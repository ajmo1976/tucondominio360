import { BadRequestException } from '@nestjs/common';
import type { TenantRole } from '@tucondominio360/shared';

/** Roles válidos del personal de la empresa administradora (tenant). */
export const TENANT_ROLES: readonly TenantRole[] = ['OWNER', 'ADMIN', 'STAFF', 'VIEWER'];

/** ¿El valor es un rol de tenant válido? */
export function isTenantRole(value: unknown): value is TenantRole {
  return typeof value === 'string' && (TENANT_ROLES as readonly string[]).includes(value);
}

/** Valida y devuelve el rol de tenant; lanza 400 si es inválido. */
export function assertTenantRole(role: unknown): TenantRole {
  if (!isTenantRole(role)) {
    throw new BadRequestException(
      `Rol de empresa administradora inválido: ${String(role)} (válidos: ${TENANT_ROLES.join(', ')})`,
    );
  }
  return role;
}
