# Plan de Implementación: Nivel 1 — Mantenimiento y Tickets de Averías, Cartelera Digital con Acuse de Recibo Legal y Directorio de Proveedores

> **Objetivo:** Implementar el **Nivel 1 completo** para **TuCondominio360**, integrando:
> 1. **Mantenimiento, Averías y Tickets de Incidencias (`maintenance_tickets` + `ticket_comments`):**
>    - Reporte de incidencias por propietarios y administración con código único (`TCK-{CÓDIGO}-{AAAAMM}-{HEX}`).
>    - Categorización técnica (`Plomería/Filtraciones`, `Sistema Hidroneumático/Bombas`, `Ascensores`, `Electricidad/Iluminación`, `Portón/Accesos`, `Áreas Comunes`, `Limpieza`), ubicación exacta y visibilidad (`Comunitaria` para averías generales del edificio vs. `Privada del Inmueble`).
>    - Flujo de gestión: `OPEN` → `ASSIGNED` → `IN_PROGRESS` → `RESOLVED` → `CLOSED`, con prioridad (`LOW`, `MEDIUM`, `HIGH`, `EMERGENCY`), asignación a proveedor (`supplier_id`) o responsable, costo estimado vs. costo real (`estimated_cost_usd`, `actual_cost_usd`).
>    - Hilo de seguimiento con comentarios públicos para la comunidad y notas internas exclusivas de la Junta/Administración (`is_internal_only`).
>    - **Orden de Trabajo / Reporte Técnico de Mantenimiento en PDF (`PdfBuilder`).**
> 2. **Cartelera Digital, Comunicados Oficiales y Acuse de Recibo Legal (`announcements` + `announcement_reads`):**
>    - Publicación de comunicados oficiales (`COM-{CÓDIGO}-{AAAAMM}-{HEX}`) por categoría (`Corte de Agua / Hidrocapital`, `Mantenimiento de Ascensores`, `Fumigación`, `Seguridad`, `Aviso Legal / Cobranza`, `Convocatoria`, `General`).
>    - Indicadores de **Aviso Urgente (`is_urgent`)**, **Fijado en Tope (`pinned`)** y **Exige Acuse de Recibo Legal (`requires_acknowledgement`)**.
>    - Registro de lectura y **Firma Digital de Acuse de Recibo por Inmueble/Propietario** con fecha, hora y unidad.
>    - **Certificado / Acta de Acuse de Recibo Legal del Comunicado en PDF (`PdfBuilder`)** con el padrón de quiénes han confirmado recepción.
> 3. **Directorio de Proveedores y Contratistas (`suppliers`):**
>    - Gestión de empresas y técnicos del condominio (RIF, especialidad/rubro, persona de contacto, teléfono, datos de pago e historial de tickets/órdenes asignadas).

---

## Tareas del Loop de Ejecución

### Task 1: Migración de Base de Datos, Esquema Canónico y Tipos Compartidos
- **Archivos:**
  - Crear: `database/migrations/20261016_operations_tickets_announcements_suppliers.sql`
  - Modificar: `database/schema.sql`
  - Modificar: `packages/shared/src/index.ts`

### Task 2: Módulo Backend `OperationsModule` (Tickets de Mantenimiento, Comentarios, Cartelera con Acuse Legal, Proveedores y PDFs Oficiales)
- **Archivos:**
  - Crear: `apps/api/src/modules/operations/dto/operations.dto.ts`
  - Crear: `apps/api/src/modules/operations/pdf.ts`
  - Crear: `apps/api/src/modules/operations/operations.service.ts`
  - Crear: `apps/api/src/modules/operations/operations.controller.ts`
  - Crear: `apps/api/src/modules/operations/operations.module.ts`
  - Modificar: `apps/api/src/app.module.ts`

### Task 3: Frontend — Vistas de Mantenimiento/Tickets, Cartelera Digital con Acuse de Recibo y Proveedores (`OperationsView.tsx` + `Sidebar.tsx` + `page.tsx` + `Header.tsx`)
- **Archivos:**
  - Crear: `apps/web/src/components/OperationsView.tsx`
  - Modificar: `apps/web/src/components/Sidebar.tsx`
  - Modificar: `apps/web/src/app/page.tsx`

### Task 4: Verificación Integral E2E (Flujo Completo en Vivo + Inspección Visual PNG de Orden de Trabajo PDF y Acta de Acuse de Recibo Legal PDF)
