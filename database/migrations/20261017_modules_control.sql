-- 20261017_modules_control.sql
-- Fase C: Catálogo de módulos y overrides por tenant/residencia

CREATE TABLE IF NOT EXISTS modules (
    code VARCHAR(40) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    default_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_core BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_modules (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_code VARCHAR(40) NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, module_code)
);

CREATE TABLE IF NOT EXISTS condo_modules (
    condo_id UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
    module_code VARCHAR(40) NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (condo_id, module_code)
);

-- Catálogo base (is_core = true → obligatorio, no se puede apagar)
INSERT INTO modules (code, name, description, default_enabled, is_core, sort_order) VALUES
  ('DASHBOARD',     'Dashboard General',          'Indicadores y resumen del condominio', TRUE,  TRUE,  10),
  ('COMMUNITY',     'Portal del Propietario',     'Mi estado de cuenta y recibos',        TRUE,  TRUE,  20),
  ('BILLING',       'Gestión de Recibos',         'Emisión y cobranza de recibos',        TRUE,  TRUE,  30),
  ('UNITS',         'Propietarios y Alícuotas',   'Unidades, propietarios y alícuotas',   TRUE,  TRUE,  40),
  ('USERS',         'Usuarios y Accesos',         'Administración de usuarios y roles',   TRUE,  TRUE,  50),
  ('EXPENSES',      'Gastos y Facturas',          'Registro de gastos del condominio',    TRUE,  FALSE, 60),
  ('PAYMENTS',      'Conciliación de Pagos',      'Pagos reportados y conciliación',      TRUE,  FALSE, 70),
  ('ACCESS',        'Control de Acceso',          'Invitaciones y bitácora de garita',    TRUE,  FALSE, 80),
  ('AMENITIES',     'Reserva de Áreas Comunes',   'Reservas y alquiler de espacios',      TRUE,  FALSE, 90),
  ('MAINTENANCE',   'Mantenimiento',              'Tickets de averías y seguimiento',     TRUE,  FALSE, 100),
  ('ANNOUNCEMENTS', 'Cartelera Digital',          'Comunicados con acuse de recibo',      TRUE,  FALSE, 110),
  ('CONSULTATIONS', 'Consultas y Asambleas',      'Votaciones y asambleas digitales',     TRUE,  FALSE, 120)
ON CONFLICT (code) DO NOTHING;