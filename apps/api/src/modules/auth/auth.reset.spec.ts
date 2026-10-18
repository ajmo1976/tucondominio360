import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

test('reset con token invalido no cambia nada', async () => {
  const updated: string[] = [];
  const db: any = {
    query: async (q: string) => {
      if (/UPDATE users/.test(q)) updated.push(q);
      return { rows: [] };
    },
  };
  const tokens: any = { consume: async () => null };
  const svc = new AuthService(db, {} as any, tokens, {} as any) as any;
  await assert.rejects(() => svc.resetPassword('bad', 'nuevaClave'));
  assert.equal(updated.length, 0);
});

test('forgot responde ok aunque el correo no exista', async () => {
  const db: any = { query: async () => ({ rows: [] }) };
  const svc = new AuthService(db, {} as any, {} as any, {
    sendPasswordReset: async () => ({}),
  } as any) as any;
  assert.deepEqual(await svc.forgotPassword('nadie@x.com'), { ok: true });
});

test('forgot con usuario existente emite token y envia correo', async () => {
  const issueCalls: any[] = [];
  const mailCalls: any[] = [];
  const db: any = { query: async () => ({ rows: [{ id: 'u1', email: 'a@b.com' }] }) };
  const tokens: any = {
    issue: async (...a: any[]) => {
      issueCalls.push(a);
      return 'TOK';
    },
  };
  const mail: any = {
    sendPasswordReset: async (...a: any[]) => {
      mailCalls.push(a);
      return {};
    },
  };
  const svc = new AuthService(db, {} as any, tokens, mail) as any;
  assert.deepEqual(await svc.forgotPassword('a@b.com'), { ok: true });
  assert.equal(issueCalls.length, 1);
  assert.equal(issueCalls[0][1], 'PASSWORD_RESET');
  assert.equal(mailCalls.length, 1);
  assert.match(mailCalls[0][1], /reset-password\?token=TOK/);
});

test('reset con token valido hashea y sube token_version', async () => {
  const calls: string[] = [];
  const db: any = {
    query: async (q: string) => {
      calls.push(q);
      return { rows: [] };
    },
  };
  const tokens: any = { consume: async () => ({ userId: 'u1', email: 'a@b.com' }) };
  const svc = new AuthService(db, {} as any, tokens, {} as any) as any;
  const res = await svc.resetPassword('good', 'nuevaClave123');
  assert.deepEqual(res, { success: true });
  const upd = calls.find((q) => /UPDATE users/.test(q))!;
  assert.match(upd, /password_hash/);
  assert.match(upd, /token_version\s*=\s*token_version\s*\+\s*1/);
});

test('acceptInvitation define clave y marca el correo verificado', async () => {
  const calls: string[] = [];
  const db: any = {
    query: async (q: string) => {
      calls.push(q);
      return { rows: [] };
    },
  };
  const tokens: any = { consume: async () => ({ userId: 'u1', email: 'a@b.com' }) };
  const svc = new AuthService(db, {} as any, tokens, {} as any) as any;
  const res = await svc.acceptInvitation('inv', 'clave12345');
  assert.deepEqual(res, { success: true });
  const upd = calls.find((q) => /UPDATE users/.test(q))!;
  assert.match(upd, /email_verified_at\s*=\s*NOW\(\)/);
  assert.match(upd, /token_version\s*=\s*token_version\s*\+\s*1/);
});

test('logout sube token_version', async () => {
  const calls: string[] = [];
  const db: any = {
    query: async (q: string) => {
      calls.push(q);
      return { rows: [] };
    },
  };
  const svc = new AuthService(db, {} as any, {} as any, {} as any) as any;
  assert.deepEqual(await svc.logout('u1'), { success: true });
  assert.match(calls[0], /token_version\s*=\s*token_version\s*\+\s*1/);
});

test('jwt rechaza si token_version no coincide y acepta si coincide', async () => {
  const db: any = {
    query: async () => ({
      rows: [
        { id: 'u1', email: 'a@b.com', is_active: true, is_superadmin: false, token_version: 2 },
      ],
    }),
  };
  const cfg: any = { get: (_k: string, d: string) => d };
  const strat = new JwtStrategy(cfg, db);
  await assert.rejects(() => strat.validate({ sub: 'u1', email: 'a@b.com', tv: 1 } as any));
  const ok = await strat.validate({ sub: 'u1', email: 'a@b.com', tv: 2 } as any);
  assert.equal(ok.id, 'u1');
});
