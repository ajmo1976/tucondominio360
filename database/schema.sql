-- =============================================================================
-- TuCondominio360 - Database Schema (PostgreSQL)
-- Soporte Multinivel, Multi-tenancy, Multimoneda y Conciliación Bancaria (Venezuela)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- TIPOS ENUMERADOS (ENUMS)
-- -----------------------------------------------------------------------------

CREATE TYPE tenant_type AS ENUM (
    'COMPANY',          -- Empresa administradora con cartera de condominios
    'SELF_MANAGED'      -- Junta de condominio autogestionada (1 solo condominio)
);

CREATE TYPE document_type AS ENUM (
    'V', 'E', 'J', 'G', 'P'
);

CREATE TYPE currency_code AS ENUM (
    'USD', 'VES', 'EUR'
);

CREATE TYPE unit_type AS ENUM (
    'APARTMENT', 'HOUSE', 'COMMERCIAL', 'OFFICE', 'PARKING', 'STORAGE'
);

CREATE TYPE occupant_role AS ENUM (
    'OWNER',            -- Propietario principal
    'CO_OWNER',         -- Co-propietario
    'TENANT',           -- Inquilino / Arrendatario
    'RESIDENT',         -- Habitante / Familiar
    'AUTHORIZED'        -- Persona autorizada
);

CREATE TYPE condo_role AS ENUM (
    'ADMIN',            -- Administrador operativo del condominio
    'BOARD_PRESIDENT',  -- Presidente de la junta
    'BOARD_TREASURER',  -- Tesorero de la junta
    'BOARD_MEMBER',     -- Vocal / Miembro de la junta
    'OWNER',            -- Propietario residente
    'TENANT',           -- Inquilino
    'GUARD',            -- Vigilancia / Garita
    'CONCIERGE',        -- Conserjería / Mantenimiento
    'AUDITOR'           -- Auditor externo
);

CREATE TYPE expense_type AS ENUM (
    'COMMON',           -- Gasto común repartido por alícuota a todos
    'NON_COMMON',       -- Gasto no común individual o por torre
    'RESERVE_FUND'      -- Gasto pagado con cargo al Fondo de Reserva
);

CREATE TYPE billing_period_status AS ENUM (
    'DRAFT',            -- En carga de gastos
    'CALCULATED',       -- Recibos pre-calculados para revisión de junta
    'ISSUED',           -- Emitido y publicado a propietarios
    'CLOSED'            -- Periodo cerrado contablemente
);

CREATE TYPE bill_status AS ENUM (
    'UNPAID',           -- No pagado
    'PARTIALLY_PAID',   -- Pagado parcialmente (abono)
    'PAID',             -- Pagado completamente
    'OVERDUE',          -- Vencido / En mora
    'CANCELLED'         -- Anulado
);

CREATE TYPE payment_method AS ENUM (
    'PAGO_MOVIL',
    'TRANSFER_VES',
    'TRANSFER_USD_NACIONAL',
    'ZELLE',
    'CASH_USD',
    'CASH_VES',
    'BINANCE_USDT',
    'OTHER'
);

CREATE TYPE payment_status AS ENUM (
    'PENDING',          -- Reportado por el propietario, pendiente de validar
    'VERIFIED',         -- Validado contra extracto bancario o por tesorería
    'REJECTED',         -- Rechazado (referencia falsa, monto incorrecto)
    'DISPUTED'          -- En disputa o reclamo
);

CREATE TYPE bank_tx_type AS ENUM (
    'CREDIT',           -- Abono / Ingreso
    'DEBIT'             -- Cargo / Egreso
);

CREATE TYPE visitor_invitation_status AS ENUM (
    'PENDING',
    'ACTIVE',
    'USED',
    'EXPIRED',
    'REVOKED'
);

CREATE TYPE reservation_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'COMPLETED'
);

CREATE TYPE ticket_priority AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'EMERGENCY'
);

CREATE TYPE ticket_status AS ENUM (
    'OPEN',
    'ASSIGNED',
    'IN_PROGRESS',
    'RESOLVED',
    'CLOSED'
);

CREATE TYPE consultation_type AS ENUM (
    'CARTA_CONSULTA',
    'ASAMBLEA_ORDINARIA',
    'ASAMBLEA_EXTRAORDINARIA'
);

CREATE TYPE consultation_status AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'CLOSED',
    'CANCELLED'
);

CREATE TYPE consultation_result AS ENUM (
    'APPROVED',
    'REJECTED',
    'TIED',
    'NO_VOTES'
);

CREATE TYPE consultation_elector_source AS ENUM (
    'OWNER',
    'MANUAL'
);

CREATE TYPE package_status AS ENUM (
    'RECEIVED_AT_GATE',
    'DELIVERED_TO_RESIDENT',
    'RETURNED'
);

-- -----------------------------------------------------------------------------
-- 1. TENANCY Y USUARIOS
-- -----------------------------------------------------------------------------

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(80) NOT NULL UNIQUE,
    tenant_type tenant_type NOT NULL DEFAULT 'COMPANY',
    rif VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(120) NOT NULL,
    phone VARCHAR(30),
    address TEXT,
    logo_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    doc_type document_type NOT NULL DEFAULT 'V',
    doc_number VARCHAR(20) NOT NULL,
    phone VARCHAR(30),
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_document UNIQUE (doc_type, doc_number)
);

CREATE TABLE tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_owner BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tenant_user UNIQUE (tenant_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 2. CONDOMINIOS Y ESTRUCTURA INMOBILIARIA
-- -----------------------------------------------------------------------------

CREATE TABLE condos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(12), -- Abreviatura para numerar recibos (Ej: "MIRA", "JUNI")
    rif VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    state VARCHAR(60) NOT NULL,
    city VARCHAR(60) NOT NULL,
    postal_code VARCHAR(10),
    main_currency currency_code NOT NULL DEFAULT 'USD',
    secondary_currency currency_code NOT NULL DEFAULT 'VES',
    reserve_fund_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00, -- Mínimo legal 10%
    late_fee_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,      -- Interés o mora mensual (%)
    bcv_policy VARCHAR(30) NOT NULL DEFAULT 'PAYMENT_DATE', -- 'PAYMENT_DATE' | 'EMISSION_DATE'
    settings JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_condo_tenant_rif UNIQUE (tenant_id, rif),
    CONSTRAINT uq_condo_tenant_code UNIQUE (tenant_id, code)
);

CREATE TABLE condo_user_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role condo_role NOT NULL DEFAULT 'OWNER',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_condo_user_role UNIQUE (condo_id, user_id, role)
);

CREATE TABLE buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL, -- Ej: "Torre A", "Edificio Norte", "Manzana 3"
    code VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE property_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
    unit_code VARCHAR(30) NOT NULL, -- Ej: "PH-1", "A-12", "Local 04"
    unit_type unit_type NOT NULL DEFAULT 'APARTMENT',
    floor VARCHAR(15),
    aliquot_percentage NUMERIC(7,5) NOT NULL, -- Ej: 1.25430%
    area_sqm NUMERIC(8,2),
    current_balance_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00, -- Saldo deudor (+) o a favor (-)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_condo_unit_code UNIQUE (condo_id, unit_code),
    CONSTRAINT chk_aliquot_range CHECK (aliquot_percentage > 0 AND aliquot_percentage <= 100)
);

CREATE TABLE unit_occupants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role occupant_role NOT NULL DEFAULT 'OWNER',
    is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
    is_billing_recipient BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_unit_user_role UNIQUE (property_unit_id, user_id, role)
);

-- -----------------------------------------------------------------------------
-- 3. TASAS DE CAMBIO (BCV / MONEDAS)
-- -----------------------------------------------------------------------------

CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_date DATE NOT NULL,
    base_currency currency_code NOT NULL DEFAULT 'USD',
    target_currency currency_code NOT NULL DEFAULT 'VES',
    rate NUMERIC(18,4) NOT NULL, -- Ej: 36.5420 Bs/USD
    source VARCHAR(50) NOT NULL DEFAULT 'BCV',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_daily_rate UNIQUE (rate_date, base_currency, target_currency, source)
);

-- -----------------------------------------------------------------------------
-- 4. CUENTAS BANCARIAS DEL CONDOMINIO
-- -----------------------------------------------------------------------------

CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    bank_code VARCHAR(4) NOT NULL, -- Ej: "0102" (BDV), "0134" (Banesco), "0105" (Mercantil)
    bank_name VARCHAR(80) NOT NULL,
    account_number VARCHAR(20) NOT NULL, -- 20 dígitos en Venezuela
    account_type VARCHAR(40) NOT NULL,   -- Corriente, Ahorro, Custodia USD, etc.
    currency currency_code NOT NULL DEFAULT 'VES',
    account_holder_name VARCHAR(120) NOT NULL,
    account_holder_rif VARCHAR(20) NOT NULL,
    -- Datos específicos para Pago Móvil:
    supports_pago_movil BOOLEAN NOT NULL DEFAULT FALSE,
    pago_movil_phone VARCHAR(20),
    pago_movil_id_type document_type,
    pago_movil_id_number VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_condo_account UNIQUE (condo_id, account_number)
);

-- -----------------------------------------------------------------------------
-- 5. EGRESOS, PROVEEDORES Y GASTOS DE CONDOMINIO
-- -----------------------------------------------------------------------------

CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID REFERENCES condos(id) ON DELETE CASCADE, -- NULL si es global para el tenant
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL, -- Ej: "Servicios Públicos", "Ascensores", "Vigilancia"
    code VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    rif VARCHAR(20) NOT NULL,
    email VARCHAR(120),
    phone VARCHAR(30),
    address TEXT,
    payment_info JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE billing_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    period_year INT NOT NULL,
    period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    status billing_period_status NOT NULL DEFAULT 'DRAFT',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    issue_date DATE,
    due_date DATE,
    bcv_exchange_rate NUMERIC(18,4) NOT NULL DEFAULT 1.0000,
    total_common_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_common_ves NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_non_common_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    reserve_fund_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    grand_total_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    grand_total_ves NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_condo_period UNIQUE (condo_id, period_year, period_month)
);

CREATE TYPE expense_distribution_type AS ENUM (
    'BY_ALICUOTA',
    'EQUAL_PARTS_FILTERED',
    'DIRECT_FIXED_AMOUNT'
);

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    billing_period_id UUID NOT NULL REFERENCES billing_periods(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    invoice_number VARCHAR(60),
    control_number VARCHAR(60),
    expense_date DATE NOT NULL,
    expense_type expense_type NOT NULL DEFAULT 'COMMON',
    currency currency_code NOT NULL DEFAULT 'USD',
    amount_original NUMERIC(14,2) NOT NULL,
    exchange_rate NUMERIC(18,4) NOT NULL DEFAULT 1.0000,
    amount_usd NUMERIC(14,2) NOT NULL,
    amount_ves NUMERIC(14,2) NOT NULL,
    target_building_id UUID REFERENCES buildings(id) ON DELETE SET NULL, -- Si es gasto exclusivo de una torre
    distribution_type expense_distribution_type NOT NULL DEFAULT 'BY_ALICUOTA',
    exclude_from_reserve BOOLEAN NOT NULL DEFAULT FALSE,
    invoice_file_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 6. RECIBOS DE CONDOMINIO (CUENTAS POR COBRAR)
-- -----------------------------------------------------------------------------

CREATE TABLE condo_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    billing_period_id UUID NOT NULL REFERENCES billing_periods(id) ON DELETE CASCADE,
    property_unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE RESTRICT,
    bill_number VARCHAR(40) NOT NULL, -- Ej: "2026-10-A101"
    aliquot_percentage NUMERIC(7,5) NOT NULL,
    
    -- Subtotales del periodo
    common_share_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    non_common_share_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    reserve_fund_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    current_period_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    
    -- Deudas anteriores y saldos
    previous_debt_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    credit_balance_applied_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    interest_moratory_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    
    -- Totales a pagar
    total_due_usd NUMERIC(14,2) NOT NULL,
    total_due_ves NUMERIC(14,2) NOT NULL,
    exchange_rate_emission NUMERIC(18,4) NOT NULL,
    
    -- Pagos y saldo pendiente
    total_paid_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    remaining_balance_usd NUMERIC(14,2) NOT NULL,
    
    status bill_status NOT NULL DEFAULT 'UNPAID',
    pdf_url TEXT,
    qr_verification_code VARCHAR(100),
    sent_via_email_at TIMESTAMPTZ,
    sent_via_whatsapp_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_period_unit UNIQUE (billing_period_id, property_unit_id)
);

CREATE TABLE bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_bill_id UUID NOT NULL REFERENCES condo_bills(id) ON DELETE CASCADE,
    expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    description VARCHAR(255) NOT NULL,
    total_expense_usd NUMERIC(14,2) NOT NULL,
    unit_share_usd NUMERIC(14,2) NOT NULL,
    unit_share_ves NUMERIC(14,2) NOT NULL,
    item_type expense_type NOT NULL DEFAULT 'COMMON'
);

-- -----------------------------------------------------------------------------
-- 7. REPORTE DE PAGOS Y CONCILIACIÓN BANCARIA
-- -----------------------------------------------------------------------------

CREATE TABLE payment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    property_unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE RESTRICT,
    reported_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL, -- Cuenta destino
    
    -- Datos del movimiento de pago
    payment_method payment_method NOT NULL,
    reference_number VARCHAR(60) NOT NULL,
    payment_date DATE NOT NULL,
    origin_bank VARCHAR(80),
    origin_phone VARCHAR(20),       -- En caso de Pago Móvil
    origin_doc_number VARCHAR(20),  -- Cédula o RIF del pagador
    
    -- Montos y monedas
    currency currency_code NOT NULL DEFAULT 'VES',
    amount_paid NUMERIC(14,2) NOT NULL,
    exchange_rate_applied NUMERIC(18,4) NOT NULL,
    equivalent_usd NUMERIC(14,2) NOT NULL,
    
    -- Comprobante e inspección
    receipt_image_url TEXT,
    notes TEXT,
    status payment_status NOT NULL DEFAULT 'PENDING',
    rejection_reason TEXT,
    verified_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Estados de cuenta bancarios cargados (Extractos bancarios en CSV, Excel o TXT)
CREATE TABLE bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    file_name VARCHAR(150) NOT NULL,
    file_url TEXT,
    statement_from DATE NOT NULL,
    statement_to DATE NOT NULL,
    total_records INT NOT NULL DEFAULT 0,
    reconciled_records INT NOT NULL DEFAULT 0,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Movimientos bancarios individuales para conciliación automática
CREATE TABLE bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    reference_number VARCHAR(60) NOT NULL,
    description TEXT,
    amount NUMERIC(14,2) NOT NULL,
    tx_type bank_tx_type NOT NULL DEFAULT 'CREDIT',
    balance_after NUMERIC(14,2),
    
    -- Estado de la conciliación
    is_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
    matched_payment_report_id UUID REFERENCES payment_reports(id) ON DELETE SET NULL,
    reconciled_at TIMESTAMPTZ,
    reconciliation_method VARCHAR(30) -- 'AUTO_REFERENCE', 'AUTO_AMOUNT_DATE', 'MANUAL'
);

-- Distribución del pago (un pago puede cancelar 1 o varios recibos, y el resto va a crédito)
CREATE TABLE payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_report_id UUID NOT NULL REFERENCES payment_reports(id) ON DELETE CASCADE,
    condo_bill_id UUID REFERENCES condo_bills(id) ON DELETE RESTRICT,
    amount_usd NUMERIC(14,2) NOT NULL,
    amount_ves NUMERIC(14,2) NOT NULL,
    is_to_credit_balance BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saldos a favor acumulados por unidad (por diferencias cambiarias o pagos adelantados)
CREATE TABLE unit_credit_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
    amount_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 8. AUDITORÍA (AUDIT LOGS)
-- -----------------------------------------------------------------------------

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    condo_id UUID REFERENCES condos(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,          -- Ej: 'BILL_ISSUED', 'PAYMENT_VERIFIED', 'RATE_UPDATED'
    entity_name VARCHAR(50) NOT NULL,     -- Ej: 'payment_reports', 'condo_bills'
    entity_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 9. CONTROL DE ACCESO Y VISITAS (GARITA, VEHÍCULOS & QR)
-- -----------------------------------------------------------------------------

CREATE TABLE resident_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    property_unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
    registered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    plate VARCHAR(15) NOT NULL,
    vehicle_type VARCHAR(20) NOT NULL DEFAULT 'CAR', -- 'CAR' | 'SUV' | 'MOTO' | 'TRUCK' | 'OTHER'
    brand VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    color VARCHAR(30) NOT NULL,
    parking_spot VARCHAR(30),
    tag_code VARCHAR(40),
    owner_name VARCHAR(120),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_condo_vehicle_plate UNIQUE (condo_id, plate)
);

CREATE TABLE visitor_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    property_unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visitor_name VARCHAR(120) NOT NULL,
    visitor_doc_type document_type DEFAULT 'V',
    visitor_doc_number VARCHAR(20),
    visitor_plate VARCHAR(15), -- Placa del vehículo si ingresa en carro
    visitor_category VARCHAR(30) NOT NULL DEFAULT 'VISITOR', -- 'VISITOR' | 'FAMILY' | 'PROVIDER' | 'DELIVERY' | 'SERVICE' | 'TAXI' | 'CONTRACTOR'
    entry_mode VARCHAR(20) NOT NULL DEFAULT 'PEDESTRIAN', -- 'PEDESTRIAN' | 'VEHICLE'
    company_name VARCHAR(100),
    companion_count INT NOT NULL DEFAULT 0,
    access_code VARCHAR(32) NOT NULL UNIQUE, -- Código QR o PIN numérico de acceso
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    max_uses INT NOT NULL DEFAULT 1,
    uses_count INT NOT NULL DEFAULT 0,
    status visitor_invitation_status NOT NULL DEFAULT 'ACTIVE',
    cancelled_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE visitor_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    invitation_id UUID REFERENCES visitor_invitations(id) ON DELETE SET NULL,
    property_unit_id UUID REFERENCES property_units(id) ON DELETE SET NULL,
    guard_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    exit_guard_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    visitor_name VARCHAR(120) NOT NULL,
    visitor_doc_type document_type DEFAULT 'V',
    visitor_doc_number VARCHAR(20) NOT NULL,
    visitor_category VARCHAR(30) NOT NULL DEFAULT 'VISITOR',
    entry_mode VARCHAR(20) NOT NULL DEFAULT 'PEDESTRIAN',
    company_name VARCHAR(100),
    vehicle_plate VARCHAR(15),
    destination_label VARCHAR(80),
    authorized_by_name VARCHAR(120),
    status VARCHAR(20) NOT NULL DEFAULT 'INSIDE', -- 'INSIDE' | 'COMPLETED' | 'DENIED' | 'INCIDENT'
    incident_alert BOOLEAN NOT NULL DEFAULT FALSE,
    entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exit_time TIMESTAMPTZ,
    notes TEXT
);

-- -----------------------------------------------------------------------------
-- 10. RESERVAS DE ÁREAS COMUNES (AMENITIES)
-- -----------------------------------------------------------------------------

CREATE TABLE amenities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- Ej: "Salón de Fiestas", "Parrillera Terraza", "Cancha de Tenis"
    description TEXT,
    capacity INT,
    fee_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    deposit_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00, -- Depósito en garantía reintegrable
    min_hours_notice INT NOT NULL DEFAULT 24,
    max_hours_per_slot INT NOT NULL DEFAULT 6,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    rules TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE amenity_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amenity_id UUID NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
    property_unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
    requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reservation_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    guest_count INT,
    status reservation_status NOT NULL DEFAULT 'PENDING',
    payment_report_id UUID REFERENCES payment_reports(id) ON DELETE SET NULL,
    deposit_refunded BOOLEAN NOT NULL DEFAULT FALSE,
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 11. MANTENIMIENTO Y TICKETS DE INCIDENCIAS
-- -----------------------------------------------------------------------------

CREATE TABLE maintenance_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    reported_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_unit_id UUID REFERENCES property_units(id) ON DELETE SET NULL,
    building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
    category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    priority ticket_priority NOT NULL DEFAULT 'MEDIUM',
    status ticket_status NOT NULL DEFAULT 'OPEN',
    assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Ej: Conserje o Técnico
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    images JSONB NOT NULL DEFAULT '[]', -- URLs de fotos de la avería
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    images JSONB NOT NULL DEFAULT '[]',
    is_internal_only BOOLEAN NOT NULL DEFAULT FALSE, -- Solo visible para administradores y junta
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 12. CARTAS CONSULTA Y ASAMBLEAS (VOTACIONES CON PONDERACIÓN DE ALÍCUOTAS)
-- -----------------------------------------------------------------------------

CREATE TABLE consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    consultation_type consultation_type NOT NULL DEFAULT 'CARTA_CONSULTA',
    status consultation_status NOT NULL DEFAULT 'DRAFT',
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    quorum_required_aliquot NUMERIC(7,5) DEFAULT 0, -- Sin quórum: umbral informativo (no decide)
    is_secret_ballot BOOLEAN NOT NULL DEFAULT FALSE,
    minutes_document_url TEXT, -- Acta final firmada
    closed_at TIMESTAMPTZ,
    closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    result consultation_result,
    winning_option_id UUID, -- FK a consultation_options(id): ver ALTER TABLE tras su definición
    result_snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE consultation_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL, -- Ej: "Opción A: Cambiar bomba de agua marca Pentax ($1.200)"
    description TEXT,
    position INT NOT NULL DEFAULT 0
);

-- FK diferido de consultations.winning_option_id (consultation_options se define después).
ALTER TABLE consultations
    ADD CONSTRAINT consultations_winning_option_id_fkey
    FOREIGN KEY (winning_option_id) REFERENCES consultation_options(id) ON DELETE SET NULL;

CREATE TABLE consultation_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    consultation_option_id UUID NOT NULL REFERENCES consultation_options(id) ON DELETE CASCADE,
    property_unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    aliquot_applied NUMERIC(7,5) NOT NULL, -- Alícuota congelada al momento de la votación
    voted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT,
    verification_code VARCHAR(40),
    CONSTRAINT uq_consultation_unit UNIQUE (consultation_id, property_unit_id)
);

-- Padrón congelado al publicar: qué usuario puede emitir el voto de qué unidad.
CREATE TABLE consultation_electors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    property_unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source consultation_elector_source NOT NULL DEFAULT 'OWNER',
    added_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_consultation_elector UNIQUE (consultation_id, property_unit_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 13. CARTELERA DIGITAL Y COMUNICADOS
-- -----------------------------------------------------------------------------

CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(180) NOT NULL,
    content TEXT NOT NULL,
    is_urgent BOOLEAN NOT NULL DEFAULT FALSE,
    requires_acknowledgement BOOLEAN NOT NULL DEFAULT FALSE, -- Acuse de recibo legal
    attachment_urls JSONB NOT NULL DEFAULT '[]',
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE TABLE announcement_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_announcement_user UNIQUE (announcement_id, user_id)
);

-- -----------------------------------------------------------------------------
-- 14. PAQUETERÍA Y CORRESPONDENCIA EN GARITA
-- -----------------------------------------------------------------------------

CREATE TABLE packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    property_unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
    courier_company VARCHAR(80), -- Ej: "MRW", "Zoom", "Tealca", "Liberty Express", "MercadoLibre"
    tracking_number VARCHAR(100),
    recipient_name VARCHAR(120),
    received_by_guard_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    pickup_pin VARCHAR(6) NOT NULL, -- PIN de retiro para el residente
    photo_url TEXT,
    status package_status NOT NULL DEFAULT 'RECEIVED_AT_GATE',
    delivered_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    delivered_to_name VARCHAR(120),
    notes TEXT,
    delivered_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- ÍNDICES DE RENDIMIENTO Y BÚSQUEDA
-- -----------------------------------------------------------------------------

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_doc ON users(doc_type, doc_number);
CREATE INDEX idx_condos_tenant ON condos(tenant_id);
CREATE INDEX idx_units_condo ON property_units(condo_id);
CREATE INDEX idx_units_building ON property_units(building_id);
CREATE INDEX idx_unit_occupants_unit ON unit_occupants(property_unit_id);
CREATE INDEX idx_unit_occupants_user ON unit_occupants(user_id);
CREATE INDEX idx_rates_date ON exchange_rates(rate_date);
CREATE INDEX idx_expenses_period ON expenses(billing_period_id);
CREATE INDEX idx_bills_period ON condo_bills(billing_period_id);
CREATE INDEX idx_bills_unit ON condo_bills(property_unit_id);
CREATE INDEX idx_bills_status ON condo_bills(status);
CREATE INDEX idx_payments_condo ON payment_reports(condo_id);
CREATE INDEX idx_payments_unit ON payment_reports(property_unit_id);
CREATE INDEX idx_payments_status ON payment_reports(status);
CREATE INDEX idx_payments_ref ON payment_reports(reference_number);
CREATE INDEX idx_bank_tx_ref ON bank_transactions(reference_number);
CREATE INDEX idx_bank_tx_account_date ON bank_transactions(bank_account_id, transaction_date);
CREATE INDEX idx_visitor_code ON visitor_invitations(access_code);
CREATE INDEX idx_visitor_unit ON visitor_invitations(property_unit_id);
CREATE INDEX idx_resident_vehicles_condo_plate ON resident_vehicles(condo_id, plate);
CREATE INDEX idx_resident_vehicles_unit ON resident_vehicles(property_unit_id);
CREATE INDEX idx_visitor_invitations_condo_status ON visitor_invitations(condo_id, status);
CREATE INDEX idx_visitor_logs_condo_status ON visitor_access_logs(condo_id, status);
CREATE INDEX idx_visitor_logs_condo_entry ON visitor_access_logs(condo_id, entry_time DESC);
CREATE INDEX idx_packages_condo_status ON packages(condo_id, status);
CREATE INDEX idx_reservations_amenity_date ON amenity_reservations(amenity_id, reservation_date);
CREATE INDEX idx_tickets_condo_status ON maintenance_tickets(condo_id, status);
CREATE INDEX idx_consultations_condo ON consultations(condo_id, status);
CREATE INDEX idx_consultation_electors ON consultation_electors(consultation_id);
CREATE INDEX idx_consultation_options ON consultation_options(consultation_id);
CREATE INDEX idx_consultation_votes_consultation ON consultation_votes(consultation_id);
CREATE INDEX idx_packages_unit_status ON packages(property_unit_id, status);
CREATE INDEX idx_audit_condo ON audit_logs(condo_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
