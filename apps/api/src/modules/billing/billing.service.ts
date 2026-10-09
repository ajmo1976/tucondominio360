import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class BillingService {
  constructor(private readonly db: DatabaseService) {}

  async getPeriods(condoId: string) {
    const res = await this.db.query(
      `SELECT bp.*, 
              (SELECT COUNT(*) FROM expenses e WHERE e.billing_period_id = bp.id) as total_expenses_count,
              (SELECT COUNT(*) FROM condo_bills cb WHERE cb.billing_period_id = bp.id) as total_bills_count
       FROM billing_periods bp
       WHERE bp.condo_id = $1
       ORDER BY bp.period_year DESC, bp.period_month DESC`,
      [condoId],
    );
    return res.rows;
  }

  async getBills(condoId: string, periodId?: string, unitId?: string) {
    let query = `
      SELECT cb.*, 
             pu.unit_code, pu.unit_type, pu.floor, pu.has_gas_service, b.name as building_name,
             bp.period_year, bp.period_month, bp.issue_date, bp.due_date
      FROM condo_bills cb
      JOIN property_units pu ON pu.id = cb.property_unit_id
      LEFT JOIN buildings b ON b.id = pu.building_id
      JOIN billing_periods bp ON bp.id = cb.billing_period_id
      WHERE cb.condo_id = $1
    `;
    const params: any[] = [condoId];

    if (periodId) {
      params.push(periodId);
      query += ` AND cb.billing_period_id = $${params.length}`;
    }
    if (unitId) {
      params.push(unitId);
      query += ` AND cb.property_unit_id = $${params.length}`;
    }

    query += ` ORDER BY pu.unit_code ASC`;

    const res = await this.db.query(query, params);
    return res.rows;
  }

  async getBillDetail(billId: string) {
    const billRes = await this.db.query(
      `SELECT cb.*, 
              pu.unit_code, pu.unit_type, pu.floor, pu.has_gas_service, b.name as building_name,
              c.name as condo_name, c.rif as condo_rif, c.address as condo_address,
              bp.period_year, bp.period_month, bp.issue_date, bp.due_date, bp.bcv_exchange_rate
       FROM condo_bills cb
       JOIN property_units pu ON pu.id = cb.property_unit_id
       LEFT JOIN buildings b ON b.id = pu.building_id
       JOIN condos c ON c.id = cb.condo_id
       JOIN billing_periods bp ON bp.id = cb.billing_period_id
       WHERE cb.id = $1`,
      [billId],
    );

    if (billRes.rows.length === 0) {
      throw new NotFoundException('Recibo de condominio no encontrado');
    }

    const itemsRes = await this.db.query(
      `SELECT id, description, total_expense_usd, unit_share_usd, unit_share_ves, item_type
       FROM bill_items
       WHERE condo_bill_id = $1`,
      [billId],
    );

    // Cargamos los gastos del período clasificados en ordinarios y extraordinarios
    const expensesRes = await this.db.query(
      `SELECT e.id, e.description, ec.name as category_name, e.amount_usd, e.amount_ves,
              e.expense_type, e.expense_subtype, e.is_recurrent,
              (e.amount_usd * $2 / 100)::numeric(14,2) as unit_share_usd,
              (e.amount_ves * $2 / 100)::numeric(14,2) as unit_share_ves
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.billing_period_id = $1
       ORDER BY e.expense_subtype ASC, e.expense_date ASC`,
      [billRes.rows[0].billing_period_id, billRes.rows[0].aliquot_percentage],
    );

    const ordinaryExpenses = expensesRes.rows.filter(
      (e) => e.expense_subtype === 'ORDINARY_RECURRENT',
    );
    const extraordinaryExpenses = expensesRes.rows.filter(
      (e) => e.expense_subtype === 'EXTRAORDINARY',
    );

    return {
      bill: billRes.rows[0],
      items: expensesRes.rows,
      ordinaryExpenses,
      extraordinaryExpenses,
    };
  }

  async getCategories(condoId: string) {
    const res = await this.db.query(
      `SELECT ec.* FROM expense_categories ec 
       WHERE (ec.condo_id = $1 OR ec.condo_id IS NULL) AND ec.is_active = TRUE
       ORDER BY ec.name ASC`,
      [condoId],
    );
    return res.rows;
  }

  async createCategory(condoId: string, name: string, code?: string) {
    const condoRes = await this.db.query(`SELECT tenant_id FROM condos WHERE id = $1`, [condoId]);
    if (condoRes.rows.length === 0) throw new NotFoundException('Condominio no encontrado');
    const tenantId = condoRes.rows[0].tenant_id;

    const res = await this.db.query(
      `INSERT INTO expense_categories (tenant_id, condo_id, name, code)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenantId, condoId, name, code || null],
    );
    return res.rows[0];
  }

  async getExpenses(condoId: string, periodId?: string) {
    let query = `
      SELECT e.*, ec.name as category_name, s.name as supplier_name, b.name as building_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      LEFT JOIN suppliers s ON s.id = e.supplier_id
      LEFT JOIN buildings b ON b.id = e.target_building_id
      WHERE e.condo_id = $1
    `;
    const params: any[] = [condoId];
    if (periodId) {
      params.push(periodId);
      query += ` AND e.billing_period_id = $${params.length}`;
    }
    query += ` ORDER BY e.expense_subtype ASC, e.expense_date DESC, e.created_at DESC`;
    const res = await this.db.query(query, params);
    return res.rows;
  }

  async createExpense(condoId: string, data: any) {
    const bcvRate = data.exchangeRate || 36.85;
    const installmentTotal = Number(data.installmentTotal || 1);
    const originalAmount = Number(data.amountOriginal);
    const dividedAmount = Number((originalAmount / installmentTotal).toFixed(2));

    let amountUsd = dividedAmount;
    let amountVes = Number((amountUsd * bcvRate).toFixed(2));

    if (data.currency === 'VES') {
      amountVes = dividedAmount;
      amountUsd = Number((amountVes / bcvRate).toFixed(2));
    }

    const expenseSubtype = data.expenseSubtype || 'ORDINARY_RECURRENT';
    const isRecurrent = data.isRecurrent ?? (expenseSubtype === 'ORDINARY_RECURRENT');

    const createdExpenses: any[] = [];

    // Si se divide en cuotas (ej. 4 cuotas), creamos un registro por cada cuota o una con la etiqueta de cuota
    for (let i = 1; i <= installmentTotal; i++) {
      const descSuffix = installmentTotal > 1 ? ` (Cuota ${i} de ${installmentTotal})` : '';
      const finalDesc = data.description + descSuffix;

      const res = await this.db.query(
        `INSERT INTO expenses (
          condo_id, billing_period_id, category_id, supplier_id, description,
          invoice_number, control_number, expense_date, expense_type, expense_subtype,
          is_recurrent, currency, amount_original, exchange_rate, amount_usd, amount_ves,
          installment_current, installment_total
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *`,
        [
          condoId,
          data.billingPeriodId,
          data.categoryId,
          data.supplierId || null,
          finalDesc,
          data.invoiceNumber || null,
          data.controlNumber || null,
          data.expenseDate,
          data.expenseType || 'COMMON',
          expenseSubtype,
          isRecurrent,
          data.currency || 'USD',
          dividedAmount,
          bcvRate,
          amountUsd,
          amountVes,
          i,
          installmentTotal,
        ],
      );
      createdExpenses.push(res.rows[0]);
    }

    return createdExpenses[0];
  }

  async updateExpense(expenseId: string, data: any) {
    const bcvRate = data.exchangeRate || 36.85;
    let amountUsd = Number(data.amountOriginal);
    let amountVes = Number((amountUsd * bcvRate).toFixed(2));

    if (data.currency === 'VES') {
      amountVes = Number(data.amountOriginal);
      amountUsd = Number((amountVes / bcvRate).toFixed(2));
    }

    const res = await this.db.query(
      `UPDATE expenses SET
        description = COALESCE($1, description),
        amount_original = COALESCE($2, amount_original),
        amount_usd = COALESCE($3, amount_usd),
        amount_ves = COALESCE($4, amount_ves),
        expense_subtype = COALESCE($5, expense_subtype),
        updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [data.description, data.amountOriginal, amountUsd, amountVes, data.expenseSubtype, expenseId],
    );
    return res.rows[0];
  }

  async deleteExpense(expenseId: string) {
    const res = await this.db.query(
      `DELETE FROM expenses WHERE id = $1 RETURNING id`,
      [expenseId],
    );
    return { success: true, deletedId: res.rows[0]?.id };
  }

  async updateBillingPeriod(periodId: string, data: any) {
    const res = await this.db.query(
      `UPDATE billing_periods SET
        bcv_exchange_rate = COALESCE($1, bcv_exchange_rate),
        issue_date = COALESCE($2, issue_date),
        due_date = COALESCE($3, due_date),
        status = COALESCE($4, status),
        updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [data.bcvExchangeRate, data.issueDate, data.dueDate, data.status, periodId],
    );
    return res.rows[0];
  }

  async deleteBillingPeriod(periodId: string) {
    const res = await this.db.query(
      `DELETE FROM billing_periods WHERE id = $1 RETURNING id`,
      [periodId],
    );
    return { success: true, deletedId: res.rows[0]?.id };
  }
  async createBillingPeriod(condoId: string, data: any) {
    // Tasa BCV: prioridad a la enviada por el frontend (viva), sino resuelve
    // la última vigente en exchange_rates, y solo como último recurso 1.0000.
    let bcvRate = Number(data.bcvExchangeRate) || 0;
    if (bcvRate <= 0) {
      try {
        const rates = await this.db.query(
          `SELECT rate FROM exchange_rates
           WHERE base_currency = 'USD' AND target_currency = 'VES' AND source = 'BCV'
           ORDER BY rate_date DESC, created_at DESC LIMIT 1`,
        );
        if (rates.rows.length > 0) bcvRate = Number(rates.rows[0].rate) || 0;
      } catch {
        bcvRate = 0;
      }
    }
    const res = await this.db.query(
      `INSERT INTO billing_periods (
        condo_id, period_year, period_month, status, start_date, end_date,
        issue_date, due_date, bcv_exchange_rate
      ) VALUES ($1, $2, $3, 'DRAFT', $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        condoId,
        data.periodYear,
        data.periodMonth,
        data.startDate,
        data.endDate,
        data.issueDate || data.startDate,
        data.dueDate || data.endDate,
        bcvRate > 0 ? bcvRate : 1.0,
      ],
    );
    return res.rows[0];
  }

  async calculateAndGenerateBills(periodId: string) {
    const periodRes = await this.db.query(
      `SELECT bp.*, c.reserve_fund_rate FROM billing_periods bp JOIN condos c ON c.id = bp.condo_id WHERE bp.id = $1`,
      [periodId],
    );
    if (periodRes.rows.length === 0) throw new NotFoundException('Periodo no encontrado');
    const period = periodRes.rows[0];

    const expRes = await this.db.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN expense_subtype = 'ORDINARY_RECURRENT' THEN amount_usd ELSE 0 END), 0)::numeric(14,2) as total_ordinary_usd,
         COALESCE(SUM(CASE WHEN expense_subtype = 'EXTRAORDINARY' THEN amount_usd ELSE 0 END), 0)::numeric(14,2) as total_extraordinary_usd,
         COALESCE(SUM(amount_usd), 0)::numeric(14,2) as total_common_usd,
         COALESCE(SUM(CASE WHEN ec.code = 'GAS' THEN e.amount_usd ELSE 0 END), 0)::numeric(14,2) as total_gas_usd
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.billing_period_id = $1`,
      [periodId],
    );

    const totalOrdinaryUsd = Number(expRes.rows[0].total_ordinary_usd);
    const totalExtraordinaryUsd = Number(expRes.rows[0].total_extraordinary_usd);
    const totalCommonUsd = Number(expRes.rows[0].total_common_usd);
    // El suministro de gas se reparte solo entre los inmuebles que tienen el
    // servicio, por lo que su monto sale de la base común.
    const totalGasUsd = Number(expRes.rows[0].total_gas_usd);

    const reserveFundRate = Number(period.reserve_fund_rate || 10.0);
    // El fondo de reserva se calcula excluyendo el gas (reembolso directo de servicio)
    const reserveBaseUsd = totalOrdinaryUsd - totalGasUsd;
    const reserveFundUsd = Number(((reserveBaseUsd * reserveFundRate) / 100).toFixed(2));
    const grandTotalUsd = totalOrdinaryUsd + totalExtraordinaryUsd;
    const bcvRate = Number(period.bcv_exchange_rate || 0);
    const grandTotalVes = Number((grandTotalUsd * bcvRate).toFixed(2));

    await this.db.query(
      `UPDATE billing_periods SET 
        total_common_usd = $1,
        total_ordinary_usd = $2,
        total_extraordinary_usd = $3,
        reserve_fund_usd = $4,
        grand_total_usd = $5,
        grand_total_ves = $6,
        status = 'CALCULATED',
        updated_at = NOW()
       WHERE id = $7`,
      [
        totalCommonUsd,
        totalOrdinaryUsd,
        totalExtraordinaryUsd,
        reserveFundUsd,
        grandTotalUsd,
        grandTotalVes,
        periodId,
      ],
    );

    const unitsRes = await this.db.query(
      `SELECT id, unit_code, aliquot_percentage, current_balance_usd, has_gas_service
       FROM property_units WHERE condo_id = $1 AND is_active = TRUE`,
      [period.condo_id],
    );

    // El gas se reparte solo entre los inmuebles con servicio de gas, usando la
    // suma de sus alícuotas como base. Si el gasto de gas es 0 o no hay
    // inmueble con el servicio, el reparto común se hace completo.
    const gasUnits = unitsRes.rows.filter((u) => u.has_gas_service === true);
    const gasAliquotBase = gasUnits.reduce(
      (acc, u) => acc + Number(u.aliquot_percentage || 0),
      0,
    );
    const canSplitGas = totalGasUsd > 0 && gasUnits.length > 0 && gasAliquotBase > 0;

    // Base común sin gas: los inmueble sin servicio de gas no pagan esa parte.
    const commonBase = totalOrdinaryUsd - (canSplitGas ? totalGasUsd : 0);

    // Reparto con corrección de redondeo.
    // Al redondear cada cuota a centavos, la suma de todas se desvía del
    // subtotal del período por unos centavos. Se calcula sin redondear, se
    // redondea, y la diferencia de centavos se asigna al inmueble de mayor
    // alícuota. Así la suma de las cuotas cuadra exactamente con el subtotal,
    // que es lo que debe mostrar el recibo.
    //
    // `normalize` reparte sobre la suma de los pesos, que es lo que necesita el
    // gas: solo carga sobre parte de los inmuebles, así que su base no es 100
    // sino la suma de las alícuotas de quienes tienen el servicio.
    const allocate = (total: number, weights: number[], normalize = false): number[] => {
      const weightBase = normalize ? weights.reduce((a, b) => a + b, 0) : 100;
      if (weightBase <= 0) return weights.map(() => 0);
      const raw = weights.map((w) => (w * total) / weightBase);
      const rounded = raw.map((v) => Number(v.toFixed(2)));
      const drift = Number((total - rounded.reduce((a, b) => a + b, 0)).toFixed(2));
      if (drift !== 0 && rounded.length > 0) {
        // El inmueble con el reparto más grande absorbe la diferencia.
        let biggest = 0;
        for (let i = 1; i < raw.length; i++) {
          if (raw[i] > raw[biggest]) biggest = i;
        }
        rounded[biggest] = Number((rounded[biggest] + drift).toFixed(2));
      }
      return rounded;
    };

    const ordinaryShares = allocate(
      commonBase,
      unitsRes.rows.map((u) => Number(u.aliquot_percentage || 0)),
    );
    const extraordinaryShares = allocate(
      totalExtraordinaryUsd,
      unitsRes.rows.map((u) => Number(u.aliquot_percentage || 0)),
    );
    const reserveShares = allocate(
      reserveFundUsd,
      unitsRes.rows.map((u) => Number(u.aliquot_percentage || 0)),
    );
    // EQUAL_PARTS_FILTERED para el gas: dividido a partes iguales únicamente
    // entre las unidades que disfrutan del servicio, con ajuste de centavos.
    const gasShares = (() => {
      const shares = unitsRes.rows.map(() => 0);
      if (totalGasUsd <= 0 || gasUnits.length === 0) return shares;

      const equalPart = Number((totalGasUsd / gasUnits.length).toFixed(2));
      let currentSum = 0;

      for (let i = 0; i < unitsRes.rows.length; i++) {
        if (unitsRes.rows[i].has_gas_service === true) {
          shares[i] = equalPart;
          currentSum += equalPart;
        }
      }

      const drift = Number((totalGasUsd - currentSum).toFixed(2));
      if (drift !== 0) {
        const firstGasIdx = unitsRes.rows.findIndex((u) => u.has_gas_service === true);
        if (firstGasIdx >= 0) {
          shares[firstGasIdx] = Number((shares[firstGasIdx] + drift).toFixed(2));
        }
      }
      return shares;
    })();

    for (let idx = 0; idx < unitsRes.rows.length; idx++) {
      const unit = unitsRes.rows[idx];
      const aliquot = Number(unit.aliquot_percentage);
      const ordinaryShareUsd = Number((ordinaryShares[idx] + gasShares[idx]).toFixed(2));
      const extraordinaryShareUsd = extraordinaryShares[idx];
      const commonShareUsd = Number((ordinaryShareUsd + extraordinaryShareUsd).toFixed(2));
      const unitReserveFundUsd = reserveShares[idx];
      const previousDebtUsd = Number(unit.current_balance_usd > 0 ? unit.current_balance_usd : 0);
      const creditAppliedUsd = Number(unit.current_balance_usd < 0 ? Math.abs(unit.current_balance_usd) : 0);
      const totalDueUsd = ordinaryShareUsd + extraordinaryShareUsd + unitReserveFundUsd + previousDebtUsd - creditAppliedUsd;
      const totalDueVes = Number((totalDueUsd * bcvRate).toFixed(2));
      const billNumber = `REC-${period.period_year}-${String(period.period_month).padStart(2, '0')}-${unit.unit_code}`;

      await this.db.query(
        `INSERT INTO condo_bills (
          condo_id, billing_period_id, property_unit_id, bill_number, aliquot_percentage,
          common_share_usd, ordinary_share_usd, extraordinary_share_usd, reserve_fund_usd,
          previous_debt_usd, credit_balance_applied_usd, total_due_usd, total_due_ves,
          exchange_rate_emission, remaining_balance_usd, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'UNPAID')
        ON CONFLICT (billing_period_id, property_unit_id) DO UPDATE SET
          aliquot_percentage = EXCLUDED.aliquot_percentage,
          common_share_usd = EXCLUDED.common_share_usd,
          ordinary_share_usd = EXCLUDED.ordinary_share_usd,
          extraordinary_share_usd = EXCLUDED.extraordinary_share_usd,
          reserve_fund_usd = EXCLUDED.reserve_fund_usd,
          total_due_usd = EXCLUDED.total_due_usd,
          total_due_ves = EXCLUDED.total_due_ves,
          remaining_balance_usd = EXCLUDED.remaining_balance_usd,
          updated_at = NOW()`,
        [
          period.condo_id,
          periodId,
          unit.id,
          billNumber,
          aliquot,
          commonShareUsd,
          ordinaryShareUsd,
          extraordinaryShareUsd,
          unitReserveFundUsd,
          previousDebtUsd,
          creditAppliedUsd,
          totalDueUsd,
          totalDueVes,
          bcvRate,
          totalDueUsd,
        ],
      );
    }

    return {
      success: true,
      message: `Se calcularon y generaron exitosamente los recibos para ${unitsRes.rows.length} apartamentos`,
      totalOrdinaryUsd,
      totalExtraordinaryUsd,
      reserveFundUsd,
      grandTotalUsd,
      grandTotalVes,
      unitsCount: unitsRes.rows.length,
    };
  }
}
