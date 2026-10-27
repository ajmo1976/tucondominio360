# Plan de Implementación: Módulo Integral de Control de Acceso y Garita (Configurable por Condominio)

> **Objetivo:** Desarrollar el módulo completo de **Control de Acceso / Garita** para **TuCondominio360**, configurable por residencia (activación general y por sub-módulos), cubriendo:
> 1. **Configuración por Condominio** (activar/desactivar módulo y sub-módulos: Vehículos de Residentes, Pases de Visita QR, Proveedores/Delivery, Paquetería, políticas de documento/placa).
> 2. **Gestión de Residentes y Vehículos** (padrón vehicular por inmueble, búsqueda instantánea por placa/unidad/residente en garita, autogestión de vehículos por el propietario).
> 3. **Gestión de Visitas y Peatones** (invitaciones y pases digitales con código único, control de vigencia y número de usos, descarga de Pase PDF oficial).
> 4. **Proveedores, Servicios, Delivery y Paquetería** (ingreso rápido de delivery/contratistas/servicios públicos y módulo completo de recepción y entrega de encomiendas con PIN de retiro de 6 dígitos).
> 5. **Panel de Control de la Garita — Bitácora Digital en Vivo** (validador de código/pase en 1 clic, check-in peatonal/vehicular, monitor de personas/vehículos actualmente dentro, check-out con cálculo de permanencia, alertas de incidencia).
> 6. **Reportes Oficiales PDF, Auditoría y Seguridad de Datos** (aislamiento estricto por condominio, privacidad por unidad para propietarios, trazabilidad en `audit_logs` y exportación de Bitácora Oficial en PDF con `PdfBuilder`).

---

## Tareas del Loop de Ejecución

### Task 1: Migración de Base de Datos, Esquema Canónico y Tipos Compartidos
- **Archivos:**
  - Crear: `database/migrations/20261016_access_control_garita.sql`
  - Modificar: `database/schema.sql`
  - Modificar: `apps/api/src/modules/condos/condos.service.ts` (`deleteCondo` incluye `resident_vehicles`)
  - Modificar: `packages/shared/src/index.ts`
- **Alcance:**
  - Crear tabla `resident_vehicles` (`id`, `condo_id`, `property_unit_id`, `registered_by_user_id`, `plate`, `vehicle_type`, `brand`, `model`, `color`, `parking_spot`, `tag_code`, `owner_name`, `is_active`, `notes`, `created_at`, `UNIQUE(condo_id, plate)`).
  - Ampliar `visitor_invitations` con `visitor_category` (`VISITOR`, `FAMILY`, `PROVIDER`, `DELIVERY`, `SERVICE`, `TAXI`, `CONTRACTOR`), `entry_mode` (`PEDESTRIAN`, `VEHICLE`), `company_name`, `companion_count`, `cancelled_at`.
  - Ampliar `visitor_access_logs` con `visitor_doc_type`, `visitor_category`, `entry_mode`, `company_name`, `destination_label`, `authorized_by_name`, `exit_guard_user_id`, `status` (`INSIDE`, `COMPLETED`, `DENIED`, `INCIDENT`), `incident_alert`.
  - Ampliar `packages` con `delivered_to_name`, `notes`.
  - Crear índices de búsqueda rápida por placa, estado en garita (`INSIDE`) y fecha de entrada.

### Task 2: Módulo Backend `AccessModule`, Configuración por Condominio y Gestión de Vehículos/Residentes
- **Archivos:**
  - Crear: `apps/api/src/modules/access/access.module.ts`
  - Crear: `apps/api/src/modules/access/guards/access-member.guard.ts`
  - Crear: `apps/api/src/modules/access/dto/access.dto.ts`
  - Crear: `apps/api/src/modules/access/access.service.ts`
  - Crear: `apps/api/src/modules/access/access.controller.ts`
  - Modificar: `apps/api/src/app.module.ts`
- **Alcance:**
  - Configuración de garita por condominio en `condos.settings.accessControl` (`GET /api/access/config?condoId=`, `PATCH /api/access/config`).
  - Directorio de residentes y vehículos (`GET /api/access/vehicles?condoId=&q=`, `POST /api/access/vehicles`, `PATCH /api/access/vehicles/:id`, `DELETE /api/access/vehicles/:id`, `GET /api/access/directory?condoId=&q=`).
  - Privacidad: un copropietario solo ve y gestiona los vehículos de sus propios inmuebles; el administrador/vigilante consulta el padrón completo de la residencia para validación en garita.

### Task 3: Gestión de Pases de Visita, Proveedores/Delivery, Bitácora de Garita y Paquetería
- **Archivos:**
  - Modificar: `apps/api/src/modules/access/access.service.ts`
  - Modificar: `apps/api/src/modules/access/access.controller.ts`
- **Alcance:**
  - **Invitaciones / Pases QR (`visitor_invitations`):** crear pase (con código único `TC360-XXXX-XXXX`, validación de límite por unidad, vigencia y usos), listar (filtrado por unidad para residentes, global para admin/garita), cancelar pase y **validar código en garita** (`POST /api/access/invitations/validate`).
  - **Bitácora Digital de Garita (`visitor_access_logs`):**
    - `POST /api/access/logs/check-in`: registra entrada (desde pase pre-autorizado o manual en garita para peatón/vehículo/delivery/proveedor/servicio), incrementa `uses_count` del pase en transacción y lo pasa a `USED` si alcanzó `max_uses`.
    - `POST /api/access/logs/:id/check-out`: registra salida, guarda fecha/hora y vigilante de salida, cambia estado a `COMPLETED`.
    - `GET /api/access/logs`: listado con filtros (`status=INSIDE|COMPLETED|INCIDENT`, `category`, `q`, rango de fechas `from`/`to`) + KPIs en tiempo real (dentro ahora, entradas hoy, vehículos dentro, deliveries/proveedores hoy, paquetes pendientes, alertas).
  - **Paquetería y Encomiendas (`packages`):**
    - `POST /api/access/packages`: recibe paquete en garita y genera `pickup_pin` numérico de 6 dígitos.
    - `POST /api/access/packages/:id/deliver`: registra entrega al residente (validando PIN o firma en garita) o devolución.
    - `GET /api/access/packages`: lista paquetes (del condominio para garita/admin; solo de sus unidades para el propietario).

### Task 4: Generación de Reportes Oficiales PDF (Bitácora de Garita y Pase QR Oficial)
- **Archivos:**
  - Crear: `apps/api/src/modules/access/pdf.ts`
  - Modificar: `apps/api/src/modules/access/access.service.ts`
  - Modificar: `apps/api/src/modules/access/access.controller.ts`
- **Alcance:**
  - `buildAccessLogbookPdf`: Reporte Oficial de Bitácora de Garita y Control de Acceso (con `PdfBuilder` de `common/pdf.ts`: encabezado institucional con RIF y código, ficha resumen del período, KPIs de movimientos y tabla completa de entradas/salidas/placas/unidades).
  - `buildVisitorPassPdf`: Pase Oficial de Acceso / Invitación Digital en PDF para compartir con el visitante o proveedor.
  - Endpoints: `GET /api/access/reports/logbook.pdf` y `GET /api/access/invitations/:id/pass.pdf`.

### Task 5: Frontend — Vista Completa de Control de Acceso y Garita (Admin/Garita y Portal de Propietario)
- **Archivos:**
  - Modificar: `apps/web/src/components/AccessView.tsx`
  - Modificar: `apps/web/src/components/Sidebar.tsx`
  - Modificar: `apps/web/src/app/page.tsx`
- **Alcance:**
  - **Modo Administración / Vigilancia de Garita:**
    - Banner de estado del módulo y modal de **Configuración del Módulo por Condominio** (activar/desactivar Control de Acceso y cada submódulo: Vehículos, Pases de Visita, Proveedores/Delivery, Paquetería, reglas de cédula/placa).
    - **KPIs en vivo:** Visitantes Dentro Ahora, Vehículos en Recinto, Entradas del Día, Deliveries/Proveedores Hoy, Paquetes Pendientes en Garita.
    - **Sub-pestaña 1 — Bitácora en Vivo (Garita):** Validador rápido de Código/Pase QR en 1 clic, botón de **Registrar Entrada (Check-in)** (Visitas, Delivery rápido, Proveedores/Servicios, Taxis), filtro de **"Actualmente Dentro"** con botón **Registrar Salida (Check-out)** en 1 clic, buscador y botón **Descargar Bitácora Oficial (PDF)**.
    - **Sub-pestaña 2 — Pases e Invitaciones QR:** listado de pases activos/usados/vencidos, crear nuevo pase, cancelar y **Descargar Pase PDF**.
    - **Sub-pestaña 3 — Residentes y Vehículos:** buscador instantáneo por **Placa / Inmueble / Propietario**, registro y edición de vehículos autorizados por unidad (placa, marca, modelo, color, tipo, puesto, tag).
    - **Sub-pestaña 4 — Paquetería y Encomiendas:** registro de paquetes recibidos (MRW, Zoom, Tealca, MercadoLibre, etc.), visualización de PIN y entrega al residente.
  - **Modo Propietario / Residente (Privacidad por Unidad):**
    - Acceso desde el Sidebar (`Control de Acceso / Visitas`).
    - Gestión de **Mis Pases de Visita / Delivery** (crear pase para mis invitados, descargar PDF, cancelar), **Mis Vehículos Registrados** (registrar/editar vehículos de mi apartamento), **Mis Paquetes en Garita** (ver paquetes pendientes con mi **PIN de retiro de 6 dígitos**) e **Historial de Ingresos a mi Inmueble**.
    - Si el condominio tiene deshabilitado el módulo de Control de Acceso, muestra un estado informativo limpio indicando que la residencia no utiliza control de garita digital.

### Task 6: Verificación Integral E2E (Backend, PDFs, Seguridad Multi-Tenant y UI)
- **Alcance:**
  - Prueba automatizada E2E de todos los flujos: configuración por condominio, registro de vehículo y búsqueda por placa, creación de pase QR + descarga de PDF, validación de pase + check-in en garita, ingreso de Delivery/Proveedor, check-out, recepción de paquete con PIN + entrega, descarga de Bitácora Oficial PDF (y verificación visual PNG), y aislamiento de seguridad entre propietarios y entre condominios.
