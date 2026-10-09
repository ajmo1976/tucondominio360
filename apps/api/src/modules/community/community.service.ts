import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PdfBuilder, pdfMoney, pdfDate } from './pdf';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function num(v: unknown): number {
  return Number(v || 0);
}

function r2(v: number): number {
  return Number(v.toFixed(2));
}

/** Mapea una categoría de gasto a un bloque del gráfico de distribución. */
function bucketFor(code: string | null, name: string | null): string {
  const n = `${name || ''} ${code || ''}`.toLowerCase();
  if (/\b(gas|sf)\b|servicio|servicios|agua|luz|electricidad|tel[eé]fono|internet|cable|aseo|limpieza urbana/.test(n)) {
    return 'Servicios Públicos';
  }
  if (/\btr\b|n[oó]mina|trabajador|sueldo|salario|vigilancia|seguridad|conserje|personal/.test(n)) {
    return 'Nómina y Seguridad';
  }
  if (/\baice\b|cuota|extra|imprevisto|adicional/.test(n)) {
    return 'Adicionales y Extraordinarios';
  }
  return 'Mantenimiento y Operación';
}

/** Etiqueta legible del tipo de cuenta bancaria. */
function accountTypeLabel(type: string | null): string {
  const t = (type || '').toLowerCase();
  if (/corriente|checking|operativa/.test(t)) return 'Cuenta Corriente Operativa';
  if (/ahorro|savings|reserva/.test(t)) return 'Fondo de Reserva';
  if (/especial|proyecto/.test(t)) return 'Fondos Especiales de Proyectos';
  return type || 'Cuenta bancaria';
}

function periodLabel(p: { period_year: number; period_month: number }): string {
  return `${MONTHS[Number(p.period_month) - 1] || p.period_month} ${p.period_year}`;
}

@Injectable()
export class CommunityService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Dashboard de transparencia de la residencia para los copropietarios.
   * Todos los indicadores financieros son AGREGADOS: nunca se exponen códigos
   * de apartamento ni identidades de vecinos (regla anti-escrache).
   */
  async getDashboard(condoId: string) {
    const condoRes = await this.db.query(
      `SELECT id, name, rif, address, state, city, reserve_fund_rate, main_currency
       FROM condos WHERE id = $1`,
      [condoId],
    );
    if (condoRes.rows.length === 0) throw new NotFoundException('Residencia no encontrada');
    const condo = condoRes.rows[0];

    // Período más reciente real (no DRAFT).
    const periodRes = await this.db.query(
      `SELECT bp.*
       FROM billing_periods bp
       WHERE bp.condo_id = $1
       ORDER BY CASE WHEN bp.status = 'DRAFT' THEN 0 ELSE 1 END DESC,
                bp.period_year DESC, bp.period_month DESC
       LIMIT 1`,
      [condoId],
    );
    const period = periodRes.rows[0] || null;

    // ---------------------------------------------------------------- KPI 1
    let billedUsd = 0;
    let collectedUsd = 0;
    let collectionPct = 0;
    let periodBills: { due: number; paid: number } | null = null;
    if (period) {
      const agg = await this.db.query(
        `SELECT COALESCE(SUM(total_due_usd), 0)::numeric(14,2) AS due,
                COALESCE(SUM(total_paid_usd), 0)::numeric(14,2) AS paid,
                COALESCE(SUM(remaining_balance_usd), 0)::numeric(14,2) AS remaining
         FROM condo_bills
         WHERE condo_id = $1 AND billing_period_id = $2 AND status <> 'CANCELLED'`,
        [condoId, period.id],
      );
      periodBills = {
        due: num(agg.rows[0].due),
        paid: num(agg.rows[0].paid),
      };
      billedUsd = r2(num(period.grand_total_usd) + num(period.reserve_fund_usd));
      collectedUsd = r2(periodBills.paid);
      collectionPct = billedUsd > 0 ? Math.min(100, (collectedUsd / billedUsd) * 100) : 0;
    }

    // ---------------------------------------------------------------- KPI 2
    // Fondo de reserva: aportes facturados por período × índice de cobranza
    // del propio período (lo que de verdad entró). Variación vs. mes anterior.
    const ratesRes = await this.db.query(
      `SELECT bp.period_year, bp.period_month, bp.reserve_fund_usd,
              COALESCE((SELECT SUM(cb.total_paid_usd) FROM condo_bills cb
                        WHERE cb.billing_period_id = bp.id AND cb.status <> 'CANCELLED'), 0)::numeric(14,2) AS paid,
              COALESCE((SELECT SUM(cb.total_due_usd) FROM condo_bills cb
                        WHERE cb.billing_period_id = bp.id AND cb.status <> 'CANCELLED'), 0)::numeric(14,2) AS due
       FROM billing_periods bp
       WHERE bp.condo_id = $1
       ORDER BY bp.period_year ASC, bp.period_month ASC`,
      [condoId],
    );
    let reserveAvailableUsd = 0;
    let reservePrevUsd = 0;
    const reserveSeries = ratesRes.rows.map((p) => {
      const due = num(p.due);
      const rate = due > 0 ? Math.min(1, num(p.paid) / due) : 0;
      return { p, contribution: num(p.reserve_fund_usd) * rate, collected: num(p.reserve_fund_usd) * rate };
    });
    for (const item of reserveSeries) {
      reservePrevUsd = reserveAvailableUsd;
      reserveAvailableUsd = r2(reserveAvailableUsd + item.contribution);
    }
    if (reserveSeries.length === 0) reservePrevUsd = 0;
    const reserveDeltaUsd = r2(reserveAvailableUsd - reservePrevUsd);
    const reserveDeltaPct =
      reservePrevUsd > 0 ? r2((reserveDeltaUsd / reservePrevUsd) * 100) : reserveSeries.length > 0 ? 100 : 0;

    // ---------------------------------------------------------------- KPI 3
    // Deuda global de la comunidad (suma de saldos de recibos abiertos) sobre
    // el presupuesto del mes.
    const debtRes = await this.db.query(
      `SELECT COALESCE(SUM(remaining_balance_usd), 0)::numeric(14,2) AS debt
       FROM condo_bills WHERE condo_id = $1 AND status <> 'CANCELLED'`,
      [condoId],
    );
    const totalDebtUsd = r2(num(debtRes.rows[0].debt));
    const monthlyBudgetUsd = billedUsd;
    const delinquencyPct = monthlyBudgetUsd > 0 ? r2((totalDebtUsd / monthlyBudgetUsd) * 100) : 0;

    // ---------------------------------------------------------------- KPI 4
    // Apartamentos en mora (solo contador agregado).
    const unitsRes = await this.db.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM((current_balance_usd > 0.004)::int), 0)::int AS arrears
       FROM property_units WHERE condo_id = $1 AND is_active = TRUE`,
      [condoId],
    );
    const totalUnits = num(unitsRes.rows[0].total);
    const arrearsUnits = num(unitsRes.rows[0].arrears);
    const arrearsPct = totalUnits > 0 ? r2((arrearsUnits / totalUnits) * 100) : 0;

    // ------------------------------------------------- Sección B: donut
    const expRes = await this.db.query(
      `SELECT ec.name AS category_name, ec.code AS category_code,
              COALESCE(SUM(e.amount_usd), 0)::numeric(14,2) AS amount
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.billing_period_id = $1
       GROUP BY ec.name, ec.code
       ORDER BY amount DESC`,
      [period?.id],
    );

    const bucketMap = new Map<string, number>();
    for (const row of expRes.rows) {
      const bucket = bucketFor(row.category_code, row.category_name);
      bucketMap.set(bucket, r2((bucketMap.get(bucket) || 0) + num(row.amount)));
    }
    // El aporte al fondo de reserva se muestra como una rebanada propia, para
    // que el propietario vea el destino completo de su cuota.
    if (period && num(period.reserve_fund_usd) > 0) {
      bucketMap.set('Aportes al Fondo de Reserva', r2((bucketMap.get('Aportes al Fondo de Reserva') || 0) + num(period.reserve_fund_usd)));
    }
    const spending = [...bucketMap.entries()]
      .map(([bucket, amount]) => ({ bucket, amountUsd: amount, pct: billedUsd > 0 ? r2((amount / billedUsd) * 100) : 0 }))
      .sort((a, b) => b.amountUsd - a.amountUsd);

    // ------------------------------------------------- Sección B: barras
    const flowRes = await this.db.query(
      `SELECT bp.period_year, bp.period_month, bp.grand_total_usd, bp.reserve_fund_usd,
              COALESCE((SELECT SUM(cb.total_paid_usd) FROM condo_bills cb
                        WHERE cb.billing_period_id = bp.id AND cb.status <> 'CANCELLED'), 0)::numeric(14,2) AS income
       FROM billing_periods bp
       WHERE bp.condo_id = $1
       ORDER BY bp.period_year DESC, bp.period_month DESC
       LIMIT 6`,
      [condoId],
    );
    const cashflow = flowRes.rows
      .map((p) => ({
        periodLabel: periodLabel(p),
        incomeUsd: r2(num(p.income)),
        expenseUsd: r2(num(p.grand_total_usd)),
      }))
      .reverse();

    // ------------------------------------------------- Sección C: cuentas
    const accRes = await this.db.query(
      `SELECT ba.id, ba.bank_name, ba.bank_code, ba.account_number, ba.account_type,
              ba.currency, ba.supports_pago_movil,
              (SELECT bt.balance_after FROM bank_transactions bt
               WHERE bt.bank_account_id = ba.id
               ORDER BY bt.transaction_date DESC, bt.id DESC LIMIT 1) AS last_balance
       FROM bank_accounts ba
       WHERE ba.condo_id = $1 AND ba.is_active = TRUE
       ORDER BY ba.bank_name`,
      [condoId],
    );
    const accounts = accRes.rows.map((a) => ({
      id: a.id,
      type: a.account_type,
      typeLabel: accountTypeLabel(a.account_type),
      bankName: a.bank_name,
      accountNumber: a.account_number,
      currency: a.currency,
      supportsPagoMovil: a.supports_pago_movil,
      balanceUsd: a.last_balance !== null && a.last_balance !== undefined ? r2(num(a.last_balance)) : null,
      hasBalance: a.last_balance !== null && a.last_balance !== undefined,
    }));

    // ------------------------------------------------- Sección D: documentos
    const stRes = await this.db.query(
      `SELECT bs.id, bs.file_name, bs.file_url, bs.statement_from, bs.statement_to,
              bs.total_records, bs.reconciled_records, bs.created_at,
              ba.bank_name, ba.account_number, ba.currency
       FROM bank_statements bs
       JOIN bank_accounts ba ON ba.id = bs.bank_account_id
       WHERE ba.condo_id = $1
       ORDER BY bs.statement_to DESC, bs.created_at DESC
       LIMIT 1`,
      [condoId],
    );
    const latestStatement = stRes.rows[0] || null;

    return {
      condo: {
        id: condo.id,
        name: condo.name,
        rif: condo.rif,
        city: condo.city,
        state: condo.state,
        reserveFundRate: num(condo.reserve_fund_rate),
        mainCurrency: condo.main_currency,
      },
      period: period
        ? {
            id: period.id,
            label: periodLabel(period),
            status: period.status,
            issueDate: period.issue_date,
            dueDate: period.due_date,
          }
        : null,
      kpis: {
        billing: { billedUsd, collectedUsd, collectionPct },
        reserveFund: {
          availableUsd: reserveAvailableUsd,
          monthlyRate: num(condo.reserve_fund_rate),
          deltaUsd: reserveDeltaUsd,
          deltaPct: reserveDeltaPct,
        },
        delinquency: { totalDebtUsd, monthlyBudgetUsd, indexPct: delinquencyPct },
        arrearsUnits: { count: arrearsUnits, totalUnits, pct: arrearsPct },
      },
      spending,
      cashflow,
      accounts,
      documents: {
        hasReconciliation: latestStatement !== null,
        latestStatement: latestStatement
          ? {
              id: latestStatement.id,
              fileName: latestStatement.file_name,
              fileUrl: latestStatement.file_url,
              statementFrom: latestStatement.statement_from,
              statementTo: latestStatement.statement_to,
              totalRecords: num(latestStatement.total_records),
              reconciledRecords: num(latestStatement.reconciled_records),
              bankName: latestStatement.bank_name,
              accountNumber: latestStatement.account_number,
            }
          : null,
        hasExpensesReport: expRes.rows.length > 0,
      },
    };
  }

  // ------------------------------------------------------------------ PDFs

  private async statementWithTx(condoId: string) {
    const stRes = await this.db.query(
      `SELECT bs.*, ba.bank_name, ba.account_number, ba.currency, c.name AS condo_name, c.rif AS condo_rif
       FROM bank_statements bs
       JOIN bank_accounts ba ON ba.id = bs.bank_account_id
       JOIN condos c ON c.id = ba.condo_id
       WHERE ba.condo_id = $1
       ORDER BY bs.statement_to DESC, bs.created_at DESC
       LIMIT 1`,
      [condoId],
    );
    if (stRes.rows.length === 0) {
      throw new NotFoundException('Aún no hay un estado de cuenta cargado para generar la conciliación.');
    }
    const st = stRes.rows[0];
    const txRes = await this.db.query(
      `SELECT transaction_date, reference_number, description, amount, tx_type, is_reconciled
       FROM bank_transactions
       WHERE bank_statement_id = $1
       ORDER BY transaction_date ASC, id ASC
       LIMIT 60`,
      [st.id],
    );
    return { st, transactions: txRes.rows };
  }

  /** PDF: conciliación bancaria oficial más reciente. */
  async buildBankReconciliationPdf(condoId: string): Promise<Buffer> {
    const { st, transactions } = await this.statementWithTx(condoId);

    let credits = 0;
    let debits = 0;
    for (const tx of transactions) {
      if (tx.tx_type === 'CREDIT') credits += num(tx.amount);
      else debits += num(tx.amount);
    }

    const doc = new PdfBuilder({
      title: 'Conciliación Bancaria Oficial',
      subtitle: `${st.condo_name} (RIF: ${st.condo_rif})`,
    });
    doc.text(
      `Estado de cuenta ${pdfDate(st.statement_from)} al ${pdfDate(st.statement_to)} · ${st.bank_name} · Cuenta ${st.account_number}`,
      { muted: true },
    );
    doc.spacer(4);
    doc.table(
      [
        { label: 'Concepto', width: 200 },
        { label: 'Valor', width: 120 },
        { label: 'Detalle', width: 184 },
      ],
      [
        ['Registros en el estado de cuenta', `${st.total_records}`, '—'],
        ['Movimientos conciliados', `${st.reconciled_records}`, '—'],
        ['Créditos (ingresos)', `$${pdfMoney(credits)}`, `${transactions.filter((t) => t.tx_type === 'CREDIT').length} movimientos`],
        ['Débitos (egresos)', `$${pdfMoney(debits)}`, `${transactions.filter((t) => t.tx_type !== 'CREDIT').length} movimientos`],
      ],
    );

    if (transactions.length > 0) {
      doc.spacer(2);
      doc.text('Detalle de movimientos', { bold: true });
      doc.spacer(2);
      doc.table(
        [
          { label: 'Fecha', width: 72 },
          { label: 'Referencia', width: 90 },
          { label: 'Descripción', width: 150 },
          { label: 'Tipo', width: 62 },
          { label: 'Monto', width: 76 },
          { label: 'Conciliado', width: 54 },
        ],
        transactions.map((tx) => [
          pdfDate(tx.transaction_date),
          tx.reference_number,
          String(tx.description || ''),
          tx.tx_type === 'CREDIT' ? 'Ingreso' : 'Egreso',
          `${tx.tx_type === 'CREDIT' ? '+' : '−'} $${pdfMoney(tx.amount)}`,
          tx.is_reconciled ? 'Sí' : 'No',
        ]),
      );
    } else {
      doc.text('El estado de cuenta no tiene movimientos registrados todavía.', { muted: true });
    }

    doc.spacer(8);
    doc.hr(0.4);
    doc.spacer(6);
    doc.text('Documento generado por TuCondominio360 para transparencia de los copropietarios.', { small: true, muted: true });
    doc.text(
      'La conciliación oficial es el archivo emitido por el banco; este resumen es complementario y no sustituye el estado de cuenta bancario.',
      { small: true, muted: true },
    );
    return doc.build();
  }

  /** PDF: relación de facturas y soportes de gastos del período. */
  async buildExpensesReportPdf(condoId: string, periodId?: string): Promise<Buffer> {
    const condoRes = await this.db.query(
      `SELECT id, name, rif FROM condos WHERE id = $1`,
      [condoId],
    );
    if (condoRes.rows.length === 0) throw new NotFoundException('Residencia no encontrada');
    const condo = condoRes.rows[0];

    const periodRes = periodId
      ? await this.db.query(`SELECT * FROM billing_periods WHERE id = $1 AND condo_id = $2`, [periodId, condoId])
      : await this.db.query(
          `SELECT * FROM billing_periods WHERE condo_id = $1
           ORDER BY CASE WHEN status = 'DRAFT' THEN 0 ELSE 1 END DESC, period_year DESC, period_month DESC LIMIT 1`,
          [condoId],
        );
    if (periodRes.rows.length === 0) {
      throw new NotFoundException('No hay un período facturado para generar el reporte de gastos.');
    }
    const period = periodRes.rows[0];

    const expRes = await this.db.query(
      `SELECT e.expense_date, e.invoice_number, e.control_number, e.description,
              e.amount_usd, e.amount_ves, e.currency, e.expense_type, e.expense_subtype,
              ec.name AS category_name, s.name AS supplier_name
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN suppliers s ON s.id = e.supplier_id
       WHERE e.billing_period_id = $1
       ORDER BY e.expense_subtype ASC, e.expense_date ASC, e.created_at ASC`,
      [period.id],
    );
    if (expRes.rows.length === 0) {
      throw new NotFoundException('Este período no tiene gastos registrados para listar.');
    }

    const totalUsd = expRes.rows.reduce((acc, e) => acc + num(e.amount_usd), 0);

    const doc = new PdfBuilder({
      title: 'Relación de Facturas y Soportes de Gastos',
      subtitle: `${condo.name} (RIF: ${condo.rif}) · Período ${periodLabel(period)}`,
    });
    doc.text(
      `Gastos ordinarios y extraordinarios ejecutados. Total del período: $${pdfMoney(totalUsd)} USD.`,
    );
    doc.spacer(4);
    doc.table(
      [
        { label: 'Fecha', width: 64 },
        { label: 'Nº Factura', width: 74 },
        { label: 'Proveedor', width: 96 },
        { label: 'Categoría', width: 88 },
        { label: 'Descripción', width: 110 },
        { label: 'Monto USD', width: 72 },
      ],
      expRes.rows.map((e) => [
        pdfDate(e.expense_date),
        String(e.invoice_number || e.control_number || '—'),
        String(e.supplier_name || '—'),
        String(e.category_name || '—'),
        String(e.description || ''),
        pdfMoney(e.amount_usd),
      ]),
    );
    doc.spacer(4);
    doc.table(
      [
        { label: 'Concepto', width: 200 },
        { label: 'Monto', width: 120 },
      ],
      [
        ['Gastos ordinarios recurrentes', `$${pdfMoney(expRes.rows.filter((e) => e.expense_subtype === 'ORDINARY_RECURRENT').reduce((a, b) => a + num(b.amount_usd), 0))}`],
        ['Gastos extraordinarios', `$${pdfMoney(expRes.rows.filter((e) => e.expense_subtype === 'EXTRAORDINARY').reduce((a, b) => a + num(b.amount_usd), 0))}`],
        ['TOTAL DEL PERÍODO', `$${pdfMoney(totalUsd)}`],
      ],
    );

    doc.spacer(8);
    doc.hr(0.4);
    doc.spacer(6);
    doc.text('Documento generado por TuCondominio360 para auditoría pública de los copropietarios.', { small: true, muted: true });
    doc.text('Los soportes (facturas originales) están disponibles en la administración de la residencia.', { small: true, muted: true });
    return doc.build();
  }
}