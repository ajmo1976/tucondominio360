# Fase B: Roles, Permisos y Empresa Administradora — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introducir una capa única de permisos (SaaS → empresa administradora → residencia → unidad) que sustituya los `is_superadmin` dispersos, permita a una administradora gestionar varias residencias y corrija el manejo de roles de ocupante por unidad.

**Architecture:** La matriz de permisos y su resolución viven como funciones puras en `@tucondominio360/shared`. En la API, un `AccessModule` nuevo expone `AccessService.resolveCondoAccess(userId, condoId)` y un `CondoPermissionGuard` + decorador `@RequireCondoPermission(...)`. Los `tenant_users` ganan rol y estado. Los módulos de dominio migran sus checks a la capa nueva de forma incremental.

**Tech Stack:** NestJS 10, PostgreSQL 16, `node:test` + `ts-node`, `@tucondominio360/shared`.

**Spec:** `docs/superpowers/specs/2026-10-17-usuarios-identidad-roles-modulos.md` (secciones 5.2, 6, 9).

## Global Constraints

- Tres niveles de rol: `is_superadmin` (SaaS), `tenant_users.role` (`tenant_role`), `condo_user_access.role` (`condo_role`), `unit_occupants.role` (`occupant_role`).
- Los permisos efectivos son la **unión** de los permisos de tenant y de residencia; `is_superadmin ⇒ todos`.
- Todo cambio de BD va también a `database/schema.sql`.
- Tras editar `packages/shared/src`: `npm run build --workspace=@tucondominio360/shared`.
- Tests backend: `cd apps/api && node --require ts-node/register/transpile-only --test <ruta>`.
- Tests shared: `cd packages/shared && node --require ts-node/register/transpile-only --test src/<file>`.
- La capa nueva **no** rompe el comportamiento actual: un usuario con `condo_user_access.role='ADMIN'` conserva acceso pleno a su residencia.
- El guard responde `403` con `{ message: 'No tienes permiso para <acción>' }`.

## Review Focus

- Usuario **sin acceso** a una residencia que llama a su API: 403 (no 500 ni fuga de datos).
- `unit_occupants.role` con valor de `condo_role` (p. ej. `ADMIN`): nunca debe insertarse; el rol de ocupante se elige de `occupant_role`.
- **Administradora (tenant ADMIN)** que gestiona 3 residencias: ve las 3, y el residente de la residencia 4 no ve nada de las de ella.
- Usuario con **dos roles** en la misma residencia (`ADMIN` y `GUARD` por error de datos): la unión de permisos no debe conceder de menos (acceso por el más permisivo).
- **Superadmin sigue viendo todo** tras el refactor de checks.

---

### Task B1: Migración de rol de tenant

**Files:**
- Create: `database/migrations/20261017_tenant_roles.sql`
- Modify: `database/schema.sql` (enum `tenant_role`; tabla `tenant_users` líneas 192-199)

**Interfaces:**
- Produces: `tenant_role` enum; `tenant_users.role`, `tenant_users.is_active`.

- [ ] **Step 1: Escribir la migración**

```sql
-- 20261017_tenant_roles.sql
DO $$ BEGIN
  CREATE TYPE tenant_role AS ENUM ('OWNER','ADMIN','STAFF','VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS role tenant_role NOT NULL DEFAULT 'STAFF';
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Overrides puntuales de permisos (opcional; sin uso inicial)
ALTER TABLE condo_user_access ADD COLUMN IF NOT EXISTS permissions_override JSONB;

-- El dueño histórico del tenant conserva su condición
UPDATE tenant_users SET role = 'OWNER' WHERE is_owner = TRUE;

CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
```

- [ ] **Step 2: Aplicar y verificar**

Run: `docker exec -i tucondominio360_postgres psql -U postgres -d tucondominio360 < database/migrations/20261017_tenant_roles.sql`
Run: `docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -c "\d tenant_users" | grep -E "role|is_active"`
Expected: columnas listadas, sin error.

- [ ] **Step 3: Reflejar en `database/schema.sql`** (enum + columnas en `tenant_users`).

- [ ] **Step 4: Commit**

```bash
git add database/migrations/20261017_tenant_roles.sql database/schema.sql
git commit -m "feat(db): rol y estado en tenant_users"
```

---

### Task B2: Matriz de permisos en shared

**Files:**
- Create: `packages/shared/src/permissions.ts`
- Test: `packages/shared/src/permissions.spec.ts`
- Modify: `packages/shared/src/index.ts` (re-export)

**Interfaces:**
- Produces:
  - `type CondoRole = 'ADMIN'|'BOARD_PRESIDENT'|...|'AUDITOR'` (ya existe), `type TenantRole = 'OWNER'|'ADMIN'|'STAFF'|'VIEWER'`
  - `type CondoPermission = 'CONDO_MANAGE'|'USERS_MANAGE'|...|'COMMUNITY_VIEW'`
  - `const CONDO_ROLE_PERMISSIONS: Record<CondoRole, CondoPermission[]>`
  - `const TENANT_ROLE_PERMISSIONS: Record<TenantRole, CondoPermission[]>`
  - `function effectivePermissions(tenantRole: TenantRole | null, condoRole: CondoRole | null, isSuperadmin?: boolean): CondoPermission[]`
  - `function hasPermission(perms: CondoPermission[], p: CondoPermission): boolean`

- [ ] **Step 1: Test que falla**

```ts
// packages/shared/src/permissions.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { effectivePermissions, hasPermission, CONDO_ROLE_PERMISSIONS } from './permissions';

test('ADMIN de residencia tiene todos los permisos de condominio', () => {
  const p = effectivePermissions(null, 'ADMIN');
  assert.ok(hasPermission(p, 'CONDO_MANAGE'));
  assert.ok(hasPermission(p, 'BILLING_MANAGE'));
});
test('OWNER no puede gestionar gastos', () => {
  const p = effectivePermissions(null, 'OWNER');
  assert.equal(hasPermission(p, 'EXPENSES_MANAGE'), false);
  assert.ok(hasPermission(p, 'PAYMENTS_REPORT'));
});
test('tenant ADMIN ve y opera todas las residencias de su cartera', () => {
  const p = effectivePermissions('ADMIN', null);
  assert.ok(hasPermission(p, 'MAINTENANCE_MANAGE'));
  assert.ok(hasPermission(p, 'BILLING_MANAGE'));
});
test('union de roles no quita permisos', () => {
  const p = effectivePermissions('VIEWER', 'GUARD');
  assert.ok(hasPermission(p, 'ACCESS_MANAGE'));
  assert.ok(hasPermission(p, 'AUDIT_VIEW'));
});
test('superadmin tiene permiso total', () => {
  assert.ok(hasPermission(effectivePermissions(null, null, true), 'USERS_MANAGE'));
});
test('no hay duplicados en la matriz', () => {
  for (const list of Object.values(CONDO_ROLE_PERMISSIONS)) {
    assert.equal(new Set(list).size, list.length);
  }
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd packages/shared && node --require ts-node/register/transpile-only --test src/permissions.spec.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `permissions.ts`**

Definir la lista canónica `CondoPermission`, la matriz completa de la spec §6.2 (`CONDO_ROLE_PERMISSIONS`, `TENANT_ROLE_PERMISSIONS`), `effectivePermissions` (deduplica con `Set`) y `hasPermission`. Exportar desde `index.ts`.

- [ ] **Step 3bis: Ajustar el `CondoRole` duplicado**

En `packages/shared/src/index.ts` ya existe `CondoRole`; **no** redefinirlo en `permissions.ts`: importarlo con `import type { CondoRole } from './index'` o mover el tipo a un archivo compartido y re-exportarlo (evitar duplicado de tipo). Verificar con `npm run build`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd packages/shared && node --require ts-node/register/transpile-only --test src/permissions.spec.ts && npm run build`
Expected: PASS (5 tests) y build OK.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/permissions.ts packages/shared/src/permissions.spec.ts packages/shared/src/index.ts
git commit -m "feat(shared): matriz de permisos y resolucion efectiva"
```

---

### Task B3: `AccessService` en la API

**Files:**
- Create: `apps/api/src/modules/access-core/access.service.ts`, `access.module.ts`
- Test: `apps/api/src/modules/access/access.resolve.spec.ts` (función pura auxiliar)
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `effectivePermissions`, `CondoRole`, `TenantRole` (B2); `DatabaseService`.
- Produces:
  - `AccessService.resolveCondoAccess(userId, condoId): Promise<CondoAccess>` con
    `CondoAccess = { isSuperadmin, tenantId, tenantRole, condoRole, occupantRoles: string[], isStaff: boolean, permissions: CondoPermission[], source: 'SUPERADMIN'|'TENANT'|'CONDO'|'NONE' }`
  - `AccessService.resolveUserAccess(userId): Promise<{ condos: CondoAccess[] }>`

  > **Nota de nombres:** se crea carpeta `modules/access-core/` para no chocar con el módulo de Garita existente (`modules/access`). El servicio se exporta como `AccessService`.

- [ ] **Step 1: Test que falla (composición pura)**

```ts
// apps/api/src/modules/access-core/access.resolve.spec.ts
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
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/access-core/access.resolve.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `access.logic.ts` y `access.service.ts`**

`access.logic.ts` exporta `composeAccess(input): CondoAccess` puro (sin BD) usando `effectivePermissions` y calculando `isStaff` (true si superadmin o tenantRole ≠ VIEWER o condoRole ∈ `{ADMIN, BOARD_PRESIDENT, BOARD_TREASURER, BOARD_MEMBER, GUARD, CONCIERGE, AUDITOR}`). `access.service.ts` consulta `condo_user_access`, `tenant_users` (join por `condos.tenant_id`) y `unit_occupants`, y delega la composición a `composeAccess`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/api && npm run build && node --require ts-node/register/transpile-only --test src/modules/access-core/access.resolve.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/access-core apps/api/src/app.module.ts
git commit -m "feat(api): AccessService con permisos efectivos"
```

---

### Task B3b: Guard y decorador de permisos

**Files:**
- Create: `apps/api/src/modules/access-core/condo-permission.guard.ts`, `apps/api/src/modules/access-core/require-condo-permission.decorator.ts`
- Test: `apps/api/src/modules/access-core/condo-permission.guard.spec.ts`

**Interfaces:**
- Consumes: `AccessService.resolveCondoAccess` (B3).
- Produces: `@RequireCondoPermission(permission: CondoPermission)` + `CondoPermissionGuard`. El `condoId` se toma de `req.params.condoId ?? req.params.id ?? req.query.condoId ?? req.body.condoId`.

- [ ] **Step 1: Test que falla**

```ts
// apps/api/src/modules/access-core/condo-permission.guard.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assertPermission } from './condo-permission.logic';

test('lanza 403 si falta el permiso', () => {
  assert.throws(() => assertPermission(['COMMUNITY_VIEW'], 'BILLING_MANAGE'), /No tienes permiso/);
});
test('no lanza si el permiso esta', () => {
  assert.doesNotThrow(() => assertPermission(['BILLING_MANAGE'], 'BILLING_MANAGE'));
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/access-core/condo-permission.guard.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`condo-permission.logic.ts` → `assertPermission(perms, required)` lanza `ForbiddenException('No tienes permiso para esta acción')`. `@RequireCondoPermission` usa `SetMetadata('condo_permission', perm)`. `CondoPermissionGuard implements CanActivate`: lee el permiso con `Reflector`, resuelve `condoId`, llama a `AccessService.resolveCondoAccess` y aplica `assertPermission`. Registrar `AccessService` como `@Global()` (o exportarlo desde `AccessCoreModule` y importarlo donde se use).

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/api && npm run build && node --require ts-node/register/transpile-only --test src/modules/access-core/condo-permission.guard.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/access-core
git commit -m "feat(api): guard y decorador de permisos por residencia"
```

---

### Task B4: Migrar checks a la capa de permisos (módulos críticos)

**Files:**
- Modify: `apps/api/src/modules/maintenance/maintenance.controller.ts`
- Modify: `apps/api/src/modules/announcements/announcements.controller.ts`
- Modify: `apps/api/src/modules/amenities/amenities.controller.ts`
- Modify: `apps/api/src/modules/access/access.controller.ts`
- Modify: `apps/api/src/modules/consultations/consultations.controller.ts`

**Interfaces:**
- Consumes: `@RequireCondoPermission` (B3b), `AccessService` (B3).
- Produces: controllers protegidos por permiso; los servicios pueden recibir `access.isStaff` en vez de recalcular.

- [ ] **Step 1: Mapear checks actuales → permisos**

Anotar, por controlador, los endpoints y su permiso (`MAINTENANCE_MANAGE` / `MAINTENANCE_REPORT`, `ANNOUNCEMENTS_MANAGE/VIEW/ACK`, `AMENITIES_MANAGE/BOOK`, `ACCESS_MANAGE/ACCESS_GUEST`, `CONSULTATIONS_MANAGE/VOTE`). Dejar el mapa en un comentario al inicio de cada controlador.

- [ ] **Step 2: Aplicar el decorador y quitar los checks manuales**

En cada endpoint de escritura/gestión: `@UseGuards(AuthGuard('jwt'), CondoPermissionGuard)` + `@RequireCondoPermission('...')`. Sustituir dentro de los servicios los `if (!user.is_superadmin) { ...consulta condo_user_access... }` por el `CondoAccess` resuelto (inyectar `AccessService` o pasar `req.access`). Mantener el comportamiento para superadmin.

- [ ] **Step 2bis: Verificar build**

Run: `cd apps/api && npm run build`
Expected: compila.

- [ ] **Step 3: Prueba manual de permisos**

Con token de un `OWNER`, llamar a `PATCH /api/maintenance/tickets/:id` → esperar 403. Con `ADMIN` de la misma residencia → 200. Con superadmin → 200.
Expected: los tres resultados.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules
git commit -m "refactor(api): permisos por residencia en mantenimiento, cartelera, reservas, garita y asambleas"
```

---

### Task B5: Empresa administradora (tenants) y su personal

**Files:**
- Create: `apps/api/src/modules/tenants/tenants.service.ts`, `tenants.controller.ts`, `tenants.module.ts`, `dto/tenant-staff.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/condos/condos.service.ts` (usar `tenant_users` al crear asignaciones)

**Interfaces:**
- Consumes: `TenantRole` (B2), `AccessService` (B3).
- Produces:
  - `GET /api/tenants/:id` → `{ id, name, tenantType, condos: [...] }` (superadmin o miembro del tenant)
  - `GET /api/tenants/:id/staff`
  - `POST /api/tenants/:id/staff { userId, role }`, `PATCH`, `DELETE`
  - `GET /api/me/access` → `{ condos: CondoAccess[] }` (en `AuthController` o `TenantsController`)

- [ ] **Step 1: Test que falla (validación de rol)**

```ts
// apps/api/src/modules/tenants/tenants.roles.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assertTenantRole } from './tenants.logic';
test('rechaza rol de tenant invalido', () => {
  assert.throws(() => assertTenantRole('SUPERMAN'), /rol/i);
});
test('acepta OWNER y STAFF', () => {
  assert.equal(assertTenantRole('OWNER'), 'OWNER');
  assert.equal(assertTenantRole('STAFF'), 'STAFF');
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/tenants/tenants.roles.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`tenants.service.ts`: `listStaff(tenantId)`, `setStaffRole(tenantId, userId, role)` (upsert en `tenant_users`), `removeStaff`. `GET /api/tenants/:id` devuelve la cartera (`condos WHERE tenant_id`). Autorización: superadmin o `tenant_users.role ∈ {OWNER, ADMIN}` del propio tenant. `resolveUserAccess` en `AccessService` (B3) alimenta `GET /api/me/access`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/api && npm run build && node --require ts-node/register/transpile-only --test src/modules/tenants/tenants.roles.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/tenants apps/api/src/modules/access-core apps/api/src/app.module.ts
git commit -m "feat(api): empresa administradora (tenant), su personal y /me/access"
```

---

### Task B6: `GET /auth/me` con roles y permisos

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts` (`getProfile`)
- Modify: `apps/api/src/modules/auth/auth.controller.ts`

**Interfaces:**
- Consumes: `AccessService.resolveUserAccess` (B3).
- Produces: `getProfile` → `{ user: {... , emailVerified, authProviders}, condos: [{ condoId, condoName, role, tenantRole, permissions, isStaff }] }`.

- [ ] **Step 1: Test/verificación**

Run (tras `./start.sh`):
`curl -s -H "Authorization: Bearer <token>" http://localhost:3001/api/auth/me | jq '.condos[0].permissions'`
Expected: array no vacío con `permissions` por residencia.

- [ ] **Step 2: Implementar** el cambio en `getProfile` y tipar en `apps/web/src/lib/api.ts` (`SessionCondo.permissions?: string[]`, `SessionUser.emailVerified?`).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/auth apps/web/src/lib/api.ts
git commit -m "feat(api): /auth/me devuelve roles y permisos efectivos"
```

---

### Task B7: Ocupantes por unidad (corrige el bug de roles) y multi-residencia

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts` (`create`/`update`: separar `condoRole` de `occupantRole`; `findOne` devuelve `occupantRole` y flags)
- Modify: `apps/api/src/modules/users/dto/create-user.dto.ts` (`UnitAssignmentDto` con `occupantRole`, `isPrimaryContact`, `isBillingRecipient`)
- Create: `apps/api/src/modules/condos/occupants.*` (endpoints de ocupantes)

**Interfaces:**
- Produces:
  - `UnitAssignmentDto = { unitId, occupantRole: OccupantRole, isPrimaryContact?: boolean, isBillingRecipient?: boolean }`
  - `GET /api/condos/:id/units/:unitId/occupants`, `POST`, `PATCH /:occupantId`, `DELETE /:occupantId`

- [ ] **Step 1: Test que falla (validación de rol de ocupante)**

```ts
// apps/api/src/modules/users/occupant-role.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assertOccupantRole } from './occupant-role.logic';
test('rechaza un condo_role como rol de ocupante', () => {
  assert.throws(() => assertOccupantRole('ADMIN'), /ocupante/i);
});
test('acepta OWNER, CO_OWNER, TENANT, RESIDENT, AUTHORIZED', () => {
  for (const r of ['OWNER','CO_OWNER','TENANT','RESIDENT','AUTHORIZED']) assert.equal(assertOccupantRole(r), r);
});
```

> **Ojo con los nombres reales en BD:** la unidad se guarda en `unit_occupants.property_unit_id`
> (no `unit_id`), y las columnas `is_primary_contact` / `is_billing_recipient` **ya existen**.
> El DTO de la API puede seguir usando `unitId`, pero el SQL debe mapear a `property_unit_id`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/users/occupant-role.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`occupant-role.logic.ts` valida contra el enum `occupant_role`. En `create`/`update`, `condo_user_access` usa `a.role` (condo_role) y `unit_occupants` usa `ua.occupantRole` (default `'OWNER'`) + flags. Endpoints de ocupantes con permiso `UNITS_MANAGE` / `CONDO_MANAGE`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/api && npm run build && node --require ts-node/register/transpile-only --test src/modules/users/occupant-role.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/users apps/api/src/modules/condos
git commit -m "fix(api): separar rol de residencia y rol de ocupante por unidad"
```

---

### Task B8: Gating en frontend por permisos

**Files:**
- Modify: `apps/web/src/app/page.tsx` (guardar `permissions` de `/auth/me`)
- Modify: `apps/web/src/components/Sidebar.tsx` (filtrar ítems por permiso)

**Interfaces:**
- Consumes: `getSession()`/`/auth/me` con `permissions`.

- [ ] **Step 1: Implementar** un mapa `moduleId → CondoPermission` y filtrar el menú: `maintenance` requiere `MAINTENANCE_MANAGE` o `MAINTENANCE_REPORT` según rol staff/propietario; `users` requiere `USERS_MANAGE`; etc. Ocultar ítems sin permiso.

- [ ] **Step 2: Verificar en navegador** con `OWNER` (no ve `Usuarios`, `Gastos`) y con `ADMIN` (los ve).

- [ ] **Step 3: Compilar**

Run: `cd apps/web && npx next build`
Expected: compila.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): menu segun permisos efectivos"
```

---

### Task B9: Verificación E2E de la Fase B

- [ ] **Step 1:** Crear una empresa administradora con 2 residencias y un usuario `tenant ADMIN`; verificar que `GET /api/me/access` lista ambas.
- [ ] **Step 2:** Con el `tenant ADMIN`, crear un ticket en cada residencia → 201 en ambas.
- [ ] **Step 3:** Con un `OWNER` de la residencia 1, `PATCH` un ticket de la residencia 2 → 403.
- [ ] **Step 4:** Asignar al `OWNER` una unidad en la residencia 2 con `occupantRole='CO_OWNER'`; verificar en `GET /api/users/:id` que la unidad aparece con ese rol (no `ADMIN`).
- [ ] **Step 5: Commit** `git add . && git commit -m "test: verificacion e2e fase b (roles y permisos)"`
