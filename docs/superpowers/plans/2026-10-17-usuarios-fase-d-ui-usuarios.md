# Fase D: Rediseño de la Experiencia de Usuarios — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer visible y usable todo lo construido en las fases A, B y C: invitar por correo desde la interfaz, ver el estado de cada cuenta, gestionar roles de residencia y de unidad por separado, revisar permisos efectivos y ofrecer al propietario una vista consolidada de sus unidades.

**Architecture:** Se reescribe `UsersView` con filtros y acciones de invitación, se amplía `UserFormModal` para distinguir "invitar" de "crear con contraseña" y separar el rol de residencia del rol de ocupante, se añade un `AccessSummaryModal` que consume `GET /api/users/:id` y los permisos efectivos, y se crea `MyUnitsView` para el portal del propietario. Todo consume los endpoints de las fases A/B/C.

**Tech Stack:** Next.js (App Router, client components), React, Tailwind, lucide-react, `@tucondominio360/shared`.

**Spec:** `docs/superpowers/specs/2026-10-17-usuarios-identidad-roles-modulos.md` (sección 10).

**Depende de:** Fase A (Task A5/A8), Fase B (Task B6/B7), Fase C (Task C5). No iniciar sin ellas.

## Global Constraints

- Reutilizar `fetchWithAuth` y el patrón de modales existente (`MaintenanceView`, `AmenitiesView`) para no introducir un estilo nuevo.
- Etiquetas en español; los `ROLE_LABELS` ya existen en `UserFormModal.tsx` y deben extenderse, no duplicarse.
- El rol de ocupante usa `OccupantRole` (`OWNER | CO_OWNER | TENANT | RESIDENT | AUTHORIZED`); **nunca** el `condo_role`.
- Toda acción destructiva (revocar invitación, quitar acceso, desactivar usuario) pide confirmación visual.
- El menú y las acciones deben respetar los permisos efectivos del usuario (Fase B) y los módulos activos (Fase C).
- Accesibilidad básica: los modales cierran con `Escape` y `focus` inicial en el primer campo; los `switch` son `role="switch"` con `aria-checked`.
- `npx next build` debe pasar al final de cada tarea que toque el frontend.

## Review Focus

- Crear usuario **sin contraseña** muestra "Invitación enviada" y la fila pasa a estado "Invitación pendiente" sin recargar a mano.
- Editar un usuario que es `ADMIN` de una residencia y ocupa 2 unidades: los roles de unidad se muestran como `OWNER`/`CO_OWNER`, **nunca** como `ADMIN`.
- Un usuario con acceso a **varias residencias**: la tabla muestra todas, con su rol en cada una, y la vista de permisos es por residencia.
- **OWNER** no ve los botones de gestión de usuarios ni los de invitación (sin permiso).
- Vista "Mis Unidades": un propietario con unidades en 2 residencias las ve todas, con sus recibos, y no ve las de otros.

---

### Task D1: `UsersView` con filtros, estado de cuenta y acciones

**Files:**
- Modify: `apps/web/src/components/UsersView.tsx`
- Modify: `apps/web/src/lib/api.ts` (si falta algún helper, p. ej. `resendInvitation`, `sendPasswordResetLink`)

**Interfaces:**
- Consumes: `GET /api/users?search=&role=&condoId=&status=&provider=`; `POST /api/users/:id/invitation/resend`; `POST /api/users/:id/invitation/revoke`; `POST /api/users/:id/password-reset-link`.
- Produces: tabla con columnas **Usuario · Acceso (Google/local) · Residencias y roles · Estado de cuenta · Último ingreso · Acciones** y una barra de filtros.

- [ ] **Step 1: Definir el modelo de estado en el componente**

Tipos locales: `AccountStatus = 'ACTIVE' | 'PENDING_INVITATION' | 'EMAIL_UNVERIFIED' | 'INACTIVE'`, derivado de `is_active`, `emailVerified` e `invitationPending` que devuelve `GET /api/users`. Añadir `avatar_url` y `authProviders` a la interfaz `UserRow`.

- [ ] **Step 2: Barra de filtros**

Inputs: búsqueda (debounce 300ms), select de residencia (desde `condos`), select de rol de residencia (`ROLE_LABELS`), select de estado, select de proveedor (`Todos | Google | Contraseña`). Cada cambio actualiza el querystring del `fetchWithAuth`.

- [ ] **Step 3: Columna de estado y badges**

`<StatusBadge>` con color por estado ("Activo" verde, "Invitación pendiente" ámbar, "Correo sin verificar" ámbar, "Inactivo" gris) y un badge de proveedor (`Google` con icono, `Google + Contraseña` si tiene ambos).

- [ ] **Step 4: Acciones por fila**

Menú de acciones: Ver detalle (D3), Editar (D2), `Reenviar invitación` (solo si pendiente), `Enviar enlace de restablecimiento`, Activar/Desactivar, Eliminar (con confirmación). Tras cada acción: `refresh()` y toast.

- [ ] **Step 4bis: Respetar permisos**

Ocultar el ítem de menú `users` y las acciones de gestión si el usuario no tiene `USERS_MANAGE` (Fase B). Aunque el controlador es superadmin-only hoy, la vista debe usar el mismo helper de permisos para el futuro.

- [ ] **Step 5: Compilar**

Run: `cd apps/web && npx next build`
Expected: compila.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/UsersView.tsx apps/web/src/lib/api.ts
git commit -m "feat(web): vista de usuarios con filtros, estado de cuenta y acciones de invitacion"
```

---

### Task D2: `UserFormModal` — invitar, roles separados y unidades con flags

**Files:**
- Modify: `apps/web/src/components/UserFormModal.tsx`
- Modify: `apps/web/src/lib/api.ts` (si hace falta)

**Interfaces:**
- Consumes: `POST /api/users` (password opcional), `PATCH /api/users/:id`, `GET /api/condos/:id/units`.
- Produces: formulario con dos modos, por residencia el `condoRole`, por unidad el `occupantRole` + `isPrimaryContact`/`isBillingRecipient`.

- [ ] **Step 1: Modo de alta**

Al crear, un `radio` superior: **"Invitar por correo"** (por defecto) y **"Crear con contraseña"**. En modo invitar, ocultar los campos de contraseña y mostrar un aviso: "Se enviará un enlace de invitación al correo; el usuario definirá su contraseña o entrará con Google". En modo contraseña, mostrar los campos de clave + confirmación (mínimo 6 caracteres) y el aviso de que la cuenta quedará verificada.

- [ ] **Step 2: Rol de residencia vs. rol de unidad**

En cada residencia seleccionada: un select de **rol en la residencia** (`ROLE_LABELS`, `condo_role`). Bajo él, la lista de unidades con un select de **rol de ocupante** (`OCCUPANT_ROLE_LABELS`: `OWNER=Propietario, CO_OWNER=Coproprietario, TENANT=Inquilino, RESIDENT=Residente, AUTHORIZED=Autorizado`) y dos checkboxes: *Contacto principal*, *Recibe recibos*. Debe cumplirse: por unidad solo un `is_primary_contact` y a lo sumo un `is_billing_recipient` por residencia.

- [ ] **Step 3: Validación y payload**

`payload.assignments = [{ condoId, role, units: [{ unitId, occupantRole, isPrimaryContact, isBillingRecipient }] }]`. Validar: al menos una residencia; roles de ocupante siempre presentes; en modo contraseña, clave y confirmación coinciden. En modo invitar, no enviar `password` (el backend entra al flujo de invitación de A5).

- [ ] **Step 4: Previsualización de permisos**

Panel lateral (o acordeón) que muestra, por residencia, los permisos resultantes usando `effectivePermissions(tenantRole, condoRole)` de `@tucondominio360/shared`. Si el usuario resultará superadmin, mostrar "Acceso total".

- [ ] **Step 5: Compilar y probar manualmente**

Run: `cd apps/web && npx next build`
Probar: invitar a un correo nuevo y verificar el estado "Invitación pendiente"; editar y asignar `ADMIN` de residencia + unidad con rol `CO_OWNER` y confirmar que se guarda `CO_OWNER`.
Expected: build OK y comportamiento observado.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/UserFormModal.tsx
git commit -m "feat(web): alta por invitacion y roles de unidad separados con flags"
```

---

### Task D3: `AccessSummaryModal` — permisos efectivos y accesos

**Files:**
- Create: `apps/web/src/components/AccessSummaryModal.tsx`
- Modify: `apps/web/src/components/UsersView.tsx` (abrir el modal desde la acción "Ver permisos")
- Modify: `apps/web/src/lib/api.ts` (`getUserAccess(userId)`)

**Interfaces:**
- Consumes: `GET /api/users/:id` (con `condos`, `units` y `occupantRole`) y `GET /api/me/access` o `resolveUserAccess` (Fase B) para un usuario concreto.
- Produces: modal con, por residencia: rol de residencia, rol de empresa (si aplica), lista de unidades con su rol de ocupante, badges de los permisos efectivos y estado del módulo afectado (si el módulo está apagado, el permiso se muestra atenuado con "módulo desactivado").

- [ ] **Step 1: Implementar** el modal con secciones por residencia y un grid de badges de permisos; reutilizar `effectivePermissions` para calcular y comparar con lo que devuelve la API (deben coincidir).
- [ ] **Step 2: Añadir `getUserAccess(userId)`** en `lib/api.ts`.
- [ ] **Step 3: Verificar** con un usuario con dos residencias y permisos distintos; comprobar que los badges cambian por residencia.
- [ ] **Step 4: Compilar** (`npx next build`) y **Commit**

```bash
git add apps/web/src/components/AccessSummaryModal.tsx apps/web/src/components/UsersView.tsx apps/web/src/lib/api.ts
git commit -m "feat(web): resumen de permisos efectivos por usuario"
```

---

### Task D4: `MyUnitsView` — vista consolidada del propietario

**Files:**
- Create: `apps/web/src/components/MyUnitsView.tsx`
- Modify: `apps/web/src/app/page.tsx` (ruta del menú para `OWNER`/`TENANT`)
- Modify: `apps/web/src/components/Sidebar.tsx` (ítem "Mis Unidades")

**Interfaces:**
- Consumes: `GET /api/me/access` (Fase B) y los endpoints de recibos del portal (`MyBillsView`).
- Produces: lista de unidades del usuario en todas sus residencias, con alícuota, estado de cuenta y acceso a los recibos.

- [ ] **Step 1: Implementar** el componente: agrupa por residencia, tarjeta por unidad (`property_code`, `role` de ocupante, `aliquot`, saldo estimado) y un botón "Ver recibos" que reutiliza el flujo de `MyBillsView` para esa unidad.
- [ ] **Step 2: Ruta y menú** para roles sin permisos de gestión (propietario/inquilino), respetando `COMMUNITY_VIEW` y el módulo `COMMUNITY` (core).
- [ ] **Step 3: Verificar** con el propietario `arnaldo.martinez@gmail.com`, que tiene unidades en dos residencias: ambas deben listarse; no debe ver unidades de otros propietarios.
- [ ] **Step 4: Compilar** (`npx next build`) y **Commit**

```bash
git add apps/web/src/components/MyUnitsView.tsx apps/web/src/app/page.tsx apps/web/src/components/Sidebar.tsx
git commit -m "feat(web): vista consolidada de unidades del propietario"
```

---

### Task D5: Verificación E2E de la Fase D y pulido

- [ ] **Step 1: Recorrido completo (superadmin)**

Invitar `ui.e2e@example.com` → estado "Invitación pendiente" → copiar el token del log/BD → `/accept-invite` define clave → estado "Activo". Reenviar invitación a un segundo usuario y revocarla.
Expected: los estados de la tabla evolucionan correctamente.

- [ ] **Step 2: Google desde la UI**

Con credenciales de Google configuradas, "Continuar con Google" desde `/login` con un correo invitado entra al panel; con un correo no invitado muestra el mensaje de "no invitado".
Expected: ambos comportamientos.

- [ ] **Step 3: Recorrido de roles y módulos**

Con un `tenant ADMIN` que gestiona 2 residencias: cambiar de residencia en el selector, abrir "Configuración de módulos", apagar `ANNOUNCEMENTS` en una sola, y confirmar que la Cartelera desaparece del menú solo en esa residencia.
Expected: comportamiento observado.

- [ ] **Step 4: Accesibilidad y limpieza**

Verificar cierre con `Escape` en los 3 modales, `focus` inicial, `role="switch"` en los toggles, y limpiar cualquier dato de prueba marcado `E2E -`/`UI -`.
Expected: sin hallazgos pendientes.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: verificacion e2e fase d (experiencia de usuarios)"
```
