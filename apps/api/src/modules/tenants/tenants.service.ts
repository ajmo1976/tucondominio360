import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TenantRole } from '@tucondominio360/shared';
import { DatabaseService } from '../../database/database.service';
import { assertTenantRole } from './tenants.logic';
import type { UpdateTenantDto } from './dto/tenant-staff.dto';

/**
 * Empresa administradora (tenant) y su personal.
 *
 * Un tenant agrupa varias residencias (`condos.tenant_id`). Su personal tiene
 * acceso a TODAS las residencias de la cartera; el rol (`tenant_users.role`)
 * decide qué puede hacer en cada una (ver matriz de permisos en shared).
 */
@Injectable()
export class TenantsService {
  constructor(private readonly db: DatabaseService) {}

  /** Autoriza al superadmin o al personal OWNER/ADMIN del propio tenant. */
  private async assertTenantAdmin(user: any, tenantId: string): Promise<void> {
    if (user?.is_superadmin) return;
    const res = await this.db.query(
      `SELECT role FROM tenant_users
        WHERE tenant_id = $1 AND user_id = $2 AND is_active = TRUE`,
      [tenantId, user?.id],
    );
    const role = res.rows[0]?.role as TenantRole | undefined;
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('No tienes permiso sobre esta empresa administradora');
    }
  }

  /**
   * Lista de empresas. El superadmin ve todas (con su cartera y plan); el
   * resto solo ve las empresas donde es OWNER/ADMIN.
   */
  async listTenants(user: any) {
    const params: any[] = [];
    let scope = '';
    if (!user?.is_superadmin) {
      scope = `WHERE EXISTS (
        SELECT 1 FROM tenant_users tu
         WHERE tu.tenant_id = t.id AND tu.user_id = $1
           AND tu.is_active = TRUE AND tu.role IN ('OWNER', 'ADMIN'))`;
      params.push(user?.id);
    }
    const res = await this.db.query(
      `SELECT t.id, t.name, t.slug, t.tenant_type, t.rif, t.email, t.phone, t.address,
              t.is_active, t.created_at AS "createdAt",
              t.max_condos AS "maxCondos",
              (SELECT COUNT(*)::int FROM condos c
                WHERE c.tenant_id = t.id AND c.is_active = TRUE) AS "condosCount",
              (SELECT COUNT(*)::int FROM tenant_users tu2
                WHERE tu2.tenant_id = t.id AND tu2.is_active = TRUE) AS "staffCount"
         FROM tenants t
         ${scope}
        ORDER BY t.name ASC`,
      params,
    );
    return res.rows;
  }

  /** Datos de la administradora y las residencias de su cartera. */
  async getTenant(user: any, tenantId: string) {
    await this.assertTenantAdmin(user, tenantId);
    const tenantRes = await this.db.query(
      `SELECT id, name, slug, tenant_type, rif, email, phone, address, logo_url, is_active, settings,
              max_condos AS "maxCondos"
         FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (tenantRes.rows.length === 0) throw new NotFoundException('Empresa administradora no encontrada');
    const t = tenantRes.rows[0];

    const condosRes = await this.db.query(
      `SELECT id, name, code, rif, city, state, is_active
         FROM condos WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId],
    );

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      tenantType: t.tenant_type,
      rif: t.rif,
      email: t.email,
      phone: t.phone,
      address: t.address,
      logoUrl: t.logo_url,
      isActive: t.is_active,
      settings: t.settings,
      maxCondos: t.maxCondos,
      condos: condosRes.rows,
    };
  }

  /** Actualiza datos de contacto de la administradora y, para el superadmin, su plan (max_condos). */
  async updateTenant(user: any, tenantId: string, dto: UpdateTenantDto) {
    await this.assertTenantAdmin(user, tenantId);

    if (dto.maxCondos !== undefined) {
      if (!user?.is_superadmin) {
        throw new ForbiddenException('Solo el superadmin puede cambiar el plan de residencias de la empresa');
      }
      if (dto.maxCondos !== null) {
        const cur = await this.db.query(
          `SELECT COUNT(*)::int AS n FROM condos WHERE tenant_id = $1 AND is_active = TRUE`,
          [tenantId],
        );
        if (dto.maxCondos < cur.rows[0].n) {
          throw new BadRequestException(
            `El plan no puede ser menor que las ${cur.rows[0].n} residencias actuales de la empresa`,
          );
        }
      }
    }

    const res = await this.db.query(
      `UPDATE tenants SET
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         phone = COALESCE($3, phone),
         max_condos = CASE WHEN $5 THEN max_condos ELSE $6 END,
         updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, slug, tenant_type, rif, email, phone, address, logo_url, is_active, settings,
                 max_condos AS "maxCondos"`,
      [
        dto.name ?? null,
        dto.email ?? null,
        dto.phone ?? null,
        tenantId,
        dto.maxCondos === undefined,
        dto.maxCondos ?? null,
      ],
    );
    if (res.rows.length === 0) throw new NotFoundException('Empresa administradora no encontrada');
    return res.rows[0];
  }

  /** Personal de la empresa administradora. */
  async listStaff(user: any, tenantId: string) {
    await this.assertTenantAdmin(user, tenantId);
    const res = await this.db.query(
      `SELECT tu.user_id AS "userId", tu.role, tu.is_owner AS "isOwner", tu.is_active AS "isActive",
              u.email, u.first_name AS "firstName", u.last_name AS "lastName",
              u.phone, u.email_verified_at AS "emailVerifiedAt",
              tu.created_at AS "createdAt"
         FROM tenant_users tu
         JOIN users u ON u.id = tu.user_id
        WHERE tu.tenant_id = $1
        ORDER BY (tu.role = 'OWNER') DESC, u.first_name ASC`,
      [tenantId],
    );
    return res.rows;
  }

  /** Asigna o cambia el rol de un usuario dentro del tenant (upsert). */
  async setStaffRole(user: any, tenantId: string, userId: string, roleInput: unknown) {
    await this.assertTenantAdmin(user, tenantId);
    const role = assertTenantRole(roleInput);

    const tenant = await this.db.query(`SELECT 1 FROM tenants WHERE id = $1`, [tenantId]);
    if (tenant.rows.length === 0) throw new NotFoundException('Empresa administradora no encontrada');

    const target = await this.db.query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
    if (target.rows.length === 0) throw new NotFoundException('Usuario no encontrado');

    const res = await this.db.query(
      `INSERT INTO tenant_users (tenant_id, user_id, role, is_owner, is_active)
       VALUES ($1, $2, $3, FALSE, TRUE)
       ON CONFLICT (tenant_id, user_id) DO UPDATE
         SET role = EXCLUDED.role,
             is_owner = EXCLUDED.is_owner,
             is_active = TRUE
       RETURNING user_id AS "userId", role, is_owner AS "isOwner", is_active AS "isActive"`,
      [tenantId, userId, role],
    );
    return res.rows[0];
  }

  /** Quita a un usuario del personal del tenant. Protege al último OWNER. */
  async removeStaff(user: any, tenantId: string, userId: string) {
    await this.assertTenantAdmin(user, tenantId);

    const current = await this.db.query(
      `SELECT role FROM tenant_users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    if (current.rows.length === 0) throw new NotFoundException('El usuario no pertenece a esta empresa');

    if (current.rows[0].role === 'OWNER') {
      const owners = await this.db.query(
        `SELECT count(*)::int AS n FROM tenant_users
          WHERE tenant_id = $1 AND role = 'OWNER' AND is_active = TRUE`,
        [tenantId],
      );
      if (owners.rows[0].n <= 1) {
        throw new BadRequestException('No se puede quitar al último OWNER de la empresa administradora');
      }
    }

    await this.db.query(`DELETE FROM tenant_users WHERE tenant_id = $1 AND user_id = $2`, [
      tenantId,
      userId,
    ]);
    return { success: true };
  }
}
