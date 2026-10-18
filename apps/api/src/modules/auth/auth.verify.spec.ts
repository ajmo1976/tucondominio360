import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AuthService } from './auth.service';

interface Dbl {
  db: any;
  jwt: any;
  tokens: any;
  mail: any;
  calls: Array<{ sql: string; params: any[] }>;
  mailCalls: any[][];
  tokensConsume: any[][];
}

function doubles(userRow: any, opts: { identities?: any[]; consume?: any } = {}): Dbl {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const mailCalls: any[][] = [];
  const tokensConsume: any[][] = [];
  const db: any = {
    query: async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (/FROM user_identities/i.test(sql)) return { rows: opts.identities ?? [] };
      if (/FROM users/i.test(sql)) return { rows: userRow ? [userRow] : [] };
      return { rows: [] };
    },
  };
  const jwt: any = { sign: () => 'JWT' };
  const tokens: any = {
    consume: async (...a: any[]) => {
      tokensConsume.push(a);
      return opts.consume ?? null;
    },
    issue: async () => 'TOK',
  };
  const mail: any = {
    sendEmailVerification: async (...a: any[]) => {
      mailCalls.push(a);
      return { mode: 'log' };
    },
  };
  return { db, jwt, tokens, mail, calls, mailCalls, tokensConsume };
}

function build(userRow: any, opts?: any) {
  const d = doubles(userRow, opts);
  const svc = new AuthService(d.db, d.jwt, d.tokens, d.mail) as any;
  return { svc, ...d };
}

const unverified = {
  id: 'u1',
  email: 'a@b.com',
  password_hash: '$2b$10$',
  is_active: true,
  is_superadmin: false,
  email_verified_at: null,
};

test('login bloquea si el correo no esta verificado y la regla esta activa', async () => {
  process.env.MAIL_VERIFY_REQUIRED = 'true';
  const { svc } = build(unverified);
  const err: any = await svc.login({ email: 'a@b.com', password: 'secret123' }).then(
    () => null,
    (e: any) => e,
  );
  assert.ok(err, 'debe rechazar el login');
  assert.equal(err.getStatus(), 403);
  assert.equal(err.getResponse().code, 'EMAIL_NOT_VERIFIED');
  delete process.env.MAIL_VERIFY_REQUIRED;
});

test('login permite si el correo esta verificado', async () => {
  process.env.MAIL_VERIFY_REQUIRED = 'true';
  const { svc } = build({ ...unverified, email_verified_at: new Date() });
  const res: any = await svc.login({ email: 'a@b.com', password: 'secret123' });
  assert.equal(res.accessToken, 'JWT');
  delete process.env.MAIL_VERIFY_REQUIRED;
});

test('login permite no verificado si la regla esta apagada', async () => {
  process.env.MAIL_VERIFY_REQUIRED = 'false';
  const { svc } = build(unverified);
  const res: any = await svc.login({ email: 'a@b.com', password: 'secret123' });
  assert.equal(res.accessToken, 'JWT');
  delete process.env.MAIL_VERIFY_REQUIRED;
});

test('verifyEmail marca el correo verificado', async () => {
  const { svc, calls, tokensConsume } = build(unverified, { consume: { userId: 'u1', email: 'a@b.com' } });
  const res: any = await svc.verifyEmail('token123');
  assert.deepEqual(res, { verified: true });
  assert.equal(tokensConsume[0][1], 'EMAIL_VERIFICATION');
  assert.ok(calls.some((c) => /UPDATE users SET email_verified_at/i.test(c.sql)));
});

test('verifyEmail rechaza token invalido', async () => {
  const { svc } = build(unverified, { consume: null });
  await assert.rejects(() => svc.verifyEmail('malo'), /no es v[aá]lido|expir/i);
});

test('resendVerification no revela si el correo existe', async () => {
  const { svc, mailCalls } = build(null);
  const res: any = await svc.resendVerification('nadie@x.com');
  assert.deepEqual(res, { sent: true });
  assert.equal(mailCalls.length, 0);
});

test('getProfile expone emailVerified y authProviders', async () => {
  const { svc } = build(
    { ...unverified, email_verified_at: new Date('2026-01-01T00:00:00Z'), created_at: new Date() },
    { identities: [{ provider: 'LOCAL' }, { provider: 'GOOGLE' }] },
  );
  const res: any = await svc.getProfile('u1');
  assert.equal(res.user.emailVerified, true);
  assert.deepEqual(res.user.authProviders, ['LOCAL', 'GOOGLE']);
});
