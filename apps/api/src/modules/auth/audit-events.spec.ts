import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AUTH_AUDIT_EVENTS } from './audit-events';
import { AuthService } from './auth.service';

test('los eventos de auditoria de auth estan definidos', () => {
  for (const e of [
    'LOGIN_OK',
    'LOGIN_FAILED',
    'PASSWORD_RESET_DONE',
    'EMAIL_VERIFIED',
    'GOOGLE_LINKED',
    'USER_INVITED',
    'USER_INVITED_ACCEPTED',
  ]) {
    assert.ok((AUTH_AUDIT_EVENTS as readonly string[]).includes(e), `falta ${e}`);
  }
});

const userRow = {
  id: 'u1',
  email: 'a@b.com',
  password_hash: '$2b$10$invalido',
  is_active: true,
  is_superadmin: false,
  email_verified_at: new Date(),
  token_version: 0,
};

function dbCapturing() {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const db: any = {
    query: async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (/FROM users WHERE LOWER\(email\)/i.test(sql)) return { rows: [userRow] };
      return { rows: [] };
    },
  };
  return { db, calls };
}

function svc(db: any) {
  return new AuthService(db, { sign: () => 'jwt' } as any, { issue: async () => 't' } as any, {} as any) as any;
}

test('login fallido audita LOGIN_FAILED', async () => {
  const { db, calls } = dbCapturing();
  await assert.rejects(() => svc(db).login({ email: 'a@b.com', password: 'mala' }));
  assert.ok(
    calls.some((c) => /INSERT INTO audit_logs/.test(c.sql) && c.params.includes('LOGIN_FAILED')),
  );
});

test('login exitoso audita LOGIN_OK', async () => {
  const { db, calls } = dbCapturing();
  await svc(db).login({ email: 'a@b.com', password: 'secret123' });
  assert.ok(
    calls.some((c) => /INSERT INTO audit_logs/.test(c.sql) && c.params.includes('LOGIN_OK')),
  );
});
