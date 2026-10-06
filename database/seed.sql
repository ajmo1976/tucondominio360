-- =============================================================================
-- TuCondominio360 - Seed Data (Datos de Prueba - Venezuela)
-- =============================================================================

-- 1. Tasas de Cambio Iniciales (BCV)
INSERT INTO exchange_rates (id, rate_date, base_currency, target_currency, rate, source)
VALUES 
  ('11111111-1111-1111-1111-111111111101', CURRENT_DATE, 'USD', 'VES', 36.8500, 'BCV'),
  ('11111111-1111-1111-1111-111111111102', CURRENT_DATE - INTERVAL '1 day', 'USD', 'VES', 36.7800, 'BCV');

-- 2. Tenants (Empresa Administradora y Junta Autogestionada)
INSERT INTO tenants (id, name, slug, tenant_type, rif, email, phone, address)
VALUES 
  (
    '22222222-2222-2222-2222-222222222201',
    'Administradora Inmobiliaria Capital C.A.',
    'administradora-capital',
    'COMPANY',
    'J-31456789-0',
    'contacto@admincapital.com.ve',
    '+582129991122',
    'Av. Francisco de Miranda, Torre Cavendes, Piso 8, Chacao, Caracas'
  ),
  (
    '22222222-2222-2222-2222-222222222202',
    'Junta de Condominio Res. Los Samanes',
    'res-los-samanes',
    'SELF_MANAGED',
    'J-40987654-1',
    'junta@lossamanes.org.ve',
    '+584141234567',
    'Urb. Los Samanes, Calle 3, Edif. Los Samanes, Baruta, Miranda'
  );

-- 3. Usuarios de Prueba
-- Passwords hash ficticio para pruebas locales (ej. 'secret123')
INSERT INTO users (id, email, password_hash, first_name, last_name, doc_type, doc_number, phone, is_superadmin)
VALUES 
  (
    '33333333-3333-3333-3333-333333333301',
    'superadmin@tucondominio360.com',
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890123456789012',
    'Arnaldo',
    'Martínez',
    'V',
    '18456123',
    '+584120000000',
    TRUE
  ),
  (
    '33333333-3333-3333-3333-333333333302',
    'carlos.admin@admincapital.com.ve',
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890123456789012',
    'Carlos',
    'Rodríguez',
    'V',
    '15234890',
    '+584141112233',
    FALSE
  ),
  (
    '33333333-3333-3333-3333-333333333303',
    'maria.presidente@gmail.com',
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890123456789012',
    'María',
    'Gómez',
    'V',
    '12456789',
    '+584242223344',
    FALSE
  ),
  (
    '33333333-3333-3333-3333-333333333304',
    'pedro.propietario@gmail.com',
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890123456789012',
    'Pedro',
    'Pérez',
    'V',
    '16789456',
    '+584163334455',
    FALSE
  ),
  (
    '33333333-3333-3333-3333-333333333305',
    'vigilancia.garita@gmail.com',
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890123456789012',
    'José',
    'Vigilante',
    'V',
    '19876543',
    '+584124445566',
    FALSE
  );

-- Relación Tenant - Usuario
INSERT INTO tenant_users (tenant_id, user_id, is_owner)
VALUES 
  ('22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333302', TRUE),
  ('22222222-2222-2222-2222-222222222202', '33333333-3333-3333-3333-333333333303', TRUE);

-- 4. Condominio de Prueba
INSERT INTO condos (id, tenant_id, name, rif, address, state, city, main_currency, secondary_currency, reserve_fund_rate)
VALUES 
  (
    '44444444-4444-4444-4444-444444444401',
    '22222222-2222-2222-2222-222222222201',
    'Residencias Parque El Ávila',
    'J-50123456-7',
    'Av. Principal de Los Palos Grandes, 3ra Transversal',
    'Miranda',
    'Caracas',
    'USD',
    'VES',
    10.00
  );

-- Permisos de usuarios en el condominio
INSERT INTO condo_user_access (condo_id, user_id, role)
VALUES 
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333302', 'ADMIN'),
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333303', 'BOARD_PRESIDENT'),
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333304', 'OWNER'),
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333305', 'GUARD');

-- 5. Torres y Apartamentos (Alícuotas equitativas de muestra)
INSERT INTO buildings (id, condo_id, name, code)
VALUES 
  ('55555555-5555-5555-5555-555555555501', '44444444-4444-4444-4444-444444444401', 'Torre A', 'TORRE-A'),
  ('55555555-5555-5555-5555-555555555502', '44444444-4444-4444-4444-444444444401', 'Torre B', 'TORRE-B');

-- Unidades (4 por torre, alícuotas del 12.50000% cada una para sumar 100%)
INSERT INTO property_units (id, condo_id, building_id, unit_code, unit_type, floor, aliquot_percentage, current_balance_usd)
VALUES 
  ('66666666-6666-6666-6666-666666666601', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555501', 'A-11', 'APARTMENT', '1', 12.50000, 0.00),
  ('66666666-6666-6666-6666-666666666602', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555501', 'A-12', 'APARTMENT', '1', 12.50000, 0.00),
  ('66666666-6666-6666-6666-666666666603', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555501', 'A-21', 'APARTMENT', '2', 12.50000, 0.00),
  ('66666666-6666-6666-6666-666666666604', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555501', 'A-22', 'APARTMENT', '2', 12.50000, 0.00),
  ('66666666-6666-6666-6666-666666666605', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555502', 'B-11', 'APARTMENT', '1', 12.50000, 0.00),
  ('66666666-6666-6666-6666-666666666606', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555502', 'B-12', 'APARTMENT', '1', 12.50000, 0.00),
  ('66666666-6666-6666-6666-666666666607', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555502', 'B-21', 'APARTMENT', '2', 12.50000, 0.00),
  ('66666666-6666-6666-6666-666666666608', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555502', 'B-22', 'APARTMENT', '2', 12.50000, 0.00);

-- Asignar propietario a A-11
INSERT INTO unit_occupants (property_unit_id, user_id, role, is_primary_contact, is_billing_recipient)
VALUES 
  ('66666666-6666-6666-6666-666666666601', '33333333-3333-3333-3333-333333333304', 'OWNER', TRUE, TRUE);

-- 6. Cuentas Bancarias del Condominio (Venezuela)
INSERT INTO bank_accounts (
  id, condo_id, bank_code, bank_name, account_number, account_type, currency,
  account_holder_name, account_holder_rif, supports_pago_movil, pago_movil_phone, pago_movil_id_type, pago_movil_id_number
)
VALUES 
  (
    '77777777-7777-7777-7777-777777777701',
    '44444444-4444-4444-4444-444444444401',
    '0134',
    'Banesco Banco Universal',
    '01340001230001234567',
    'Corriente',
    'VES',
    'Condominio Res Parque El Ávila',
    'J-50123456-7',
    TRUE,
    '04141234567',
    'J',
    '501234567'
  ),
  (
    '77777777-7777-7777-7777-777777777702',
    '44444444-4444-4444-4444-444444444401',
    '0102',
    'Banco de Venezuela',
    '01020009870009876543',
    'Custodia Divisas',
    'USD',
    'Condominio Res Parque El Ávila',
    'J-50123456-7',
    FALSE,
    NULL,
    NULL,
    NULL
  );

-- 7. Categorías de Gastos y Proveedores
INSERT INTO expense_categories (id, tenant_id, condo_id, name, code)
VALUES 
  ('88888888-8888-8888-8888-888888888801', '22222222-2222-2222-2222-222222222201', '44444444-4444-4444-4444-444444444401', 'Mantenimiento de Ascensores', 'MANT-ASC'),
  ('88888888-8888-8888-8888-888888888802', '22222222-2222-2222-2222-222222222201', '44444444-4444-4444-4444-444444444401', 'Servicios Públicos (Luz y Agua)', 'SERV-PUB'),
  ('88888888-8888-8888-8888-888888888803', '22222222-2222-2222-2222-222222222201', '44444444-4444-4444-4444-444444444401', 'Nómina de Conserjería', 'NOM-CONS');

INSERT INTO suppliers (id, tenant_id, name, rif, phone, email)
VALUES 
  ('99999999-9999-9999-9999-999999999901', '22222222-2222-2222-2222-222222222201', 'Ascensores Schindler de Venezuela S.A.', 'J-00123987-1', '+582122001100', 'soporte@schindler.com.ve'),
  ('99999999-9999-9999-9999-999999999902', '22222222-2222-2222-2222-222222222201', 'Bombas e Hidroneumáticos Ávila C.A.', 'J-30456123-4', '+582123445566', 'ventas@bombasavila.com');

-- 8. Periodo de Cobro (Mes Actual) y Gastos
INSERT INTO billing_periods (
  id, condo_id, period_year, period_month, status, start_date, end_date,
  issue_date, due_date, bcv_exchange_rate, total_common_usd, reserve_fund_usd, grand_total_usd
)
VALUES 
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '44444444-4444-4444-4444-444444444401',
    EXTRACT(YEAR FROM CURRENT_DATE)::INT,
    EXTRACT(MONTH FROM CURRENT_DATE)::INT,
    'ISSUED',
    DATE_TRUNC('month', CURRENT_DATE)::DATE,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '10 days',
    36.8500,
    800.00,
    80.00,
    880.00
  );

-- Gastos cargados
INSERT INTO expenses (
  id, condo_id, billing_period_id, category_id, supplier_id, description,
  expense_date, expense_type, currency, amount_original, exchange_rate, amount_usd, amount_ves
)
VALUES 
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
    '44444444-4444-4444-4444-444444444401',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '88888888-8888-8888-8888-888888888801',
    '99999999-9999-9999-9999-999999999901',
    'Mantenimiento preventivo mensual 2 ascensores (Torres A y B)',
    CURRENT_DATE - INTERVAL '5 days',
    'COMMON',
    'USD',
    350.00,
    36.8500,
    350.00,
    12897.50
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
    '44444444-4444-4444-4444-444444444401',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '88888888-8888-8888-8888-888888888803',
    NULL,
    'Sueldo y bono de alimentación conserje Sr. Marcos',
    CURRENT_DATE - INTERVAL '3 days',
    'COMMON',
    'USD',
    450.00,
    36.8500,
    450.00,
    16582.50
  );

-- 9. Recibo Emitido para A-11 (Alícuota 12.5% -> $880 * 12.5% = $110 USD)
INSERT INTO condo_bills (
  id, condo_id, billing_period_id, property_unit_id, bill_number, aliquot_percentage,
  common_share_usd, reserve_fund_usd, total_due_usd, total_due_ves,
  exchange_rate_emission, remaining_balance_usd, status
)
VALUES 
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '44444444-4444-4444-4444-444444444401',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '66666666-6666-6666-6666-666666666601',
    'REC-2026-10-A11',
    12.50000,
    100.00,
    10.00,
    110.00,
    4053.50,
    36.8500,
    110.00,
    'UNPAID'
  );

-- 10. Amenidades del Condominio (Áreas Comunes)
INSERT INTO amenities (id, condo_id, name, description, capacity, fee_usd, deposit_usd)
VALUES 
  (
    'dddddddd-dddd-dddd-dddd-dddddddddd01',
    '44444444-4444-4444-4444-444444444401',
    'Salón de Fiesta Principal',
    'Salón climatizado con mesas, sillas y área de cocina básica',
    60,
    40.00,
    50.00
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddd02',
    '44444444-4444-4444-4444-444444444401',
    'Parrillera Terraza Torre A',
    'Área techada con parrillera a carbón y lavaplatos',
    25,
    15.00,
    20.00
  );
