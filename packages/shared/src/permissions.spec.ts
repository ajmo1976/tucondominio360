import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { effectivePermissions, hasPermission, CONDO_ROLE_PERMISSIONS } from './permissions';

test('ADMIN de residencia tiene todos los permisos de condominio', () => {
  const p = effectivePermissions(null, 'ADMIN');
  assert.ok(hasPermission(p, 'CONDO_MANAGE'));
  assert.ok(hasPermission(p, 'BILLING_MANAGE'));
});
test('OWNER no puede gestionar gastos', () => {
  const p = effectivePermissions(null, 'OWNER');
  assert.equal(hasPermission(p, 'EXPENSES_MANAGE'), false);
  assert.ok(hasPermission(p, 'PAYMENTS_REPORT'));
});
test('tenant ADMIN ve y opera todas las residencias de su cartera', () => {
  const p = effectivePermissions('ADMIN', null);
  assert.ok(hasPermission(p, 'MAINTENANCE_MANAGE'));
  assert.ok(hasPermission(p, 'BILLING_MANAGE'));
});
test('union de roles no quita permisos', () => {
  const p = effectivePermissions('VIEWER', 'GUARD');
  assert.ok(hasPermission(p, 'ACCESS_MANAGE'));
  assert.ok(hasPermission(p, 'AUDIT_VIEW'));
});
test('superadmin tiene permiso total', () => {
  assert.ok(hasPermission(effectivePermissions(null, null, true), 'USERS_MANAGE'));
});
test('no hay duplicados en la matriz', () => {
  for (const list of Object.values(CONDO_ROLE_PERMISSIONS)) {
    assert.equal(new Set(list).size, list.length);
  }
});
