-- 20261017_tenant_roles.sql
-- Fase B: rol y estado del personal de la empresa administradora (tenant).
-- El rol de tenant convive con el rol por residencia (condo_user_access.role);
-- los permisos efectivos son la unión de ambos (ver shared/permissions.ts).

DO $$ BEGIN
  CREATE TYPE tenant_role AS ENUM ('OWNER','ADMIN','STAFF','VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS role tenant_role NOT NULL DEFAULT 'STAFF';
ALTER TABLE tenant_users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Overrides puntuales de permisos (opcional; sin uso inicial)
ALTER TABLE condo_user_access ADD COLUMN IF NOT EXISTS permissions_override JSONB;

-- El dueño histórico del tenant conserva su condición
UPDATE tenant_users SET role = 'OWNER' WHERE is_owner = TRUE;

CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
