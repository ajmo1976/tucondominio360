-- =============================================================================
-- TuCondominio360 - Migración: Identidad de usuarios y tokens de autenticación
-- Fase A (Identidad y Autenticación)
-- 1. users: permitir cuentas solo-Google (password_hash/doc_number nullable)
-- 2. users: email_verified_at, last_login_at, token_version (invalida JWT)
-- 3. user_identities: proveedores de acceso (LOCAL, GOOGLE, ...)
-- 4. auth_tokens: tokens de un solo uso hasheados (invitación, verificación, reset)
-- =============================================================================

-- 1. Cuentas sin contraseña local (solo Google o invitación pendiente)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN doc_number DROP NOT NULL;

-- 2. Estado de correo, último ingreso y versión de token
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

-- 3. Proveedores de acceso por usuario
CREATE TABLE IF NOT EXISTS user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,             -- 'LOCAL' | 'GOOGLE'
    provider_user_id VARCHAR(255),             -- 'sub' de Google; NULL para LOCAL
    email_at_provider VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    CONSTRAINT uq_identity_provider UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);

-- 4. Tokens de autenticación de un solo uso (se guarda sha256, nunca el token)
CREATE TABLE IF NOT EXISTS auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(30) NOT NULL,              -- 'INVITATION' | 'EMAIL_VERIFICATION' | 'PASSWORD_RESET'
    token_hash VARCHAR(64) NOT NULL,
    email VARCHAR(120) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_auth_token_hash UNIQUE (token_hash)
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, purpose);

-- Usuarios existentes: verificar su correo y sembrar identidad LOCAL
INSERT INTO user_identities (user_id, provider, provider_user_id, email_at_provider)
SELECT id, 'LOCAL', NULL, email FROM users
ON CONFLICT DO NOTHING;

UPDATE users
SET email_verified_at = NOW()
WHERE email_verified_at IS NULL AND password_hash IS NOT NULL;
