import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { composeAccess } from './access.logic';

test('superadmin obtiene todos los permisos y source SUPERADMIN', () => {
  const a = composeAccess({ isSuperadmin: true, tenantRole: null, condoRole: null, occupantRoles: [] });
  assert.equal(a.source, 'SUPERADMIN');
  assert.ok(a.permissions.includes('USERS_MANAGE'));
});
test('tenant ADMIN sin rol de condo es staff', () => {
  const a = composeAccess({ isSuperadmin: false, tenantRole: 'ADMIN', condoRole: null, occupantRoles: [] });
  assert.equal(a.isStaff, true);
  assert.equal(a.source, 'TENANT');
});
test('OWNER de condo no es staff', () => {
  const a = composeAccess({ isSuperadmin: false, tenantRole: null, condoRole: 'OWNER', occupantRoles: ['OWNER'] });
  assert.equal(a.isStaff, false);
  assert.equal(a.source, 'CONDO');
});
