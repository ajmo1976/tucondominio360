import { Injectable } from '@nestjs/common';
import type { CondoPermission, CondoRole, TenantRole } from '@tucondominio360/shared';
import { DatabaseService } from '../../database/database.service';
import { composeAccess, type CondoAccess } from './access.logic';
import { assertAnyPermission } from './condo-permission.logic';

/**
 * Resuelve el acceso efectivo de un usuario: rol de tenant (empresa
 * administradora), rol(es) de residencia y rol(es) de ocupante por unidad.
 *
 * Vive en `access-core` para no chocar con el módulo de Garita (`modules/access`).
 */
@Injectable()
export class AccessService {
  constructor(private readonly db: DatabaseService) {}

  /** Acceso efectivo de un usuario a una residencia concreta. */
  async resolveCondoAccess(userId: string, condoId: string): Promise<CondoAccess> {
    const userRes = await this.db.query(`SELECT is_superadmin FROM users WHERE id = $1`, [userId]);
    const isSuperadmin = userRes.rows[0]?.is_superadmin === true;

    const condoRes = await this.db.query(`SELECT tenant_id FROM condos WHERE id = $1`, [condoId]);
    const tenantId: string | null = condoRes.rows[0]?.tenant_id ?? null;

    let tenantRole: TenantRole | null = null;
    if (tenantId) {
      const tuRes = await this.db.query(
        `SELECT role FROM tenant_users
          WHERE tenant_id = $1 AND user_id = $2 AND is_active = TRUE`,
        [tenantId, userId],
      );
      tenantRole = (tuRes.rows[0]?.role as TenantRole) ?? null;
    }

    const cuaRes = await this.db.query(
      `SELECT role FROM condo_user_access
        WHERE condo_id = $1 AND user_id = $2 AND is_active = TRUE`,
      [condoId, userId],
    );
    const condoRoles = cuaRes.rows.map((r: any) => r.role as CondoRole).filter(Boolean);

    const occRes = await this.db.query(
      `SELECT DISTINCT uo.role
         FROM unit_occupants uo
         JOIN property_units pu ON pu.id = uo.property_unit_id
        WHERE pu.condo_id = $1 AND uo.user_id = $2
          AND (uo.valid_to IS NULL OR uo.valid_to >= CURRENT_DATE)`,
      [condoId, userId],
    );
    const occupantRoles = occRes.rows.map((r: any) => r.role as string);

    return composeAccess({
      isSuperadmin,
      condoId,
      tenantId,
      tenantRole,
      condoRole: null,
      condoRoles,
      occupantRoles,
    });
  }

  /**
   * Resuelve el acceso del usuario a la residencia y exige al menos una de las
   * capacidades indicadas; lanza 403 si no las tiene. Devuelve el `CondoAccess`
   * para reutilizarlo. Pensado para chequeos dentro de servicios, donde el
   * `condoId` se conoce tras cargar la entidad (p. ej. el ticket).
   */
  async assertCondoPermission(
    userId: string,
    condoId: string,
    ...required: CondoPermission[]
  ): Promise<CondoAccess> {
    const access = await this.resolveCondoAccess(userId, condoId);
    assertAnyPermission(access.permissions, required);
    return access;
  }

  /**
   * Acceso efectivo a todas las residencias relevantes del usuario: las de su
   * cartera como tenant, aquellas con acceso directo y donde es ocupante.
   */
  async resolveUserAccess(userId: string): Promise<{ condos: CondoAccess[] }> {
    const userRes = await this.db.query(`SELECT is_superadmin FROM users WHERE id = $1`, [userId]);
    const isSuperadmin = userRes.rows[0]?.is_superadmin === true;

    const condosRes = isSuperadmin
      ? await this.db.query(`SELECT id FROM condos WHERE is_active = TRUE ORDER BY name`)
      : await this.db.query(
          `SELECT DISTINCT c.id, c.name
             FROM condos c
            WHERE c.is_active = TRUE
              AND (
                c.id IN (SELECT condo_id FROM condo_user_access WHERE user_id = $1 AND is_active = TRUE)
                OR c.tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = $1 AND is_active = TRUE)
                OR c.id IN (
                  SELECT pu.condo_id
                    FROM property_units pu
                    JOIN unit_occupants uo ON uo.property_unit_id = pu.id
                   WHERE uo.user_id = $1
                     AND (uo.valid_to IS NULL OR uo.valid_to >= CURRENT_DATE)
                )
              )
            ORDER BY c.name`,
          [userId],
        );

    const condos = await Promise.all(
      condosRes.rows.map((r: any) => this.resolveCondoAccess(userId, r.id)),
    );
    return { condos };
  }
}
