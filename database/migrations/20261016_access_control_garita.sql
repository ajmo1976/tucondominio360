-- =============================================================================
-- Migración: Módulo Integral de Control de Acceso y Garita
-- Fecha: 2026-10-16
-- =============================================================================

-- 1. Tabla de Vehículos de Residentes por Inmueble
CREATE TABLE IF NOT EXISTS resident_vehicles (
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

-- 2. Ampliar visitor_invitations (categorías de visita, modo de ingreso, empresa, acompañantes)
ALTER TABLE visitor_invitations
    ADD COLUMN IF NOT EXISTS visitor_category VARCHAR(30) NOT NULL DEFAULT 'VISITOR',
    ADD COLUMN IF NOT EXISTS entry_mode VARCHAR(20) NOT NULL DEFAULT 'PEDESTRIAN',
    ADD COLUMN IF NOT EXISTS company_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS companion_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 3. Ampliar visitor_access_logs (bitácora digital completa con estado en recinto, proveedor/delivery, incidencias)
ALTER TABLE visitor_access_logs
    ADD COLUMN IF NOT EXISTS visitor_doc_type document_type DEFAULT 'V',
    ADD COLUMN IF NOT EXISTS visitor_category VARCHAR(30) NOT NULL DEFAULT 'VISITOR',
    ADD COLUMN IF NOT EXISTS entry_mode VARCHAR(20) NOT NULL DEFAULT 'PEDESTRIAN',
    ADD COLUMN IF NOT EXISTS company_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS destination_label VARCHAR(80),
    ADD COLUMN IF NOT EXISTS authorized_by_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS exit_guard_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'INSIDE',
    ADD COLUMN IF NOT EXISTS incident_alert BOOLEAN NOT NULL DEFAULT FALSE;

-- Sincronizar registros previos que ya tengan exit_time como COMPLETED
UPDATE visitor_access_logs
SET status = 'COMPLETED'
WHERE exit_time IS NOT NULL AND status = 'INSIDE';

-- 4. Ampliar packages (paquetería y encomiendas en garita)
ALTER TABLE packages
    ADD COLUMN IF NOT EXISTS delivered_to_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- 5. Índices para búsquedas en garita en tiempo real
CREATE INDEX IF NOT EXISTS idx_resident_vehicles_condo_plate ON resident_vehicles(condo_id, plate);
CREATE INDEX IF NOT EXISTS idx_resident_vehicles_unit ON resident_vehicles(property_unit_id);
CREATE INDEX IF NOT EXISTS idx_visitor_invitations_condo_status ON visitor_invitations(condo_id, status);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_condo_status ON visitor_access_logs(condo_id, status);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_condo_entry ON visitor_access_logs(condo_id, entry_time DESC);
CREATE INDEX IF NOT EXISTS idx_packages_condo_status ON packages(condo_id, status);
