// =============================================================================
// Catálogo de módulos y resolución de estado (on/off) — Fase C
// =============================================================================
//
// Tres niveles de override (el más específico gana):
// 1. CORE           → is_core = true (nunca se apaga)
// 2. CONDO          → condo_modules.enabled
// 3. TENANT         → tenant_modules.enabled
// 4. GLOBAL         → modules.default_enabled
//
// Fuente de verdad: esta definición DEBE coincidir con la migración
// 20261017_modules_control.sql y database/schema.sql.

/** Código canónico de cada módulo (clave primaria en BD). */
export type ModuleCode =
  | 'DASHBOARD'
  | 'COMMUNITY'
  | 'BILLING'
  | 'UNITS'
  | 'USERS'
  | 'EXPENSES'
  | 'PAYMENTS'
  | 'ACCESS'
  | 'AMENITIES'
  | 'MAINTENANCE'
  | 'ANNOUNCEMENTS'
  | 'CONSULTATIONS';

/** Definición completa de un módulo (espejo de la tabla `modules`). */
export interface ModuleDefinition {
  code: ModuleCode;
  name: string;
  description: string;
  defaultEnabled: boolean;
  isCore: boolean;
  sortOrder: number;
}

/** Catálogo completo, en orden de `sort_order` (misma data que la migración). */
export const MODULE_CATALOG: readonly ModuleDefinition[] = [
  { code: 'DASHBOARD',     name: 'Dashboard General',          description: 'Indicadores y resumen del condominio', defaultEnabled: true,  isCore: true,  sortOrder: 10 },
  { code: 'COMMUNITY',     name: 'Portal del Propietario',     description: 'Mi estado de cuenta y recibos',        defaultEnabled: true,  isCore: true,  sortOrder: 20 },
  { code: 'BILLING',       name: 'Gestión de Recibos',         description: 'Emisión y cobranza de recibos',        defaultEnabled: true,  isCore: true,  sortOrder: 30 },
  { code: 'UNITS',         name: 'Propietarios y Alícuotas',   description: 'Unidades, propietarios y alícuotas',   defaultEnabled: true,  isCore: true,  sortOrder: 40 },
  { code: 'USERS',         name: 'Usuarios y Accesos',         description: 'Administración de usuarios y roles',   defaultEnabled: true,  isCore: true,  sortOrder: 50 },
  { code: 'EXPENSES',      name: 'Gastos y Facturas',          description: 'Registro de gastos del condominio',    defaultEnabled: true,  isCore: false, sortOrder: 60 },
  { code: 'PAYMENTS',      name: 'Conciliación de Pagos',      description: 'Pagos reportados y conciliación',      defaultEnabled: true,  isCore: false, sortOrder: 70 },
  { code: 'ACCESS',        name: 'Control de Acceso',          description: 'Invitaciones y bitácora de garita',    defaultEnabled: true,  isCore: false, sortOrder: 80 },
  { code: 'AMENITIES',     name: 'Reserva de Áreas Comunes',   description: 'Reservas y alquiler de espacios',      defaultEnabled: true,  isCore: false, sortOrder: 90 },
  { code: 'MAINTENANCE',   name: 'Mantenimiento',              description: 'Tickets de averías y seguimiento',     defaultEnabled: true,  isCore: false, sortOrder: 100 },
  { code: 'ANNOUNCEMENTS', name: 'Cartelera Digital',          description: 'Comunicados con acuse de recibo',      defaultEnabled: true,  isCore: false, sortOrder: 110 },
  { code: 'CONSULTATIONS', name: 'Consultas y Asambleas',      description: 'Votaciones y asambleas digitales',     defaultEnabled: true,  isCore: false, sortOrder: 120 },
] as const;

/** Códigos de los módulos core (derivado del catálogo para single source of truth). */
export const CORE_MODULES: readonly ModuleCode[] = MODULE_CATALOG
  .filter((m) => m.isCore)
  .map((m) => m.code) as ModuleCode[];

/** Overrides parciales por nivel (true = activado, false = desactivado). */
export type ModuleOverrides = Partial<Record<ModuleCode, boolean>>;

/** Origen de la decisión para un módulo concreto. */
export type ModuleSource = 'CORE' | 'CONDO' | 'TENANT' | 'GLOBAL';

/**
 * Devuelve la lista de códigos de módulos efectivamente activados para un
 * usuario en una residencia, aplicando la jerarquía:
 *   CORE > CONDO override > TENANT override > GLOBAL default
 */
export function resolveEnabledModules(
  tenantOverrides?: ModuleOverrides,
  condoOverrides?: ModuleOverrides,
): ModuleCode[] {
  const enabled: ModuleCode[] = [];
  for (const m of MODULE_CATALOG) {
    if (m.isCore) {
      enabled.push(m.code);
      continue;
    }
    const condoVal = condoOverrides?.[m.code];
    if (condoVal !== undefined) {
      if (condoVal) enabled.push(m.code);
      continue;
    }
    const tenantVal = tenantOverrides?.[m.code];
    if (tenantVal !== undefined) {
      if (tenantVal) enabled.push(m.code);
      continue;
    }
    if (m.defaultEnabled) enabled.push(m.code);
  }
  return enabled;
}

/**
 * Indica de dónde provino la decisión final para un módulo específico.
 * Útil para badges en la UI (badge "Residencia" / "Empresa" / "Global" / "Obligatorio").
 */
export function resolveModuleSource(
  code: ModuleCode,
  tenantOverrides?: ModuleOverrides,
  condoOverrides?: ModuleOverrides,
): ModuleSource {
  const mod = MODULE_CATALOG.find((m) => m.code === code);
  if (!mod) return 'GLOBAL';
  if (mod.isCore) return 'CORE';
  if (condoOverrides?.[code] !== undefined) return 'CONDO';
  if (tenantOverrides?.[code] !== undefined) return 'TENANT';
  return 'GLOBAL';
}

/** Valida si un módulo puede cambiar su estado (activar/desactivar). */
export function canToggleModule(code: ModuleCode, enabled: boolean): boolean {
  const mod = MODULE_CATALOG.find((m) => m.code === code);
  if (!mod) return false;
  if (mod.isCore && !enabled) return false; // core nunca se apaga
  return true;
}

/** Map para lookups rápidos por código. */
export const MODULE_BY_CODE: ReadonlyMap<ModuleCode, ModuleDefinition> = new Map(
  MODULE_CATALOG.map((m) => [m.code, m]),
);

// -----------------------------------------------------------------------------
// Visibilidad de módulos de menú por tipo de cuenta de usuario
// -----------------------------------------------------------------------------
//
// Complementa el sistema de módulos por condominio/empresa
// (tenant_modules / condo_modules / modules.default_enabled). Un módulo de
// menú es visible solo si cumple AMBAS condiciones:
//   1. Está habilitado para la residencia seleccionada (sistema existente).
//   2. Está en la lista del tipo de cuenta del usuario (esta matriz).
//
// Los módulos CORE (DASHBOARD, COMMUNITY, BILLING, UNITS, USERS) nunca se
// apagan por condominio; aquí decidimos solo la visibilidad de menú por rol
// de cuenta:
//
// - PROPIETARIO: ve lo propio (mis recibos vía COMMUNITY, mis unidades,
//   reservas de áreas, reportes de mantenimiento, cartelera, consultas). No
//   ve gestión de recibos (BILLING), gastos (EXPENSES), pagos (PAYMENTS),
//   control de acceso (ACCESS) ni administración de usuarios (USERS).
// - JUNTA: ve módulos de administración del condominio excepto los que
//   dependen de un rol específico dentro de la junta (ACCESS solo si tiene
//   garita; AMENITIES solo si tiene áreas comunes). Se afinará por
//   condo_role en una fase posterior.
// - ADMINISTRADORA: ve todo el menú de administración.
export type AccountType = 'PROPIETARIO' | 'JUNTA' | 'ADMINISTRADORA';

export const MODULE_VISIBILITY_BY_ACCOUNT_TYPE: Record<AccountType, ReadonlyArray<ModuleCode>> = {
  PROPIETARIO: [
    'DASHBOARD',
    'COMMUNITY',
    'UNITS',
    'AMENITIES',
    'MAINTENANCE',
    'ANNOUNCEMENTS',
    'CONSULTATIONS',
  ] as const,
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
  ] as const,
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
  ] as const,
};

/** Filtra los módulos efectivos de una residencia dejando solo los que son
 * visibles para el tipo de cuenta del usuario. Devuelve [] si el accountType
 * no se reconoce (modo seguro: no muestra nada no listado explícitamente). */
export function modulesVisibleForAccountType(
  accountType: AccountType,
  enabledModules: readonly string[],
): ModuleCode[] {
  const allowed = new Set(MODULE_VISIBILITY_BY_ACCOUNT_TYPE[accountType] ?? []);
  return enabledModules.filter((m) => allowed.has(m as ModuleCode)) as ModuleCode[];
}