-- =============================================================================
-- Migración: Módulo Nivel 1 — Mantenimiento, Tickets y Cartelera Digital con Acuse
-- Fecha: 2026-10-16
-- =============================================================================

-- 1. Ampliar `maintenance_tickets`
ALTER TABLE maintenance_tickets
    ADD COLUMN IF NOT EXISTS ticket_code VARCHAR(32) UNIQUE,
    ADD COLUMN IF NOT EXISTS incident_type VARCHAR(30) NOT NULL DEFAULT 'PLUMBING',
    ADD COLUMN IF NOT EXISTS location_area VARCHAR(100),
    ADD COLUMN IF NOT EXISTS is_public_issue BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS actual_cost_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00;

-- 2. Ampliar `announcements`
ALTER TABLE announcements
    ADD COLUMN IF NOT EXISTS announcement_code VARCHAR(32) UNIQUE,
    ADD COLUMN IF NOT EXISTS category VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_condo_status ON maintenance_tickets(condo_id, status);
CREATE INDEX IF NOT EXISTS idx_announcements_condo_published ON announcements(condo_id, published_at DESC);
