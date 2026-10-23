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
import { assertOccupantRole, OCCUPANT_ROLES } from './occupant-role.logic';

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
  /**
   * Estado de cuenta y proveedores de autenticación para un lote de usuarios.
   * `invitationPending` es true si existe un token INVITATION vigente (sin
   * consumir ni expirar). Se resuelve en batch para no hacer N queries.
   */
  private async accountStateFor(ids: string[]) {
    if (ids.length === 0) return {} as Record<string, any>;

    const pendingRes = await this.db.query(
      `SELECT DISTINCT user_id FROM auth_tokens
        WHERE user_id = ANY($1) AND purpose = 'INVITATION'
          AND consumed_at IS NULL AND expires_at > NOW()`,
      [ids],
    );
    const pending = new Set<string>(pendingRes.rows.map((r: any) => r.user_id));

    const verifiedRes = await this.db.query(
      `SELECT id FROM users WHERE id = ANY($1) AND email_verified_at IS NOT NULL`,
      [ids],
    );
    const verified = new Set<string>(verifiedRes.rows.map((r: any) => r.id));

    const provRes = await this.db.query(
      `SELECT user_id, provider FROM user_identities WHERE user_id = ANY($1)`,
      [ids],
    );
    const providers: Record<string, string[]> = {};
    for (const r of provRes.rows) (providers[r.user_id] ||= []).push(r.provider);

    const out: Record<string, { invitationPending: boolean; emailVerified: boolean; authProviders: string[] }> = {};
    for (const id of ids) {
      out[id] = {
        invitationPending: pending.has(id),
        emailVerified: verified.has(id),
        authProviders: providers[id] || [],
      };
    }
    return out;
  }

  async list(search = '') {
    const term = search.trim();
    const usersRes = await this.db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.doc_type, u.doc_number, u.phone,
              u.is_active, u.is_superadmin, u.avatar_url, u.created_at,
              u.account_type AS "accountType"
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
      `SELECT cua.user_id, c.id AS condo_id, c.name AS condo_name, c.tenant_id,
              cua.role, cua.is_active
       FROM condo_user_access cua
       JOIN condos c ON c.id = cua.condo_id
       WHERE cua.user_id = ANY($1)
       ORDER BY c.name, cua.role`,
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

    // Membresías de empresa administradora: dan acceso a todo el portafolio
    // (la misma pata que resuelve /me/access vía composeAccess).
    const tenantsRes = await this.db.query(
      `SELECT user_id, tenant_id, role FROM tenant_users
        WHERE user_id = ANY($1) AND is_active = TRUE`,
      [ids],
    );

    const portfolioRes =
      tenantsRes.rows.length > 0
        ? await this.db.query(
            `SELECT tu.user_id, c.id AS condo_id, c.name AS condo_name, c.tenant_id,
                    tu.role AS tenant_role
               FROM tenant_users tu
               JOIN condos c ON c.tenant_id = tu.tenant_id
              WHERE tu.user_id = ANY($1) AND tu.is_active = TRUE
                AND c.is_active = TRUE
              ORDER BY c.name`,
            [ids],
          )
        : { rows: [] as any[] };

    const byAccess: Record<string, any[]> = {};
    for (const a of accessesRes.rows) (byAccess[a.user_id] ||= []).push(a);

    const byUnits: Record<string, Record<string, number>> = {};
    for (const o of occupantsRes.rows) (byUnits[o.user_id] ||= {})[o.condo_id] = o.units;

    const tenantRoleOf = new Map<string, string>();
    for (const t of tenantsRes.rows) tenantRoleOf.set(`${t.user_id}|${t.tenant_id}`, t.role);

    const portfolioByUser: Record<string, any[]> = {};
    for (const p of portfolioRes.rows) (portfolioByUser[p.user_id] ||= []).push(p);

    const state = await this.accountStateFor(ids);

    return users.map((u) => {
      // Una entrada por residencia: un usuario puede tener varios roles en la
      // misma (la tabla lo permite) y la UI necesita agruparlos por condo.
      const entries: any[] = [];
      const byCondo = new Map<string, any>();
      for (const a of byAccess[u.id] || []) {
        let entry = byCondo.get(a.condo_id);
        if (!entry) {
          entry = {
            condoId: a.condo_id,
            condoName: a.condo_name,
            role: null,
            roles: [],
            accessActive: false,
            tenantRole: tenantRoleOf.get(`${u.id}|${a.tenant_id}`) ?? null,
            units: byUnits[u.id]?.[a.condo_id] || 0,
          };
          byCondo.set(a.condo_id, entry);
          entries.push(entry);
        }
        if (!entry.roles.includes(a.role)) entry.roles.push(a.role);
        if (a.is_active) entry.accessActive = true;
      }
      for (const entry of entries) entry.role = entry.roles[0] ?? null;

      // Portafolio de la empresa (sin fila propia en condo_user_access).
      for (const p of portfolioByUser[u.id] || []) {
        if (byCondo.has(p.condo_id)) continue;
        entries.push({
          condoId: p.condo_id,
          condoName: p.condo_name,
          role: null,
          roles: [],
          accessActive: true,
          tenantRole: tenantRoleOf.get(`${u.id}|${p.tenant_id}`) ?? p.tenant_role,
          units: byUnits[u.id]?.[p.condo_id] || 0,
        });
      }
      entries.sort((a, b) => (a.condoName || '').localeCompare(b.condoName || ''));

      return {
        ...u,
        ...state[u.id],
        condos: entries,
      };
    });
  }

  /** Detalle de un usuario con sus residencias y las unidades que ocupa. */
  async findOne(id: string) {
    const userRes = await this.db.query(
      `SELECT id, email, first_name, last_name, doc_type, doc_number, phone,
              is_active, is_superadmin, created_at,
              account_type AS "accountType"
       FROM users WHERE id = $1`,
      [id],
    );
    if (userRes.rows.length === 0) throw new NotFoundException('Usuario no encontrado');
    const user = userRes.rows[0];

    const accessesRes = await this.db.query(
      `SELECT cua.condo_id, c.name AS condo_name, c.tenant_id, cua.role, cua.is_active
       FROM condo_user_access cua
       JOIN condos c ON c.id = cua.condo_id
       WHERE cua.user_id = $1
       ORDER BY c.name, cua.role`,
      [id],
    );

    // Membresía de empresa administradora: da acceso a todo su portafolio de
    // residencias aunque no exista fila explícita en condo_user_access
    // (misma pata que resuelve /me/access vía composeAccess).
    const tenantsRes = await this.db.query(
      `SELECT tu.tenant_id, tu.role, t.tenant_type, t.name AS tenant_name,
              t.rif, t.email, t.phone, t.max_condos AS "maxCondos"
         FROM tenant_users tu
         JOIN tenants t ON t.id = tu.tenant_id
        WHERE tu.user_id = $1 AND tu.is_active = TRUE`,
      [id],
    );
    const tenantRoleOf = new Map<string, string>(
      tenantsRes.rows.map((t: any) => [t.tenant_id, t.role]),
    );

    const portfolioRes =
      tenantsRes.rows.length > 0
        ? await this.db.query(
            `SELECT c.id, c.name, c.tenant_id
               FROM condos c
              WHERE c.tenant_id = ANY($1) AND c.is_active = TRUE
              ORDER BY c.name`,
            [tenantsRes.rows.map((t: any) => t.tenant_id)],
          )
        : { rows: [] as any[] };

    const unitsRes = await this.db.query(
      `SELECT uo.property_unit_id, uo.role AS occupant_role, uo.is_primary_contact,
              uo.is_billing_recipient, pu.unit_code, pu.unit_type, pu.condo_id
       FROM unit_occupants uo
       JOIN property_units pu ON pu.id = uo.property_unit_id
       WHERE uo.user_id = $1
       ORDER BY pu.condo_id, pu.unit_code`,
      [id],
    );

    const state = await this.accountStateFor([id]);

    // Una entrada por residencia agrupa todos sus roles (un usuario puede
    // tener varios en la misma) para no duplicar claves en la UI.
    const condoEntries: any[] = [];
    const byCondo = new Map<string, any>();
    for (const a of accessesRes.rows) {
      let entry = byCondo.get(a.condo_id);
      if (!entry) {
        entry = {
          condoId: a.condo_id,
          condoName: a.condo_name,
          role: null,
          roles: [] as string[],
          active: false,
          tenantRole: tenantRoleOf.get(a.tenant_id) ?? null,
        };
        byCondo.set(a.condo_id, entry);
        condoEntries.push(entry);
      }
      if (!entry.roles.includes(a.role)) entry.roles.push(a.role);
      if (a.is_active) entry.active = true;
    }
    for (const entry of condoEntries) entry.role = entry.roles[0] ?? null;

    // Residencias del portafolio del tenant sin fila propia de acceso.
    for (const c of portfolioRes.rows) {
      if (byCondo.has(c.id)) continue;
      const entry = {
        condoId: c.id,
        condoName: c.name,
        role: null,
        roles: [] as string[],
        active: true,
        tenantRole: tenantRoleOf.get(c.tenant_id) ?? null,
      };
      condoEntries.push(entry);
    }
    condoEntries.sort((a, b) => (a.condoName || '').localeCompare(b.condoName || ''));

    // Empresa (tenant COMPANY) del usuario, si tiene: el form del superadmin
    // la usa para precargar los datos y saber qué residencias ya están en la
    // cartera (el plan es tenants.max_condos).
    const companies = tenantsRes.rows
      .filter((t: any) => t.tenant_type === 'COMPANY')
      .sort((a: any, b: any) => Number(b.role === 'OWNER') - Number(a.role === 'OWNER'));
    const companyTenant = companies[0] ?? null;
    const company = companyTenant
      ? {
          id: companyTenant.tenant_id,
          name: companyTenant.tenant_name,
          rif: companyTenant.rif,
          email: companyTenant.email,
          phone: companyTenant.phone,
          maxCondos: companyTenant.maxCondos,
          condoIds: portfolioRes.rows
            .filter((c: any) => c.tenant_id === companyTenant.tenant_id)
            .map((c: any) => c.id),
        }
      : null;

    return {
      ...user,
      ...state[id],
      company,
      condos: condoEntries,
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
   * Garantiza que el usuario tenga una empresa (tenant COMPANY) con el usuario
   * como OWNER. Si ya tiene empresa no hace nada; si el RIF indicado corresponde
   * a una empresa existente, se vincula a esa empresa en vez de duplicarla.
   * Devuelve el tenant_id de la empresa.
   */
  private async ensureCompany(
    client: any,
    userId: string,
    company?: { name?: string; rif?: string; email?: string; phone?: string },
  ): Promise<string> {
    const owned = await client.query(
      `SELECT t.id FROM tenant_users tu
         JOIN tenants t ON t.id = tu.tenant_id
        WHERE tu.user_id = $1 AND tu.is_active = TRUE AND t.tenant_type = 'COMPANY'
        ORDER BY (tu.role = 'OWNER') DESC, tu.created_at
        LIMIT 1`,
      [userId],
    );
    if (owned.rows.length > 0) return owned.rows[0].id as string;

    if (!company?.name?.trim()) {
      throw new BadRequestException(
        'Para definir al usuario como Administradora indica los datos de la empresa (nombre comercial y RIF)',
      );
    }
    const rif = company.rif?.trim() || null;
    if (!rif) {
      throw new BadRequestException('El RIF de la empresa es requerido para crearla');
    }

    // ¿La empresa ya existe por RIF? -> se vincula a esa en vez de duplicarla.
    const byRif = await client.query(`SELECT id FROM tenants WHERE rif = $1`, [rif]);
    let tenantId: string;
    if (byRif.rows.length > 0) {
      tenantId = byRif.rows[0].id;
    } else {
      const base =
        company.name
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60) || 'empresa';
      let slug = base;
      let n = 1;
      while ((await client.query(`SELECT 1 FROM tenants WHERE slug = $1`, [slug])).rows.length > 0) {
        n += 1;
        slug = `${base}-${n}`;
      }
      const created = await client.query(
        `INSERT INTO tenants (name, slug, tenant_type, rif, email, phone)
         VALUES ($1, $2, 'COMPANY', $3, $4, $5)
         RETURNING id`,
        [company.name.trim(), slug, rif, company.email?.trim() || null, company.phone || null],
      );
      tenantId = created.rows[0].id;
    }

    await client.query(
      `INSERT INTO tenant_users (tenant_id, user_id, role, is_owner, is_active)
       VALUES ($1, $2, 'OWNER', TRUE, TRUE)
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET role = 'OWNER', is_owner = TRUE, is_active = TRUE`,
      [tenantId, userId],
    );
    return tenantId as string;
  }

  /**
   * Incorpora residencias a la cartera de la empresa validando el plan
   * (`tenants.max_condos`; NULL = sin límite). Solo suma residencias que aún no
   * pertenecen a la empresa — sacar residencias de una cartera no es un
   * flujo soportado (los condos siempre pertenecen a un tenant).
   */
  private async addToPortfolio(client: any, tenantId: string, condoIds: string[]): Promise<void> {
    const ids = [...new Set(condoIds)];
    if (ids.length === 0) return;

    const planRes = await client.query(`SELECT max_condos FROM tenants WHERE id = $1`, [tenantId]);
    const max = planRes.rows[0]?.max_condos ?? null;
    if (max != null) {
      const current = await client.query(
        `SELECT COUNT(*)::int AS n FROM condos WHERE tenant_id = $1 AND is_active = TRUE`,
        [tenantId],
      );
      const pending = await client.query(
        `SELECT COUNT(*)::int AS n FROM condos
          WHERE id = ANY($1::uuid[]) AND tenant_id <> $2 AND is_active = TRUE`,
        [ids, tenantId],
      );
      const total = current.rows[0].n + pending.rows[0].n;
      if (total > max) {
        throw new BadRequestException(
          `La empresa no puede superar su plan: máximo ${max} residencia(s) y quedaría con ${total}`,
        );
      }
    }

    await client.query(
      `UPDATE condos SET tenant_id = $1
        WHERE id = ANY($2::uuid[]) AND tenant_id <> $1`,
      [tenantId, ids],
    );
  }

  /** Regla de negocio: una Junta de Condominio solo puede tener UNA residencia. */
  private assertJuntaScope(condoIds: string[]): void {
    const distinct = new Set(condoIds);
    if (distinct.size > 1) {
      throw new BadRequestException(
        'Una Junta de Condominio solo puede tener una residencia asignada; elige una sola residencia',
      );
    }
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

    // Regla de negocio de entrada: una Junta de Condominio tiene UNA residencia.
    if (dto.accountType === 'JUNTA') {
      this.assertJuntaScope((dto.assignments || []).map((a) => a.condoId));
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, doc_type, doc_number, phone, is_active, is_superadmin, email_verified_at, account_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
          dto.accountType ?? 'PROPIETARIO',
        ],
      );
      const userId = userRes.rows[0].id;

      // ADMINISTRADORA: se crea (o vincula) su empresa y se incorporan las
      // residencias de su cartera respetando el plan (tenants.max_condos).
      if (dto.accountType === 'ADMINISTRADORA') {
        const tenantId = await this.ensureCompany(client, userId, dto.company);
        if (dto.portfolioCondoIds?.length) {
          await this.addToPortfolio(client, tenantId, dto.portfolioCondoIds);
        }
      }

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
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (property_unit_id, user_id, role) DO UPDATE SET
               is_primary_contact = COALESCE($4, unit_occupants.is_primary_contact),
               is_billing_recipient = COALESCE($5, unit_occupants.is_billing_recipient)`,
            [ua.unitId, userId, ua.occupantRole ?? 'OWNER', ua.isPrimaryContact ?? true, ua.isBillingRecipient ?? true],
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

  /** Envía al usuario un enlace para que él mismo defina su nueva contraseña. */
  async sendPasswordResetLink(id: string) {
    const res = await this.db.query(`SELECT id, email FROM users WHERE id = $1`, [id]);
    if (res.rows.length === 0) throw new NotFoundException('Usuario no encontrado');
    const user = res.rows[0] as { id: string; email: string };

    const token = await this.tokens.issue(id, 'PASSWORD_RESET', user.email);
    await this.mail.sendPasswordReset(
      user.email,
      `${this.appBaseUrl()}/reset-password?token=${token}`,
    );
    return { sent: true };
  }

  /**
   * Actualiza datos del usuario. Si llega `assignments`, reemplaza por completo
   * sus accesos a residencias y las unidades que ocupa (las tablas no tienen FK
   * apuntando hacia ellas, el reemplazo es seguro).
   */
  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.db.query(`SELECT id, account_type FROM users WHERE id = $1`, [id]);
    if (existing.rows.length === 0) throw new NotFoundException('Usuario no encontrado');
    const currentType = existing.rows[0].account_type as string;
    const effectiveType = dto.accountType ?? currentType;

    // Regla de negocio: una Junta de Condominio solo puede tener UNA residencia.
    if (effectiveType === 'JUNTA') {
      if (dto.assignments !== undefined) {
        this.assertJuntaScope(dto.assignments.map((a) => a.condoId));
      } else if (dto.accountType === 'JUNTA') {
        const cur = await this.db.query(
          `SELECT COUNT(DISTINCT condo_id)::int AS n
             FROM condo_user_access
            WHERE user_id = $1 AND is_active = TRUE`,
          [id],
        );
        if (cur.rows[0].n > 1) {
          throw new BadRequestException(
            'Una Junta de Condominio solo puede tener una residencia asignada; este usuario tiene residencias en varias. Quita las extras antes de definirlo como Junta.',
          );
        }
      }
    }

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
           account_type = COALESCE($10, account_type),
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
          dto.accountType,
        ],
      );
      if (userRes.rows.length === 0) throw new NotFoundException('Usuario no encontrado');

      // ADMINISTRADORA: garantiza su empresa (la crea con los datos si no
      // existe) e incorpora residencias a la cartera validando el plan.
      if (effectiveType === 'ADMINISTRADORA') {
        const tenantId = await this.ensureCompany(client, id, dto.company);
        if (dto.portfolioCondoIds?.length) {
          await this.addToPortfolio(client, tenantId, dto.portfolioCondoIds);
        }
      }

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
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (property_unit_id, user_id, role) DO UPDATE SET
                 is_primary_contact = COALESCE($4, unit_occupants.is_primary_contact),
                 is_billing_recipient = COALESCE($5, unit_occupants.is_billing_recipient)`,
              [ua.unitId, id, ua.occupantRole ?? 'OWNER', ua.isPrimaryContact ?? true, ua.isBillingRecipient ?? true],
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