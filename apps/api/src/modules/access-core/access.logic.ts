// =============================================================================
// Composición pura de acceso (sin BD) para poder testear la resolución de
// permisos sin dobles de base de datos.
// =============================================================================
import {
  CONDO_ROLE_PERMISSIONS,
  effectivePermissions,
  type CondoPermission,
  type CondoRole,
  type TenantRole,
} from '@tucondominio360/shared';

export type AccessSource = 'SUPERADMIN' | 'TENANT' | 'CONDO' | 'NONE';

export interface CondoAccess {
  isSuperadmin: boolean;
  tenantId: string | null;
  tenantRole: TenantRole | null;
  condoRole: CondoRole | null;
  occupantRoles: string[];
  isStaff: boolean;
  permissions: CondoPermission[];
  source: AccessSource;
}

export interface ComposeAccessInput {
  isSuperadmin: boolean;
  tenantId?: string | null;
  tenantRole: TenantRole | null;
  condoRole: CondoRole | null;
  /** Permite representar a un usuario con varios roles en la misma residencia. */
  condoRoles?: CondoRole[];
  occupantRoles?: string[];
}

/** Roles de residencia que implican condición de personal/gestión. */
const STAFF_CONDO_ROLES: CondoRole[] = [
  'ADMIN',
  'BOARD_PRESIDENT',
  'BOARD_TREASURER',
  'BOARD_MEMBER',
  'GUARD',
  'CONCIERGE',
  'AUDITOR',
];

/** De varios roles, devuelve el más permisivo (mayor cantidad de permisos). */
function mostPermissive(roles: CondoRole[]): CondoRole | null {
  let best: CondoRole | null = null;
  let bestCount = -1;
  for (const role of roles) {
    const count = (CONDO_ROLE_PERMISSIONS[role] ?? []).length;
    if (count > bestCount) {
      best = role;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Compone el acceso efectivo de un usuario en una residencia a partir de sus
 * roles ya resueltos. La unión de todos sus roles de residencia evita conceder
 * de menos cuando hay filas duplicadas por error.
 */
export function composeAccess(input: ComposeAccessInput): CondoAccess {
  const { isSuperadmin, tenantRole } = input;
  const roles = input.condoRoles?.length
    ? input.condoRoles
    : input.condoRole
      ? [input.condoRole]
      : [];
  const condoRole = mostPermissive(roles);

  let permissions: CondoPermission[];
  if (isSuperadmin) {
    permissions = effectivePermissions(tenantRole, condoRole, true);
  } else {
    const merged = new Set<CondoPermission>();
    for (const p of effectivePermissions(tenantRole, null)) merged.add(p);
    for (const role of roles) {
      for (const p of effectivePermissions(null, role)) merged.add(p);
    }
    permissions = [...merged];
  }

  const source: AccessSource = isSuperadmin
    ? 'SUPERADMIN'
    : tenantRole
      ? 'TENANT'
      : condoRole
        ? 'CONDO'
        : 'NONE';

  const isStaff =
    isSuperadmin ||
    (tenantRole != null && tenantRole !== 'VIEWER') ||
    (condoRole != null && STAFF_CONDO_ROLES.includes(condoRole));

  return {
    isSuperadmin,
    tenantId: input.tenantId ?? null,
    tenantRole,
    condoRole,
    occupantRoles: input.occupantRoles ?? [],
    isStaff,
    permissions,
    source,
  };
}
