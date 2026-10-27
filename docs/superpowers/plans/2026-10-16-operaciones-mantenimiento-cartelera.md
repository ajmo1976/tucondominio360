# Plan de Implementación: Módulo Nivel 1 — Mantenimiento, Incidencias y Cartelera Digital con Acuse de Recibo

> **Objetivo:** Desarrollar el módulo integral de **Operaciones Comunitarias (Mantenimiento, Tickets de Averías y Cartelera Digital con Acuse de Recibo Legal)** para **TuCondominio360**, abarcando:
> 1. **Mantenimiento y Tickets de Incidencias (`maintenance_tickets` + `ticket_comments`):** Reporte de averías por los residentes o la junta con flujo de estados (`OPEN` → `ASSIGNED` → `IN_PROGRESS` → `RESOLVED` → `CLOSED`), prioridades (`LOW`, `MEDIUM`, `HIGH`, `EMERGENCY`), asignación a personal/proveedores, costos estimados vs reales, hilo de comentarios internos/públicos (`is_internal_only`) y conversión directa de un ticket resuelto en gasto del condominio (`expenses`).
> 2. **Cartelera Digital y Comunicados con Acuse de Recibo Legal (`announcements` + `announcement_reads`):** Publicación de comunicados oficiales de la administración o junta, avisos de carácter urgente (`is_urgent`), opción de **acuse de reciba obligatorio (`requires_acknowledgement`)**, registro en tiempo real de qué copropietarios ya leyeron y acusaron recibo, y exportación de comunicado oficial en PDF (`PdfBuilder`).
> 3. **Configurabilidad por Condominio (`condos.settings.operationsConfig`):** Activación/desactivación general y de cada sub-módulo.
> 4. **Interfaz Web Integrada en el Sidebar (`OperationsView.tsx`):** Vista completa para administradores, juntas y residentes, con pestañas de Tickets de Mantenimiento y Cartelera Digital.

---

## Tareas del Loop de Ejecución

### Task 1: Migración de Base de Datos, Esquema Canónico y Tipos Compartidos
- **Archivos:**
  - Crear: `database/migrations/20261016_operations_maintenance_announcements.sql`
  - Modificar: `database/schema.sql`
  - Modificar: `packages/shared/src/index.ts`
- **Alcance:**
  - Ampliar `maintenance_tickets` con `ticket_code`, `incident_type`, `location_area`, `is_public_issue`, `estimated_cost_usd`, `actual_cost_usd`.
  - Ampliar `announcements` con `announcement_code`, `category`, `pinned`.
  - Actualizar `condos.service.ts` (`deleteCondo` elimina tickets y anuncios).
  - Añadir tipos en `@tucondominio360/shared` (`TicketPriority`, `TicketStatus`, `AnnouncementCategory`, etc.).

### Task 2: Módulo Backend `OperationsModule` (Tickets de Mantenimiento, Comentarios y Conversión a Gastos)
- **Archivos:**
  - Crear: `apps/api/src/modules/operations/dto/operations.dto.ts`
  - Crear: `apps/api/src/modules/operations/operations.service.ts`
  - Crear: `apps/api/src/modules/operations/operations.controller.ts`
  - Crear: `apps/api/src/modules/operations/operations.module.ts`
  - Modificar: `apps/api/src/app.module.ts`
- **Alcance:**
  - Configuración del módulo por condominio (`GET/PATCH /api/operations/config`).
  - CRUD de tickets de mantenimiento (`GET /api/operations/tickets`, `POST /api/operations/tickets`, `PATCH /api/operations/tickets/:id`, `POST /api/operations/tickets/:id/comments`).
  - Acción administrativa: **Convertir ticket resuelto en gasto del condominio** (`POST /api/operations/tickets/:id/convert-to-expense`).

### Task 3: Módulo Backend de Cartelera Digital y Acuse de Recibo Legal + PDFs
- **Archivos:**
  - Crear: `apps/api/src/modules/operations/pdf.ts`
  - Modificar: `apps/api/src/modules/operations/operations.service.ts`
  - Modificar: `apps/api/src/modules/operations/operations.controller.ts`
- **Alcance:**
  - CRUD de anuncios/comunicados (`GET /api/operations/announcements`, `POST /api/operations/announcements`, `DELETE /api/operations/announcements/:id`).
  - **Acuse de recibo legal:** `POST /api/operations/announcements/:id/acknowledge` (registra lectura obligatoria en `announcement_reads` y devuelve métricas de lectores).
  - Exportación PDF: `GET /api/operations/announcements/:id/pdf` (Genera Comunicado Oficial en PDF con `PdfBuilder`).

### Task 4: Frontend — Vista de Operaciones (`OperationsView.tsx` + `Sidebar.tsx` + `page.tsx`)
- **Archivos:**
  - Crear: `apps/web/src/components/OperationsView.tsx`
  - Modificar: `apps/web/src/components/Sidebar.tsx`
  - Modificar: `apps/web/src/app/page.tsx`
- **Alcance:**
  - Vista dual (Admin / Propietario) con sub-pestañas:
    - **Pestaña 1 — Mantenimiento e Incidencias:** listado de averías con filtros por estado/prioridad, crear ticket, modal de comentarios (públicos y notas internas de la junta), cambiar estados, asignar técnico/proveedor y botón de convertir a gasto.
    - **Pestaña 2 — Cartelera Digital y Comunicados:** tablón de anuncios oficiales, destacados, avisos urgentes y **botón interactivo de "Acusar Recibo"** para residentes (con contador en tiempo real de lectores para administradores).
  - Añadir enlace en el `Sidebar.tsx` (`Operaciones y Cartelera`, icono `Wrench` o `Megaphone`).

### Task 5: Verificación Integral E2E y Compilación
- **Alcance:**
  - Compilación NestJS y Next.js.
  - Pruebas E2E de creación de ticket, hilo de comentarios, conversión a gasto, publicación de comunicado urgente con acuse de recibo y descarga de PDF oficial.
