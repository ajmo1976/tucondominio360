import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ReportPaymentDto } from './dto/report-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly db: DatabaseService) {}

  async reportPayment(user: any, dto: ReportPaymentDto) {
    const userId = user.id;
    const isSuperadmin = user.is_superadmin === true;

    // 0. Aislamiento de rol: solo el propietario/residente de la unidad (o la
    //    administración) puede reportar pagos para ese inmueble. Sin esto,
    //    cualquier usuario autenticado podía cargar pagos de unidades ajenas.
    if (!isSuperadmin) {
      const ownerRes = await this.db.query(
        `SELECT 1 FROM unit_occupants uo
         JOIN property_units pu ON pu.id = uo.property_unit_id
         WHERE uo.user_id = $1 AND pu.id = $2 AND pu.is_active = TRUE
         LIMIT 1`,
        [userId, dto.propertyUnitId],
      );
      if (ownerRes.rows.length === 0) {
        throw new BadRequestException(
          'Solo puedes reportar pagos de inmuebles donde eres propietario o residente.',
        );
      }
    }

    // 1. Verificar si la referencia ya fue reportada para evitar duplicados
    const dupCheck = await this.db.query(
      `SELECT id, status, payment_date FROM payment_reports 
       WHERE condo_id = $1 AND reference_number = $2 AND status != 'REJECTED'`,
      [dto.condoId, dto.referenceNumber],
    );

    if (dupCheck.rows.length > 0) {
      throw new BadRequestException(
        `La referencia de pago #${dto.referenceNumber} ya fue reportada anteriormente el ${dupCheck.rows[0].payment_date}.`,
      );
    }

    // 2. Aislamiento de datos: el inmueble y la cuenta bancaria reportados
    //    deben pertenecer a la residencia del reporte. Sin esta validación se
    //    podía registrar un pago de una residencia contra un inmueble de otra,
    //    porque el id del inmueble venía cableado en el cliente.
    const unitRes = await this.db.query(
      `SELECT id, unit_code FROM property_units WHERE id = $1 AND condo_id = $2 AND is_active = TRUE`,
      [dto.propertyUnitId, dto.condoId],
    );
    if (unitRes.rows.length === 0) {
      throw new BadRequestException(
        'El inmueble reportado no pertenece a esta residencia.',
      );
    }

    if (dto.bankAccountId) {
      const bankRes = await this.db.query(
        `SELECT id FROM bank_accounts WHERE id = $1 AND condo_id = $2`,
        [dto.bankAccountId, dto.condoId],
      );
      if (bankRes.rows.length === 0) {
        throw new BadRequestException(
          'La cuenta bancaria receptora no pertenece a esta residencia.',
        );
      }
    }

    // 3. Vínculo al recibo que el propietario está pagando (opcional). El
    //    recibo debe pertenecer al inmueble del reporte. Se guarda como
    //    contexto para la conciliación: los fondos se aplican a la deuda más
    //    antigua (FIFO) como siempre, pero la administración ve qué mes
    //    pretendía pagar el propietario.
    let condoBillId: string | null = null;
    if (dto.billingPeriodId) {
      const billRes = await this.db.query(
        `SELECT cb.id FROM condo_bills cb
         WHERE cb.billing_period_id = $1 AND cb.property_unit_id = $2`,
        [dto.billingPeriodId, dto.propertyUnitId],
      );
      if (billRes.rows.length === 0) {
        throw new BadRequestException(
          'El recibo seleccionado no corresponde a este inmueble.',
        );
      }
      condoBillId = billRes.rows[0].id;
    }

    // 4. Obtener la tasa de cambio BCV oficial aplicable a la fecha del pago.
    //    Sin tasa registrada no se inventa un valor: se guarda el monto tal cual
    //    lo reportó el residente, sin equivalente en dólares inventado.
    const rateRes = await this.db.query(
      `SELECT rate FROM exchange_rates 
       WHERE base_currency = 'USD' AND target_currency = 'VES' AND rate_date <= $1
       ORDER BY rate_date DESC LIMIT 1`,
      [dto.paymentDate],
    );

    const bcvRate = rateRes.rows.length > 0 ? Number(rateRes.rows[0].rate) : null;

    let equivalentUsd = dto.amountPaid;
    if (dto.currency === 'VES' && bcvRate !== null) {
      equivalentUsd = Number((dto.amountPaid / bcvRate).toFixed(2));
    }

    // 5. Insertar el reporte de pago
    const insertRes = await this.db.query(
      `INSERT INTO payment_reports (
        condo_id, property_unit_id, reported_by_user_id, bank_account_id,
        payment_method, reference_number, payment_date, origin_bank,
        origin_phone, origin_doc_number, currency, amount_paid,
        exchange_rate_applied, equivalent_usd, receipt_image_url, notes,
        origin_email, condo_bill_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'PENDING')
      RETURNING *`,
      [
        dto.condoId,
        dto.propertyUnitId,
        userId,
        dto.bankAccountId,
        dto.paymentMethod,
        dto.referenceNumber,
        dto.paymentDate,
        dto.originBank || null,
        dto.originPhone || null,
        dto.originDocNumber || null,
        dto.currency,
        dto.amountPaid,
        bcvRate,
        equivalentUsd,
        dto.receiptImageUrl || null,
        dto.notes || null,
        dto.originEmail || null,
        condoBillId,
      ],
    );

    const newPayment = insertRes.rows[0];

    // 4. Intento de Conciliación Automática contra movimientos bancarios existentes
    const bankTxMatch = await this.db.query(
      `SELECT id, amount, reference_number FROM bank_transactions
       WHERE bank_account_id = $1 
         AND is_reconciled = FALSE
         AND (reference_number = $2 OR reference_number LIKE $3)
         AND ABS(amount - $4) < 0.05
       LIMIT 1`,
      [dto.bankAccountId, dto.referenceNumber, `%${dto.referenceNumber.slice(-6)}`, dto.amountPaid],
    );

    let isAutoReconciled = false;
    if (bankTxMatch.rows.length > 0) {
      const tx = bankTxMatch.rows[0];

      // Descontar de la deuda ANTES de marcar el pago como verificado: si el
      // descuento falla, el pago queda PENDING y el banco sin conciliar.
      try {
        await this.applyPaymentToDebt(newPayment.property_unit_id, equivalentUsd);
      } catch (err) {
        console.error('No se pudo descontar el pago de la deuda:', err);
        throw new BadRequestException(
          'El pago coincidió con el extracto bancario, pero no se pudo descontar de la deuda. Intenta verificarlo manualmente.',
        );
      }

      // Vincular y conciliar automáticamente
      await this.db.query(
        `UPDATE bank_transactions 
         SET is_reconciled = TRUE, matched_payment_report_id = $1, reconciled_at = NOW(), reconciliation_method = 'AUTO_REFERENCE'
         WHERE id = $2`,
        [newPayment.id, tx.id],
      );

      await this.db.query(
        `UPDATE payment_reports
         SET status = 'VERIFIED', verified_at = NOW()
         WHERE id = $1`,
        [newPayment.id],
      );

      isAutoReconciled = true;
    }

    return {
      payment: newPayment,
      isAutoReconciled,
      bcvRateUsed: bcvRate,
      equivalentUsd,
      message: isAutoReconciled
        ? '¡Pago verificado y conciliado automáticamente con el extracto bancario!'
        : 'Pago reportado exitosamente. Pendiente de validación.',
    };
  }

  async getPayments(condoId: string, status?: string) {
    let query = `
      SELECT pr.*, 
             pu.unit_code, b.name as building_name,
             ba.bank_name, ba.account_number,
             concat(u.first_name, ' ', u.last_name) as reported_by_name,
             bp.period_year, bp.period_month,
             concat(bp.period_year, '-', lpad(bp.period_month::text, 2, '0')) as linked_period
      FROM payment_reports pr
      JOIN property_units pu ON pu.id = pr.property_unit_id
      LEFT JOIN buildings b ON b.id = pu.building_id
      LEFT JOIN bank_accounts ba ON ba.id = pr.bank_account_id
      LEFT JOIN condo_bills cb ON cb.id = pr.condo_bill_id
      LEFT JOIN billing_periods bp ON bp.id = cb.billing_period_id
      JOIN users u ON u.id = pr.reported_by_user_id
      WHERE pr.condo_id = $1
    `;
    const params: any[] = [condoId];

    if (status) {
      params.push(status);
      query += ` AND pr.status = $${params.length}`;
    }

    query += ` ORDER BY pr.created_at DESC`;

    const res = await this.db.query(query, params);
    return res.rows;
  }

  // Recibos del propietario actual en todas sus residencias (portal de pagos).
  // Agrupa por residencia → unidad → recibo, calcula el estado visible
  // (PAGADO / PARCIAL / PENDIENTE / MOROSO / CANCELADO) y trae las cuentas
  // receptoras de cada residencia para el formulario de reporte.
  async getMyBills(userId: string) {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];

    const res = await this.db.query(
      `SELECT c.id AS condo_id, c.name AS condo_name, c.rif AS condo_rif, c.address AS condo_address,
              pu.id AS unit_id, pu.unit_code, bld.name AS building_name, pu.floor, pu.unit_type,
              cb.id AS bill_id, cb.billing_period_id,
              cb.total_due_usd, cb.total_paid_usd, cb.remaining_balance_usd, cb.status AS bill_status,
              bp.period_year, bp.period_month, bp.issue_date, bp.due_date, bp.status AS period_status,
              CASE
                WHEN cb.status = 'CANCELLED' THEN 'CANCELLED'
                WHEN cb.remaining_balance_usd <= 0 THEN 'PAID'
                WHEN cb.total_paid_usd > 0 THEN 'PARTIAL'
                WHEN bp.due_date < CURRENT_DATE THEN 'OVERDUE'
                ELSE 'PENDING'
              END AS display_status,
              (SELECT COUNT(*)::int FROM payment_reports pr
               WHERE pr.condo_bill_id = cb.id AND pr.status = 'PENDING') AS pending_reports
       FROM unit_occupants uo
       JOIN property_units pu ON pu.id = uo.property_unit_id AND pu.is_active = TRUE
       JOIN condos c ON c.id = pu.condo_id
       LEFT JOIN buildings bld ON bld.id = pu.building_id
       LEFT JOIN condo_bills cb ON cb.property_unit_id = pu.id
         AND (cb.total_due_usd <> 0 OR cb.total_paid_usd <> 0 OR cb.remaining_balance_usd <> 0)
       LEFT JOIN billing_periods bp ON bp.id = cb.billing_period_id
       WHERE uo.user_id = $1
       ORDER BY c.name ASC, pu.unit_code ASC, bp.period_year DESC, bp.period_month DESC`,
      [userId],
    );

    // Cuentas receptoras de las residencias del propietario.
    const condoIds = [...new Set(res.rows.map((r) => r.condo_id))].filter(Boolean);
    const accountsByCondo = new Map<string, any[]>();
    if (condoIds.length > 0) {
      const accRes = await this.db.query(
        `SELECT ba.*, c.name AS condo_name
         FROM bank_accounts ba
         JOIN condos c ON c.id = ba.condo_id
         WHERE ba.condo_id = ANY($1::uuid[]) AND ba.is_active = TRUE
         ORDER BY ba.bank_name ASC`,
        [condoIds],
      );
      for (const a of accRes.rows) {
        const list = accountsByCondo.get(a.condo_id) || [];
        list.push(a);
        accountsByCondo.set(a.condo_id, list);
      }
    }

    // Agrupar residencia → unidad → recibos.
    const condosMap = new Map<string, any>();
    for (const row of res.rows) {
      if (!row.condo_id) continue;
      let condo = condosMap.get(row.condo_id);
      if (!condo) {
        condo = {
          id: row.condo_id,
          name: row.condo_name,
          rif: row.condo_rif,
          address: row.condo_address,
          bankAccounts: accountsByCondo.get(row.condo_id) || [],
          units: [],
        };
        condosMap.set(row.condo_id, condo);
      }
      if (!row.unit_id) continue;
      let unit = condo.units.find((u: any) => u.id === row.unit_id);
      if (!unit) {
        unit = {
          id: row.unit_id,
          unitCode: row.unit_code,
          buildingName: row.building_name,
          floor: row.floor,
          unitType: row.unit_type,
          balanceUsd: 0,
          bills: [],
        };
        condo.units.push(unit);
      }
      if (!row.bill_id) continue;
      const bill = {
        billId: row.bill_id,
        periodId: row.billing_period_id,
        periodLabel:
          row.period_year && row.period_month
            ? `${months[row.period_month - 1]} ${row.period_year}`
            : null,
        periodYear: row.period_year,
        periodMonth: row.period_month,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        totalDueUsd: Number(row.total_due_usd || 0),
        totalPaidUsd: Number(row.total_paid_usd || 0),
        remainingUsd: Number(row.remaining_balance_usd || 0),
        status: row.display_status,
        pendingPayments: Number(row.pending_reports || 0),
      };
      unit.bills.push(bill);
      unit.balanceUsd = Number((unit.balanceUsd + bill.remainingUsd).toFixed(2));
    }

    const condos = [...condosMap.values()];
    let totalDebtUsd = 0;
    let totalDueUsd = 0;
    let openBills = 0;
    let unitsCount = 0;
    let pendingPayments = 0;
    for (const c of condos) {
      for (const u of c.units) {
        unitsCount++;
        for (const bill of u.bills) {
          totalDebtUsd = Number((totalDebtUsd + bill.remainingUsd).toFixed(2));
          totalDueUsd = Number((totalDueUsd + bill.totalDueUsd).toFixed(2));
          if (bill.remainingUsd > 0.004 && bill.status !== 'CANCELLED') openBills++;
          pendingPayments += bill.pendingPayments;
        }
      }
    }

    return {
      summary: {
        totalDebtUsd,
        totalDueUsd,
        openBills,
        unitsCount,
        condosCount: condos.length,
        pendingPayments,
      },
      condos,
    };
  }

  async verifyPayment(paymentId: string, verifiedByUserId: string, approved: boolean, reason?: string) {
    const paymentRes = await this.db.query(
      `SELECT * FROM payment_reports WHERE id = $1`,
      [paymentId],
    );

    if (paymentRes.rows.length === 0) {
      throw new NotFoundException('Pago no encontrado');
    }

    const payment = paymentRes.rows[0];
    const wasAlreadyVerified = payment.status === 'VERIFIED';
    const newStatus = approved ? 'VERIFIED' : 'REJECTED';

    // Descontar primero de la deuda y solo después marcar el pago: si el
    // descuento falla, el pago conserva su estado (PENDING) y el error es
    // visible para la administración. Un pago ya VERIFIED (p. ej. conciliado
    // automáticamente) no se vuelve a descontar.
    if (approved && !wasAlreadyVerified) {
      const equivalentUsd = Number(payment.equivalent_usd || 0);
      if (equivalentUsd > 0) {
        try {
          await this.applyPaymentToDebt(payment.property_unit_id, equivalentUsd);
        } catch (err) {
          console.error('No se pudo descontar el pago de la deuda:', err);
          throw new BadRequestException(
            'El pago no se pudo descontar de la deuda del inmueble. Intenta nuevamente.',
          );
        }
      }
    }

    const updateRes = await this.db.query(
      `UPDATE payment_reports
       SET status = $1, verified_by_user_id = $2, verified_at = NOW(), rejection_reason = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newStatus, verifiedByUserId, approved ? null : reason || 'Rechazado por administración', paymentId],
    );

    return updateRes.rows[0];
  }

  // Descuenta un pago verificado de la deuda de un inmueble: recorre sus
  // recibos abiertos del más antiguo al más reciente (FIFO), reduce el
  // remaining_balance_usd de cada uno y sincroniza current_balance_usd de la
  // unidad, que es la fuente de la morosidad del dashboard.
  // Un pago mayor a la deuda deja el excedente como crédito a favor (saldo
  // negativo en la unidad).
  private async applyPaymentToDebt(unitId: string, equivalentUsd: number) {
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      const billsRes = await client.query(
        `SELECT cb.id, cb.remaining_balance_usd, cb.total_paid_usd
         FROM condo_bills cb
         JOIN billing_periods bp ON bp.id = cb.billing_period_id
         WHERE cb.property_unit_id = $1 AND cb.remaining_balance_usd > 0
         ORDER BY bp.period_year ASC, bp.period_month ASC
         FOR UPDATE`,
        [unitId],
      );

      let leftoverUsd = Number(equivalentUsd) || 0;
      let appliedUsd = 0;

      for (const bill of billsRes.rows) {
        if (leftoverUsd <= 0) break;
        const billRemaining = Number(bill.remaining_balance_usd);
        const applied = Number(Math.min(billRemaining, leftoverUsd).toFixed(2));
        const newRemaining = Number((billRemaining - applied).toFixed(2));
        const newPaid = Number((Number(bill.total_paid_usd || 0) + applied).toFixed(2));

        await client.query(
          `UPDATE condo_bills
           SET remaining_balance_usd = $1,
               total_paid_usd = $2,
               status = CASE WHEN $1::numeric <= 0 THEN 'PAID'::bill_status ELSE status END,
               updated_at = NOW()
           WHERE id = $3`,
          [newRemaining, newPaid, bill.id],
        );

        appliedUsd = Number((appliedUsd + applied).toFixed(2));
        leftoverUsd = Number((leftoverUsd - applied).toFixed(2));
      }

      // Sincronizar la morosidad del inmueble: baja por el monto efectivamente
      // aplicado a sus recibos, sin volverse negativa. Si el pago supera la
      // deuda, el excedente se reporta como excessUsd para que la
      // administración lo gestione (p. ej. abono a un próximo período).
      await client.query(
        `UPDATE property_units
         SET current_balance_usd = GREATEST(0, ROUND((current_balance_usd - $1::numeric)::numeric, 2)),
             updated_at = NOW()
         WHERE id = $2`,
        [appliedUsd, unitId],
      );

      const balanceRes = await client.query(
        `SELECT current_balance_usd FROM property_units WHERE id = $1`,
        [unitId],
      );

      await client.query('COMMIT');

      return {
        appliedUsd,
        excessUsd: Number(leftoverUsd.toFixed(2)),
        unitBalanceUsd: Number(balanceRes.rows[0]?.current_balance_usd || 0),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
