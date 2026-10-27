# Plan de Implementación: Módulo de Reserva y Alquiler de Áreas Comunes ( Parametrizable + Motor de Reglas de Convivencia )

> **Objetivo:** Construir el módulo integral de **Reserva y Alquiler de Áreas Comunes** para **TuCondominio360**, basado en:
> 1. **Modelo de Entidades Desacoplado del Tipo Físico de Espacio:** Cualquier espacio o recurso comunitario (Salón de Fiestas, Parrillera, Cancha Deportiva, Piscina, Sala Coworking, Ascensor de Carga/Mudanza, Estacionamiento Temporal u otro) se define mediante parámetros de comportamiento (`booking_mode`, `approval_mode`, `pricing_mode`, horarios, días permitidos, cupos concurrentes y reglas financieras).
> 2. **Motor Puro de Reglas de Convivencia Comunitaria (`rules-engine.ts` con TDD en `node:test`):** Resuelve de raíz los conflictos vecinales habituales:
>    - **Regla de Solvencia (Anti-morosidad):** bloqueo configurable a unidades con deuda mayor al umbral permitido (`block_delinquent_units`, `max_allowed_debt_usd`).
>    - **Regla de Equidad / Anti-acaparamiento:** límite de reservas activas simultáneas (`max_active_bookings_per_unit`), cuota mensual por inmueble (`max_bookings_per_unit_per_month`) y días mínimos de enfriamiento entre usos (`cooldown_days_between_bookings`).
>    - **Regla de Colchón de Limpieza/Entrega (`buffer_minutes`):** evita roces entre el vecino saliente y el entrante exigiendo N minutos libres entre reservas, con soporte de `max_concurrent_bookings`.
>    - **Regla de Ventana Horaria, Días Hábiles y Anticipación:** valida `open_time`/`close_time`, `allowed_days_of_week`, `min_hours_notice`, `max_advance_days`, `min_duration_minutes`, `max_hours_per_slot` y aforo (`capacity`).
>    - **Regla de Bloqueos Operativos (`amenity_blackouts`):** impide reservar durante mantenimientos, fumigaciones o eventos del condominio.
> 3. **Gestión Financiera, Inspección Post-Uso y Depósito en Garantía:** Cálculo automático de canon de alquiler + limpieza + depósito reembolsable, registro de pago, acta de inspección post-evento y liquidación/retención de garantía por daños.
> 4. **Configurabilidad por Condominio (`condos.settings.amenitiesConfig`):** Permite activar/desactivar el módulo según la estructura del conjunto residencial y fijar políticas globales.
> 5. **Documentos Oficiales PDF (`PdfBuilder`):** Contrato/Constancia Oficial de Reserva (`voucher.pdf`) y Reporte General de Reservas e Ingresos (`reservations.pdf`).

---

## Tareas del Loop de Ejecución

### Task 1: Migración de Base de Datos, Esquema Canónico y Tipos Compartidos
- **Archivos:**
  - Crear: `database/migrations/20261016_amenities_reservations_engine.sql`
  - Modificar: `database/schema.sql`
  - Modificar: `packages/shared/src/index.ts`
- **Alcance:**
  - Ampliar `amenities` con parámetros agnósticos del espacio: `space_category`, `booking_mode`, `approval_mode`, `fee_type`, `cleaning_fee_usd`, `open_time`, `close_time`, `allowed_days`, `min_duration_minutes`, `max_advance_days`, `buffer_minutes`, `max_concurrent_bookings`, `max_active_per_unit`, `max_per_unit_per_month`, `cooldown_days`, `block_delinquent_units`, `max_allowed_debt_usd`, `requires_deposit`, `updated_at`.
  - Crear tabla `amenity_blackouts` (bloqueos por mantenimiento/eventos: `id`, `condo_id`, `amenity_id`, `title`, `start_date`, `end_date`, `start_time`, `end_time`, `reason`, `created_by_user_id`, `created_at`).
  - Ampliar `amenity_reservations` con: `condo_id`, `reservation_code`, `event_title`, `event_description`, `fee_amount_usd`, `cleaning_fee_usd`, `deposit_amount_usd`, `total_amount_usd`, `payment_status`, `payment_reference`, `payment_method`, `approved_by_user_id`, `approved_at`, `cancelled_at`, `cancel_reason`, `inspection_status`, `inspection_notes`, `damage_deduction_usd`, `deposit_refunded_usd`, `inspected_at`, `inspected_by_user_id`.

### Task 2: Motor Puro de Reglas de Convivencia (`rules-engine.ts` + TDD `rules-engine.spec.ts`)
- **Archivos:**
  - Crear: `apps/api/src/modules/amenities/rules-engine.ts`
  - Crear: `apps/api/src/modules/amenities/rules-engine.spec.ts`
- **Alcance:**
  - Función pura `evaluateReservationRules(input)` que evalúa todas las reglas de convivencia (estado del módulo/espacio, solvencia del inmueble, días permitidos, horario de apertura/cierre, duración mínima/máxima, anticipación mínima y máxima en días, aforo, solapamiento con `buffer_minutes` y `max_concurrent_bookings`, bloqueos de mantenimiento `blackouts`, cuota activa, cuota mensual y `cooldown_days`), devolviendo `{ allowed: boolean; violations: RuleViolation[]; pricing: ReservationPricing; autoApprove: boolean }`.
  - Suite de pruebas `node:test` verificando cada conflicto comunitario.

### Task 3: Módulo Backend `AmenitiesModule` (Catálogo Parametrizable, Pre-chequeo, Reservas, Aprobación, Inspección y PDFs)
- **Archivos:**
  - Crear: `apps/api/src/modules/amenities/dto/amenities.dto.ts`
  - Crear: `apps/api/src/modules/amenities/pdf.ts`
  - Crear: `apps/api/src/modules/amenities/amenities.service.ts`
  - Crear: `apps/api/src/modules/amenities/amenities.controller.ts`
  - Crear: `apps/api/src/modules/amenities/amenities.module.ts`
  - Modificar: `apps/api/src/app.module.ts`
- **Alcance:**
  - Configuración por condominio (`GET/PATCH /api/amenities/config`).
  - CRUD completo de espacios parametrizables (`GET/POST/PATCH/DELETE /api/amenities/spaces`) + semilla automática de espacios modelo si la residencia está vacía y el admin usa plantillas rápidas.
  - Gestión de bloqueos por mantenimiento (`GET/POST/DELETE /api/amenities/blackouts`).
  - Pre-evaluación interactiva en vivo (`POST /api/amenities/reservations/evaluate`) para que la UI muestre al vecino o administrador en tiempo real si el horario está libre, cuánto cuesta y qué reglas se cumplen o infringen antes de enviar.
  - Creación transaccional de reserva (`POST /api/amenities/reservations` con bloqueo `FOR UPDATE` sobre el espacio para impedir condiciones de carrera entre dos vecinos reservando el mismo turno al mismo segundo).
  - Gestión del ciclo de vida: aprobar/rechazar (`POST /api/amenities/reservations/:id/status`), cancelar (`POST /api/amenities/reservations/:id/cancel`), registrar pago (`POST /api/amenities/reservations/:id/payment`) y **liquidar inspección/depósito post-uso** (`POST /api/amenities/reservations/:id/inspect`).
  - Exportación PDF: `GET /api/amenities/reservations/:id/voucher.pdf` y `GET /api/amenities/reports/reservations.pdf`.

### Task 4: Frontend — Vista de Reserva y Alquiler de Áreas Comunes (`AmenitiesView.tsx` + `Sidebar.tsx` + `page.tsx`)
- **Archivos:**
  - Crear: `apps/web/src/components/AmenitiesView.tsx`
  - Modificar: `apps/web/src/components/Sidebar.tsx`
  - Modificar: `apps/web/src/app/page.tsx`
- **Alcance:**
  - Vista dual adaptada a **Administración** y **Propietario/Residente**:
    - Catálogo visual de espacios con sus reglas de convivencia, tarifas, depósito, horario, aforo y plantillas rápidas de creación (Salón de Fiestas, Parrillera, Cancha de Pádel/Tenis, Sala Coworking, Ascensor de Mudanzas, Piscina).
    - Asistente de Reserva con **Verificador de Reglas de Convivencia en Vivo** (muestra checkmarks o alertas de solvencia, disponibilidad, colchón de limpieza, cuotas vecinales y desglose financiero).
    - Agenda / Calendario de Reservas con flujo de Aprobación, Registro de Pago, Inspección Post-Evento / Liquidación de Depósito en Garantía y descarga de **Constancia/Contrato PDF**.
    - Panel de Bloqueos por Mantenimiento (`Blackouts`) y Configuración del Módulo por Condominio.

### Task 5: Verificación Integral E2E (Unit Tests del Motor + Flujo Completo en Vivo + Inspección Visual de PDFs)
