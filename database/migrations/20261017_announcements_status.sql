-- =============================================================================
-- Migración: Cartelera Digital — estado de publicación y última actualización
-- Fecha: 2026-10-17
-- Motivo: el AnnouncementsModule usa las columnas `status` (DRAFT/PUBLISHED/EXPIRED)
--         y `updated_at`, que no existían en la tabla `announcements`.
-- =============================================================================

ALTER TABLE announcements
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_announcements_condo_status ON announcements(condo_id, status);
