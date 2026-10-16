import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluateReservationRules, SpaceRulesConfig } from './rules-engine';

const baseSpace: SpaceRulesConfig = {
  id: 'sp-1',
  name: 'Salón de Fiestas',
  isActive: true,
  bookingMode: 'HOURLY',
  approvalMode: 'ADMIN_APPROVAL',
  feeType: 'FLAT_PER_BOOKING',
  feeUsd: 50,
  cleaningFeeUsd: 15,
  depositUsd: 100,
  capacity: 60,
  openTime: '09:00',
  closeTime: '22:00',
  allowedDays: [1, 2, 3, 4, 5, 6, 0],
  minHoursNotice: 24,
  minDurationMinutes: 120,
  maxHoursPerSlot: 6,
  maxAdvanceDays: 60,
  bufferMinutes: 60,
  maxConcurrentBookings: 1,
  maxActivePerUnit: 2,
  maxPerUnitPerMonth: 2,
  cooldownDays: 3,
  blockDelinquentUnits: true,
  maxAllowedDebtUsd: 0,
};

const fixedNow = new Date(2026, 9, 16, 10, 0, 0); // 16 oct 2026 10:00

test('reserva válida cumple todas las reglas y calcula canon + limpieza + depósito', () => {
  const res = evaluateReservationRules({
    moduleEnabled: true,
    space: baseSpace,
    request: {
      propertyUnitId: 'u-1',
      reservationDate: '2026-10-20',
      startTime: '14:00',
      endTime: '18:00',
      guestCount: 40,
    },
    unitFinancials: { currentDebtUsd: 0, hasOverdueBills: false },
    existingReservations: [],
    blackouts: [],
    now: fixedNow,
  });

  assert.equal(res.allowed, true);
  assert.equal(res.violations.length, 0);
  assert.equal(res.pricing.feeAmountUsd, 50);
  assert.equal(res.pricing.cleaningFeeUsd, 15);
  assert.equal(res.pricing.depositAmountUsd, 100);
  assert.equal(res.pricing.totalPayableUsd, 165);
  assert.equal(res.initialStatus, 'PENDING');
});

test('bloquea inmueble moroso cuando blockDelinquentUnits está activo', () => {
  const res = evaluateReservationRules({
    moduleEnabled: true,
    space: baseSpace,
    request: {
      propertyUnitId: 'u-moroso',
      reservationDate: '2026-10-20',
      startTime: '14:00',
      endTime: '18:00',
      guestCount: 20,
    },
    unitFinancials: { currentDebtUsd: 85.5, hasOverdueBills: true },
    existingReservations: [],
    blackouts: [],
    now: fixedNow,
  });

  assert.equal(res.allowed, false);
  assert.ok(res.violations.some((v) => v.code === 'UNIT_SOLVENCY'));
});

test('detecta solapamiento incluyendo el colchón obligatorio de limpieza (bufferMinutes)', () => {
  // Reserva existente de 10:00 a 14:00 con buffer de 60 min -> bloquea hasta las 15:00
  const res = evaluateReservationRules({
    moduleEnabled: true,
    space: baseSpace,
    request: {
      propertyUnitId: 'u-2',
      reservationDate: '2026-10-20',
      startTime: '14:30',
      endTime: '18:00',
      guestCount: 25,
    },
    unitFinancials: { currentDebtUsd: 0, hasOverdueBills: false },
    existingReservations: [
      {
        id: 'r-1',
        propertyUnitId: 'u-1',
        reservationDate: '2026-10-20',
        startTime: '10:00',
        endTime: '14:00',
        status: 'APPROVED',
      },
    ],
    blackouts: [],
    now: fixedNow,
  });

  assert.equal(res.allowed, false);
  assert.ok(res.violations.some((v) => v.code === 'SLOT_AVAILABILITY_AND_BUFFER'));
});

test('aplica reglas anti-acaparamiento: cuota mensual y cooldown de rotación entre vecinos', () => {
  const res = evaluateReservationRules({
    moduleEnabled: true,
    space: baseSpace,
    request: {
      propertyUnitId: 'u-1',
      reservationDate: '2026-10-22',
      startTime: '14:00',
      endTime: '17:00',
    },
    unitFinancials: { currentDebtUsd: 0, hasOverdueBills: false },
    existingReservations: [
      {
        id: 'r-prev-1',
        propertyUnitId: 'u-1',
        reservationDate: '2026-10-05',
        startTime: '14:00',
        endTime: '17:00',
        status: 'COMPLETED',
      },
      {
        id: 'r-prev-2',
        propertyUnitId: 'u-1',
        reservationDate: '2026-10-20',
        startTime: '14:00',
        endTime: '17:00',
        status: 'APPROVED',
      },
    ],
    blackouts: [],
    now: fixedNow,
  });

  assert.equal(res.allowed, false);
  assert.ok(res.violations.some((v) => v.code === 'UNIT_MONTHLY_QUOTA'));
  assert.ok(res.violations.some((v) => v.code === 'UNIT_COOLDOWN'));
});

test('auto-aprueba reservas en espacios gratuitos con AUTO_APPROVE (ej. Cancha Deportiva)', () => {
  const courtSpace: SpaceRulesConfig = {
    ...baseSpace,
    name: 'Cancha de Pádel',
    approvalMode: 'AUTO_APPROVE',
    feeType: 'FREE',
    feeUsd: 0,
    cleaningFeeUsd: 0,
    depositUsd: 0,
    minDurationMinutes: 60,
    maxHoursPerSlot: 2,
  };

  const res = evaluateReservationRules({
    moduleEnabled: true,
    space: courtSpace,
    request: {
      propertyUnitId: 'u-1',
      reservationDate: '2026-10-20',
      startTime: '16:00',
      endTime: '17:30',
      guestCount: 4,
    },
    unitFinancials: { currentDebtUsd: 0, hasOverdueBills: false },
    existingReservations: [],
    blackouts: [],
    now: fixedNow,
  });

  assert.equal(res.allowed, true);
  assert.equal(res.initialStatus, 'APPROVED');
  assert.equal(res.pricing.totalPayableUsd, 0);
});
