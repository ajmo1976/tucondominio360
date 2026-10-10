import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { resolveCondoCode } from '../../common/condo-code';

@Injectable()
export class CondosService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Código corto único dentro del tenant para numerar recibos. Si el deseado
   * ya está tomado por otra residencia, se añade un sufijo numérico.
   */
  private async resolveUniqueCondoCode(tenantId: string, desired: string, excludeId?: string): Promise<string> {
    const base = desired.slice(0, 10);
    let candidate = desired;
    let suffix = 1;
    for (;;) {
      const res = await this.db.query(
        `SELECT 1 FROM condos WHERE tenant_id = $1 AND code = $2 ${excludeId ? 'AND id <> $3' : ''} LIMIT 1`,
        excludeId ? [tenantId, candidate, excludeId] : [tenantId, candidate],
      );
      if (res.rows.length === 0) return candidate;
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
  }

  async findAll(tenantId?: string) {
    if (tenantId) {
      const res = await this.db.query(
        `SELECT id, tenant_id, name, code, rif, address, state, city, main_currency, secondary_currency, reserve_fund_rate, is_active,
                (SELECT COUNT(*) FROM property_units pu WHERE pu.condo_id = condos.id AND pu.is_active = TRUE) as units_count
         FROM condos WHERE tenant_id = $1 AND is_active = TRUE ORDER BY name ASC`,
        [tenantId],
      );
      return res.rows;
    }
    const res = await this.db.query(
      `SELECT c.id, c.tenant_id, t.name as tenant_name, c.name, c.code, c.rif, c.address, c.state, c.city,
              c.main_currency, c.secondary_currency, c.reserve_fund_rate, c.is_active,
              (SELECT COUNT(*) FROM property_units pu WHERE pu.condo_id = c.id AND pu.is_active = TRUE) as units_count
       FROM condos c
       JOIN tenants t ON t.id = c.tenant_id
       WHERE c.is_active = TRUE ORDER BY c.name ASC`,
    );
    return res.rows;
  }

  /**
   * Lista de residencias de un usuario regular: solo aquellas donde tiene un
   * acceso activo (condo_user_access) u ocupa alguna unidad. Un propietario no
   * ve los condominios de otros.
   */
  async findForUser(userId: string, tenantId?: string) {
    const tenantFilter = tenantId ? 'AND c.tenant_id = $2' : '';
    const params = tenantId ? [userId, tenantId] : [userId];
    const res = await this.db.query(
      `SELECT c.id, c.tenant_id, c.name, c.code, c.rif, c.address, c.state, c.city,
              c.main_currency, c.secondary_currency, c.reserve_fund_rate, c.is_active,
              (SELECT COUNT(*) FROM property_units pu WHERE pu.condo_id = c.id AND pu.is_active = TRUE) as units_count
       FROM condos c
       WHERE c.is_active = TRUE ${tenantFilter}
         AND (EXISTS (
                SELECT 1 FROM condo_user_access cua
                WHERE cua.condo_id = c.id AND cua.user_id = $1 AND cua.is_active = TRUE)
              OR EXISTS (
                SELECT 1 FROM unit_occupants uo
                JOIN property_units pu ON pu.id = uo.property_unit_id
                WHERE pu.condo_id = c.id AND uo.user_id = $1))
       ORDER BY c.name ASC`,
      params,
    );
    return res.rows;
  }

  async createCondo(data: any) {
    const tenantId = data.tenantId || '22222222-2222-2222-2222-222222222201';
    // Código corto para numerar los recibos (REC-CODIGO-AAAA-MM-APTO), único
    // dentro del tenant: el explícito si es válido, si no la abreviatura del nombre.
    const condoCode = await this.resolveUniqueCondoCode(
      tenantId,
      resolveCondoCode(data.name || '', data.code),
    );
    const res = await this.db.query(
      `INSERT INTO condos (
        tenant_id, name, code, rif, address, state, city, main_currency, secondary_currency, reserve_fund_rate
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        tenantId,
        data.name,
        condoCode,
        data.rif,
        data.address,
        data.state || 'Miranda',
        data.city || 'Caracas',
        data.mainCurrency || 'USD',
        data.secondaryCurrency || 'VES',
        data.reserveFundRate || 10.0,
      ],
    );
    return res.rows[0];
  }

  async updateCondo(condoId: string, data: any) {
    const currentRes = await this.db.query(
      `SELECT tenant_id, name, code FROM condos WHERE id = $1`,
      [condoId],
    );
    if (currentRes.rows.length === 0) throw new NotFoundException('Residencia no encontrada');
    const current = currentRes.rows[0];

    // El código de recibos solo cambia si la petición lo trae explícitamente;
    // si no se conserva el actual (derivándolo del nombre si aún no existía).
    let code: string | null = current.code;
    if (data.code !== undefined) {
      code = resolveCondoCode(data.name ?? current.name, data.code);
    } else if (!code && data.name !== undefined) {
      code = resolveCondoCode(data.name, null);
    }
    if (code) code = await this.resolveUniqueCondoCode(current.tenant_id, code, condoId);

    const res = await this.db.query(
      `UPDATE condos SET
        name = COALESCE($1, name),
        rif = COALESCE($2, rif),
        address = COALESCE($3, address),
        city = COALESCE($4, city),
        state = COALESCE($5, state),
        reserve_fund_rate = COALESCE($6, reserve_fund_rate),
        code = COALESCE($7, code),
        updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        data.name,
        data.rif,
        data.address,
        data.city,
        data.state,
        data.reserveFundRate,
        code,
        condoId,
      ],
    );
    return res.rows[0];
  }

  /**
   * Elimina definitivamente una residencia y TODOS sus datos asociados.
   *
   * No se usa borrado "a ciegas" por cascada: varias tablas hijas se referencian
   * entre sí con RESTRICT (condo_bills -> property_units, payment_allocations ->
   * condo_bills, expenses -> expense_categories), así que el orden explícito en
   * una transacción es lo único determinista y seguro.
   */
  async deleteCondo(condoId: string) {
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      const exists = await client.query(`SELECT id FROM condos WHERE id = $1`, [condoId]);
      if (exists.rows.length === 0) {
        throw new NotFoundException('Condominio no encontrado');
      }

      // 1. Pagos y sus asignaciones (libera RESTRICT hacia recibos y unidades)
      await client.query(
        `DELETE FROM payment_allocations
         WHERE payment_report_id IN (SELECT id FROM payment_reports WHERE condo_id = $1)`,
        [condoId],
      );
      await client.query(`DELETE FROM payment_reports WHERE condo_id = $1`, [condoId]);

      // 2. Recibos (arrastra bill_items en cascada)
      await client.query(`DELETE FROM condo_bills WHERE condo_id = $1`, [condoId]);

      // 3. Unidades (arrastra ocupantes, créditos, reservas de amenities,
      //    paquetes, invitaciones a visitantes y votos de consultas)
      await client.query(`DELETE FROM property_units WHERE condo_id = $1`, [condoId]);

      // 4. Períodos (arrastra sus gastos) y gastos huérfanos
      await client.query(`DELETE FROM billing_periods WHERE condo_id = $1`, [condoId]);
      await client.query(`DELETE FROM expenses WHERE condo_id = $1`, [condoId]);

      // 5. Estructura y operaciones del conjunto
      await client.query(`DELETE FROM buildings WHERE condo_id = $1`, [condoId]);
      await client.query(`DELETE FROM bank_accounts WHERE condo_id = $1`, [condoId]);
      await client.query(`DELETE FROM amenities WHERE condo_id = $1`, [condoId]);
      await client.query(`DELETE FROM announcements WHERE condo_id = $1`, [condoId]);
      await client.query(`DELETE FROM consultations WHERE condo_id = $1`, [condoId]);
      await client.query(`DELETE FROM maintenance_tickets WHERE condo_id = $1`, [condoId]);
      await client.query(`DELETE FROM packages WHERE condo_id = $1`, [condoId]);
      await client.query(`DELETE FROM condo_user_access WHERE condo_id = $1`, [condoId]);
      await client.query(`DELETE FROM expense_categories WHERE condo_id = $1`, [condoId]);
      await client.query(`DELETE FROM audit_logs WHERE condo_id = $1`, [condoId]);
      await client.query(`DELETE FROM visitor_access_logs WHERE condo_id = $1`, [condoId]);
      await client.query(`DELETE FROM visitor_invitations WHERE condo_id = $1`, [condoId]);

      // 6. La residencia
      const res = await client.query(`DELETE FROM condos WHERE id = $1 RETURNING id`, [condoId]);

      await client.query('COMMIT');
      return { success: true, deletedId: res.rows[0]?.id };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findById(id: string) {
    const res = await this.db.query(
      `SELECT c.*, t.name as tenant_name
       FROM condos c
       JOIN tenants t ON t.id = c.tenant_id
       WHERE c.id = $1`,
      [id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException('Condominio no encontrado');
    }
    return res.rows[0];
  }

  async getBuildings(condoId: string) {
    const res = await this.db.query(
      `SELECT id, condo_id, name, code, created_at
       FROM buildings WHERE condo_id = $1 ORDER BY name ASC`,
      [condoId],
    );
    return res.rows;
  }

  async getPropertyUnits(condoId: string) {
    const res = await this.db.query(
      `SELECT pu.id, pu.condo_id, pu.building_id, b.name as building_name,
              pu.unit_code, pu.unit_type, pu.floor, pu.aliquot_percentage,
              pu.current_balance_usd, pu.has_gas_service,
              pu.has_parking, pu.parking_number, pu.has_storage, pu.storage_number,
              pu.is_active,
              (
                SELECT json_agg(json_build_object(
                  'userId', u.id,
                  'name', concat(u.first_name, ' ', u.last_name),
                  'docNumber', concat(u.doc_type, '-', u.doc_number),
                  'phone', u.phone,
                  'email', u.email,
                  'role', uo.role,
                  'isPrimary', uo.is_primary_contact
                ))
                FROM unit_occupants uo
                JOIN users u ON u.id = uo.user_id
                WHERE uo.property_unit_id = pu.id
              ) as occupants
       FROM property_units pu
       LEFT JOIN buildings b ON b.id = pu.building_id
       WHERE pu.condo_id = $1 AND pu.is_active = TRUE
       ORDER BY pu.unit_code ASC`,
      [condoId],
    );
    return res.rows;
  }

  async getBankAccounts(condoId: string) {
    const res = await this.db.query(
      `SELECT id, condo_id, bank_code, bank_name, account_number, account_type, currency,
              account_holder_name, account_holder_rif, supports_pago_movil,
              pago_movil_phone, is_active
       FROM bank_accounts
       WHERE condo_id = $1 AND is_active = TRUE
       ORDER BY currency ASC, bank_name ASC`,
      [condoId],
    );
    return res.rows;
  }

  async createBankAccount(condoId: string, data: any) {
    const res = await this.db.query(
      `INSERT INTO bank_accounts (
        condo_id, bank_code, bank_name, account_number, account_type, currency,
        account_holder_name, account_holder_rif, supports_pago_movil,
        pago_movil_phone, pago_movil_id_type, pago_movil_id_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        condoId,
        data.bankCode || '0134',
        data.bankName || 'Banesco',
        data.accountNumber,
        data.accountType || 'Corriente',
        data.currency || 'VES',
        data.accountHolderName,
        data.accountHolderRif,
        Boolean(data.supportsPagoMovil),
        data.pagoMovilPhone || null,
        data.pagoMovilIdType || 'J',
        data.pagoMovilIdNumber || null,
      ],
    );
    return res.rows[0];
  }

  async updateBankAccount(accountId: string, data: any) {
    const res = await this.db.query(
      `UPDATE bank_accounts SET
        bank_code = COALESCE($1, bank_code),
        bank_name = COALESCE($2, bank_name),
        account_number = COALESCE($3, account_number),
        account_type = COALESCE($4, account_type),
        currency = COALESCE($5, currency),
        account_holder_name = COALESCE($6, account_holder_name),
        account_holder_rif = COALESCE($7, account_holder_rif),
        supports_pago_movil = COALESCE($8, supports_pago_movil),
        pago_movil_phone = $9,
        updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        data.bankCode,
        data.bankName,
        data.accountNumber,
        data.accountType,
        data.currency,
        data.accountHolderName,
        data.accountHolderRif,
        data.supportsPagoMovil,
        data.pagoMovilPhone || null,
        accountId,
      ],
    );
    return res.rows[0];
  }

  async deleteBankAccount(accountId: string) {
    const res = await this.db.query(
      `DELETE FROM bank_accounts WHERE id = $1 RETURNING id`,
      [accountId],
    );
    return { success: true, deletedId: res.rows[0]?.id };
  }

  async getFinancialSummary(condoId: string) {
    const stats = await this.db.query(
      `SELECT 
        COUNT(pu.id)::int as total_units,
        COALESCE(SUM(pu.aliquot_percentage), 0)::numeric(8,5) as total_aliquots,
        COALESCE(SUM(CASE WHEN pu.current_balance_usd > 0 THEN pu.current_balance_usd ELSE 0 END), 0)::numeric(14,2) as total_debt_usd,
        COALESCE(SUM(CASE WHEN pu.current_balance_usd < 0 THEN ABS(pu.current_balance_usd) ELSE 0 END), 0)::numeric(14,2) as total_credit_balance_usd
       FROM property_units pu
       WHERE pu.condo_id = $1 AND pu.is_active = TRUE`,
      [condoId],
    );

    // Periodo activo: se prefiere el más reciente que YA tenga facturación
    // (grand_total_usd > 0). Si el último periodo aperturado todavía está vacío
    // (sin gastos/recibos), el dashboard muestra el último con datos reales en
    // lugar de pintar ceros.
    const latestPeriod = await this.db.query(
      `SELECT id, period_year, period_month, status, bcv_exchange_rate, grand_total_usd, grand_total_ves,
              total_common_usd, total_ordinary_usd, total_extraordinary_usd, reserve_fund_usd
       FROM billing_periods
       WHERE condo_id = $1
       ORDER BY (COALESCE(grand_total_usd, 0) > 0) DESC, period_year DESC, period_month DESC
       LIMIT 1`,
      [condoId],
    );

    return {
      overview: stats.rows[0],
      latestBillingPeriod: latestPeriod.rows[0] || null,
    };
  }

  async createOrAssignOwner(condoId: string, unitId: string, data: any) {
    let user;
    const userCheck = await this.db.query(
      `SELECT id FROM users WHERE email = $1 OR (doc_type = $2 AND doc_number = $3)`,
      [data.email, data.docType || 'V', data.docNumber],
    );

    if (userCheck.rows.length > 0) {
      user = userCheck.rows[0];
      await this.db.query(
        `UPDATE users SET first_name = $1, last_name = $2, phone = $3, updated_at = NOW() WHERE id = $4`,
        [data.firstName, data.lastName, data.phone, user.id],
      );
    } else {
      const newUserRes = await this.db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, doc_type, doc_number, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          data.email,
          '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890123456789012',
          data.firstName,
          data.lastName,
          data.docType || 'V',
          data.docNumber,
          data.phone || null,
        ],
      );
      user = newUserRes.rows[0];
    }

    await this.db.query(
      `INSERT INTO condo_user_access (condo_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (condo_id, user_id, role) DO NOTHING`,
      [condoId, user.id, data.role || 'OWNER'],
    );

    await this.db.query(
      `INSERT INTO unit_occupants (property_unit_id, user_id, role, is_primary_contact, is_billing_recipient)
       VALUES ($1, $2, $3, TRUE, TRUE)
       ON CONFLICT (property_unit_id, user_id, role) DO UPDATE SET
         is_primary_contact = TRUE,
         is_billing_recipient = TRUE`,
      [unitId, user.id, data.role || 'OWNER'],
    );

    return { success: true, userId: user.id };
  }

  async updateOwner(userId: string, data: any) {
    const res = await this.db.query(
      `UPDATE users SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        doc_number = COALESCE($5, doc_number),
        updated_at = NOW()
       WHERE id = $6
       RETURNING id, email, first_name, last_name, doc_type, doc_number, phone`,
      [data.firstName, data.lastName, data.phone, data.email, data.docNumber, userId],
    );
    return res.rows[0];
  }

  async createPropertyUnit(condoId: string, data: any) {
    const res = await this.db.query(
      `INSERT INTO property_units (
        condo_id, unit_code, unit_type, floor, aliquot_percentage,
        current_balance_usd, has_gas_service, has_parking, parking_number,
        has_storage, storage_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        condoId,
        data.unitCode,
        data.unitType || 'APARTMENT',
        data.floor || '1',
        data.aliquotPercentage || 0,
        data.currentBalanceUsd || 0,
        data.hasGasService ?? true,
        data.hasParking ?? false,
        data.parkingNumber || null,
        data.hasStorage ?? false,
        data.storageNumber || null,
      ],
    );
    return res.rows[0];
  }

  async deletePropertyUnit(unitId: string) {
    const res = await this.db.query(
      `DELETE FROM property_units WHERE id = $1 RETURNING id`,
      [unitId],
    );
    return { success: true, deletedId: res.rows[0]?.id };
  }

  async updatePropertyUnit(unitId: string, data: any) {
    const res = await this.db.query(
      `UPDATE property_units SET
        unit_code = COALESCE($1, unit_code),
        floor = COALESCE($2, floor),
        aliquot_percentage = COALESCE($3, aliquot_percentage),
        current_balance_usd = COALESCE($4, current_balance_usd),
        has_gas_service = COALESCE($5, has_gas_service),
        has_parking = COALESCE($6, has_parking),
        parking_number = $7,
        has_storage = COALESCE($8, has_storage),
        storage_number = $9,
        updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        data.unitCode,
        data.floor,
        data.aliquotPercentage,
        data.currentBalanceUsd,
        data.hasGasService,
        data.hasParking,
        data.parkingNumber || null,
        data.hasStorage,
        data.storageNumber || null,
        unitId,
      ],
    );
    return res.rows[0];
  }
}
