import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../../database/database.service';
import { TokensService } from '../auth/tokens.service';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * Tablas que bloquean el borrado físico de un usuario (FK RESTRICT). Si el
 * usuario tiene actividad en alguna, el módulo recomienda desactivarlo.
 */
const USER_HISTORY_CHECKS: Array<{ column: string; table: string; label: string }> = [
  { table: 'payment_reports', column: 'reported_by_user_id', label: 'pagos reportados' },
  { table: 'bank_statements', column: 'uploaded_by_user_id', label: 'estados de cuenta cargados' },
  { table: 'consultations', column: 'created_by_user_id', label: 'consultas creadas' },
  { table: 'consultation_votes', column: 'user_id', label: 'votaciones de consultas' },
  { table: 'announcements', column: 'author_user_id', label: 'anuncios publicados' },
  { table: 'packages', column: 'received_by_guard_id', label: 'paquetería recibida en garita' },
  { table: 'visitor_access_logs', column: 'guard_user_id', label: 'registros de visitantes en garita' },
  { table: 'maintenance_tickets', column: 'reported_by_user_id', label: 'reportes de mantenimiento' },
];

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
  ) {}

  /** Lista de usuarios con residencias y unidades asignadas (para el módulo de administración). */
  async list(search = '') {
    const term = search.trim();
    const usersRes = await this.db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.doc_type, u.doc_number, u.phone,
              u.is_active, u.is_superadmin, u.avatar_url, u.created_at
       FROM users u
       WHERE $1 = '' OR u.first_name ILIKE $2 OR u.last_name ILIKE $2
          OR u.email ILIKE $2 OR u.doc_number ILIKE $2
       ORDER BY u.created_at DESC`,
      [term, `%${term}%`],
    );

    const users = usersRes.rows;
    if (users.length === 0) return [];

    const ids = users.map((u) => u.id);

    const accessesRes = await this.db.query(
      `SELECT cua.user_id, c.id AS condo_id, c.name AS condo_name, cua.role, cua.is_active
       FROM condo_user_access cua
       JOIN condos c ON c.id = cua.condo_id
       WHERE cua.user_id = ANY($1)
       ORDER BY c.name`,
      [ids],
    );

    const occupantsRes = await this.db.query(
      `SELECT uo.user_id, pu.condo_id, COUNT(*)::int AS units
       FROM unit_occupants uo
       JOIN property_units pu ON pu.id = uo.property_unit_id
       WHERE uo.user_id = ANY($1)
       GROUP BY uo.user_id, pu.condo_id`,
      [ids],
    );

    const byAccess: Record<string, any[]> = {};
    for (const a of accessesRes.rows) (byAccess[a.user_id] ||= []).push(a);

    const byUnits: Record<string, Record<string, number>> = {};
    for (const o of occupantsRes.rows) (byUnits[o.user_id] ||= {})[o.condo_id] = o.units;

    return users.map((u) => ({
      ...u,
      condos: (byAccess[u.id] || []).map((a) => ({
        condoId: a.condo_id,
        condoName: a.condo_name,
        role: a.role,
        accessActive: a.is_active,
        units: byUnits[u.id]?.[a.condo_id] || 0,
      })),
    }));
  }

  /** Detalle de un usuario con sus residencias y las unidades que ocupa. */
  async findOne(id: string) {
    const userRes = await this.db.query(
      `SELECT id, email, first_name, last_name, doc_type, doc_number, phone,
              is_active, is_superadmin, created_at
       FROM users WHERE id = $1`,
      [id],
    );
    if (userRes.rows.length === 0) throw new NotFoundException('Usuario no encontrado');
    const user = userRes.rows[0];

    const accessesRes = await this.db.query(
      `SELECT cua.condo_id, c.name AS condo_name, cua.role, cua.is_active
       FROM condo_user_access cua
       JOIN condos c ON c.id = cua.condo_id
       WHERE cua.user_id = $1
       ORDER BY c.name`,
      [id],
    );

    const unitsRes = await this.db.query(
      `SELECT uo.property_unit_id, uo.role AS occupant_role, uo.is_primary_contact,
              uo.is_billing_recipient, pu.unit_code, pu.unit_type, pu.condo_id
       FROM unit_occupants uo
       JOIN property_units pu ON pu.id = uo.property_unit_id
       WHERE uo.user_id = $1
       ORDER BY pu.condo_id, pu.unit_code`,
      [id],
    );

    return {
      ...user,
      condos: accessesRes.rows.map((a) => ({
        condoId: a.condo_id,
        condoName: a.condo_name,
        role: a.role,
        active: a.is_active,
      })),
      units: unitsRes.rows.map((u) => ({
        unitId: u.property_unit_id,
        unitCode: u.unit_code,
        unitType: u.unit_type,
        condoId: u.condo_id,
        role: u.occupant_role,
        isPrimaryContact: u.is_primary_contact,
        isBillingRecipient: u.is_billing_recipient,
      })),
    };
  }

  /**
   * Dashboard de un usuario para la administración: residencias y roles,
   * unidades asignadas, recibos/deuda y pagos reportados. Da trazabilidad
   * transparente del estado real de cada persona del sistema.
   */
  async getDashboard(id: string) {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];

    const userRes = await this.db.query(
      `SELECT id, email, first_name, last_name, doc_type, doc_number, phone,
              is_active, is_superadmin, created_at
       FROM users WHERE id = $1`,
      [id],
    );
    if (userRes.rows.length === 0) throw new NotFoundException('Usuario no encontrado');
    const user = userRes.rows[0];

    // Residencias donde tiene rol (condo_user_access).
    const accessesRes = await this.db.query(
      `SELECT cua.condo_id, c.name AS condo_name, cua.role, cua.is_active
       FROM condo_user_access cua
       JOIN condos c ON c.id = cua.condo_id
       WHERE cua.user_id = $1
       ORDER BY c.name`,
      [id],
    );

    // Unidades que ocupa (unit_occupants).
    const unitsRes = await this.db.query(
      `SELECT uo.property_unit_id, uo.role AS occupant_role, uo.valid_from, uo.valid_to,
              pu.unit_code, pu.unit_type, pu.floor, pu.condo_id, b.name AS building_name
       FROM unit_occupants uo
       JOIN property_units pu ON pu.id = uo.property_unit_id
       LEFT JOIN buildings b ON b.id = pu.building_id
       WHERE uo.user_id = $1
       ORDER BY pu.condo_id, pu.unit_code`,
      [id],
    );

    // Recibos de las unidades que ocupa el usuario (misma lógica de estado
    // visible que el portal de propietario: PAGADO / PARCIAL / MOROSO / PENDIENTE).
    const billsRes = await this.db.query(
      `SELECT cb.id AS bill_id, pu.unit_code, c.name AS condo_name,
              bp.period_year, bp.period_month, bp.issue_date, bp.due_date,
              cb.total_due_usd, cb.total_paid_usd, cb.remaining_balance_usd,
              cb.status AS bill_status,
              (SELECT COUNT(*)::int FROM payment_reports pr
               WHERE pr.condo_bill_id = cb.id AND pr.status = 'PENDING') AS pending_reports
       FROM unit_occupants uo
       JOIN property_units pu ON pu.id = uo.property_unit_id
       JOIN condos c ON c.id = pu.condo_id
       JOIN condo_bills cb ON cb.property_unit_id = pu.id
         AND (cb.total_due_usd <> 0 OR cb.total_paid_usd <> 0 OR cb.remaining_balance_usd <> 0)
       JOIN billing_periods bp ON bp.id = cb.billing_period_id
       WHERE uo.user_id = $1
       ORDER BY c.name, pu.unit_code, bp.period_year DESC, bp.period_month DESC`,
      [id],
    );

    // Pagos reportados por el usuario.
    const payRes = await this.db.query(
      `SELECT pr.id, pu.unit_code, c.name AS condo_name,
              pr.payment_method, pr.reference_number, pr.payment_date,
              pr.amount_paid, pr.currency, pr.equivalent_usd, pr.status,
              pr.notes, pr.rejection_reason, pr.created_at, pr.verified_at
       FROM payment_reports pr
       JOIN property_units pu ON pu.id = pr.property_unit_id
       JOIN condos c ON c.id = pu.condo_id
       WHERE pr.reported_by_user_id = $1
       ORDER BY pr.created_at DESC
       LIMIT 50`,
      [id],
    );

    // Agrupar unidades por residencia (y listar las que queden fuera de un
    // acceso, por consistencia con los datos actuales).
    const byCondo = new Map<string, any[]>();
    for (const u of unitsRes.rows) {
      const list = byCondo.get(u.condo_id) || [];
      list.push({
        unitId: u.property_unit_id,
        unitCode: u.unit_code,
        unitType: u.unit_type,
        floor: u.floor,
        buildingName: u.building_name,
        occupantRole: u.occupant_role,
        validFrom: u.valid_from,
        validTo: u.valid_to,
      });
      byCondo.set(u.condo_id, list);
    }

    const accessCondos = new Set<string>();
    const condos = accessesRes.rows.map((a) => {
      accessCondos.add(a.condo_id);
      return {
        condoId: a.condo_id,
        condoName: a.condo_name,
        role: a.role,
        accessActive: a.is_active,
        units: byCondo.get(a.condo_id) || [],
      };
    });

    const orphanUnits = unitsRes.rows
      .filter((u) => !accessCondos.has(u.condo_id))
      .map((u) => ({
        unitId: u.property_unit_id,
        unitCode: u.unit_code,
        unitType: u.unit_type,
        floor: u.floor,
        buildingName: u.building_name,
        occupantRole: u.occupant_role,
      }));

    const bills = billsRes.rows.map((b) => {
      const remaining = Number(b.remaining_balance_usd || 0);
      const paid = Number(b.total_paid_usd || 0);
      const status =
        b.bill_status === 'CANCELLED'
          ? 'CANCELLED'
          : remaining <= 0
            ? 'PAID'
            : paid > 0
              ? 'PARTIAL'
              : b.due_date < new Date().toISOString().slice(0, 10)
                ? 'OVERDUE'
                : 'PENDING';
      const year = b.period_year;
      const month = b.period_month;
      return {
        billId: b.bill_id,
        unitCode: b.unit_code,
        condoName: b.condo_name,
        periodLabel: year && month ? `${months[month - 1]} ${year}` : null,
        periodYear: year,
        periodMonth: month,
        dueDate: b.due_date,
        issueDate: b.issue_date,
        totalDueUsd: Number(b.total_due_usd || 0),
        totalPaidUsd: paid,
        remainingUsd: remaining,
        status,
        pendingReports: Number(b.pending_reports || 0),
      };
    });

    let totalDebtUsd = 0;
    let totalDueUsd = 0;
    let openBills = 0;
    let pendingPayments = 0;
    for (const bill of bills) {
      totalDebtUsd = Number((totalDebtUsd + bill.remainingUsd).toFixed(2));
      totalDueUsd = Number((totalDueUsd + bill.totalDueUsd).toFixed(2));
      if (bill.remainingUsd > 0.004 && bill.status !== 'CANCELLED') openBills++;
      pendingPayments += bill.pendingReports;
    }

    let verifiedPaymentsUsd = 0;
    const paymentReports = payRes.rows.map((p) => {
      if (p.status === 'VERIFIED') {
        verifiedPaymentsUsd = Number((verifiedPaymentsUsd + Number(p.equivalent_usd || 0)).toFixed(2));
      }
      return {
        id: p.id,
        unitCode: p.unit_code,
        condoName: p.condo_name,
        method: p.payment_method,
        referenceNumber: p.reference_number,
        paymentDate: p.payment_date,
        amountPaid: Number(p.amount_paid || 0),
        currency: p.currency,
        equivalentUsd: Number(p.equivalent_usd || 0),
        status: p.status,
        notes: p.notes,
        rejectionReason: p.rejection_reason,
        createdAt: p.created_at,
        verifiedAt: p.verified_at,
      };
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        docType: user.doc_type,
        docNumber: user.doc_number,
        phone: user.phone,
        isActive: user.is_active,
        isSuperadmin: user.is_superadmin,
        createdAt: user.created_at,
      },
      summary: {
        totalDebtUsd,
        totalDueUsd,
        openBills,
        pendingPayments,
        verifiedPaymentsUsd,
        condosCount: condos.length,
        unitsCount: unitsRes.rows.length,
        paymentsCount: paymentReports.length,
      },
      condos,
      units: orphanUnits,
      bills,
      paymentReports,
    };
  }

  /**
   * Crea un usuario y sus asignaciones de residencias/unidades.
   *
   * Si llega `password`, la cuenta queda activa con correo verificado. Si no,
   * se crea sin contraseña (`password_hash = NULL`) y se envía una invitación
   * por correo para que el usuario defina su clave o entre con Google.
   */
  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const dup = await this.db.query(`SELECT id FROM users WHERE LOWER(email) = $1`, [email]);
    if (dup.rows.length > 0) {
      throw new ConflictException('Ya existe un usuario con ese correo electrónico');
    }

    const hasPassword = !!dto.password;
    const passwordHash = hasPassword ? await bcrypt.hash(dto.password as string, 10) : null;
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, doc_type, doc_number, phone, is_active, is_superadmin, email_verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          email,
          passwordHash,
          dto.firstName.trim(),
          dto.lastName.trim(),
          dto.docType ?? 'V',
          dto.docNumber?.trim() ?? null,
          dto.phone || null,
          dto.isActive ?? true,
          dto.isSuperadmin ?? false,
          hasPassword ? new Date() : null,
        ],
      );
      const userId = userRes.rows[0].id;

      for (const a of dto.assignments || []) {
        await client.query(
          `INSERT INTO condo_user_access (condo_id, user_id, role, is_active)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (condo_id, user_id, role) DO NOTHING`,
          [a.condoId, userId, a.role],
        );
        for (const ua of a.units || []) {
          await client.query(
            `INSERT INTO unit_occupants (property_unit_id, user_id, role, is_primary_contact, is_billing_recipient)
             VALUES ($1, $2, $3, TRUE, TRUE)
             ON CONFLICT (property_unit_id, user_id, role) DO UPDATE SET
               is_primary_contact = TRUE,
               is_billing_recipient = TRUE`,
            [ua.unitId, userId, a.role],
          );
        }
      }

      await client.query('COMMIT');

      const detail = await this.findOne(userId);
      if (!hasPassword) {
        const token = await this.tokens.issue(userId, 'INVITATION', email);
        await this.mail.sendInvitation(email, `${this.appBaseUrl()}/accept-invite?token=${token}`);
        return { ...detail, invitationSent: true, emailVerified: false };
      }
      return { ...detail, invitationSent: false, emailVerified: true };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err?.code === '23505') {
        throw new ConflictException('Ya existe un usuario con ese correo electrónico');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /** URL base pública de la web, para armar los enlaces de los correos. */
  private appBaseUrl(): string {
    return process.env.APP_URL ?? process.env.WEB_APP_URL ?? 'http://localhost:3000';
  }

  /**
   * Reenvía la invitación a un usuario que aún no activó su cuenta. Se niega si
   * el correo ya está verificado (en ese caso corresponde el reseteo de clave).
   */
  async resendInvitation(id: string) {
    const res = await this.db.query(
      `SELECT id, email, email_verified_at FROM users WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) throw new NotFoundException('Usuario no encontrado');
    const user = res.rows[0] as { email: string; email_verified_at: string | null };
    if (user.email_verified_at) {
      throw new BadRequestException('El usuario ya activó su cuenta');
    }

    const token = await this.tokens.issue(id, 'INVITATION', user.email);
    await this.mail.sendInvitation(user.email, `${this.appBaseUrl()}/accept-invite?token=${token}`);
    return { sent: true };
  }

  /** Anula las invitaciones pendientes de un usuario. */
  async revokeInvitation(id: string) {
    const exists = await this.db.query(`SELECT id FROM users WHERE id = $1`, [id]);
    if (exists.rows.length === 0) throw new NotFoundException('Usuario no encontrado');

    const res = await this.db.query(
      `DELETE FROM auth_tokens
        WHERE user_id = $1 AND purpose = 'INVITATION' AND consumed_at IS NULL
        RETURNING id`,
      [id],
    );
    return { revoked: res.rows.length > 0 };
  }

  /**
   * Actualiza datos del usuario. Si llega `assignments`, reemplaza por completo
   * sus accesos a residencias y las unidades que ocupa (las tablas no tienen FK
   * apuntando hacia ellas, el reemplazo es seguro).
   */
  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.db.query(`SELECT id FROM users WHERE id = $1`, [id]);
    if (existing.rows.length === 0) throw new NotFoundException('Usuario no encontrado');

    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      const dup = await this.db.query(
        `SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2`,
        [email, id],
      );
      if (dup.rows.length > 0) {
        throw new ConflictException('Ya existe otro usuario con ese correo electrónico');
      }
      dto.email = email;
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const userRes = await client.query(
        `UPDATE users SET
           first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           email = COALESCE($3, email),
           doc_type = COALESCE($4, doc_type),
           doc_number = COALESCE($5, doc_number),
           phone = COALESCE($6, phone),
           is_active = COALESCE($7, is_active),
           is_superadmin = COALESCE($8, is_superadmin),
           updated_at = NOW()
         WHERE id = $9
         RETURNING id`,
        [
          dto.firstName?.trim(),
          dto.lastName?.trim(),
          dto.email,
          dto.docType,
          dto.docNumber?.trim(),
          dto.phone,
          dto.isActive,
          dto.isSuperadmin,
          id,
        ],
      );
      if (userRes.rows.length === 0) throw new NotFoundException('Usuario no encontrado');

      if (dto.assignments !== undefined) {
        await client.query(`DELETE FROM condo_user_access WHERE user_id = $1`, [id]);
        await client.query(`DELETE FROM unit_occupants WHERE user_id = $1`, [id]);

        for (const a of dto.assignments) {
          await client.query(
            `INSERT INTO condo_user_access (condo_id, user_id, role, is_active)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT (condo_id, user_id, role) DO UPDATE SET is_active = TRUE`,
            [a.condoId, id, a.role],
          );
          for (const ua of a.units || []) {
            await client.query(
              `INSERT INTO unit_occupants (property_unit_id, user_id, role, is_primary_contact, is_billing_recipient)
               VALUES ($1, $2, $3, TRUE, TRUE)
               ON CONFLICT (property_unit_id, user_id, role) DO UPDATE SET
                 is_primary_contact = TRUE,
                 is_billing_recipient = TRUE`,
              [ua.unitId, id, a.role],
            );
          }
        }
      }

      await client.query('COMMIT');
      return this.findOne(id);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err?.code === '23505') {
        throw new ConflictException('Ya existe otro usuario con ese correo electrónico');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /** La administración asigna una nueva contraseña (el usuario la cambia luego en su perfil). */
  async resetPassword(id: string, password: string) {
    const hash = await bcrypt.hash(password, 10);
    const res = await this.db.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
      [hash, id],
    );
    if (res.rows.length === 0) throw new NotFoundException('Usuario no encontrado');
    return { success: true };
  }

  /**
   * Borra físicamente al usuario solo si no tiene historial registrado (pagos,
   * consultas, garita, etc.). Si lo tiene, responde 409 pidiendo desactivarlo.
   */
  async remove(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta de usuario');
    }

    const userRes = await this.db.query(
      `SELECT id, is_superadmin FROM users WHERE id = $1`,
      [id],
    );
    if (userRes.rows.length === 0) throw new NotFoundException('Usuario no encontrado');

    if (userRes.rows[0].is_superadmin) {
      const supers = await this.db.query(
        `SELECT COUNT(*)::int AS n FROM users WHERE is_superadmin = TRUE`,
      );
      if (supers.rows[0].n <= 1) {
        throw new BadRequestException('No se puede eliminar al último Super Administrador del sistema');
      }
    }

    const existsRes = await this.db.query(
      `SELECT
         EXISTS (SELECT 1 FROM payment_reports WHERE reported_by_user_id = $1) AS payment_reports,
         EXISTS (SELECT 1 FROM bank_statements WHERE uploaded_by_user_id = $1) AS bank_statements,
         EXISTS (SELECT 1 FROM consultations WHERE created_by_user_id = $1) AS consultations,
         EXISTS (SELECT 1 FROM consultation_votes WHERE user_id = $1) AS consultation_votes,
         EXISTS (SELECT 1 FROM announcements WHERE author_user_id = $1) AS announcements,
         EXISTS (SELECT 1 FROM packages WHERE received_by_guard_id = $1) AS packages,
         EXISTS (SELECT 1 FROM visitor_access_logs WHERE guard_user_id = $1) AS visitor_access_logs,
         EXISTS (SELECT 1 FROM maintenance_tickets WHERE reported_by_user_id = $1) AS maintenance_tickets`,
      [id],
    );

    const row = existsRes.rows[0];
    const blockers = USER_HISTORY_CHECKS.filter((c) => row[c.table]).map((c) => c.label);

    if (blockers.length > 0) {
      throw new ConflictException(
        `El usuario tiene historial registrado (${blockers.join(', ')}). ` +
          `Desactívalo en su lugar para conservar la trazabilidad.`,
      );
    }

    const del = await this.db.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [id]);
    if (del.rows.length === 0) throw new NotFoundException('Usuario no encontrado');
    return { success: true, deletedId: id };
  }
}