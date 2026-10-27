# Plan de Implementación: Nivel 1 — Mantenimiento/Tickets y Cartelera Digital (Prioridad Alta)

## Objetivo
Completar el círculo de operación diaria entre Junta, Administradora y Vecinos añadiendo:
1. **Módulo de Mantenimiento y Tickets de Incidencias** — reporte, seguimiento y liquidación de averías.
2. **Cartelera Digital y Comunicados Oficiales** — publicación de avisos con acuse de recibo legal obligatorio.

Ambas funcionalidades tienen sus esquemas de base de datos ya definidos en `database/schema.sql` (líneas 717–849), pero aún no tienen módulo backend, DTOs, ni vista frontend.

---

## Tareas del Loop de Ejecución

### Task 1: Verificación y Completado del Esquema BD (Jaula)
- **Archivos:** `database/schema.sql` (líneas 717–849)
- **Alcance:** Confirmar que las tablas `maintenance_tickets`, `ticket_comments`, `announcements`, `announcement_reads` tienen todos los campos necesarios. Revisar tipos `ticket_priority`, `ticket_status`, `consultation_type`, `consultation_status` ya definidos en líneas previas.
- **Estado:** ✅ Ya completado (tablas y tipos enumerados existen).

### Task 2: Motor Backend `MantenimientoModule` (Catálogo, Reportes, Estados y Comentarios)
- **Archivos por crear:**
  - `apps/api/src/modules/maintenance/dto/maintenance.dto.ts`
  - `apps/api/src/modules/maintenance/maintenance.service.ts`
  - `apps/api/src/modules/maintenance/maintenance.controller.ts`
  - `apps/api/src/modules/maintenance/maintenance.module.ts`
- **Alcance:**
  - `GET/PATCH /api/maintenance/tickets` — CRUD de tickets con filtrado por condo, categoría, prioridad, estado, unidad responsable.
  - `POST /api/maintenance/tickets` — Reportar nueva incidencia (genera `ticket_code` automático `TICK-{CÓDIGO}-{AAAA}{HEX}`, asigna `reported_by_user_id`, `property_unit_id`, `priority`, `status OPEN`).
  - `GET/PATCH /api/maintenance/tickets/:id` — Ver y actualizar estado de un ticket (`OPEN` → `ASSIGNED` → `IN_PROGRESS` → `RESOLVED` → `CLOSED`), asignar a conserje/técnico (`assigned_to_user_id`) y/o proveedor (`supplier_id`).
  - `POST /api/maintenance/tickets/:id/comments` — Agregar comentario al hilo (soporte de imágenes JSONB, marcadores `is_internal_only` para junta/admin).
  - `GET /api/maintenance/tickets/kpis` — Conteos por estado y prioridad por condominio.
  - Integración opcional: convertir ticket resuelto → gasto mensual (`expenses` table) en 1 clic.

### Task 3: Motor Backend `AnnouncementsModule` (Cartelera Digital + Acuse de Recibo Legal)
- **Archivos por crear:**
  - `apps/api/src/modules/announcements/dto/announcements.dto.ts`
  - `apps/api/src/modules/announcements/announcements.service.ts`
  - `apps/api/src/modules/announcements/announcements.controller.ts`
  - `apps/api/src/modules/announcements/announcements.module.ts`
- **Alcance:**
  - `GET/PATCH /api/announcements` — Listado y actualización de comunicados (filtro por categoría, urgente `is_urgent`, pinned, expirado `expires_at`).
  - `POST /api/announcements` — Publicar nuevo comunicado (genera `announcement_code` automático `ANUNC-{CÓDIGO}-{AAAA}{HEX}`, soporta `attachment_urls` JSONB).
  - `POST /api/announcements/:id/acknowledge` — **Acuse de recibo legal**: registra que el usuario/propietario firmó recepción (`announcement_reads` con `signature_code` y `acknowledge_note`). La UI bloquea la acción hasta que este endpoint sea llamado para comunicados con `requires_acknowledgement: true`.
  - `GET /api/announcements/user-acks` — Para un usuario dado, devolver qué comunicados ya ha reconocido (estado visual: 🟉 leído y acuse completo, 🟥 pendiente).
  - `GET /api/announcements/condo-acks/:condoId` — Para un condominio, devolver % de cumplimiento del acuse de recibo (útil para reportes de junta).
  - Si `requires_acknowledgement: true`, la emisión de PDF de constancia bloquea hasta que todos los residentes firmen el acuse (o se establece fecha de vencimiento).

### Task 4: Frontend — Vista de Mantenimiento y Cartelera Digital
- **Archivos por crear/Modificar:**
  - `apps/web/src/components/MaintenanceView.tsx` — Lista y formulario de reporte de tickets, filtros por categoría/prioridad/estado, vista de hilo de comentarios con acuse interno.
  - `apps/web/src/components/AnnouncementsView.tsx` — cartelera digital: comunicados visibles, indicador de "pendiente de acuse", modal para firmar acuse de recibo, búsqueda y filtros.
  - `apps/web/src/components/Sidebar.tsx` — Agregar ícono de **"Mantenimiento"** y **"Comunicados"** (o integrar en pestañas existentes).
  - `apps/web/src/app/page.tsx` — Cableado de nuevas rutas `/maintenance` y `/announcements` (protegidos según rol: superadmin/junta ven todo; propietario ve los suyos y los comunicados generales).
- **UI/UX:**
  - Nueva pestaña en el sidebar: 🛠️ Mantenimiento y 📢 Comunicados.
  - Al crear un ticket, el sistema sugiere categorías: `PLUMBING`, `ELECTRICAL`, `STRUCTURAL`, `HVAC`, `PAINTING`, `SECURITY`, `OTHER`.
  - En la cartelera, los comunicados urgentes (`is_urgent: true`) aparecen con badge rojo parpadeante y se pueden filtrar.
  - El acuse de recibo (`requires_acknowledgement`) muestra un indicador visual 🔒 bloqueado hasta que el usuario firme; luego cambia a ✅ completado.

### Task 5: Verificación Integral E2E (Unit Tests + Flujo Completo en Vivo)
- **Tests unitarios:** Crear suites `node:test` para `maintenance.service.ts` y `announcements.service.ts` cubriendo creación de ticket, cambio de estado, comentarios, generación de códigos, acuse de recibo.
- **Flujo E2E scriptado:**
  1. Login superadmin → crear ticket de mantenimiento (plomería) → asignar a conserje → agregar comentario interno → cambiar estado a RESOLVED → verificar KPIs.
  2. Login propietario → ver sus tickets → crear nuevo ticket → recibir notificación.
  3. Login cualquier usuario → ver cartelera → comunicado urgente con badge rojo → firmar acuse → verificación de que `announcement_reads` se creó → ya no muestra bloqueado.
  4. Verificar que comunicado sin `requires_acknowledgement` se muestra sin bloqueo.
  5. PDF de acuse de recibo (opcional) y reporte de cumplimiento por condominio.

---

## Decisiones Arquitectónicas (Rulings)

- **R1:** Los `ticket_code` y `announcement_code` siguen el mismo patrón de nomenclatura que las reservas: `TICK-{CÓDIGO_CONDO}-{AAAA}{HEX}` y `ANUNC-{CÓDIGO_CONDO}-{AAAA}{HEX}` para consistencia en la UI.
- **R2:** El módulo de mantenimiento reutiliza los DTOs y enumerados existentes de `expense_categories` para la categoría del ticket, evitando duplicidad.
- **R3:** El acuse de recibo legal (`requires_acknowledgement`) es **obligatorio** para la administración al publicar el comunicado, pero el usuario puede firmarlo en cualquier momento después de la publicación; el sistema no bloquea la vista del comunicado, solo la acción de "marcar como leído + firmado".
- **R4:** Los tickets y comunicados heredan el aislamiento multi-tenant por `condo_id` idéntico al resto del sistema (sin tablas cross-condo).
- **R5:** El frontend usa los mismos patrones de `downloadWithAuth`/`fetchWithAuth` del resto de la app; los PDFs de acuse usan el `PdfBuilder` existente con plantilla simplificada.

## Work State (Inicial)
- **Completed:** Ninguna tarea en ejecución (las tablas BD ya existen).
- **Active:** Plan recién creado.
- **Blocked:** Ningún bloqueo reportado (depende solo de la ejecución inline sobre `main`).

## Next Move
1. Ejecutar Task 2: crear `MantenimientoModule` (service, controller, dto, module).
2. Ejecutar Task 3: crear `AnnouncementsModule` (service, controller, dto, module).
3. Ejecutar Task 4: crear vistas frontend `MaintenanceView.tsx` y `AnnouncementsView.tsx`, cablear Sidebar y page.tsx.
4. Ejecutar Task 5: build, tests unitarios y verificación E2E scriptada.