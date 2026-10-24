// Visibilidad de módulos de menú por tipo de cuenta de usuario.
//
// Es la réplica en el frontend de la definición en
// packages/shared/src/modules.ts (MODULE_VISIBILITY_BY_ACCOUNT_TYPE /
// modulesVisibleForAccountType). Se mantiene aquí para que el cliente no
// tenga que importar el paquete @tucondominio360/shared completo (que
// arrastra auth.js y node:crypto, solo disponibles en el servidor).
//
// Un módulo de menú es visible solo si está habilitado para la residencia
// (sistema existente: tenant_modules / condo_modules / default_enabled) Y
// está en la lista del tipo de cuenta del usuario.

export type AccountType = 'PROPIETARIO' | 'JUNTA' | 'ADMINISTRADORA';
export type ModuleCode = string;

export const MODULE_VISIBILITY_BY_ACCOUNT_TYPE: Record<AccountType, ModuleCode[]> = {
  PROPIETARIO: [
    'DASHBOARD',
    'COMMUNITY',
    'UNITS',
    'AMENITIES',
    'MAINTENANCE',
    'ANNOUNCEMENTS',
    'CONSULTATIONS',
  ],
  JUNTA: [
    'DASHBOARD',
    'COMMUNITY',
    'BILLING',
    'UNITS',
    'EXPENSES',
    'PAYMENTS',
    'MAINTENANCE',
    'ANNOUNCEMENTS',
    'CONSULTATIONS',
  ],
  ADMINISTRADORA: [
    'DASHBOARD',
    'COMMUNITY',
    'BILLING',
    'UNITS',
    'EXPENSES',
    'PAYMENTS',
    'ACCESS',
    'AMENITIES',
    'MAINTENANCE',
    'ANNOUNCEMENTS',
    'CONSULTATIONS',
  ],
};

export function modulesVisibleForAccountType(
  accountType: AccountType,
  enabledModules: ModuleCode[],
): ModuleCode[] {
  const allowed = new Set(MODULE_VISIBILITY_BY_ACCOUNT_TYPE[accountType] ?? []);
  return enabledModules.filter((m) => allowed.has(m));
}
