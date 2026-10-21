import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  ModuleCode,
  ModuleDefinition,
  MODULE_CATALOG,
  CORE_MODULES,
  resolveEnabledModules,
  resolveModuleSource,
  type ModuleOverrides,
} from '@tucondominio360/shared';
import { canToggleModule } from './modules.logic';

@Injectable()
export class ModulesService {
  constructor(private readonly db: DatabaseService) {}

  /** Catálogo global con default_enabled actual. */
  async getGlobal(): Promise<ModuleDefinition[]> {
    const rows = await this.db.query(
      `SELECT code, name, description, default_enabled, is_core, sort_order
         FROM modules ORDER BY sort_order`,
    );
    return rows.rows;
  }

  /** Cambia el default global de un módulo (solo superadmin). */
  async setGlobalDefault(code: ModuleCode, defaultEnabled: boolean): Promise<void> {
    if (!canToggleModule(code, defaultEnabled)) {
      throw new BadRequestException(`El módulo ${code} es obligatorio y no puede desactivarse`);
    }
    const res = await this.db.query(
      `UPDATE modules SET default_enabled = $1, updated_at = NOW()
       WHERE code = $2`,
      [defaultEnabled, code],
    );
    if (res.rowCount === 0) throw new NotFoundException(`Módulo ${code} no encontrado`);
  }

  /** Overrides actuales de un tenant. */
  async getTenantOverrides(tenantId: string): Promise<Record<ModuleCode, boolean>> {
    const rows = await this.db.query(
      `SELECT module_code, enabled FROM tenant_modules WHERE tenant_id = $1`,
      [tenantId],
    );
    const overrides: Record<ModuleCode, boolean> = {} as any;
    for (const r of rows.rows) overrides[r.module_code as ModuleCode] = r.enabled;
    return overrides;
  }

  /** Cambia/crea un override de tenant (solo superadmin o tenant OWNER/ADMIN). */
  async setTenantOverride(
    tenantId: string,
    code: ModuleCode,
    enabled: boolean,
    actor: { isSuperadmin: boolean; tenantId?: string; tenantRole?: string },
  ): Promise<void> {
    // Autorización
    if (!actor.isSuperadmin) {
      if (actor.tenantId !== tenantId) {
        throw new ForbiddenException('No tienes permiso sobre esta empresa administradora');
      }
      if (actor.tenantRole !== 'OWNER' && actor.tenantRole !== 'ADMIN') {
        throw new ForbiddenException('Solo OWNER/ADMIN del tenant pueden cambiar módulos');
      }
    }

    if (!canToggleModule(code, enabled)) {
      throw new BadRequestException(`El módulo ${code} es obligatorio y no puede desactivarse`);
    }

    await this.db.query(
      `INSERT INTO tenant_modules (tenant_id, module_code, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, module_code) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         updated_at = NOW()`,
      [tenantId, code, enabled],
    );
  }

  /** Overrides efectivos de un condo (une tenant + condo). */
  async getEffectiveForCondo(condoId: string): Promise<
    Array<{ code: ModuleCode; enabled: boolean; source: 'CORE' | 'CONDO' | 'TENANT' | 'GLOBAL' }>
  > {
    // 1) Traer tenant_id del condo
    const condoRes = await this.db.query(
      `SELECT tenant_id FROM condos WHERE id = $1`,
      [condoId],
    );
    if (condoRes.rows.length === 0) throw new NotFoundException('Residencia no encontrada');
    const tenantId = condoRes.rows[0].tenant_id;

    // 2) Overrides de tenant
    const tenantRows = await this.db.query(
      `SELECT module_code, enabled FROM tenant_modules WHERE tenant_id = $1`,
      [tenantId],
    );
    const tenantOverrides: ModuleOverrides = {};
    for (const r of tenantRows.rows) tenantOverrides[r.module_code as ModuleCode] = r.enabled;

    // 3) Overrides de condo
    const condoRows = await this.db.query(
      `SELECT module_code, enabled FROM condo_modules WHERE condo_id = $1`,
      [condoId],
    );
    const condoOverrides: ModuleOverrides = {};
    for (const r of condoRows.rows) condoOverrides[r.module_code as ModuleCode] = r.enabled;

    // 4) Resolver efectivos
    const enabled = resolveEnabledModules(tenantOverrides, condoOverrides);
    const enabledSet = new Set(enabled);

    // 5) Devolver con source
    return MODULE_CATALOG.map((m) => ({
      code: m.code,
      enabled: enabledSet.has(m.code),
      source: m.isCore
        ? 'CORE'
        : condoOverrides[m.code] !== undefined
          ? 'CONDO'
          : tenantOverrides[m.code] !== undefined
            ? 'TENANT'
            : 'GLOBAL',
    }));
  }

  /** Cambia/crea un override de condo (requiere CONDO_MANAGE o superadmin). */
  async setCondoOverride(
    condoId: string,
    code: ModuleCode,
    enabled: boolean,
    actor: { isSuperadmin: boolean; hasCondoManage: boolean },
  ): Promise<void> {
    if (!actor.isSuperadmin && !actor.hasCondoManage) {
      throw new ForbiddenException('Se requiere permiso CONDO_MANAGE para cambiar módulos de la residencia');
    }

    if (!canToggleModule(code, enabled)) {
      throw new BadRequestException(`El módulo ${code} es obligatorio y no puede desactivarse`);
    }

    await this.db.query(
      `INSERT INTO condo_modules (condo_id, module_code, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (condo_id, module_code) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         updated_at = NOW()`,
      [condoId, code, enabled],
    );
  }

  /** Módulos efectivos por usuario (para GET /api/me/modules). */
  async getEffectiveForUser(userId: string): Promise<Record<string, ModuleCode[]>> {
    // Primero verificamos si es superadmin
    const userRes = await this.db.query(`SELECT is_superadmin FROM users WHERE id = $1`, [userId]);
    const isSuperadmin = userRes.rows[0]?.is_superadmin === true;

    // Traer tenant_id del usuario (si es staff de tenant)
    const tuRes = await this.db.query(
      `SELECT tenant_id, role FROM tenant_users WHERE user_id = $1 AND is_active = TRUE`,
      [userId],
    );
    const tenantId = tuRes.rows[0]?.tenant_id;
    const tenantRole = tuRes.rows[0]?.role;

    // Trae todas las residencias relevantes
    let condosRes;
    if (isSuperadmin) {
      // Superadmin ve todos los condos activos
      condosRes = await this.db.query(
        `SELECT id, name, tenant_id FROM condos WHERE is_active = TRUE ORDER BY name`,
      );
    } else if (tenantId && (tenantRole === 'OWNER' || tenantRole === 'ADMIN')) {
      // Tenant admin ve todos los condos de su tenant
      condosRes = await this.db.query(
        `SELECT id, name, tenant_id FROM condos WHERE tenant_id = $1 AND is_active = TRUE ORDER BY name`,
        [tenantId],
      );
    } else {
      // Usuario normal: solo condos donde tiene acceso directo o es ocupante
      condosRes = await this.db.query(
        `SELECT DISTINCT c.id, c.name, c.tenant_id
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
    }

    const result: Record<string, ModuleCode[]> = {};
    for (const c of condosRes.rows) {
      // Overrides de tenant
      const tenantRows = await this.db.query(
        `SELECT module_code, enabled FROM tenant_modules WHERE tenant_id = $1`,
        [c.tenant_id],
      );
      const tenantOverrides: ModuleOverrides = {};
      for (const r of tenantRows.rows) tenantOverrides[r.module_code as ModuleCode] = r.enabled;

      // Overrides de condo
      const condoRows = await this.db.query(
        `SELECT module_code, enabled FROM condo_modules WHERE condo_id = $1`,
        [c.id],
      );
      const condoOverrides: ModuleOverrides = {};
      for (const r of condoRows.rows) condoOverrides[r.module_code as ModuleCode] = r.enabled;

      result[c.id] = resolveEnabledModules(tenantOverrides, condoOverrides);
    }
    return result;
  }

  /** Lanza 403 si el módulo está desactivado para la residencia. */
  async assertEnabled(condoId: string, code: ModuleCode): Promise<void> {
    const effective = await this.getEffectiveForCondo(condoId);
    const mod = effective.find((m) => m.code === code);
    if (!mod?.enabled) {
      throw new ForbiddenException({
        message: `El módulo ${code} está desactivado para esta residencia`,
        code: 'MODULE_DISABLED',
      });
    }
  }
}