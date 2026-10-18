import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AuthService } from './auth.service';

function svcWith(db: any) {
  return new AuthService(db, { sign: () => 'jwt' } as any, {} as any, {} as any) as any;
}

test('google rechaza un correo sin cuenta (invite-first)', async () => {
  const svc = svcWith({ query: async () => ({ rows: [] }) });
  const err: any = await svc
    .loginWithGoogle({ googleId: 'g1', email: 'no@existe.com', firstName: '', lastName: '' })
    .then(() => null, (e: any) => e);
  assert.ok(err, 'debe rechazar');
  assert.equal(err.getStatus(), 401);
  assert.equal(err.getResponse().code, 'INVITE_REQUIRED');
});

test('google vincula la identidad de un usuario existente', async () => {
  const calls: string[] = [];
  const db: any = {
    query: async (q: string) => {
      if (/user_identities/.test(q) && /SELECT/i.test(q)) return { rows: [] };
      if (/FROM users/.test(q))
        return { rows: [{ id: 'u1', email: 'a@b.com', is_active: true, is_superadmin: false }] };
      if (/INSERT INTO user_identities/.test(q)) {
        calls.push('link');
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const res: any = await svcWith(db).loginWithGoogle({
    googleId: 'g1',
    email: 'a@b.com',
    firstName: 'A',
    lastName: 'B',
  });
  assert.equal(res.accessToken, 'jwt');
  assert.ok(calls.includes('link'), 'vincula la identidad GOOGLE');
});

test('google con identidad ya vinculada no vuelve a buscar por correo', async () => {
  const queries: string[] = [];
  const db: any = {
    query: async (q: string) => {
      queries.push(q);
      if (/FROM user_identities/.test(q))
        return {
          rows: [
            {
              id: 'u1',
              email: 'a@b.com',
              is_active: true,
              is_superadmin: false,
              email_verified_at: new Date(),
              token_version: 0,
              avatar_url: null,
            },
          ],
        };
      return { rows: [] };
    },
  };
  const res: any = await svcWith(db).loginWithGoogle({
    googleId: 'g1',
    email: 'a@b.com',
    firstName: 'A',
    lastName: 'B',
  });
  assert.equal(res.accessToken, 'jwt');
  assert.equal(
    queries.some((q) => /INSERT INTO user_identities/.test(q)),
    false,
  );
});

test('google rechaza a un usuario desactivado', async () => {
  const db: any = {
    query: async (q: string) => {
      if (/FROM user_identities/.test(q)) return { rows: [] };
      if (/FROM users/.test(q))
        return { rows: [{ id: 'u1', email: 'a@b.com', is_active: false, is_superadmin: false }] };
      return { rows: [] };
    },
  };
  await assert.rejects(() =>
    svcWith(db).loginWithGoogle({ googleId: 'g1', email: 'a@b.com', firstName: '', lastName: '' }),
  );
});
