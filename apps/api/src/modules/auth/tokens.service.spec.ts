import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TokensService } from './tokens.service';
import { hashToken } from '@tucondominio360/shared';

function fakeDb(rows: any[] = []) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  return {
    calls,
    query: async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows };
    },
  };
}

test('issue persiste el hash (no el token) con expiracion futura', async () => {
  const db = fakeDb();
  const svc = new TokensService(db as any);
  const token = await svc.issue('u1', 'PASSWORD_RESET', 'a@b.com');

  const insert = db.calls.find((c) => /INSERT INTO auth_tokens/i.test(c.sql));
  assert.ok(insert, 'debe insertar en auth_tokens');
  const [, , tokenHash, , expiresAt] = insert!.params;
  assert.equal(tokenHash, hashToken(token));
  assert.equal(insert!.params.includes(token), false, 'nunca guarda el token en claro');
  assert.ok(expiresAt instanceof Date && expiresAt.getTime() > Date.now());

  assert.ok(
    db.calls.some((c) => /DELETE FROM auth_tokens/i.test(c.sql)),
    'borra tokens previos no consumidos del mismo proposito',
  );
});

test('consume devuelve null si no hay fila', async () => {
  const db = fakeDb();
  const svc = new TokensService(db as any);
  assert.equal(await svc.consume('nope', 'PASSWORD_RESET'), null);
});

test('consume mapea la fila a { userId, email }', async () => {
  const db = fakeDb([{ user_id: 'u9', email: 'z@y.com' }]);
  const svc = new TokensService(db as any);
  assert.deepEqual(await svc.consume('tok', 'INVITATION'), { userId: 'u9', email: 'z@y.com' });
});
