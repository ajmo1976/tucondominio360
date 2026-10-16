-- Consultas y Asambleas Digitales · 2026-10-16
CREATE TYPE consultation_result AS ENUM ('APPROVED', 'REJECTED', 'TIED', 'NO_VOTES');
CREATE TYPE consultation_elector_source AS ENUM ('OWNER', 'MANUAL');

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

-- Cierre y resultado congelado (para acta e inmutabilidad).
ALTER TABLE consultations
    ADD COLUMN closed_at TIMESTAMPTZ,
    ADD COLUMN closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN result consultation_result,
    ADD COLUMN winning_option_id UUID REFERENCES consultation_options(id) ON DELETE SET NULL,
    ADD COLUMN result_snapshot JSONB;

-- Sin quórum: el umbral queda en 0 y solo es informativo.
ALTER TABLE consultations ALTER COLUMN quorum_required_aliquot SET DEFAULT 0;

-- Trazabilidad del emisor del voto.
ALTER TABLE consultation_votes
    ADD COLUMN ip_address VARCHAR(45),
    ADD COLUMN user_agent TEXT,
    ADD COLUMN verification_code VARCHAR(40);

CREATE INDEX idx_consultation_electors ON consultation_electors(consultation_id);
CREATE INDEX idx_consultation_options ON consultation_options(consultation_id);
CREATE INDEX idx_consultation_votes_consultation ON consultation_votes(consultation_id);
