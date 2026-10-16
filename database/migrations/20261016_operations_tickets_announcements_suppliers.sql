-- =============================================================================
-- Migración: Nivel 1 — Mantenimiento/Tickets, Cartelera con Acuse Legal y Proveedores
-- Fecha: 2026-10-16
-- =============================================================================

-- 1. Ampliar `maintenance_tickets` con código oficial, rubro técnico, ubicación, costos y visibilidad
ALTER TABLE maintenance_tickets
    ADD COLUMN IF NOT EXISTS ticket_code VARCHAR(32) UNIQUE,
    ADD COLUMN IF NOT EXISTS incident_type VARCHAR(30) NOT NULL DEFAULT 'PLUMBING',
    ADD COLUMN IF NOT EXISTS location_area VARCHAR(100),
    ADD COLUMN IF NOT EXISTS is_public_issue BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS actual_cost_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00;

-- 2. Ampliar `announcements` y `announcement_reads` para Acuse de Recibo Legal certificable
ALTER TABLE announcements
    ADD COLUMN IF NOT EXISTS announcement_code VARCHAR(32) UNIQUE,
    ADD COLUMN IF NOT EXISTS category VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE announcement_reads
    ADD COLUMN IF NOT EXISTS property_unit_id UUID REFERENCES property_units(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS signature_code VARCHAR(32),
    ADD COLUMN IF NOT EXISTS acknowledgement_note VARCHAR(160);

-- 3. Ampliar `suppliers` con rubro/especialidad y contacto directo
ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS specialty VARCHAR(60) NOT NULL DEFAULT 'Mantenimiento General',
    ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100),
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. Índices adicionales
CREATE INDEX IF NOT EXISTS idx_announcements_condo_pub ON announcements(condo_id, pinned DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_ann ON announcement_reads(announcement_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_active ON suppliers(tenant_id, is_active);
