# Arquitectura y Diseño de Base de Datos - TuCondominio360

## 1. Contexto de Negocio y Marco Legal (Venezuela)
TuCondominio360 está diseñado bajo el marco de la **Ley de Propiedad Horizontal de Venezuela**, incorporando las particularidades financieras y operativas del país:
- **Multimoneda Dual**: Emisión en Divisas (USD referencial) y Bolívares (VES), con registro histórico de tasa oficial BCV.
- **Métodos de Pago Nacionales**: Soporte nativo para Pago Móvil (banco, teléfono, cédula, referencia de 4 a 8 dígitos), transferencias bancarias nacionales (cuentas de 20 dígitos), cuentas custodia/nacionales en USD, Zelle y Efectivo USD.
- **Alícuotas**: Precisión decimal alta (`numeric(7,5)`) para repartir gastos comunes con exactitud porcentual (ej. `1.45230%`).
- **Fondos Especiales**: Fondo de Reserva legal (mínimo 10% según LPH), prestaciones sociales del personal, y fondos para proyectos extraordinarios.
- **Modelo Híbrido**: Empresas administradoras (múltiples condominios) y Juntas de Condominio autogestionadas (un solo condominio).

---

## 2. Jerarquía del Modelo Multinivel (Multi-tenancy)

```
[Tenants (Empresa Administradora o Junta Autogestionada)]
   │
   ├── [Condos (Edificios / Conjuntos Residenciales / Urbanizaciones)]
   │      │
   │      ├── [Buildings / Torres / Bloques]
   │      │      └── [Property Units (Apartamentos, Casas, Locales, Puestos, Maleteros)]
   │      │             └── [Unit Occupants (Propietarios, Inquilinos, Responsables de pago)]
   │      │
   │      ├── [Bank Accounts (Cuentas bancarias del condominio: VES, USD, Pago Móvil)]
   │      │      └── [Bank Transactions (Extractos bancarios para conciliación)]
   │      │
   │      ├── [Billing Periods (Periodos mensuales de cobro)]
   │      │      ├── [Expenses (Gastos comunes y no comunes del mes)]
   │      │      └── [Condo Bills (Recibos emitidos por unidad)]
   │      │             └── [Bill Items (Desglose rubro por rubro)]
   │      │
   │      └── [Payment Reports (Pagos reportados por residentes)]
   │             ├── [Payment Allocations (Aplicación del pago a recibos)]
   │             └── [Reconciliation Match con Bank Transactions]
   │
   └── [Users & Roles (SuperAdmin, Admin, Junta, Propietario, Vigilante, Inquilino)]
```

---

## 3. Módulos y Tablas

### Módulo A: Multi-tenancy, Usuarios y Accesos
1. **`tenants`**: Empresas administradoras o juntas registradas en la plataforma SaaS.
2. **`users`**: Personas registradas con autenticación centralizada.
3. **`roles`**: Catálogo de roles del sistema.
4. **`tenant_users`**: Vinculación usuario-tenant (ej. empleados de la administradora).
5. **`condo_access`**: Permisos específicos por condominio (ej. Miembro de Junta, Vigilante, Propietario).

### Módulo B: Inmuebles y Catastro
6. **`condos`**: Conjuntos residenciales con sus reglas (moneda base, porcentaje de fondo de reserva, RIF).
7. **`buildings`**: Torres, manzanas o etapas dentro de un condominio.
8. **`property_units`**: Inmuebles con alícuotas, metraje, tipo y saldo actual.
9. **`unit_occupants`**: Relación persona-inmueble (Propietario principal, inquilino, contacto de emergencia).

### Módulo C: Tasas de Cambio y Bancos
10. **`exchange_rates`**: Histórico diario de tasas BCV (USD/VES, EUR/VES).
11. **`bank_accounts`**: Cuentas del condominio con datos de Pago Móvil y tipo de moneda.

### Módulo D: Egresos y Gastos
12. **`expense_categories`**: Clasificador de gastos (servicios públicos, nómina, reparaciones, etc.).
13. **`suppliers`**: Directorio de proveedores de bienes y servicios con RIF y datos de pago.
14. **`expenses`**: Facturas y compromisos de pago del periodo, clasificados en comunes o no comunes.

### Módulo E: Facturación y Recibos
15. **`billing_periods`**: Ciclos mensuales de cobranza (mes, año, tasa de cierre, estatus).
16. **`condo_bills`**: Recibo de condominio por apartamento con montos en USD y VES a tasa de emisión.
17. **`bill_items`**: Desglose individual de cada gasto asignado al recibo.

### Módulo F: Pagos y Conciliación Bancaria
18. **`payment_reports`**: Pagos reportados por propietarios con comprobante y datos de Pago Móvil/Transferencia.
19. **`payment_allocations`**: Abono de un pago a uno o más recibos o a saldo a favor.
20. **`bank_statements`**: Archivos de estados de cuenta importados (CSV/TXT).
21. **`bank_transactions`**: Movimientos bancarios individuales para match de conciliación.
22. **`unit_credit_balances`**: Saldos a favor de los apartamentos por pagos excedentes.

### Módulo G: Auditoría
23. **`audit_logs`**: Trazabilidad completa de acciones críticas (cambios de alícuotas, aprobación de pagos, anulación de recibos).

### Módulo H: Control de Acceso y Visitas (Garita & QR)
24. **`visitor_invitations`**: Códigos QR y pases temporales generados por residentes para visitas o delivery.
25. **`visitor_access_logs`**: Bitácora de entradas y salidas reales registradas por el personal de vigilancia.

### Módulo I: Reservas de Áreas Comunes
26. **`amenities`**: Catálogo de áreas sociales (salón de fiesta, parrillera, piscina) con aforo, costo y depósito de garantía.
27. **`amenity_reservations`**: Solicitudes de reserva con calendario, validación de no solapamiento y reintegro de depósito.

### Módulo J: Mantenimiento y Mesa de Ayuda
28. **`maintenance_tickets`**: Reportes de averías o incidencias con fotos, asignación a personal y seguimiento de estados.
29. **`ticket_comments`**: Historial de mensajes, actualizaciones y soporte técnico.

### Módulo K: Cartas Consulta y Asambleas (Votaciones Digitales)
30. **`consultations`**: Consultas vinculantes o asambleas con quórum mínimo legal conforme a la LPH.
31. **`consultation_options`**: Opciones a votar en la consulta.
32. **`consultation_votes`**: Votación individual ponderada de forma exacta por la alícuota de cada apartamento.

### Módulo L: Cartelera Digital y Notificaciones
33. **`announcements`**: Circulares, comunicados y avisos urgentes (ej. cortes de agua, averías).
34. **`announcement_reads`**: Acuse de recibo digital para constancia formal de notificación al propietario.

### Módulo M: Paquetería y Correspondencia
35. **`packages`**: Registro de paquetes y encomiendas en garita (MRW, Tealca, Zoom, etc.) con PIN de entrega y firma.
