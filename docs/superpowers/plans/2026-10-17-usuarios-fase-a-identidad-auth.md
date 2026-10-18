# Fase A — Identidad y Autenticación (Google, invitación, verificación y reseteo) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir acceso con Google (invite-first), invitación y verificación de usuario por correo con token, y reseteo de contraseña de autoservicio, sin romper el login actual.

**Architecture:** Se amplía el `AuthModule` con `TokensService` (tokens de un solo uso hasheados), `MailService` (nodemailer con modo `log` en dev) y una estrategia `passport-google-oauth20`. Los cambios de esquema van a `database/migrations/` y a `database/schema.sql`. Los tipos y helpers puros viven en `@tucondominio360/shared` y se cargan en runtime desde su `dist` (requiere `npm run build` del workspace tras editarlos).

**Tech Stack:** NestJS 10, Passport (JWT + Google OAuth 2.0), nodemailer, `@nestjs/throttler`, PostgreSQL 16, bcrypt, `node:test` + `ts-node`.

**Spec:** `docs/superpowers/specs/2026-10-17-usuarios-identidad-roles-modulos.md` (secciones 5.1, 7, 9, 11).

## Global Constraints

- Node 22, TS targets: API `ES2021` (commonjs), shared `ES2022` (NodeNext, strict).
- Prefijo API global `/api`; validación con `ValidationPipe({ whitelist: true, transform: true })`.
- Todo cambio de BD va **también** a `database/schema.sql`.
- Tras editar `packages/shared/src`, ejecutar `npm run build --workspace=@tucondominio360/shared` (la API/Web consumen `dist`).
- Tests backend: `node --require ts-node/register/transpile-only --test <ruta.spec.ts>` desde `apps/api`.
- Tests shared: `node --require ts-node/register/transpile-only --test src/<file>.spec.ts` desde `packages/shared`.
- Tokens de correo **nunca** en claro en BD: `sha256(token)`. Un solo uso. Expiración: invitación 7d, reset 1h, verificación 24h.
- Endpoints `password/forgot` y `email/resend` responden **202 siempre** (no revelar existencia).
- El bypass `secret123` solo puede permanecer activo si `NODE_ENV !== 'production'`.
- Variables nuevas de entorno documentadas en `apps/api/.env.example`.

## Review Focus

- Cuenta **sin `password_hash`** (solo Google o invitación pendiente) que intenta login local: debe fallar con mensaje claro, nunca con error 500 ni login exitoso.
- Token de correo **caducado o ya consumido**: `reset`/`verify`/`accept` deben rechazar y no alterar la contraseña ni el estado.
- Correo que **no está invitado** entra por Google: no se crea cuenta; redirige a `/login?error=not_invited`.
- `password/forgot` con correo **inexistente**: responde 202 y no envía nada (sin enumeración de cuentas).
- **Usuario existente pre-migración** (con `password_hash`) sigue entrando por email/contraseña después de aplicar la migración.

---

### Task A1: Migración de identidad + esquema

**Files:**
- Create: `database/migrations/20261017_identity_auth.sql`
- Modify: `database/schema.sql` (tabla `users` líneas 175-190; añadir tablas tras `unit_occupants` ~275)

**Interfaces:**
- Produces: columnas `users.email_verified_at`, `users.last_login_at`, `users.token_version`, `users.password_hash`/`doc_number` nullable; tablas `user_identities`, `auth_tokens`.

- [x] **Step 1: Escribir la migración**

```sql
-- 20261017_identity_auth.sql
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN doc_number DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    provider_user_id VARCHAR(255),
    email_at_provider VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    CONSTRAINT uq_identity_provider UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);

CREATE TABLE IF NOT EXISTS auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(30) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    email VARCHAR(120) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_auth_token_hash UNIQUE (token_hash)
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, purpose);

-- Usuarios existentes: verificar correo y sembrar identidad LOCAL
INSERT INTO user_identities (user_id, provider, provider_user_id, email_at_provider)
SELECT id, 'LOCAL', NULL, email FROM users
ON CONFLICT DO NOTHING;
UPDATE users SET email_verified_at = NOW() WHERE email_verified_at IS NULL AND password_hash IS NOT NULL;
```

- [x] **Step 2: Aplicar y verificar contra la BD local**

Run: `docker exec -i tucondominio360_postgres psql -U postgres -d tucondominio360 < database/migrations/20261017_identity_auth.sql`
Expected: sin error; luego:
Run: `docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -c "\d users" | grep -E "token_version|email_verified_at"`
Expected: ambas columnas listadas.

- [x] **Step 3: Reflejar el cambio en `database/schema.sql`**

Actualizar la definición de `users` y añadir `user_identities` + `auth_tokens` con las mismas columnas/constraints.

- [x] **Step 4: Commit**

```bash
git add database/migrations/20261017_identity_auth.sql database/schema.sql
git commit -m "feat(db): identidad de usuarios, email verificado y tokens de auth"
```

---

### Task A2: Tipos y helpers de tokens en shared

**Files:**
- Create: `packages/shared/src/auth.ts`
- Test: `packages/shared/src/auth.spec.ts`
- Modify: `packages/shared/src/index.ts` (re-export)

**Interfaces:**
- Produces:
  - `type AuthProvider = 'LOCAL' | 'GOOGLE'`
  - `type EmailTokenPurpose = 'INVITATION' | 'EMAIL_VERIFICATION' | 'PASSWORD_RESET'`
  - `const AUTH_TOKEN_TTL_MS: Record<EmailTokenPurpose, number>`
  - `function generateToken(): string` (base64url, 32 bytes)
  - `function hashToken(token: string): string` (sha256 hex, 64 chars)

- [x] **Step 1: Escribir el test que falla**

```ts
// packages/shared/src/auth.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateToken, hashToken, AUTH_TOKEN_TTL_MS } from './auth';

test('hashToken es sha256 hex determinista de 64 chars', () => {
  const t = 'abc';
  assert.equal(hashToken(t), hashToken(t));
  assert.equal(hashToken(t).length, 64);
  assert.notEqual(hashToken(t), t);
});
test('generateToken produce base64url distinto cada vez', () => {
  const a = generateToken(), b = generateToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});
test('TTL: invitacion 7d, reset 1h, verificacion 24h', () => {
  assert.equal(AUTH_TOKEN_TTL_MS.INVITATION, 7 * 24 * 3600_000);
  assert.equal(AUTH_TOKEN_TTL_MS.PASSWORD_RESET, 3600_000);
  assert.equal(AUTH_TOKEN_TTL_MS.EMAIL_VERIFICATION, 24 * 3600_000);
});
```

- [x] **Step 2: Ejecutar y ver que falla**

Run: `cd packages/shared && node --require ts-node/register/transpile-only --test src/auth.spec.ts`
Expected: FAIL `Cannot find module './auth'`.

- [x] **Step 3: Implementar `packages/shared/src/auth.ts`**

Usar `import { createHash, randomBytes } from 'node:crypto'`. `hashToken = createHash('sha256').update(token).digest('hex')`. Exportar los tipos y `AUTH_TOKEN_TTL_MS`. Re-exportar todo desde `index.ts`.

- [x] **Step 4: Ejecutar y ver que pasa**

Run: `cd packages/shared && node --require ts-node/register/transpile-only --test src/auth.spec.ts && npm run build`
Expected: PASS (3 tests) y build sin errores.

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/auth.ts packages/shared/src/auth.spec.ts packages/shared/src/index.ts
git commit -m "feat(shared): helpers de tokens de autenticacion"
```

---

### Task A3: MailService (nodemailer + modo log)

**Files:**
- Create: `apps/api/src/modules/mail/mail.service.ts`, `apps/api/src/modules/mail/mail.module.ts`, `apps/api/src/modules/mail/templates.ts`
- Create: `apps/api/src/modules/mail/mail.service.spec.ts`
- Modify: `apps/api/src/app.module.ts` (importar `MailModule`)
- Create: `apps/api/.env.example`

**Interfaces:**
- Consumes: `AUTH_TOKEN_TTL_MS` (Task A2).
- Produces:
  - `MailService.send(to: string, subject: string, html: string): Promise<{ mode: 'smtp'|'log'; preview?: string }>`
  - `MailService.sendInvitation(to, link): Promise<...>`
  - `MailService.sendPasswordReset(to, link): Promise<...>`
  - `MailService.sendEmailVerification(to, link): Promise<...>`
  - `templates.invitationEmail(link)`, `.passwordResetEmail(link)`, `.emailVerificationEmail(link)` → `{ subject, html }`

- [x] **Step 1: Test que falla (modo log)**

```ts
// apps/api/src/modules/mail/mail.service.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MailService } from './mail.service';
import { invitationEmail } from './templates';

test('modo log no envia SMTP y devuelve preview con el enlace', async () => {
  process.env.MAIL_MODE = 'log';
  const svc = new MailService();
  const res = await svc.send('a@b.com', 'Hola', '<p>http://x/?t=1</p>');
  assert.equal(res.mode, 'log');
  assert.match(res.preview!, /http:\/\/x/);
});
test('plantilla de invitacion incluye el enlace', () => {
  const { subject, html } = invitationEmail('http://app/accept-invite?token=XYZ');
  assert.match(subject, /invitaci/i);
  assert.match(html, /accept-invite\?token=XYZ/);
});
```

- [x] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/mail/mail.service.spec.ts`
Expected: FAIL `Cannot find module './mail.service'`.

- [x] **Step 3: Implementar**

`MailService` lee `MAIL_MODE` (`smtp|log`), `SMTP_HOST/PORT/USER/PASS/SMTP_FROM`, `APP_URL`. Si `log` (o falta SMTP), hace `Logger.log` del enlace y devuelve `{ mode: 'log', preview: html }`. `templates.ts` exporta las 3 funciones con asunto en español y HTML simple (saludo, botón/enlace, expiración). `MailModule` provee/exporta `MailService`.

- [x] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/mail/mail.service.spec.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/mail apps/api/src/app.module.ts apps/api/.env.example
git commit -m "feat(api): MailService con nodemailer y modo log"
```

---

### Task A4: TokensService (emitir/consumir tokens)

**Files:**
- Create: `apps/api/src/modules/auth/tokens.service.ts`
- Test: `apps/api/src/modules/auth/tokens.service.spec.ts`
- Modify: `apps/api/src/modules/auth/auth.module.ts` (provider/export)

**Interfaces:**
- Consumes: `generateToken`, `hashToken`, `AUTH_TOKEN_TTL_MS` (A2); `DatabaseService`.
- Produces:
  - `TokensService.issue(userId: string, purpose: EmailTokenPurpose, email: string): Promise<string>` (devuelve token en claro)
  - `TokensService.consume(token: string, purpose: EmailTokenPurpose): Promise<{ userId: string; email: string } | null>`

- [x] **Step 1: Test que falla con una BD falsa**

```ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TokensService } from './tokens.service';

function fakeDb(rows: any[] = []) {
  const calls: any[] = [];
  return { calls,
    query: async (sql: string, params?: any[]) => { calls.push([sql, params]); return { rows }; } };
}

test('issue guarda el hash (no el token) y con expiracion futura', async () => {
  const db: any = { query: async (_s: string, p: any[]) => { captured = p; return { rows: [] }; } };
  let captured: any[] = [];
  const svc = new TokensService(db as any);
  const token = await svc.issue('u1', 'PASSWORD_RESET', 'a@b.com');
  const [, , hash, , expiresAt] = captured;
  assert.equal(hash, (await import('@tucondominio360/shared')).hashToken(token));
  assert.ok(new Date(expiresAt).getTime() > Date.now());
});
test('consume devuelve null si no hay fila', async () => {
  const db: any = { query: async () => ({ rows: [] }) };
  const svc = new TokensService(db);
  assert.equal(await svc.consume('nope', 'PASSWORD_RESET'), null);
});
```

- [x] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/auth/tokens.service.spec.ts`
Expected: FAIL (módulo no existe).

- [x] **Step 3: Implementar `TokensService`**

`issue`: `DELETE` tokens previos no consumidos del mismo `(user_id,purpose)`; `INSERT` con `token_hash=hashToken(token)`, `expires_at = NOW() + ttl`. `consume`: `UPDATE auth_tokens SET consumed_at=NOW() WHERE token_hash=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at > NOW() RETURNING user_id, email`; devolver `{ userId, email }` o `null`.

- [x] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/auth/tokens.service.spec.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/tokens.service.ts apps/api/src/modules/auth/tokens.service.spec.ts apps/api/src/modules/auth/auth.module.ts
git commit -m "feat(api): TokensService de un solo uso hasheado"
```

---

### Task A5: Invitación desde Usuarios (contraseña opcional)

**Files:**
- Modify: `apps/api/src/modules/users/dto/create-user.dto.ts` (hacer `password` opcional, `docNumber` opcional)
- Modify: `apps/api/src/modules/users/users.service.ts` (`create`, nuevos `resendInvitation`, `revokeInvitation`)
- Modify: `apps/api/src/modules/users/users.controller.ts`
- Modify: `apps/api/src/modules/users/users.module.ts` (importar `AuthModule`/`MailModule` o exportar `TokensService`)

**Interfaces:**
- Consumes: `TokensService.issue` (A4), `MailService.sendInvitation` (A3).
- Produces:
  - `POST /api/users` acepta `password?`; si falta → invitación (devuelve `{ invitationSent: true }`).
  - `POST /api/users/:id/invitation/resend` → `{ sent: true }`
  - `POST /api/users/:id/invitation/revoke` → `{ revoked: true }`

- [x] **Step 1: Test que falla (servicio, con dobles)**

```ts
// apps/api/src/modules/users/users.invite.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { UsersService } from './users.service';

test('crear sin password emite invitacion y no guarda hash', async () => {
  const calls: any[] = [];
  const db: any = {
    query: async (q: string, p?: any[]) => { calls.push([q, p]); return { rows: [{ id: 'u1' }] }; },
    getClient: async () => ({ query: async (q: string, p?: any[]) => { calls.push([q, p]); return { rows: [{ id: 'u1' }] }; }, release() {} }),
  };
  const tokens: any = { issue: async () => 'TOKEN' };
  const mail: any = { sendInvitation: async () => ({ mode: 'log' }) };
  const svc = new UsersService(db, tokens, mail as any);
  const res = await svc.create({ email: 'x@y.com', firstName: 'A', lastName: 'B' } as any);
  assert.equal((res as any).invitationSent, true);
  const insert = calls.find(([q]) => /INSERT INTO users/.test(q));
  assert.equal(insert[1].includes(null) || insert[1].some((v: any) => v === null), true);
});
```

- [x] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/users/users.invite.spec.ts`
Expected: FAIL (el `create` actual exige `dto.password`/`dto.docNumber`).

- [x] **Step 3: Implementar**

En `create`: si `dto.password` existe → `bcrypt.hash` y `email_verified_at = NOW()`; si no → `password_hash = NULL`, `email_verified_at = NULL`, y tras `COMMIT` llamar `tokens.issue(userId,'INVITATION',email)` + `mail.sendInvitation(email, `${APP_URL}/accept-invite?token=${token}`)`, devolver `{ ...findOne, invitationSent: true }`. Añadir `resendInvitation(id)` (rechaza si ya está verificado) y `revokeInvitation(id)`. Añadir los endpoints al controller (solo superadmin, como el resto del controlador).

- [x] **Step 3b: Ajustar el constructor y wiring**

`UsersService` pasa a `constructor(db, tokens: TokensService, mail: MailService)`. `UsersModule` importa `AuthModule` (exporta `TokensService`) y `MailModule`. Verificar que `nest build` no se cicla (`AuthModule` no debe importar `UsersModule`).

- [x] **Step 4: Compilar y correr el test**

Run: `cd apps/api && npm run build && node --require ts-node/register/transpile-only --test src/modules/users/users.invite.spec.ts`
Expected: build OK y PASS.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/users
git commit -m "feat(api): invitar usuarios por correo con token"
```

---

### Task A6: Verificación de correo + gating de login

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts` (`login`, `getProfile`, nuevos `verifyEmail`, `resendVerification`)
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Create: `apps/api/src/modules/auth/dto/verify-email.dto.ts`, `dto/email-only.dto.ts`

**Interfaces:**
- Consumes: `TokensService.consume` (A4), `MailService.sendEmailVerification` (A3).
- Produces:
  - `POST /api/auth/email/verify { token }` → `{ verified: true }`
  - `GET /api/auth/email/verify?token=` → redirect `${WEB_APP_URL}/verify-email?status=ok|error`
  - `POST /api/auth/email/resend { email }` → 202
  - `login` responde 403 `{ code: 'EMAIL_NOT_VERIFIED' }` cuando `MAIL_VERIFY_REQUIRED === 'true'` y `email_verified_at IS NULL`.
  - `GET /api/auth/me` incluye `emailVerified: boolean` y `authProviders: AuthProvider[]`.

- [x] **Step 1: Test que falla (gating)**

```ts
// apps/api/src/modules/auth/auth.verify.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AuthService } from './auth.service';

test('login bloquea si el correo no esta verificado y la regla esta activa', async () => {
  process.env.MAIL_VERIFY_REQUIRED = 'true';
  const db: any = { query: async (q: string) => q.includes('FROM users')
    ? { rows: [{ id: 'u1', email: 'a@b.com', password_hash: '$2b$10$', is_active: true, email_verified_at: null, is_superadmin: false }] }
    : { rows: [] } };
  const svc = new AuthService(db, {} as any, {} as any, {} as any);
  await assert.rejects(() => svc.login({ email: 'a@b.com', password: 'x' } as any), /verificar|verificado/i);
});
```

- [x] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/auth/auth.verify.spec.ts`
Expected: FAIL.

- [x] **Step 3: Implementar**

En `login`, tras validar credenciales: si `MAIL_VERIFY_REQUIRED==='true'` y `!user.email_verified_at` → `throw new ForbiddenException({ message: 'Debes verificar tu correo electrónico', code: 'EMAIL_NOT_VERIFIED' })`. Añadir `verifyEmail(token)` (usa `TokensService.consume(token,'EMAIL_VERIFICATION')`, set `email_verified_at=NOW()`) y `resendVerification(email)` (202 siempre; emite+envía solo si existe y no verificado). Extender `getProfile` con `emailVerified` y `authProviders` (join `user_identities`).

- [x] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/api && npm run build && node --require ts-node/register/transpile-only --test src/modules/auth/auth.verify.spec.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth
git commit -m "feat(api): verificacion de correo y bloqueo de login no verificado"
```

---

### Task A7: Google OAuth (invite-first)

**Files:**
- Create: `apps/api/src/modules/auth/google.strategy.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts` (`loginWithGoogle`, `linkGoogleIdentity`, `findSessionPayload`)
- Modify: `apps/api/src/modules/auth/auth.controller.ts` (`GET /auth/google`, `GET /auth/google/callback`)
- Modify: `apps/api/src/modules/auth/auth.module.ts`
- Add deps: `npm i passport-google-oauth20 && npm i -D @types/passport-google-oauth20 --workspace=tucondominio360-api`

**Interfaces:**
- Produces:
  - `GoogleStrategy` valida el perfil y devuelve `{ googleId, email, firstName, lastName, avatarUrl }`.
  - `AuthService.loginWithGoogle(profile: GoogleProfile): Promise<{ accessToken, user, condos }>`
  - `GET /api/auth/google` y `GET /api/auth/google/callback` (redirige a `${WEB_APP_URL}/auth/callback?token=<jwt>` o `/login?error=<code>`).

- [x] **Step 1: Test que falla (invite-first)**

```ts
// apps/api/src/modules/auth/auth.google.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AuthService } from './auth.service';

test('google rechaza correo no invitado', async () => {
  const db: any = { query: async () => ({ rows: [] }) };
  const svc = new AuthService(db, { sign: () => 'jwt' } as any, {} as any, {} as any);
  await assert.rejects(() => svc.loginWithGoogle({ googleId: 'g1', email: 'no@existe.com', firstName: '', lastName: '' } as any));
});
test('google vincula identidad de usuario existente', async () => {
  const calls: string[] = [];
  const db: any = { query: async (q: string) => {
    if (/user_identities/.test(q) && /SELECT/.test(q)) return { rows: [] };
    if (/FROM users/.test(q)) return { rows: [{ id: 'u1', email: 'a@b.com', is_active: true, is_superadmin: false }] };
    if (/INSERT INTO user_identities/.test(q)) { calls.push('link'); return { rows: [] }; }
    return { rows: [] }; } };
  const svc = new AuthService(db, { sign: () => 'jwt' } as any, {} as any, {} as any);
  const res = await svc.loginWithGoogle({ googleId: 'g1', email: 'a@b.com', firstName: 'A', lastName: 'B' } as any);
  assert.equal(res.accessToken, 'jwt');
  assert.ok(calls.includes('link'));
});
```

- [x] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/auth/auth.google.spec.ts`
Expected: FAIL.

- [x] **Step 3: Implementar**

`loginWithGoogle`: buscar en `user_identities(provider='GOOGLE', provider_user_id=googleId)`; si no, buscar `users` por email normalizado; si no existe o `is_active=false` → `UnauthorizedException('INVITE_REQUIRED')`; si existe, upsert identidad, `UPDATE users SET email_verified_at=COALESCE(email_verified_at,NOW()), last_login_at=NOW(), avatar_url=COALESCE(avatar_url,$)`, firmar JWT con `{ sub, email, isSuperadmin, tv: token_version }`. `GoogleStrategy` con `clientID`, `clientSecret`, `callbackURL` desde env; `passReqToCallback:false`; `scope: ['email','profile']`. Controller: `@UseGuards(AuthGuard('google'))` en ambos; el callback firma el `state` y redirige.

- [x] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/api && npm run build && node --require ts-node/register/transpile-only --test src/modules/auth/auth.google.spec.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth apps/api/package.json
git commit -m "feat(api): login con Google (invite-first)"
```

---

### Task A8: Reseteo de contraseña + invalidación de sesiones

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts` (`forgotPassword`, `resetPassword`, `logout`, `acceptInvitation`; `login`/`changePassword` ajustados)
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/jwt.strategy.ts` (verificar `token_version`)
- Create: `apps/api/src/modules/auth/dto/forgot-password.dto.ts`, `dto/reset-password-token.dto.ts`, `dto/accept-invitation.dto.ts`
- Modify: `apps/api/src/modules/users/users.service.ts` (`sendPasswordResetLink`)

**Interfaces:**
- Consumes: `TokensService` (A4), `MailService.sendPasswordReset`/`sendInvitationAccepted?`.
- Produces:
  - `POST /api/auth/password/forgot { email }` → 202
  - `POST /api/auth/password/reset { token, newPassword }` → `{ success: true }`, `token_version++`
  - `POST /api/auth/invitation/accept { token, newPassword }` → `{ success: true }`, marca verificado
  - `POST /api/auth/logout` → `{ success: true }`
  - `POST /api/users/:id/password-reset-link` (admin) → `{ sent: true }`

- [x] **Step 1: Test que falla**

```ts
// apps/api/src/modules/auth/auth.reset.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AuthService } from './auth.service';

test('reset con token invalido no cambia nada', async () => {
  let updated = false;
  const db: any = { query: async (q: string) => { if (/UPDATE users/.test(q)) updated = true; return { rows: [] }; } };
  const tokens: any = { consume: async () => null };
  const svc = new AuthService(db, {} as any, tokens, {} as any);
  await assert.rejects(() => svc.resetPassword('bad', 'nuevaClave'));
  assert.equal(updated, false);
});
test('forgot responde ok aunque el correo no exista', async () => {
  const db: any = { query: async () => ({ rows: [] }) };
  const svc = new AuthService(db, {} as any, {} as any, { sendPasswordReset: async () => {} } as any);
  assert.deepEqual(await svc.forgotPassword('nadie@x.com'), { ok: true });
});
```

- [x] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/auth/auth.reset.spec.ts`
Expected: FAIL.

- [x] **Step 3: Implementar**

`forgotPassword`: si el usuario existe y tiene identidad `LOCAL` (o cualquier usuario), `TokensService.issue(user.id,'PASSWORD_RESET',user.email)` + `MailService.sendPasswordReset`; **siempre** `{ ok: true }`. `resetPassword`: `consume(token,'PASSWORD_RESET')`; si null → `BadRequestException('Token inválido o expirado')`; `bcrypt.hash`, `UPDATE users SET password_hash=$1, token_version=token_version+1, updated_at=NOW()`. `acceptInvitation`: `consume(token,'INVITATION')` → set hash, `email_verified_at=NOW()`, `token_version++`. `logout`: `token_version++`. `JwtStrategy.validate`: consultar `token_version` y comparar con `payload.tv` (si difieren → 401). Quitar el bypass `secret123` cuando `NODE_ENV==='production'` (en `login` y `changePassword`).

- [x] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/api && npm run build && node --require ts-node/register/transpile-only --test src/modules/auth/auth.reset.spec.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth apps/api/src/modules/users
git commit -m "feat(api): reseteo de contrasena, aceptar invitacion e invalidacion de sesiones"
```

---

### Task A9: Rate limiting y auditoría de auth

**Files:**
- Modify: `apps/api/src/app.module.ts` (`ThrottlerModule`)
- Modify: `apps/api/src/modules/auth/auth.controller.ts` (`@Throttle`)
- Modify: `apps/api/src/modules/auth/auth.service.ts` (insertar en `audit_logs`)
- Add dep: `npm i @nestjs/throttler --workspace=tucondominio360-api`

**Interfaces:**
- Produces: límite global de auth (`10/min`), `password/forgot` y `email/resend` (`3/15min`); eventos de auditoría.

- [x] **Step 1: Test que falla (helper de auditoría puro)**

```ts
// apps/api/src/modules/auth/audit-events.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AUTH_AUDIT_EVENTS } from './audit-events';
test('los eventos de auditoria de auth estan definidos', () => {
  for (const e of ['LOGIN_OK','LOGIN_FAILED','PASSWORD_RESET_DONE','EMAIL_VERIFIED','GOOGLE_LINKED','USER_INVITED','USER_INVITED_ACCEPTED']) {
    assert.ok((AUTH_AUDIT_EVENTS as string[]).includes(e));
  }
});
```

- [x] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/auth/audit-events.spec.ts`
Expected: FAIL.

- [x] **Step 3: Implementar**

`audit-events.ts` exporta `AUTH_AUDIT_EVENTS`. `AuthService` gana `private audit(action, userId, meta?)` que hace:

```sql
INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_values)
VALUES ($1, $2, 'users', $1, $3)
```

(`audit_logs` real: `user_id`, `action`, `entity_name`, `entity_id UUID NOT NULL`, `old_values`, `new_values`, `ip_address`, `user_agent`). Añadir `@Throttle` a login/forgot/resend/reset. Configurar `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])` + `ThrottlerGuard` global.

- [x] **Step 3bis: Verificar la tabla `audit_logs`**

Run: `docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -c "\d audit_logs"`
Expected: columnas `action`, `entity_name`, `entity_id`, `new_values`; ajustar el INSERT si cambió el esquema.

- [x] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/api && npm run build && node --require ts-node/register/transpile-only --test src/modules/auth/audit-events.spec.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth apps/api/src/app.module.ts apps/api/package.json
git commit -m "feat(api): rate limiting y auditoria de autenticacion"
```

---

### Task A10: Frontend de autenticación

**Files:**
- Create: `apps/web/src/app/forgot-password/page.tsx`, `reset-password/page.tsx`, `verify-email/page.tsx`, `accept-invite/page.tsx`, `auth/callback/page.tsx`
- Modify: `apps/web/src/app/login/page.tsx` (botón Google, enlace olvido, error `EMAIL_NOT_VERIFIED`)
- Modify: `apps/web/src/lib/api.ts` (`loginWithGoogleToken(token)`, `forgotPassword`, `resetPassword`, `verifyEmail`, `acceptInvitation`)

**Interfaces:**
- Consumes: endpoints de A5-A8.
- Produces: páginas que leen `?token=`/`?status=`/`?error=` y llaman a la API.

- [x] **Step 1: Añadir helpers en `lib/api.ts`**

`export async function loginWithGoogleToken(token: string): Promise<Session>` (setea localStorage como `login`). `forgotPassword(email)`, `resetPassword(token,newPassword)`, `verifyEmail(token)`, `acceptInvitation(token,newPassword)` → `fetch` a `${API_BASE}/auth/...`.

- [x] **Step 2: Botón Google en `/login`**

Añadir `<a href="http://localhost:3001/api/auth/google">Continuar con Google</a>` y el enlace a `/forgot-password`. Si `login` lanza mensaje que incluya `verificar`, mostrar botón "Reenviar verificación" (`email/resend`).

- [x] **Step 3: Páginas restantes**

`/auth/callback`: lee `token` de `searchParams`, llama `loginWithGoogleToken`, redirige a `/`. `/forgot-password`: formulario email → mensaje "si el correo existe, recibirás un enlace". `/reset-password` y `/accept-invite`: token oculto + nueva clave + confirmación → llaman API → redirigen a `/login`. `/verify-email`: llama `verifyEmail(token)` y muestra ok/error.

- [x] **Step 4: Compilar**

Run: `cd apps/web && npx next build`
Expected: compila; rutas nuevas listadas.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/app apps/web/src/lib/api.ts
git commit -m "feat(web): paginas de invitacion, verificacion y reseteo de contrasena"
```

---

### Task A11: Verificación E2E de la Fase A

- [x] **Step 1: Levantar servicios**

Run: `./start.sh`
Expected: API 3001 y Web 3000 en HTTP 200.

- [x] **Step 2: Flujo invitación (con SMTP en modo log)**

1. `POST /api/users` sin `password` para `e2e.invitado@example.com` (token superadmin).
2. Leer el token: `docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -c "SELECT purpose, expires_at, consumed_at FROM auth_tokens ORDER BY created_at DESC LIMIT 1"`
3. `POST /api/auth/invitation/accept { token, newPassword }` → 201.
4. `POST /api/auth/login` con esa clave → 200.
Expected: los 4 pasos OK; el token queda `consumed_at` no nulo.

- [x] **Step 3: Flujo reset + caducidad**

1. `POST /api/auth/password/forgot { email }` → 202.
2. Reusar un token ya consumido en `/auth/password/reset` → 400.
3. Forzar `expires_at` en el pasado, reintentar → 400.
Expected: 202 + dos 400.

- [x] **Step 4: Google (si hay credenciales)**

Con `GOOGLE_CLIENT_ID/SECRET` configurados, abrir `http://localhost:3001/api/auth/google` con un correo invitado → redirige a `/auth/callback?token=...` y entra. Con un correo no invitado → `/login?error=not_invited`.
Expected: ambos comportamientos.

- [x] **Step 5: Commit**

```bash
git add .
git commit -m "test: verificacion e2e fase a (identidad y auth)"
```
