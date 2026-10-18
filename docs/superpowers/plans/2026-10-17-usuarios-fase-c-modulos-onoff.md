# Fase C: Control de Módulos On/Off — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir prender/apagar módulos con tres niveles (catálogo global del SaaS → override por empresa administradora → override por residencia), aplicando el estado tanto en el menú del frontend como en el backend.

**Architecture:** Un catálogo `modules` en BD, overrides en `tenant_modules` y `condo_modules`, y una resolución pura `resolveEnabledModules(global, tenant, condo)` en `@tucondominio360/shared`. La API expone `ModulesService` (+ guard `@RequireModule`), y el frontend consume `GET /api/me/modules` para filtrar el `Sidebar`. La residencia gana sobre el tenant, que gana sobre el default global; los módulos `is_core` nunca se apagan.

**Tech Stack:** NestJS 10, PostgreSQL 16, `node:test` + `ts-node`, `@tucondominio360/shared`, Next.js.

**Spec:** `docs/superpowers/specs/2026-10-17-usuarios-identidad-roles-modulos.md` (secciones 5.3, 8).

## Global Constraints

- Módulos `is_core = true` (`DASHBOARD`, `COMMUNITY`, `BILLING`, `UNITS`, `USERS`) **no** se pueden apagar en ningún nivel; el servicio y la UI deben rechazarlo.
- Orden de resolución: `is_core → true`; si no, `condo` override; si no, `tenant` override; si no, `default_enabled` global.
- Todo cambio de BD va también a `database/schema.sql`.
- Tras editar `packages/shared/src`: `npm run build --workspace=@tucondominio360/shared`.
- Tests backend: `cd apps/api && node --require ts-node/register/transpile-only --test <ruta>`.
- Tests shared: `cd packages/shared && node --require ts-node/register/transpile-only --test src/<file>`.
- La API responde `403 { code: 'MODULE_DISABLED' }` cuando el módulo está apagado (no `404`, para distinguirlo de "no existe").
- Apagar un módulo **no** borra datos; solo bloquea acceso y lo oculta. Reactivar lo restaura.
- El mapa `moduleCode → ruta del Sidebar` debe declararse una sola vez y ser la fuente de verdad para frontend y guardas.

## Review Focus

- Módulo **core** apagado por API directa: debe rechazar (400/403), nunca quedar apagado.
- Residencia con override `false` en un módulo que el tenant tiene en `true`: el residente de esa residencia **no** lo ve; otra residencia del mismo tenant **sí**.
- Superadmin: ve todos los módulos aunque el default global esté en `false` (pero los toggles por residencia siguen aplicando a los demás).
- Dato existente de un módulo apagado y reactivado: reaparece íntegro (no se borró).
- Navegación manual a la URL de un módulo apagado: mensaje "Módulo desactivado", no pantalla en blanco ni error 500.

---

### Task C1: Migración del catálogo y overrides de módulos

**Files:**
- Create: `database/migrations/20261017_modules_control.sql`
- Modify: `database/schema.sql` (nueva sección tras `announcements`, ~línea 845)

**Interfaces:**
- Produces: tablas `modules`, `tenant_modules`, `condo_modules`, con el catálogo sembrado.

- [ ] **Step 1: Escribir la migración**

```sql
-- 20261017_modules_control.sql
CREATE TABLE IF NOT EXISTS modules (
    code VARCHAR(40) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    default_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_core BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_modules (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_code VARCHAR(40) NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, module_code)
);

CREATE TABLE IF NOT EXISTS condo_modules (
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    module_code VARCHAR(40) NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (condo_id, module_code)
);

INSERT INTO modules (code, name, description, default_enabled, is_core, sort_order) VALUES
  ('DASHBOARD',     'Dashboard General',          'Indicadores y resumen del condominio', TRUE,  TRUE,  10),
  ('COMMUNITY',     'Portal del Propietario',     'Mi estado de cuenta y recibos',        TRUE,  TRUE,  20),
  ('BILLING',       'Gestión de Recibos',         'Emisión y cobranza de recibos',        TRUE,  TRUE,  30),
  ('UNITS',         'Propietarios y Alícuotas',   'Unidades, propietarios y alícuotas',   TRUE,  TRUE,  40),
  ('USERS',         'Usuarios y Accesos',         'Administración de usuarios y roles',   TRUE,  TRUE,  50),
  ('EXPENSES',      'Gastos y Facturas',          'Registro de gastos del condominio',    TRUE,  FALSE, 60),
  ('PAYMENTS',      'Conciliación de Pagos',      'Pagos reportados y conciliación',      TRUE,  FALSE, 70),
  ('ACCESS',        'Control de Acceso',          'Invitaciones y bitácora de garita',    TRUE,  FALSE, 80),
  ('AMENITIES',     'Reserva de Áreas Comunes',   'Reservas y alquiler de espacios',      TRUE,  FALSE, 90),
  ('MAINTENANCE',   'Mantenimiento',              'Tickets de averías y seguimiento',     TRUE,  FALSE, 100),
  ('ANNOUNCEMENTS', 'Cartelera Digital',          'Comunicados con acuse de recibo',      TRUE,  FALSE, 110),
  ('CONSULTATIONS', 'Consultas y Asambleas',      'Votaciones y asambleas digitales',     TRUE,  FALSE, 120)
ON CONFLICT (code) DO NOTHING;
```

- [ ] **Step 2: Aplicar y verificar**

Run: `docker exec -i tucondominio360_postgres psql -U postgres -d tucondominio360 < database/migrations/20261017_modules_control.sql`
Run: `docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -c "SELECT code, is_core, default_enabled FROM modules ORDER BY sort_order"`
Expected: 12 filas, 5 con `is_core = t`.

- [ ] **Step 3: Reflejar en `database/schema.sql`** (las 3 tablas + el `INSERT ... ON CONFLICT DO NOTHING`).

- [ ] **Step 4: Commit**

```bash
git add database/migrations/20261017_modules_control.sql database/schema.sql
git commit -m "feat(db): catalogo de modulos y overrides por tenant/residencia"
```

---

### Task C2: Catálogo y resolución pura en shared

**Files:**
- Create: `packages/shared/src/modules.ts`
- Test: `packages/shared/src/modules.spec.ts`
- Modify: `packages/shared/src/index.ts` (re-export)

**Interfaces:**
- Produces:
  - `type ModuleCode = 'DASHBOARD' | 'COMMUNITY' | ... | 'CONSULTATIONS'`
  - `interface ModuleDefinition { code: ModuleCode; name: string; description: string; defaultEnabled: boolean; isCore: boolean; sortOrder: number }`
  - `const MODULE_CATALOG: ModuleDefinition[]`
  - `const CORE_MODULES: ModuleCode[]`
  - `type ModuleOverrides = Partial<Record<ModuleCode, boolean>>`
  - `function resolveEnabledModules(tenant?: ModuleOverrides, condo?: ModuleOverrides): ModuleCode[]`
  - `function resolveModuleSource(code: ModuleCode, tenant?: ModuleOverrides, condo?: ModuleOverrides): 'CORE' | 'CONDO' | 'TENANT' | 'GLOBAL'`

- [ ] **Step 1: Test que falla**

```ts
// packages/shared/src/modules.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveEnabledModules, resolveModuleSource, CORE_MODULES, MODULE_CATALOG } from './modules';

test('por defecto todos los modulos del catalogo estan activos', () => {
  assert.equal(resolveEnabledModules().length, MODULE_CATALOG.length);
});

test('el override de residencia gana sobre el de tenant', () => {
  const tenant = { MAINTENANCE: true } as any;
  const condo = { MAINTENANCE: false } as any;
  assert.equal(resolveEnabledModules(tenant, condo).includes('MAINTENANCE' as any), false);
  assert.equal(resolveModuleSource('MAINTENANCE' as any, tenant, condo), 'CONDO');
});

test('el override de tenant aplica si la residencia no lo define', () => {
  const tenant = { ACCESS: false } as any;
  assert.equal(resolveEnabledModules(tenant, {}).includes('ACCESS' as any), false);
  assert.equal(resolveModuleSource('ACCESS' as any, tenant, {}), 'TENANT');
});

test('los modulos core nunca se apagan', () => {
  const off = Object.fromEntries(CORE_MODULES.map((c) => [c, false]));
  const enabled = resolveEnabledModules(off as any, off as any);
  for (const c of CORE_MODULES) assert.ok(enabled.includes(c));
  assert.equal(resolveModuleSource(CORE_MODULES[0], off as any, off as any), 'CORE');
});

test('el catalogo no tiene codigos duplicados y respeta sortOrder', () => {
  assert.equal(new Set(MODULE_CATALOG.map((m) => m.code)).size, MODULE_CATALOG.length);
  const orders = MODULE_CATALOG.map((m) => m.sortOrder);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd packages/shared && node --require ts-node/register/transpile-only --test src/modules.spec.ts`
Expected: FAIL `Cannot find module './modules'`.

- [ ] **Step 3: Implementar `modules.ts`**

Declarar `MODULE_CATALOG` con la misma data de la migración (C1), `CORE_MODULES` derivado (`filter(m => m.isCore)`), y las dos funciones puras. `resolveEnabledModules` recorre el catálogo en orden: `isCore` → incluido; si no, `condo[code] ?? tenant[code] ?? defaultEnabled`. `resolveModuleSource` devuelve de dónde vino la decisión. Exportar desde `index.ts`.

- [ ] **Step 3bis: Blindar la paridad catálogo↔BD**

Añadir un comentario en `modules.ts` y en la migración indicando que ambos deben coincidir, y añadir un test que compare `MODULE_CATALOG.map(m => m.code)` contra una copia local de los códigos de la migración, para que el desajuste falle en test.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd packages/shared && node --require ts-node/register/transpile-only --test src/modules.spec.ts && npm run build`
Expected: PASS (5 tests) y build sin errores.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/modules.ts packages/shared/src/modules.spec.ts packages/shared/src/index.ts
git commit -m "feat(shared): catalogo y resolucion de modulos on/off"
```

---

### Task C3: `ModulesService` y endpoints

**Files:**
- Create: `apps/api/src/modules/modules/modules.service.ts`, `modules.controller.ts`, `modules.module.ts`, `dto/update-modules.dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts` (`getProfile` incluye `modulesByCondo`)

**Interfaces:**
- Consumes: `resolveEnabledModules`, `resolveModuleSource`, `CORE_MODULES` (C2); `DatabaseService`; `AccessService` (Fase B).
- Produces:
  - `ModulesService.getGlobal(): Promise<ModuleDefinition[]>` (catálogo + `default_enabled`)
  - `ModulesService.setGlobalDefault(code, enabled)` (rechaza `is_core`)
  - `ModulesService.getTenantOverrides(tenantId)` / `setTenantOverride(tenantId, code, enabled)`
  - `ModulesService.getEffectiveForCondo(condoId): Promise<{ code, enabled, source }[]>`
  - `ModulesService.setCondoOverride(condoId, code, enabled)`
  - `ModulesService.getEffectiveForUser(userId): Promise<Record<string, ModuleCode[]>>`
  - `ModulesService.assertEnabled(condoId, code): Promise<void>` (lanza 403 `MODULE_DISABLED`)
  - Endpoints: `GET /api/modules`, `PATCH /api/modules/:code`, `GET|PATCH /api/tenants/:id/modules`, `GET|PATCH /api/condos/:id/modules`, `GET /api/me/modules`

- [ ] **Step 1: Test que falla (decisión pura de autorización)**

```ts
// apps/api/src/modules/modules/modules.guard.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { canToggleModule } from './modules.logic';

test('no se puede apagar un modulo core', () => {
  assert.equal(canToggleModule('DASHBOARD', false), false);
});
test('se puede apagar un modulo no core', () => {
  assert.equal(canToggleModule('MAINTENANCE', false), true);
  assert.equal(canToggleModule('MAINTENANCE', true), true);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/modules/modules.guard.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`modules.logic.ts` → `canToggleModule(code, enabled)` (`enabled` nunca puede quedar en `false` para `CORE_MODULES`; activar siempre permitido). `ModulesService` consulta `modules`, `tenant_modules` (via `condos.tenant_id`), `condo_modules` y usa `resolveEnabledModules`/`resolveModuleSource`. `setGlobalDefault`/`setTenantOverride`/`setCondoOverride` validan con `canToggleModule` (sino `BadRequestException('El módulo ... es obligatorio y no puede desactivarse')`). `assertEnabled` resuelve y lanza `ForbiddenException({ message: 'El módulo está desactivado para esta residencia', code: 'MODULE_DISABLED' })`. Autorización de endpoints: `PATCH /modules/:code` → superadmin; `tenants/:id/modules` → superadmin o tenant OWNER/ADMIN; `condos/:id/modules` → permiso `CONDO_MANAGE` (Fase B).

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cd apps/api && npm run build && node --require ts-node/register/transpile-only --test src/modules/modules/modules.guard.spec.ts`
Expected: PASS + build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/modules apps/api/src/app.module.ts apps/api/src/modules/auth
git commit -m "feat(api): service y endpoints de control de modulos"
```

---

### Task C4: Enforcement en los módulos de dominio

**Files:**
- Create: `apps/api/src/modules/modules/require-module.decorator.ts`, `apps/api/src/modules/modules/module-enabled.guard.ts`
- Test: `apps/api/src/modules/modules/module-enabled.guard.spec.ts`
- Modify: controladores de `maintenance`, `announcements`, `access`, `amenities`, `consultations`, `billing`, `payments`

**Interfaces:**
- Consumes: `ModulesService.assertEnabled` (C3).
- Produces: `@RequireModule('MAINTENANCE')` + `ModuleEnabledGuard`; `403 { code: 'MODULE_DISABLED' }` en cada módulo apagado.

- [ ] **Step 1: Test que falla (extracción de `condoId`)**

```ts
// apps/api/src/modules/modules/module-enabled.guard.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { extractCondoId } from './module-enabled.guard';

test('prefiere el condoId de la ruta', () => {
  assert.equal(extractCondoId({ params: { condoId: 'a' }, query: { condoId: 'b' }, body: {} } as any), 'a');
});
test('cae a query y body', () => {
  assert.equal(extractCondoId({ params: {}, query: { condoId: 'b' }, body: {} } as any), 'b');
  assert.equal(extractCondoId({ params: {}, query: {}, body: { condoId: 'c' } } as any), 'c');
});
test('devuelve null si no hay condoId', () => {
  assert.equal(extractCondoId({ params: {}, query: {}, body: {} } as any), null);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cd apps/api && node --require ts-node/register/transpile-only --test src/modules/modules/module-enabled.guard.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar y aplicar**

Implementar `extractCondoId`, `@RequireModule(code)` (`SetMetadata`) y `ModuleEnabledGuard` (si hay `condoId`, `await assertEnabled`; si no hay `condoId`, no bloquea y deja que el controlador lo resuelva). Aplicar `@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard)` + `@RequireModule(...)` a los controladores listados. En los endpoints donde el `condoId` llega en el body/query, incluirlo en el decorador del handler.

- [ ] **Step 3bis: Verificar build**

Run: `cd apps/api && npm run build`
Expected: compila.

- [ ] **Step 4: Prueba manual**

1. Apagar `MAINTENANCE` en la residencia X: `PATCH /api/condos/X/modules { modules: [{ code: 'MAINTENANCE', enabled: false }] }`.
2. `GET /api/maintenance/tickets?condoId=X` → 403 `MODULE_DISABLED`.
3. Misma llamada en la residencia Y → 200.
Expected: 403 / 200.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules
git commit -m "feat(api): enforcement de modulos apagados por residencia"
```

---

### Task C5: Frontend — sidebar dinámico y configuración de módulos

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`getMyModules()`)
- Modify: `apps/web/src/app/page.tsx` (guardar `modulesByCondo`, pasar al `Sidebar`)
- Modify: `apps/web/src/components/Sidebar.tsx` (filtrar ítems por módulo)
- Create: `apps/web/src/components/ModuleSettingsModal.tsx`
- Create: `apps/web/src/app/modules/page.tsx` (vista global, solo superadmin)

**Interfaces:**
- Consumes: `GET /api/me/modules`, `GET|PATCH /api/condos/:id/modules`, `GET|PATCH /api/modules/:code`.
- Produces: sidebar filtrado; modal por residencia; vista global.

- [ ] **Step 1: Mapa único módulo→ítem**

En `Sidebar.tsx` (o un `apps/web/src/lib/modules.ts`), declarar `MENU_ITEMS` con `{ id, label, icon, module: ModuleCode, permission?: CondoPermission, ownerOnly?: boolean, staffOnly?: boolean }`. El filtrado usa `modulesByCondo[selectedCondoId]` (superadmin: todos).

- [ ] **Step 2: Filtrar el sidebar**

`visibleItems = MENU_ITEMS.filter(it => enabledForCondo(it.module) && hasPermission(it.permission))`. Si un módulo está apagado, no se renderiza. Mantener el `text-left` ya aplicado.

- [ ] **Step 3: Página de módulo desactivado**

En `page.tsx`, si `view` corresponde a un módulo apagado, renderizar un `<ModuleDisabled />` con mensaje "Este módulo está desactivado para la residencia seleccionada." y un enlace a inicio.

- [ ] **Step 4: `ModuleSettingsModal` (por residencia)**

Checklist de módulos con: switch (deshabilitado para core con etiqueta "Obligatorio"), badge de origen (`Residencia` / `Empresa` / `Global`), y guardado con `PATCH /api/condos/:id/modules`. Accesible desde el `Header`/selector de residencia solo con permiso `CONDO_MANAGE`.

- [ ] **Step 5: Vista global (superadmin)**

`/modules` lista el catálogo con `default_enabled` editable (`PATCH /api/modules/:code`), marcando core como bloqueado.

- [ ] **Step 6: Compilar y verificar en navegador**

Run: `cd apps/web && npx next build`
Luego: apagar `AMENITIES` en una residencia y confirmar que "Reserva de Áreas Comunes" desaparece del sidebar y que `/modules` no aparece para un rol no-superadmin.
Expected: build OK y comportamiento observado.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): sidebar dinamico y configuracion de modulos"
```

---

### Task C6: Verificación E2E de la Fase C

- [ ] **Step 1:** `PATCH /api/modules/DASHBOARD { defaultEnabled: false }` → 400 (core protegido).
- [ ] **Step 2:** Tenant con 2 residencias: `PATCH /api/tenants/:id/modules { ACCESS: false }` → ambas residencias pierden `ACCESS`; luego `PATCH /api/condos/:first/modules { ACCESS: true }` → solo la primera lo recupera.
- [ ] **Step 3:** `GET /api/me/modules` con un residente de cada residencia refleja la diferencia.
- [ ] **Step 4:** Apagar `MAINTENANCE` en la residencia 2; crear un ticket existente antes de apagar y reactivar; verificar que el ticket reaparece intacto.
- [ ] **Step 5: Commit** `git add . && git commit -m "test: verificacion e2e fase c (modulos on/off)"`
