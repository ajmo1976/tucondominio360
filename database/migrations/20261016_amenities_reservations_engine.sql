-- =============================================================================
-- Migración: Módulo de Reserva y Alquiler de Áreas Comunes (Motor de Reglas)
-- Fecha: 2026-10-16
-- =============================================================================

-- 1. Ampliar tabla `amenities` con parámetros agnósticos del tipo físico de espacio
ALTER TABLE amenities
    ADD COLUMN IF NOT EXISTS space_category VARCHAR(30) NOT NULL DEFAULT 'SOCIAL_HALL',
    ADD COLUMN IF NOT EXISTS booking_mode VARCHAR(20) NOT NULL DEFAULT 'HOURLY', -- 'HOURLY' | 'FULL_DAY'
    ADD COLUMN IF NOT EXISTS approval_mode VARCHAR(20) NOT NULL DEFAULT 'ADMIN_APPROVAL', -- 'AUTO_APPROVE' | 'ADMIN_APPROVAL'
    ADD COLUMN IF NOT EXISTS fee_type VARCHAR(25) NOT NULL DEFAULT 'FLAT_PER_BOOKING', -- 'FREE' | 'FLAT_PER_BOOKING' | 'PER_HOUR'
    ADD COLUMN IF NOT EXISTS cleaning_fee_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS open_time TIME NOT NULL DEFAULT '08:00:00',
    ADD COLUMN IF NOT EXISTS close_time TIME NOT NULL DEFAULT '22:00:00',
    ADD COLUMN IF NOT EXISTS allowed_days JSONB NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
    ADD COLUMN IF NOT EXISTS min_duration_minutes INT NOT NULL DEFAULT 60,
    ADD COLUMN IF NOT EXISTS max_advance_days INT NOT NULL DEFAULT 60,
    ADD COLUMN IF NOT EXISTS buffer_minutes INT NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS max_concurrent_bookings INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS max_active_per_unit INT NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS max_per_unit_per_month INT NOT NULL DEFAULT 4,
    ADD COLUMN IF NOT EXISTS cooldown_days INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS block_delinquent_units BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS max_allowed_debt_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Tabla de bloqueos administrativos por mantenimiento, fumigación o uso comunitario
CREATE TABLE IF NOT EXISTS amenity_blackouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    amenity_id UUID NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
    title VARCHAR(140) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME NOT NULL DEFAULT '00:00:00',
    end_time TIME NOT NULL DEFAULT '23:59:00',
    reason TEXT,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Ampliar `amenity_reservations` con ciclo financiero, código oficial e inspección de garantía
ALTER TABLE amenity_reservations
    ADD COLUMN IF NOT EXISTS condo_id UUID REFERENCES condos(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS reservation_code VARCHAR(32) UNIQUE,
    ADD COLUMN IF NOT EXISTS event_title VARCHAR(140) NOT NULL DEFAULT 'Reserva de Espacio Común',
    ADD COLUMN IF NOT EXISTS event_description TEXT,
    ADD COLUMN IF NOT EXISTS fee_amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS cleaning_fee_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS deposit_amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS total_amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUIRED', -- 'NOT_REQUIRED' | 'PENDING' | 'VERIFIED'
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(80),
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30),
    ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
    ADD COLUMN IF NOT EXISTS inspection_status VARCHAR(25) NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'CLEAN_OK' | 'WITH_OBSERVATIONS' | 'DAMAGE_REPORTED'
    ADD COLUMN IF NOT EXISTS inspection_notes TEXT,
    ADD COLUMN IF NOT EXISTS damage_deduction_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS deposit_refunded_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS inspected_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS solvency_override BOOLEAN NOT NULL DEFAULT FALSE;

-- Sincronizar condo_id en reservas previas si existiesen
UPDATE amenity_reservations ar
SET condo_id = a.condo_id
FROM amenities a
WHERE ar.amenity_id = a.id AND ar.condo_id IS NULL;

-- 4. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_amenities_condo ON amenities(condo_id, is_active);
CREATE INDEX IF NOT EXISTS idx_amenity_blackouts_amenity_dates ON amenity_blackouts(amenity_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_amenity_reservations_condo_date ON amenity_reservations(condo_id, reservation_date DESC);
CREATE INDEX IF NOT EXISTS idx_amenity_reservations_unit_status ON amenity_reservations(property_unit_id, status);
