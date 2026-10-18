// =============================================================================
// Matriz de permisos (capacidades) y resolución efectiva.
//
// Tres niveles de rol: SaaS (`is_superadmin`), empresa administradora
// (`TenantRole`) y residencia (`CondoRole`). Los permisos efectivos son la
// UNIÓN de los permisos de tenant y de residencia; `is_superadmin ⇒ todos`.
// =============================================================================
import type { CondoRole } from './index';

/** Rol del personal de la empresa administradora (tenant). */
export type TenantRole = 'OWNER' | 'ADMIN' | 'STAFF' | 'VIEWER';

/** Capacidad dentro de una residencia. Lista canónica (spec §6.2). */
export type CondoPermission =
  | 'CONDO_MANAGE'
  | 'USERS_MANAGE'
  | 'UNITS_MANAGE'
  | 'AUDIT_VIEW'
  | 'BILLING_MANAGE'
  | 'EXPENSES_MANAGE'
  | 'PAYMENTS_MANAGE'
  | 'PAYMENTS_REPORT'
  | 'ACCESS_MANAGE'
  | 'ACCESS_GUEST'
  | 'AMENITIES_MANAGE'
  | 'AMENITIES_BOOK'
  | 'MAINTENANCE_MANAGE'
  | 'MAINTENANCE_REPORT'
  | 'ANNOUNCEMENTS_MANAGE'
  | 'ANNOUNCEMENTS_VIEW'
  | 'ANNOUNCEMENTS_ACK'
  | 'CONSULTATIONS_MANAGE'
  | 'CONSULTATIONS_VOTE'
  | 'COMMUNITY_VIEW';

/** Todas las capacidades, en orden canónico. */
export const ALL_CONDO_PERMISSIONS: readonly CondoPermission[] = [
  'CONDO_MANAGE',
  'USERS_MANAGE',
  'UNITS_MANAGE',
  'AUDIT_VIEW',
  'BILLING_MANAGE',
  'EXPENSES_MANAGE',
  'PAYMENTS_MANAGE',
  'PAYMENTS_REPORT',
  'ACCESS_MANAGE',
  'ACCESS_GUEST',
  'AMENITIES_MANAGE',
  'AMENITIES_BOOK',
  'MAINTENANCE_MANAGE',
  'MAINTENANCE_REPORT',
  'ANNOUNCEMENTS_MANAGE',
  'ANNOUNCEMENTS_VIEW',
  'ANNOUNCEMENTS_ACK',
  'CONSULTATIONS_MANAGE',
  'CONSULTATIONS_VOTE',
  'COMMUNITY_VIEW',
];

const ALL: CondoPermission[] = [...ALL_CONDO_PERMISSIONS];

/** Permisos por rol de residencia (spec §6.2). */
export const CONDO_ROLE_PERMISSIONS: Record<CondoRole, CondoPermission[]> = {
  ADMIN: ALL,
  BOARD_PRESIDENT: ALL.filter((p) => p !== 'USERS_MANAGE'),
  BOARD_TREASURER: [
    'BILLING_MANAGE',
    'EXPENSES_MANAGE',
    'PAYMENTS_MANAGE',
    'MAINTENANCE_MANAGE',
    'ANNOUNCEMENTS_MANAGE',
    'ANNOUNCEMENTS_VIEW',
    'ANNOUNCEMENTS_ACK',
    'COMMUNITY_VIEW',
    'AUDIT_VIEW',
  ],
  BOARD_MEMBER: [
    'MAINTENANCE_MANAGE',
    'ANNOUNCEMENTS_MANAGE',
    'ANNOUNCEMENTS_VIEW',
    'ANNOUNCEMENTS_ACK',
    'CONSULTATIONS_MANAGE',
    'CONSULTATIONS_VOTE',
    'COMMUNITY_VIEW',
  ],
  OWNER: [
    'ANNOUNCEMENTS_VIEW',
    'ANNOUNCEMENTS_ACK',
    'CONSULTATIONS_VOTE',
    'AMENITIES_BOOK',
    'MAINTENANCE_REPORT',
    'PAYMENTS_REPORT',
    'COMMUNITY_VIEW',
  ],
  TENANT: [
    'ANNOUNCEMENTS_VIEW',
    'ANNOUNCEMENTS_ACK',
    'AMENITIES_BOOK',
    'MAINTENANCE_REPORT',
    'COMMUNITY_VIEW',
  ],
  GUARD: ['ACCESS_MANAGE', 'ACCESS_GUEST', 'MAINTENANCE_REPORT', 'ANNOUNCEMENTS_VIEW'],
  CONCIERGE: ['MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT', 'ANNOUNCEMENTS_VIEW'],
  AUDITOR: ['AUDIT_VIEW', 'ANNOUNCEMENTS_VIEW', 'COMMUNITY_VIEW'],
};

/** Permisos por rol de tenant: aplican a todas las residencias de la cartera. */
export const TENANT_ROLE_PERMISSIONS: Record<TenantRole, CondoPermission[]> = {
  OWNER: ALL,
  ADMIN: ALL,
  STAFF: [
    'MAINTENANCE_MANAGE',
    'MAINTENANCE_REPORT',
    'ANNOUNCEMENTS_MANAGE',
    'ANNOUNCEMENTS_VIEW',
    'ANNOUNCEMENTS_ACK',
    'ACCESS_MANAGE',
    'ACCESS_GUEST',
    'AMENITIES_MANAGE',
    'AMENITIES_BOOK',
    'UNITS_MANAGE',
    'COMMUNITY_VIEW',
  ],
  VIEWER: ['AUDIT_VIEW', 'ANNOUNCEMENTS_VIEW', 'COMMUNITY_VIEW'],
};

/**
 * Permisos efectivos de un usuario en una residencia: unión de la matriz de
 * tenant y de la de residencia (sin duplicados). Superadmin obtiene todos.
 */
export function effectivePermissions(
  tenantRole: TenantRole | null,
  condoRole: CondoRole | null,
  isSuperadmin = false,
): CondoPermission[] {
  if (isSuperadmin) return [...ALL_CONDO_PERMISSIONS];
  const perms = new Set<CondoPermission>();
  if (tenantRole && TENANT_ROLE_PERMISSIONS[tenantRole]) {
    for (const p of TENANT_ROLE_PERMISSIONS[tenantRole]) perms.add(p);
  }
  if (condoRole && CONDO_ROLE_PERMISSIONS[condoRole]) {
    for (const p of CONDO_ROLE_PERMISSIONS[condoRole]) perms.add(p);
  }
  return [...perms];
}

/** ¿La lista de permisos incluye la capacidad pedida? */
export function hasPermission(perms: CondoPermission[], p: CondoPermission): boolean {
  return perms.includes(p);
}
