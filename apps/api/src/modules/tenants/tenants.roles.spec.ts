import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assertTenantRole } from './tenants.logic';

test('rechaza rol de tenant invalido', () => {
  assert.throws(() => assertTenantRole('SUPERMAN'), /rol/i);
});
test('acepta OWNER y STAFF', () => {
  assert.equal(assertTenantRole('OWNER'), 'OWNER');
  assert.equal(assertTenantRole('STAFF'), 'STAFF');
});
