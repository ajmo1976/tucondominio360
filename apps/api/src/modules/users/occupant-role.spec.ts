import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assertOccupantRole } from './occupant-role.logic';

test('rechaza un condo_role como rol de ocupante', () => {
  assert.throws(() => assertOccupantRole('ADMIN'), /ocupante/i);
});
test('acepta OWNER, CO_OWNER, TENANT, RESIDENT, AUTHORIZED', () => {
  for (const r of ['OWNER','CO_OWNER','TENANT','RESIDENT','AUTHORIZED']) assert.equal(assertOccupantRole(r), r);
});