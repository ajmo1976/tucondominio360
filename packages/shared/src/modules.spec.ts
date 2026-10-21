import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  resolveEnabledModules,
  resolveModuleSource,
  CORE_MODULES,
  MODULE_CATALOG,
  canToggleModule,
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