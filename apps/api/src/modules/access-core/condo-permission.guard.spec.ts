import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assertPermission, assertAnyPermission } from './condo-permission.logic';

test('lanza 403 si falta el permiso', () => {
  assert.throws(() => assertPermission(['COMMUNITY_VIEW'], 'BILLING_MANAGE'), /No tienes permiso/);
});
test('no lanza si el permiso esta', () => {
  assert.doesNotThrow(() => assertPermission(['BILLING_MANAGE'], 'BILLING_MANAGE'));
});
test('assertAnyPermission pasa si tiene una de las capacidades', () => {
  assert.doesNotThrow(() =>
    assertAnyPermission(['MAINTENANCE_REPORT'], ['MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT']),
  );
});
test('assertAnyPermission lanza 403 si no tiene ninguna', () => {
  assert.throws(
    () => assertAnyPermission(['COMMUNITY_VIEW'], ['MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT']),
    /No tienes permiso/,
  );
});
