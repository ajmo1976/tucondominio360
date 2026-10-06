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

    const newStatus = approved ? 'VERIFIED' : 'REJECTED';

    const updateRes = await this.db.query(
      `UPDATE payment_reports
       SET status = $1, verified_by_user_id = $2, verified_at = NOW(), rejection_reason = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newStatus, verifiedByUserId, approved ? null : reason || 'Rechazado por administración', paymentId],
    );

    return updateRes.rows[0];
  }
}
