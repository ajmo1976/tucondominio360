import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assertPermission } from './condo-permission.logic';

test('lanza 403 si falta el permiso', () => {
  assert.throws(() => assertPermission(['COMMUNITY_VIEW'], 'BILLING_MANAGE'), /No tienes permiso/);
});
test('no lanza si el permiso esta', () => {
  assert.doesNotThrow(() => assertPermission(['BILLING_MANAGE'], 'BILLING_MANAGE'));
});
