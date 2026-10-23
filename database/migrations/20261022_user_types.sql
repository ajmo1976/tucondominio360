-- 20261022_user_types.sql
-- Tipos de usuario para el superadmin: PROPIETARIO / JUNTA / ADMINISTRADORA,
-- y plan de residencias (máximo N) por empresa.
--
--  - users.account_type: etiqueta del TIPO PRINCIPAL que define el superadmin.
--    Es combinable: cambiar el tipo NO destruye los accesos existentes (un
--    usuario puede ser propietario en una residencia y personal de empresa en
--    otras); la verdad de los accesos sigue siendo tenant_users /
--    condo_user_access / unit_occupants.
--  - tenants.max_condos: límite máximo de residencias en el portafolio de la
--    empresa (plan comercial). NULL = sin límite. Validado al crear residencias.

DO $$ BEGIN
  CREATE TYPE account_type AS ENUM ('PROPIETARIO', 'JUNTA', 'ADMINISTRADORA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type account_type NOT NULL DEFAULT 'PROPIETARIO';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_condos INTEGER;

-- Clasificación inicial de los usuarios existentes:
-- 1) Personal activo de una empresa (COMPANY) con rol OWNER/ADMIN -> ADMINISTRADORA
UPDATE users u
   SET account_type = 'ADMINISTRADORA'
 WHERE u.account_type = 'PROPIETARIO'
   AND EXISTS (
     SELECT 1 FROM tenant_users tu
       JOIN tenants t ON t.id = tu.tenant_id
      WHERE tu.user_id = u.id
        AND tu.is_active = TRUE
        AND t.tenant_type = 'COMPANY'
        AND tu.role IN ('OWNER', 'ADMIN'));

-- 2) Personal de junta autogestionada o con roles de junta en residencias -> JUNTA
UPDATE users u
   SET account_type = 'JUNTA'
 WHERE u.account_type = 'PROPIETARIO'
   AND (
     EXISTS (
       SELECT 1 FROM tenant_users tu
         JOIN tenants t ON t.id = tu.tenant_id
        WHERE tu.user_id = u.id
          AND tu.is_active = TRUE
          AND t.tenant_type = 'SELF_MANAGED')
     OR EXISTS (
       SELECT 1 FROM condo_user_access cua
        WHERE cua.user_id = u.id
          AND cua.is_active = TRUE
          AND cua.role IN ('BOARD_PRESIDENT', 'BOARD_TREASURER', 'BOARD_MEMBER')));

-- El resto queda en PROPIETARIO (default)
