import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { UsersService } from './users.service';

function doubles(rows: any[] = [{ id: 'u1' }]) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const query = async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    // El chequeo de correo duplicado debe ver la BD vacía; el resto devuelve la fila simulada.
    if (/FROM users WHERE LOWER\(email\)/i.test(sql)) return { rows: [] };
    return { rows };
  };
  const db: any = {
    query,
    getClient: async () => ({ query, release() {} }),
  };
  const issued: any[] = [];
  const sent: any[] = [];
  const tokens: any = {
    issue: async (...a: any[]) => {
      issued.push(a);
      return 'TOKEN';
    },
  };
  const mail: any = {
    sendInvitation: async (...a: any[]) => {
      sent.push(a);
      return { mode: 'log' };
    },
  };
  return { db, tokens, mail, calls, sent, issued };
}

test('crear sin password emite invitacion y no guarda hash', async () => {
  const { db, tokens, mail, calls, sent, issued } = doubles();
  const svc = new UsersService(db, tokens, mail) as any;
  const res: any = await svc.create({ email: 'x@y.com', firstName: 'A', lastName: 'B' });

  assert.equal(res.invitationSent, true);
  const insert = calls.find((c) => /INSERT INTO users/.test(c.sql))!;
  assert.ok(insert, 'debe insertar usuario');
  assert.ok(insert.params.some((v: any) => v === null), 'password_hash/documento deben poder ser null');
  assert.equal(issued.length, 1, 'emite un token de invitacion');
  assert.equal(issued[0][1], 'INVITATION');
  assert.equal(sent.length, 1, 'envia el correo de invitacion');
  assert.match(sent[0][1], /accept-invite\?token=TOKEN/);
});

test('crear con password no emite invitacion y verifica el correo', async () => {
  const { db, tokens, mail, calls, issued, sent } = doubles();
  const svc = new UsersService(db, tokens, mail) as any;
  const res: any = await svc.create({ email: 'x@y.com', firstName: 'A', lastName: 'B', password: 'secret123' });

  assert.equal(res.invitationSent, false);
  assert.equal(issued.length, 0);
  assert.equal(sent.length, 0);
  const insert = calls.find((c) => /INSERT INTO users/.test(c.sql))!;
  assert.ok(
    insert.params.some((v: any) => v instanceof Date),
    'email_verified_at debe quedar con fecha',
  );
});

test('resendInvitation rechaza si la cuenta ya fue verificada', async () => {
  const { db, tokens, mail } = doubles([{ id: 'u1', email: 'z@y.com', email_verified_at: new Date() }]);
  const svc = new UsersService(db, tokens, mail) as any;
  await assert.rejects(() => svc.resendInvitation('u1'), /ya\s+activ/i);
});

test('revokeInvitation reporta si habia invitacion pendiente', async () => {
  const { db, tokens, mail } = doubles([{ id: 'tok' }]);
  const svc = new UsersService(db, tokens, mail) as any;
  const res: any = await svc.revokeInvitation('u1');
  assert.equal(res.revoked, true);
});
