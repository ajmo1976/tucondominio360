# Diseño: Identidad, Roles, Permisos y Control de Módulos — TuCondominio360

> **Estado:** propuesta para aprobación.
> **Autor:** sesión de diseño.
> **Alcance:** módulo de Usuarios y Accesos + Autenticación + activación/desactivación de módulos.
> **Planes que implementan este diseño:**
> - `docs/superpowers/plans/2026-10-17-usuarios-fase-a-identidad-auth.md`
> - `docs/superpowers/plans/2026-10-17-usuarios-fase-b-roles-permisos.md`
> - `docs/superpowers/plans/2026-10-17-usuarios-fase-c-modulos-onoff.md`
> - `docs/superpowers/plans/2026-10-17-usuarios-fase-d-ui-usuarios.md`

---

## 1. Contexto y problema

El módulo actual resuelve lo básico (login email/contraseña, JWT 7d, CRUD de usuarios,
asignación de residencias y unidades), pero tiene límites que impiden operarlo con
seguridad y a escala:

1. **Autenticación solo local.** No hay Google, ni verificación de correo, ni
   "olvidé mi contraseña" self-service. La administración asigna contraseñas a mano
   (`ResetPasswordModal` → `POST /users/:id/reset-password`).
- `users.password_hash` es `NOT NULL`, así que hoy es imposible soportar una cuenta
  que solo entre con Google.
- Existe un **bypass de desarrollo** (`secret123`) dentro de `AuthService.login` y
  `changePassword` que acepta esa clave para cualquier usuario.
- **Autorización ad-hoc:** el control de acceso está repartido en `if (user.is_superadmin)`
   y consultas repetidas a `condo_user_access` por cada módulo (maintenance, announcements,
   amenities, billing, access, consultations, condos…). No hay una capa de permisos.
- **"Empresa administradora":** el esquema ya tiene `tenants` (`tenant_type='COMPANY'`),
   `tenant_users` y `condos.tenant_id`, pero `tenant_users` no tiene rol ni estado y
   ningún módulo lo usa. No existe forma de que una administradora gestione varias
   residencias con una sola cuenta.
- **Unidades y roles mezclados:** `unit_occupants.role` es del enum `occupant_role`,
   pero `UsersService` inserta el rol de `condo_role` (p. ej. `ADMIN`) en esa columna,
   lo que rompe el enum al asignar unidades a un administrador.
- **Módulos:** existen `tenants.settings` y `condos.settings` (JSONB) pero **no hay
   interruptores** de módulos. El sidebar siempre muestra todos los ítems.

## 2. Objetivos

1. **Acceso con Google** (modelo "invitar primero": solo correos ya registrados pueden
   vincular y entrar con Google).
2. **Confirmación de usuario por correo con token** (invitación + verificación).
3. **Reseteo de contraseña** de autoservicio por correo, más envío de enlace desde la
   administración.
4. **Modelo de roles robusto**: una capa de **permisos** resuelta en un solo lugar,
   con alcance por residencia y a nivel de **empresa administradora (tenant)**.
5. **Usuario administradora que gestiona varias residencias** vía rol de tenant.
6. **Usuarios con 1..N unidades en una o varias residencias**, con rol de ocupante
   por unidad (corrigiendo el bug de roles) y vista consolidada para el propietario.
7. **Prender/apagar módulos** con granularidad **global → por tenant → por residencia**
   (la residencia manda), filtrando el sidebar y las APIs.
8. Migración **no disruptiva**: los usuarios y datos existentes siguen funcionando.

## 3. No-objetivos (YAGNI por ahora)

- No hay autorregistro público ni Google para crear cuentas anónimas.
- No hay SSO con Apple/Microsoft/Azure (el modelo de identidades lo permitirá después).
- No hay 2FA/TOTP ni WebAuthn.
- No hay impersonación de usuarios.
- No hay permisos personalizados por usuario (overrides puntuales) en esta fase; se
  diseña la tabla de overrides pero se deja vacía/opcional.
- No hay refactor de todos los módulos existentes a la nueva capa de permisos: se migran
  los módulos críticos y se documenta el resto como deuda técnica controlada.

## 4. Decisiones bloqueadas (confirmadas con el responsable)

| # | Decisión | Elección |
|---|----------|----------|
| D1 | Modelo "administradora" | **Empresa administradora (tenant)**: rol a nivel tenant con acceso a todas las residencias del tenant. |
| D2 | Alta con Google | **Invitar primero**: solo correos ya registrados pueden entrar/vincular con Google. |
| D3 | Granularidad de módulos | **Global (catálogo superadmin) + por tenant + por residencia**, con la residencia como override final. |
| D4 | Envío de correo | **nodemailer** configurable por SMTP; en dev sin SMTP el token/enlace se escribe en el log (`MAIL_MODE=log`). |
| D5 | Entrega del plan | 1 spec + 4 planes por subsistema (A, B, C, D). |

## 5. Modelo de datos (deltas)

Convención del repo: cada cambio va en `database/migrations/<fecha>_<nombre>.sql` **y**
se refleja en `database/schema.sql`. Los tipos/enums nuevos se declaran en `schema.sql`
(junto a los existentes) y en la migración con guardas.

### 5.1 Identidad y tokens (Fase A) — `20261017_identity_auth.sql`

```sql
-- users: permitir cuentas solo-Google e incorporar estado de correo/sesión
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN doc_number DROP NOT NULL;
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0;   -- invalida JWT al cambiar clave/resetear

CREATE TABLE user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,             -- 'LOCAL' | 'GOOGLE'
    provider_user_id VARCHAR(255),             -- 'sub' de Google; NULL para LOCAL
    email_at_provider VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    CONSTRAINT uq_identity_provider UNIQUE (provider, provider_user_id)
);
CREATE INDEX idx_user_identities_user ON user_identities(user_id);

CREATE TABLE auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(30) NOT NULL,              -- 'INVITATION' | 'EMAIL_VERIFICATION' | 'PASSWORD_RESET'
    token_hash VARCHAR(64) NOT NULL,           -- sha256 hex del token en claro
    email VARCHAR(120) NOT NULL,               -- destinatario al emitir
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_auth_token_hash UNIQUE (token_hash)
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id, purpose);
```

Notas:
- `doc_type`/`doc_number` quedan opcionales para permitir invitar solo con correo
  (el `UNIQUE (doc_type, doc_number)` de Postgres admite múltiples `NULL`).
- Los tokens **nunca** se guardan en claro: se guarda `sha256(token)`.
- `password_hash = NULL` significa "cuenta sin contraseña local" (solo Google o invitación
  pendiente). El login local debe rechazarla con un mensaje claro.

### 5.2 Roles y empresa administradora (Fase B) — `20261017_tenant_roles.sql`

```sql
CREATE TYPE tenant_role AS ENUM ('OWNER', 'ADMIN', 'STAFF', 'VIEWER');

ALTER TABLE tenant_users ADD COLUMN role tenant_role NOT NULL DEFAULT 'STAFF';
ALTER TABLE tenant_users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Overrides puntuales de permisos (opcional; se deja para futuro uso selectivo)
ALTER TABLE condo_user_access ADD COLUMN permissions_override JSONB;   -- ["MAINTENANCE_MANAGE", ...]
```

- `tenant_users.is_owner` se conserva por compatibilidad; `role='OWNER'` es el dueño de
  la empresa administradora.
- El acceso efectivo de un usuario a una residencia = superadmin ∪ permisos del rol de
  tenant (solo si `condos.tenant_id` coincide) ∪ permisos del `condo_role`.

### 5.3 Módulos on/off (Fase C) — `20261017_modules_control.sql`

```sql
CREATE TABLE modules (
    code VARCHAR(40) PRIMARY KEY,              -- ver MODULE_CODES en @tucondominio360/shared
    name VARCHAR(80) NOT NULL,
    description TEXT,
    default_enabled BOOLEAN NOT NULL DEFAULT TRUE,   -- valor global (superadmin)
    is_core BOOLEAN NOT NULL DEFAULT FALSE,          -- los core no se pueden apagar
    sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE tenant_modules (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_code VARCHAR(40) NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    PRIMARY KEY (tenant_id, module_code)
);

CREATE TABLE condo_modules (
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    module_code VARCHAR(40) NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    PRIMARY KEY (condo_id, module_code)
);
```

### 5.3.1 Catálogo de módulos (semilla en la migración)

| code | name | is_core | default_enabled |
|------|------|---------|-----------------|
| `DASHBOARD` | Dashboard General | **true** | true |
| `COMMUNITY` | Portal del Propietario | **true** | true |
| `BILLING` | Gestión de Recibos | true | true |
| `EXPENSES` | Gastos y Facturas | false | true |
| `PAYMENTS` | Conciliación de Pagos | false | true |
| `UNITS` | Propietarios y Alícuotas | true | true |
| `ACCESS` | Control de Acceso / Garita | false | true |
| `AMENITIES` | Reserva de Áreas Comunes | false | true |
| `MAINTENANCE` | Mantenimiento | false | true |
| `ANNOUNCEMENTS` | Cartelera Digital | false | true |
| `CONSULTATIONS` | Consultas y Asambleas | false | true |
| `USERS` | Usuarios y Accesos | **true** | true |

Los `is_core=true` no se pueden desactivar en ningún nivel (validación en servicio y UI).

## 6. Roles y permisos

### 6.1 Tres niveles

1. **SaaS (global):** `users.is_superadmin` → permiso total (se conserva).
2. **Empresa administradora (tenant):** `tenant_users.role` ∈ `OWNER | ADMIN | STAFF | VIEWER`.
   Otorga acceso a **todas las residencias** del tenant (`condos.tenant_id = tenant_users.tenant_id`).
3. **Residencia (condo):** `condo_user_access.role` ∈ `condo_role` (enum existente:
   `ADMIN, BOARD_PRESIDENT, BOARD_TREASURER, BOARD_MEMBER, OWNER, TENANT, GUARD, CONCIERGE, AUDITOR`).
4. **Unidad:** `unit_occupants.role` ∈ `occupant_role` (`OWNER, CO_OWNER, TENANT, RESIDENT, AUTHORIZED`).

### 6.2 Permisos (capacidades)

Lista canónica `CondoPermission` (en `packages/shared`):

```
CONDO_MANAGE, USERS_MANAGE, UNITS_MANAGE, AUDIT_VIEW,
BILLING_MANAGE, EXPENSES_MANAGE, PAYMENTS_MANAGE, PAYMENTS_REPORT,
ACCESS_MANAGE, ACCESS_GUEST,
AMENITIES_MANAGE, AMENITIES_BOOK,
MAINTENANCE_MANAGE, MAINTENANCE_REPORT,
ANNOUNCEMENTS_MANAGE, ANNOUNCEMENTS_VIEW, ANNOUNCEMENTS_ACK,
CONSULTATIONS_MANAGE, CONSULTATIONS_VOTE, COMMUNITY_VIEW
```

Matriz por rol de residencia (borrador a ajustar en el plan, función pura testeable):

| Rol | Permisos |
|-----|----------|
| `ADMIN` | todos |
| `BOARD_PRESIDENT` | todos menos `USERS_MANAGE` |
| `BOARD_TREASURER` | `BILLING_MANAGE, EXPENSES_MANAGE, PAYMENTS_MANAGE, MAINTENANCE_MANAGE, ANNOUNCEMENTS_MANAGE, ANNOUNCEMENTS_VIEW, ANNOUNCEMENTS_ACK, COMMUNITY_VIEW, AUDIT_VIEW` |
| `BOARD_MEMBER` | `MAINTENANCE_MANAGE, ANNOUNCEMENTS_MANAGE, ANNOUNCEMENTS_VIEW, ANNOUNCEMENTS_ACK, CONSULTATIONS_MANAGE, CONSULTATIONS_VOTE, COMMUNITY_VIEW` |
| `OWNER` | `ANNOUNCEMENTS_VIEW, ANNOUNCEMENTS_ACK, CONSULTATIONS_VOTE, AMENITIES_BOOK, MAINTENANCE_REPORT, PAYMENTS_REPORT, COMMUNITY_VIEW` |
| `TENANT` | `ANNOUNCEMENTS_VIEW, ANNOUNCEMENTS_ACK, AMENITIES_BOOK, MAINTENANCE_REPORT, COMMUNITY_VIEW` |
| `GUARD` | `ACCESS_MANAGE, ACCESS_GUEST, MAINTENANCE_REPORT, ANNOUNCEMENTS_VIEW` |
| `CONCIERGE` | `MAINTENANCE_MANAGE, MAINTENANCE_REPORT, ANNOUNCEMENTS_VIEW` |
| `AUDITOR` | `AUDIT_VIEW, ANNOUNCEMENTS_VIEW, COMMUNITY_VIEW` |

Matriz por rol de tenant (acceso a todas las residencias del tenant):

| Rol tenant | Permisos |
|------------|----------|
| `OWNER` | todos |
| `ADMIN` | todos menos (no aplica borrado de tenant) |
| `STAFF` | `MAINTENANCE_MANAGE, MAINTENANCE_REPORT, ANNOUNCEMENTS_MANAGE, ANNOUNCEMENTS_VIEW, ANNOUNCEMENTS_ACK, ACCESS_MANAGE, ACCESS_GUEST, AMENITIES_MANAGE, AMENITIES_BOOK, UNITS_MANAGE, COMMUNITY_VIEW` |
| `VIEWER` | `AUDIT_VIEW, ANNOUNCEMENTS_VIEW, COMMUNITY_VIEW` |

**Resolución efectiva** (`effectivePermissions(tenantRole, condoRole)`):
`permisos = (tenant ? MATRIZ_TENANT[tenantRole] : ∅) ∪ (condo ? MATRIZ_CONDO[condoRole] : ∅)`,
y `is_superadmin ⇒ todos`.

### 6.3 API de resolución (backend)

`AccessService` (Fase B):
- `resolveCondoAccess(userId, condoId): Promise<CondoAccess>` donde
  `CondoAccess = { isSuperadmin, tenantId, tenantRole, condoRole, occupantRoles[], isStaff, permissions[], source }`.
- `resolveUserAccess(userId): Promise<{ condos: CondoAccess[] }>`.

Guard + decorador:
```ts
@RequireCondoPermission('MAINTENANCE_MANAGE') // lee condoId de params/query/body
@UseGuards(AuthGuard('jwt'), CondoPermissionGuard)
```
`CondoPermissionGuard` usa `AccessService.resolveCondoAccess` y responde 403 con
`{ message: 'No tienes permiso para ...' }`.

## 7. Flujos de autenticación

### 7.1 Invitación + verificación por correo (Fase A)

1. La administración crea un usuario desde `UsersView` **sin contraseña** (modo invitar).
2. `POST /api/users` → crea usuario `is_active=true`, `email_verified_at=NULL`,
   `password_hash=NULL`, y emite `auth_tokens` (`purpose='INVITATION'`, 7 días).
3. `MailService` envía correo con enlace `${APP_URL}/accept-invite?token=...`.
4. El usuario abre el enlace → página `/accept-invite` → define su contraseña
   (`POST /api/auth/invitation/accept { token, newPassword }`) **o** pulsa
   "Continuar con Google" (si su correo coincide con el de la invitación).
5. Al aceptar: `password_hash` = bcrypt, `email_verified_at = NOW()`, token consumido,
   `token_version++`, se emite sesión (o se redirige a `/login`).

Reenvío: `POST /api/users/:id/invitation/resend` (invalida el token anterior).

### 7.2 Google (invite-first) (Fase A)

- `GET /api/auth/google` → redirige a Google (passport-google-oauth20, scope `email profile`).
- `GET /api/auth/google/callback`:
  - Busca `user_identities(provider='GOOGLE', provider_user_id=sub)`.
  - Si no existe, busca `users` por email (normalizado). Si **no existe** o está
    inactivo → redirige a `/login?error=not_invited` (no se crea cuenta).
  - Si existe: vincula identidad si falta, marca `email_verified_at` (lo garantiza Google),
    actualiza `last_login_at`, firma JWT y redirige a
    `${WEB_APP_URL}/auth/callback?token=<jwt>`.
- `/auth/callback` guarda la sesión con `login`-equivalente y va a `/`.
- Si el usuario invitado aún no tiene `password_hash`, Google igualmente lo activa
  (no necesita clave local).

### 7.3 Reseteo de contraseña (Fase A)

- `POST /api/auth/password/forgot { email }` → **siempre 202** (no revela existencia).
  Si existe y tiene identidad `LOCAL`: emite `PASSWORD_RESET` (1 h) y envía correo.
- `POST /api/auth/password/reset { token, newPassword }` → valida token, hace bcrypt,
  consume token, `token_version++` (invalida sesiones vivas), `email_verified_at` se
  conserva.
- Administración: `POST /api/users/:id/password-reset-link` emite y **devuelve el enlace**
  solo a superadmin (útil para soporte), además de enviar el correo.

### 7.4 Sesión y expiración

- JWT sigue en `Authorization: Bearer`. Se añade `token_version` al payload y
  `JwtStrategy.validate` compara con `users.token_version`; si difieren ⇒ 401.
- `POST /api/auth/logout` (autenticado) → `token_version++` (cierra todas las sesiones).
- El bypass de dev `secret123` se mantiene **solo** cuando `NODE_ENV !== 'production'`
  y se documenta como riesgo; en producción el login local exige hash real.

### 7.4.1 Reglas de inicio de sesión

- `is_active = false` → 403 "cuenta inactiva".
- Cuenta con `password_hash IS NULL` en login local → 401
  "Esta cuenta usa Google o tiene una invitación pendiente".
- `email_verified_at IS NULL` y `MAIL_VERIFY_REQUIRED=true` (prod) → 403
  `{ code: 'EMAIL_NOT_VERIFIED' }` y el frontend ofrece reenviar verificación.
  En dev (`MAIL_VERIFY_REQUIRED=false`) no bloquea.

### 7.4.1bis Verificación de correo

- `POST /api/auth/email/verify { token }` → marca `email_verified_at`, consume token.
- `GET /api/auth/email/verify?token=...` → redirige a `${WEB_APP_URL}/verify-email?status=ok|error`
  (para enlaces de correo).
- `POST /api/auth/email/resend { email }` → 202 siempre; reemite si aplica.

## 8. Módulos on/off (Fase C)

### 8.1 Resolución

`resolveEnabledModules(global, tenant, condo)` (función pura, testeable):
```
enabled(code) =
  catalog[code].is_core ? true :
  condo[code]  !== undefined ? condo[code] :
  tenant[code] !== undefined ? tenant[code] :
  global[code]               /* default_enabled */
```

### 8.2 API

- `GET /api/modules` (superadmin) → catálogo + defaults globales.
- `PATCH /api/modules/:code { defaultEnabled }` (superadmin; rechaza `is_core`).
- `GET /api/tenants/:id/modules` / `PATCH` (superadmin o rol tenant OWNER/ADMIN).
- `GET /api/condos/:id/modules` → efectivos (cualquier miembro) + `source` de cada uno.
- `PATCH /api/condos/:id/modules` (permiso `CONDO_MANAGE`) → setea overrides.
- `GET /api/me/modules` → mapa `{ [condoId]: ModuleCode[] }` para el usuario actual
  (impulsa el sidebar). Superadmin ve todos.

### 8.3 Enforcement

- **Frontend:** `Sidebar` y `page.tsx` filtran por `/api/me/modules`; un módulo apagado
  no aparece y, si se navega manualmente, se muestra "Módulo desactivado".
- **Backend:** cada controlador de dominio llama a `ModulesService.assertEnabled(condoId, code)`
  (o usa un `@RequireModule(code)` guard) y responde 403 `{ code: 'MODULE_DISABLED' }`
  si está apagado. Se aplica a MAINTENANCE, ANNOUNCEMENTS, ACCESS, AMENITIES,
  CONSULTATIONS, EXPENSES, PAYMENTS.

## 9. API — resumen de endpoints nuevos/cambiados

**Auth**
| Método | Ruta | Notas |
|--------|------|-------|
| GET | `/api/auth/google` | inicia OAuth |
| GET | `/api/auth/google/callback` | cierra OAuth → redirige con token |
| POST | `/api/auth/invitation/accept` | `{ token, newPassword }` |
| POST | `/api/auth/email/verify` | `{ token }` |
| GET | `/api/auth/email/verify` | enlace de correo (redirect) |
| POST | `/api/auth/email/resend` | `{ email }` |
| POST | `/api/auth/password/forgot` | `{ email }` → 202 |
| POST | `/api/auth/password/reset` | `{ token, newPassword }` |
| POST | `/api/auth/logout` | invalida sesiones (`token_version++`) |
| GET | `/api/auth/me` | **+** `roles`, `permissions`, `emailVerified`, `authProviders` |

**Usuarios**
| Método | Ruta | Notas |
|--------|------|-------|
| POST | `/api/users` | `password` ahora **opcional** → modo invitar |
| POST | `/api/users/:id/invitation/resend` | reenvía invitación |
| POST | `/api/users/:id/invitation/revoke` | invalida invitación |
| POST | `/api/users/:id/password-reset-link` | envía enlace (admin) |
| GET | `/api/users` | **+** filtros `role`, `condoId`, `status`, `provider` |
| GET | `/api/users/:id` | **+** `emailVerified`, `authProviders`, `lastLoginAt`, `unitRole` por unidad |

**Roles / tenant / unidades (Fase B)**
| Método | Ruta | Notas |
|--------|------|-------|
| GET | `/api/me/access` | residencias + roles + permisos |
| GET/PATCH | `/api/tenants/:id` | datos de la administradora |
| GET | `/api/tenants/:id/staff` | personal del tenant |
| POST/PATCH/DELETE | `/api/tenants/:id/staff/:userId` | asigna/cambia/quita rol tenant |
| GET/POST | `/api/condos/:id/access` | accesos de la residencia |
| PATCH/DELETE | `/api/condos/:id/access/:userId` | cambia/quita rol por residencia |
| GET/POST | `/api/condos/:id/units/:unitId/occupants` | ocupantes con `occupantRole` + flags |
| PATCH/DELETE | `/api/condos/:id/units/:unitId/occupants/:occupantId` | edita/quita ocupante |

## 10. Frontend

- **`/login`**: botón "Continuar con Google"; enlace "¿Olvidaste tu contraseña?";
  manejo de `EMAIL_NOT_VERIFIED` (banner + reenviar) y `not_invited`.
- **`/forgot-password`**, **`/reset-password`**, **`/verify-email`**, **`/accept-invite`**,
  **`/auth/callback`**: páginas nuevas.
- **`UsersView`**: filtros (residencia, rol, estado, proveedor), columna de estado de
  invitación/verificación, acciones "Reenviar invitación", "Enviar enlace de
  restablecimiento", "Ver permisos efectivos".
- **`UserFormModal`**: modo crear con dos opciones — *Invitar por correo* (sin clave) y
  *Crear con contraseña*; por residencia se elige `condo_role`; por unidad se elige
  `occupant_role` + `is_primary_contact`/`is_billing_recipient` (corrige el bug).
- **`ModuleSettingsModal`** (por residencia) y **`GlobalModulesView`** (superadmin).
- **`MyUnitsView`**: el propietario ve todas sus unidades en todas sus residencias con
  sus recibos.

## 11. Seguridad y operación

- Tokens: `crypto.randomBytes(32).toString('base64url')`, se guarda `sha256` hex; expiran
  (invitación 7d, reset 1h, verificación 24h); un solo uso (`consumed_at`).
- **Rate limiting** (`@nestjs/throttler`) en `/auth/*` (p. ej. 10 req/min por IP) y en
  `password/forgot` (3/15min por IP).
- Eliminar el bypass `secret123` cuando `NODE_ENV=production`.
- **Auditoría** en `audit_logs`: `USER_INVITED`, `USER_INVITED_ACCEPTED`, `GOOGLE_LINKED`,
  `LOGIN_OK`, `LOGIN_FAILED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_DONE`,
  `EMAIL_VERIFIED`, `MODULE_TOGGLED`, `ROLE_CHANGED`.
- No filtrar existencia de cuentas en `forgot`/`resend` (siempre 202).
- Compatibilidad: usuarios existentes → `email_verified_at = NOW()`, identidad `LOCAL`
  creada por migración, `token_version = 0`; el login actual sigue funcionando.

## 12. Fases, dependencias y criterios de aceptación

```
Fase A (Identidad/Auth)  ──┐
                           ├──> Fase D (UI Usuarios) requiere A + B + C
Fase B (Roles/Permisos) ──┤
                           │
Fase C (Módulos on/off) ──┘
```

- **Fase A** entrega: Google login funcional, invitación/verificación y reset por correo,
  tokens, rate limit. *Aceptación:* un usuario invitado define clave por enlace, entra; un
  usuario existente entra con Google; "olvidé mi contraseña" llega y cambia la clave;
  el enlace caduca y no se reutiliza.
- **Fase B** entrega: capa de permisos, roles de tenant, accesos por residencia y ocupantes
  por unidad. *Aceptación:* una administradora (tenant ADMIN) ve y opera todas las
  residencias de su cartera; un `OWNER` solo ve lo suyo; `GUARD` solo garita.
- **Fase C** entrega: catálogo + overrides + sidebar/APIs filtrados. *Aceptación:* apagar
  Mantenimiento en una residencia lo oculta en su sidebar y su API responde 403; el resto
  de residencias no se afecta; un módulo core no se puede apagar.
- **Fase D** entrega: UI de usuarios completa. *Aceptación:* invitar, reenviar, ver
  permisos efectivos, asociar varias unidades en varias residencias con rol de ocupante.

## 13. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Migrar `password_hash` a NULL y datos existentes | La migración marca `email_verified_at=NOW()` y crea identidades `LOCAL`; se prueba contra dump real. |
| Refactor de permisos rompe módulos actuales | Se introduce la capa en paralelo; los módulos críticos se migran con tests; el resto mantiene sus checks hasta su fase. |
| Google OAuth en local | Credenciales de prueba + `GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback`; documentado en `.env.example`. |
| Envío de correo en dev | `MAIL_MODE=log` escribe el enlace en `api.log`; los E2E leen el token de la BD. |
| Apagar un módulo con datos existentes | El toggle oculta/accede, no borra datos; reactivar restaura. |
