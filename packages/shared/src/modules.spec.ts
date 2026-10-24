import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  resolveEnabledModules,
  resolveModuleSource,
  CORE_MODULES,
  MODULE_CATALOG,
  canToggleModule,
  modulesVisibleForAccountType,
  type ModuleCode,
} from './modules';

test('por defecto todos los modulos del catalogo estan activos', () => {
  const enabled = resolveEnabledModules();
  assert.equal(enabled.length, MODULE_CATALOG.length);
});

test('el override de residencia gana sobre el de tenant', () => {
  const tenant = { MAINTENANCE: true } as any;
  const condo = { MAINTENANCE: false } as any;
  assert.equal(resolveEnabledModules(tenant, condo).includes('MAINTENANCE'), false);
  assert.equal(resolveModuleSource('MAINTENANCE', tenant, condo), 'CONDO');
});

test('el override de tenant aplica si la residencia no lo define', () => {
  const tenant = { ACCESS: false } as any;
  assert.equal(resolveEnabledModules(tenant, {}).includes('ACCESS'), false);
  assert.equal(resolveModuleSource('ACCESS', tenant, {}), 'TENANT');
});

test('los modulos core nunca se apagan', () => {
  const off = Object.fromEntries(CORE_MODULES.map((c) => [c, false]));
  const enabled = resolveEnabledModules(off as any, off as any);
  for (const c of CORE_MODULES) assert.ok(enabled.includes(c));
  assert.equal(resolveModuleSource(CORE_MODULES[0], off as any, off as any), 'CORE');
});

test('el catalogo no tiene codigos duplicados y respeta sortOrder', () => {
  assert.equal(new Set(MODULE_CATALOG.map((m) => m.code)).size, MODULE_CATALOG.length);
  const orders = MODULE_CATALOG.map((m) => m.sortOrder);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
});

test('canToggleModule: no se puede apagar un modulo core', () => {
  assert.equal(canToggleModule('DASHBOARD', false), false);
  assert.equal(canToggleModule('USERS', false), false);
});

test('canToggleModule: se puede apagar un modulo no core', () => {
  assert.equal(canToggleModule('MAINTENANCE', false), true);
  assert.equal(canToggleModule('MAINTENANCE', true), true);
});

test('modulesVisibleForAccountType: PROPIETARIO no ve modulos de administracion financiera', () => {
  const enabled = ['DASHBOARD', 'COMMUNITY', 'BILLING', 'UNITS', 'EXPENSES', 'PAYMENTS', 'ACCESS', 'AMENITIES', 'MAINTENANCE', 'ANNOUNCEMENTS', 'CONSULTATIONS'];
  const visible = modulesVisibleForAccountType('PROPIETARIO', enabled);
  assert.ok(visible.includes('DASHBOARD'));
  assert.ok(visible.includes('COMMUNITY'));
  assert.ok(visible.includes('UNITS'));
  assert.ok(visible.includes('AMENITIES'));
  assert.ok(!visible.includes('BILLING'), 'propietario no ve Gestion de Recibos');
  assert.ok(!visible.includes('EXPENSES'), 'propietario no ve Gastos y Facturas');
  assert.ok(!visible.includes('PAYMENTS'), 'propietario no ve Conciliacion de Pagos');
  assert.ok(!visible.includes('ACCESS'), 'propietario no ve Control de Acceso');
  assert.ok(!visible.includes('USERS'), 'propietario no ve Usuarios y Accesos');
});

test('modulesVisibleForAccountType: JUNTA ve modulos administrativos salvo acceso y areas', () => {
  const enabled = ['DASHBOARD', 'COMMUNITY', 'BILLING', 'UNITS', 'EXPENSES', 'PAYMENTS', 'ACCESS', 'AMENITIES', 'MAINTENANCE', 'ANNOUNCEMENTS', 'CONSULTATIONS'];
  const visible = modulesVisibleForAccountType('JUNTA', enabled);
  assert.ok(visible.includes('BILLING'));
  assert.ok(visible.includes('EXPENSES'));
  assert.ok(visible.includes('PAYMENTS'));
  assert.ok(visible.includes('MAINTENANCE'));
  assert.ok(!visible.includes('ACCESS'), 'junta por defecto no ve Control de Acceso');
  assert.ok(!visible.includes('AMENITIES'), 'junta por defecto no ve Reserva de Areas');
});

test('modulesVisibleForAccountType: ADMINISTRADORA ve todo el menu de administracion', () => {
  const enabled = ['DASHBOARD', 'COMMUNITY', 'BILLING', 'UNITS', 'EXPENSES', 'PAYMENTS', 'ACCESS', 'AMENITIES', 'MAINTENANCE', 'ANNOUNCEMENTS', 'CONSULTATIONS'];
  const visible = modulesVisibleForAccountType('ADMINISTRADORA', enabled);
  assert.equal(visible.length, enabled.length);
});

test('modulesVisibleForAccountType: respeta modulos desactivados por condominio', () => {
  // Aunque la cuenta Administradora permite ACCESS, si el condominio lo dejo
  // apagado, no debe verse.
  const enabled = ['DASHBOARD', 'COMMUNITY', 'UNITS', 'MAINTENANCE', 'ANNOUNCEMENTS', 'CONSULTATIONS']; // ACCESS apagado por condo
  const visible = modulesVisibleForAccountType('ADMINISTRADORA', enabled);
  assert.ok(!visible.includes('ACCESS'));
});

test('modulesVisibleForAccountType: cuenta desconocida no muestra nada', () => {
  const visible = modulesVisibleForAccountType('DESCONOCIDO' as any, ['DASHBOARD']);
  assert.equal(visible.length, 0);
});