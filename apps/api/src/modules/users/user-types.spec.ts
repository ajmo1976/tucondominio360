import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { UsersService } from './users.service';
import { TenantsService } from '../tenants/tenants.service';
import { CondosService } from '../condos/condos.service';

/** Rutas simuladas: la primera expresión que matchee responde con sus filas. */
type Route = [RegExp, any[]];

function makeDb(routes: Route[], fallback: any[] = []) {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const query = async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    for (const [re, rows] of routes) {
      if (re.test(sql)) return { rows };
    }
    return { rows: fallback };
  };
  const db: any = { query, getClient: async () => ({ query, release() {} }) };
  return { db, calls };
}

const tokens: any = { issue: async () => 'TOKEN' };
const mail: any = { sendInvitation: async () => ({ mode: 'log' }) };

/** Fila de usuario que findOne() espera ver (con accountType configurable). */
function findUser(accountType = 'PROPIETARIO', extra: any = {}): Route {
  return [
    /SELECT id, email, first_name/,
    [
      {
        id: 'u1',
        email: 'a@b.com',
        first_name: 'A',
        last_name: 'B',
        doc_type: 'V',
        doc_number: null,
        phone: null,
        is_active: true,
        is_superadmin: false,
        created_at: new Date(),
        accountType,
        ...extra,
      },
    ],
  ];
}

const DUPE_MAIL: Route = [/FROM users WHERE LOWER\(email\)/, []];

test('definir ADMINISTRADORA crea la empresa (COMPANY) y deja al usuario como OWNER', async () => {
  const { db, calls } = makeDb([
    DUPE_MAIL,
    [/INSERT INTO users/, [{ id: 'u1' }]],
    [/t\.tenant_type = 'COMPANY'/, []], // aún no tiene empresa
    [/FROM tenants WHERE rif = \$1/, []], // el RIF no existe: empresa nueva
    [/FROM tenants WHERE slug = \$1/, []], // slug libre
    [/INSERT INTO tenants/, [{ id: 't1' }]],
    [/INSERT INTO tenant_users/, []],
    findUser('ADMINISTRADORA'),
    [/FROM condo_user_access cua/, []],
  ]);
  const svc = new UsersService(db, tokens, mail) as any;

  const res: any = await svc.create({
    email: 'nuevo@x.com',
    firstName: 'Ana',
    lastName: 'Pérez',
    password: 'secret123',
    accountType: 'ADMINISTRADORA',
    company: { name: 'Admin Test C.A.', rif: 'J-30111222-3', email: 'hola@admintest.com' },
  });

  const insertUser = calls.find((c) => /INSERT INTO users/.test(c.sql))!;
  assert.ok(
    insertUser.params.includes('ADMINISTRADORA'),
    'guarda el account_type del usuario',
  );

  const insertTenant = calls.find((c) => /INSERT INTO tenants/.test(c.sql))!;
  assert.ok(insertTenant, 'crea la empresa');
  assert.ok(insertTenant.params.includes('J-30111222-3'), 'con el RIF indicado');
  assert.ok(insertTenant.params.includes('Admin Test C.A.'), 'con el nombre indicado');

  const insertMember = calls.find((c) => /INSERT INTO tenant_users/.test(c.sql))!;
  assert.ok(insertMember, 'vincula al usuario a la empresa');
  assert.equal(insertMember.params[0], 't1');
  assert.equal(insertMember.params[1], 'u1');
  assert.match(insertMember.sql, /'OWNER'/, 'como OWNER');

  assert.equal(res.accountType, 'ADMINISTRADORA');
});

test('ADMINISTRADORA sin datos de empresa se rechaza con 400', async () => {
  const { db } = makeDb([DUPE_MAIL, [/INSERT INTO users/, [{ id: 'u1' }]], [/t\.tenant_type = 'COMPANY'/, []]]);
  const svc = new UsersService(db, tokens, mail) as any;

  await assert.rejects(
    () => svc.create({ email: 'x@y.com', firstName: 'A', lastName: 'B', accountType: 'ADMINISTRADORA' }),
    /empresa/i,
  );
});

test('ADMINISTRADORA con RIF de empresa existente se vincula sin duplicarla', async () => {
  const { db, calls } = makeDb([
    DUPE_MAIL,
    [/INSERT INTO users/, [{ id: 'u1' }]],
    [/t\.tenant_type = 'COMPANY'/, []],
    [/FROM tenants WHERE rif = \$1/, [{ id: 't9' }]], // el RIF ya existe
    [/INSERT INTO tenant_users/, []],
    findUser('ADMINISTRADORA'),
    [/FROM condo_user_access cua/, []],
  ]);
  const svc = new UsersService(db, tokens, mail) as any;

  await svc.create({
    email: 'x@y.com',
    firstName: 'A',
    lastName: 'B',
    password: 'secret123',
    accountType: 'ADMINISTRADORA',
    company: { name: 'Capital C.A.', rif: 'J-31456789-0' },
  });

  assert.equal(calls.find((c) => /INSERT INTO tenants/.test(c.sql)), undefined, 'no crea empresa duplicada');
  const member = calls.find((c) => /INSERT INTO tenant_users/.test(c.sql))!;
  assert.equal(member.params[0], 't9', 'se vincula a la empresa existente');
});

test('crear una JUNTA con más de una residencia se rechaza (400)', async () => {
  const { db } = makeDb([DUPE_MAIL]);
  const svc = new UsersService(db, tokens, mail) as any;

  await assert.rejects(
    () =>
      svc.create({
        email: 'j@x.com',
        firstName: 'M',
        lastName: 'J',
        accountType: 'JUNTA',
        assignments: [
          { condoId: 'c1', role: 'BOARD_PRESIDENT', units: [] },
          { condoId: 'c2', role: 'BOARD_TREASURER', units: [] },
        ],
      }),
    /solo puede tener una residencia/i,
  );
});

test('definir como JUNTA a un usuario con residencias en varios condominios se rechaza (400)', async () => {
  const { db } = makeDb([
    [/SELECT id, account_type FROM users/, [{ id: 'u1', account_type: 'PROPIETARIO' }]],
    [/COUNT\(DISTINCT condo_id\)/, [{ n: 2 }]],
  ]);
  const svc = new UsersService(db, tokens, mail) as any;

  await assert.rejects(() => svc.update('u1', { accountType: 'JUNTA' }), /solo puede tener una residencia/i);
});

test('cambiar asignaciones de una JUNTA a dos residencias se rechaza (400)', async () => {
  const { db } = makeDb([
    [/SELECT id, account_type FROM users/, [{ id: 'u1', account_type: 'JUNTA' }]],
  ]);
  const svc = new UsersService(db, tokens, mail) as any;

  await assert.rejects(
    () =>
      svc.update('u1', {
        accountType: 'JUNTA',
        assignments: [
          { condoId: 'c1', role: 'BOARD_MEMBER', units: [] },
          { condoId: 'c2', role: 'BOARD_MEMBER', units: [] },
        ],
      }),
    /solo puede tener una residencia/i,
  );
});

test('incorporar residencias a la cartera respeta el plan máximo (400)', async () => {
  const { db } = makeDb([
    [/SELECT id, account_type FROM users/, [{ id: 'u1', account_type: 'ADMINISTRADORA' }]],
    [/UPDATE users SET/, [{ id: 'u1' }]],
    [/t\.tenant_type = 'COMPANY'/, [{ id: 't1' }]], // ya tiene empresa
    [/SELECT max_condos FROM tenants/, [{ max_condos: 1 }]], // plan: 1
    [/id = ANY\(\$1::uuid\[\]\)/, [{ n: 1 }]], // residencias nuevas: 1
    [/COUNT\(\*\)::int AS n FROM condos WHERE tenant_id = \$1/, [{ n: 1 }]], // cartera actual: 1
  ]);
  const svc = new UsersService(db, tokens, mail) as any;

  await assert.rejects(
    () => svc.update('u1', { accountType: 'ADMINISTRADORA', portfolioCondoIds: ['c2'] }),
    /plan/i,
  );
});

test('incorporar residencias dentro del plan actualiza el tenant de las residencias', async () => {
  const { db, calls } = makeDb([
    [/SELECT id, account_type FROM users/, [{ id: 'u1', account_type: 'ADMINISTRADORA' }]],
    [/t\.tenant_type = 'COMPANY'/, [{ id: 't1' }]],
    [/SELECT max_condos FROM tenants/, [{ max_condos: 3 }]],
    [/id = ANY\(\$1::uuid\[\]\)/, [{ n: 1 }]],
    [/COUNT\(\*\)::int AS n FROM condos WHERE tenant_id = \$1/, [{ n: 1 }]],
    [/UPDATE users SET/, [{ id: 'u1' }]],
    findUser('ADMINISTRADORA'),
    [/FROM condo_user_access cua/, []],
  ]);
  const svc = new UsersService(db, tokens, mail) as any;

  await svc.update('u1', { accountType: 'ADMINISTRADORA', portfolioCondoIds: ['c2'] });

  const move = calls.find((c) => /UPDATE condos SET tenant_id/.test(c.sql))!;
  assert.ok(move, 'mueve la residencia a la cartera');
  assert.equal(move.params[0], 't1');
  assert.deepEqual(move.params[1], ['c2']);
});

test('cambiar el tipo no borra los accesos existentes (solo actualiza account_type)', async () => {
  const { db, calls } = makeDb([
    [/SELECT id, account_type FROM users/, [{ id: 'u1', account_type: 'PROPIETARIO' }]],
    [/UPDATE users SET/, [{ id: 'u1' }]],
    findUser('PROPIETARIO'),
    [/FROM condo_user_access cua/, []],
  ]);
  const svc = new UsersService(db, tokens, mail) as any;

  await svc.update('u1', { accountType: 'PROPIETARIO' });

  const upd = calls.find((c) => /UPDATE users SET/.test(c.sql))!;
  assert.ok(upd.sql.includes('account_type'), 'actualiza la columna account_type');
  assert.equal(calls.find((c) => /DELETE FROM condo_user_access/.test(c.sql)), undefined, 'no borra accesos');
  assert.equal(calls.find((c) => /DELETE FROM tenant_users/.test(c.sql)), undefined, 'no borra membresías');
});

test('el plan no puede quedar por debajo de las residencias actuales (400)', async () => {
  const { db } = makeDb([[/COUNT\(\*\)::int AS n FROM condos WHERE tenant_id = \$1/, [{ n: 2 }]]]);
  const svc = new TenantsService(db);

  await assert.rejects(
    () => svc.updateTenant({ is_superadmin: true }, 't1', { maxCondos: 1 }),
    /plan no puede ser menor/i,
  );
});

test('solo el superadmin puede cambiar el plan de la empresa (403)', async () => {
  const { db } = makeDb([[/FROM tenant_users/, [{ role: 'OWNER' }]]]);
  const svc = new TenantsService(db);

  await assert.rejects(
    () => svc.updateTenant({ id: 'u1' }, 't1', { maxCondos: 5 }),
    /solo el superadmin/i,
  );
});

test('plan null (sin límite) se guarda como tal', async () => {
  const { db, calls } = makeDb([
    [/UPDATE tenants SET/, [{ id: 't1', name: 'X', maxCondos: null }]],
  ]);
  const svc = new TenantsService(db);

  const res: any = await svc.updateTenant({ is_superadmin: true }, 't1', { maxCondos: null });
  assert.equal(res.maxCondos, null);

  const upd = calls.find((c) => /UPDATE tenants SET/.test(c.sql))!;
  assert.equal(upd.params[4], false, 'la bandera indica que sí cambia max_condos');
  assert.equal(upd.params[5], null, 'se escribe null = sin límite');
});

test('crear una residencia más allá del plan de la empresa se rechaza (400)', async () => {
  const { db } = makeDb([
    [/SELECT max_condos FROM tenants/, [{ max_condos: 2 }]],
    [/COUNT\(\*\)::int AS n FROM condos WHERE tenant_id = \$1/, [{ n: 2 }]],
  ]);
  const svc = new CondosService(db);

  await assert.rejects(() => svc.createCondo({ name: 'Otra Residencia' }), /límite de su plan/i);
});

test('crear residencias sin plan (null) sigue funcionando', async () => {
  const { db } = makeDb([
    [/SELECT max_condos FROM tenants/, [{ max_condos: null }]],
    [/INSERT INTO condos/, [{ id: 'c9', name: 'Nueva Res' }]],
  ]);
  const svc = new CondosService(db);

  const res: any = await svc.createCondo({ name: 'Nueva Residencia', rif: 'J-00000000-0' });
  assert.equal(res.id, 'c9');
});

test('listTenants: el superadmin ve todo sin filtro; el resto solo lo suyo', async () => {
  const { db, calls } = makeDb([[/FROM tenants t/, [{ id: 't1', name: 'A', maxCondos: null, condosCount: 0, staffCount: 1 }]]]);
  const svc = new TenantsService(db);

  await svc.listTenants({ is_superadmin: true });
  await svc.listTenants({ id: 'u1' });

  const superSql = calls[0].sql;
  const userCall = calls[1];
  assert.ok(!superSql.includes('EXISTS'), 'el superadmin no aplica filtro de membresía');
  assert.ok(userCall.sql.includes('EXISTS'), 'un usuario normal solo ve sus empresas');
  assert.deepEqual(userCall.params, ['u1']);
});
