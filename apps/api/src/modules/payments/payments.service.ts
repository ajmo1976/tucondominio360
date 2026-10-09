import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ReportPaymentDto } from './dto/report-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly db: DatabaseService) {}

  async reportPayment(userId: string, dto: ReportPaymentDto) {
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
        exchange_rate_applied, equivalent_usd, receipt_image_url, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'PENDING')
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
             concat(u.first_name, ' ', u.last_name) as reported_by_name
      FROM payment_reports pr
      JOIN property_units pu ON pu.id = pr.property_unit_id
      LEFT JOIN buildings b ON b.id = pu.building_id
      LEFT JOIN bank_accounts ba ON ba.id = pr.bank_account_id
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
