/**
 * Motor Puro de Reglas de Reserva y Convivencia Comunitaria (`rules-engine.ts`).
 *
 * Totalmente desacoplado del tipo físico de espacio y sin efectos secundarios (I/O-free).
 * Resuelve los conflictos habituales en la convivencia comunitaria:
 *  1. Solvencia financiera (bloqueo configurable de unidades morosas).
 *  2. Días de la semana permitidos y horario operativo del espacio (`openTime` .. `closeTime`).
 *  3. Duración mínima/máxima por turno y modalidad (`HOURLY` vs `FULL_DAY`).
 *  4. Ventana de anticipación mínima (`minHoursNotice`) y máxima (`maxAdvanceDays`).
 *  5. Control de aforo máximo (`capacity`).
 *  6. Bloqueos administrativos por mantenimiento, fumigación o eventos (`blackouts`).
 *  7. Solapamiento de reservas incluyendo el colchón obligatorio de limpieza/entrega (`bufferMinutes`)
 *     y el cupo de reservas concurrentes (`maxConcurrentBookings`).
 *  8. Reglas de equidad vecinal (anti-acaparamiento):
 *     - Máximo de reservas futuras activas por inmueble (`maxActivePerUnit`).
 *     - Cuota máxima mensual por inmueble (`maxPerUnitPerMonth`).
 *     - Días mínimos de enfriamiento entre usos del mismo inmueble (`cooldownDays`).
 */

export interface SpaceRulesConfig {
  id: string;
  name: string;
  isActive: boolean;
  bookingMode: 'HOURLY' | 'FULL_DAY';
  approvalMode: 'AUTO_APPROVE' | 'ADMIN_APPROVAL';
  feeType: 'FREE' | 'FLAT_PER_BOOKING' | 'PER_HOUR';
  feeUsd: number;
  cleaningFeeUsd: number;
  depositUsd: number;
  capacity: number | null;
  openTime: string; // 'HH:MM' o 'HH:MM:SS'
  closeTime: string; // 'HH:MM' o 'HH:MM:SS'
  allowedDays: number[]; // 0=Dom, 1=Lun, ..., 6=Sáb
  minHoursNotice: number;
  minDurationMinutes: number;
  maxHoursPerSlot: number;
  maxAdvanceDays: number;
  bufferMinutes: number;
  maxConcurrentBookings: number;
  maxActivePerUnit: number;
  maxPerUnitPerMonth: number;
  cooldownDays: number;
  blockDelinquentUnits: boolean;
  maxAllowedDebtUsd: number;
}

export interface ExistingReservationSlot {
  id: string;
  propertyUnitId: string;
  reservationDate: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
}

export interface BlackoutWindow {
  id: string;
  title: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  reason?: string | null;
}

export interface ReservationEvaluationInput {
  moduleEnabled: boolean;
  space: SpaceRulesConfig;
  request: {
    propertyUnitId: string;
    reservationDate: string; // 'YYYY-MM-DD'
    startTime: string; // 'HH:MM'
    endTime: string; // 'HH:MM'
    guestCount?: number | null;
  };
  unitFinancials: {
    currentDebtUsd: number;
    hasOverdueBills: boolean;
    solvencyOverride?: boolean;
  };
  existingReservations: ExistingReservationSlot[];
  blackouts: BlackoutWindow[];
  now?: Date;
}

export interface RuleCheckItem {
  code:
    | 'MODULE_ACTIVE'
    | 'SPACE_ACTIVE'
    | 'UNIT_SOLVENCY'
    | 'ALLOWED_DAY'
    | 'OPERATING_HOURS'
    | 'DURATION_LIMITS'
    | 'ADVANCE_WINDOW'
    | 'CAPACITY_LIMIT'
    | 'NO_BLACKOUT'
    | 'SLOT_AVAILABILITY_AND_BUFFER'
    | 'UNIT_ACTIVE_QUOTA'
    | 'UNIT_MONTHLY_QUOTA'
    | 'UNIT_COOLDOWN';
  label: string;
  passed: boolean;
  message: string;
}

export interface ReservationPricing {
  durationMinutes: number;
  durationHours: number;
  feeAmountUsd: number;
  cleaningFeeUsd: number;
  depositAmountUsd: number;
  totalPayableUsd: number;
  requiresPayment: boolean;
}

export interface ReservationEvaluationResult {
  allowed: boolean;
  checks: RuleCheckItem[];
  violations: RuleCheckItem[];
  pricing: ReservationPricing;
  effectiveSlot: {
    reservationDate: string;
    startTime: string;
    endTime: string;
    bufferBeforeTime: string;
    bufferAfterTime: string;
  };
  initialStatus: 'APPROVED' | 'PENDING';
}

/** Convierte 'HH:MM' o 'HH:MM:SS' a minutos desde las 00:00. */
export function timeToMinutes(t: string): number {
  const parts = String(t || '00:00').trim().split(':');
  const h = Number(parts[0] || 0);
  const m = Number(parts[1] || 0);
  return h * 60 + m;
}

/** Convierte minutos desde las 00:00 a 'HH:MM'. */
export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
}

function daysBetweenDates(ymdA: string, ymdB: string): number {
  const a = parseLocalDate(ymdA).getTime();
  const b = parseLocalDate(ymdB).getTime();
  return Math.round(Math.abs(a - b) / (24 * 3600 * 1000));
}

export function evaluateReservationRules(
  input: ReservationEvaluationInput,
): ReservationEvaluationResult {
  const { moduleEnabled, space, request, unitFinancials, existingReservations, blackouts } = input;
  const now = input.now ?? new Date();
  const dateStr = request.reservationDate.slice(0, 10);

  // Si el espacio es FULL_DAY, el horario efectivo toma openTime .. closeTime
  const rawStart = space.bookingMode === 'FULL_DAY' ? space.openTime : request.startTime;
  const rawEnd = space.bookingMode === 'FULL_DAY' ? space.closeTime : request.endTime;

  const startMin = timeToMinutes(rawStart);
  const endMin = timeToMinutes(rawEnd);
  const openMin = timeToMinutes(space.openTime);
  const closeMin = timeToMinutes(space.closeTime);
  const durationMinutes = Math.max(0, endMin - startMin);
  const durationHours = round2(durationMinutes / 60);

  // Cálculo financiero desacoplado
  let feeAmountUsd = 0;
  if (space.feeType === 'FLAT_PER_BOOKING') {
    feeAmountUsd = round2(space.feeUsd);
  } else if (space.feeType === 'PER_HOUR') {
    feeAmountUsd = round2(space.feeUsd * (durationMinutes / 60));
  }
  const cleaningFeeUsd = round2(space.cleaningFeeUsd);
  const depositAmountUsd = round2(space.depositUsd);
  const totalPayableUsd = round2(feeAmountUsd + cleaningFeeUsd + depositAmountUsd);
  const requiresPayment = totalPayableUsd > 0;

  const checks: RuleCheckItem[] = [];

  // 1. Módulo y espacio activos
  checks.push({
    code: 'MODULE_ACTIVE',
    label: 'Módulo habilitado en el condominio',
    passed: moduleEnabled,
    message: moduleEnabled
      ? 'El módulo de reservas está activo en la residencia.'
      : 'El módulo de reserva de áreas comunes está deshabilitado en esta residencia.',
  });

  checks.push({
    code: 'SPACE_ACTIVE',
    label: 'Espacio habilitado para uso',
    passed: space.isActive,
    message: space.isActive
      ? `El espacio «${space.name}» se encuentra habilitado.`
      : `El espacio «${space.name}» está temporalmente fuera de servicio.`,
  });

  // 2. Solvencia financiera del inmueble (conflicto de morosidad)
  const debt = round2(unitFinancials.currentDebtUsd);
  const maxDebt = round2(space.maxAllowedDebtUsd);
  const isDelinquent = space.blockDelinquentUnits && (debt > maxDebt || (maxDebt === 0 && unitFinancials.hasOverdueBills));
  const solvencyPassed = !isDelinquent || Boolean(unitFinancials.solvencyOverride);
  checks.push({
    code: 'UNIT_SOLVENCY',
    label: 'Solvencia de condominio del inmueble',
    passed: solvencyPassed,
    message: solvencyPassed
      ? unitFinancials.solvencyOverride && isDelinquent
        ? 'Excepción administrativa de solvencia autorizada.'
        : 'Inmueble solvente conforme al reglamento del espacio.'
      : `Inmueble con saldo pendiente ($${debt.toFixed(2)} USD; máximo permitido: $${maxDebt.toFixed(
          2,
        )} USD). Debe estar solvente para reservar este espacio.`,
  });

  // 3. Día de la semana permitido
  const dayOfWeek = parseLocalDate(dateStr).getUTCDay();
  const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const allowedDays = Array.isArray(space.allowedDays) && space.allowedDays.length > 0 ? space.allowedDays : [0, 1, 2, 3, 4, 5, 6];
  const dayPassed = allowedDays.includes(dayOfWeek);
  checks.push({
    code: 'ALLOWED_DAY',
    label: 'Día de la semana habilitado',
    passed: dayPassed,
    message: dayPassed
      ? `${DAY_NAMES[dayOfWeek]} está habilitado para este espacio.`
      : `Este espacio no permite reservas los días ${DAY_NAMES[dayOfWeek]}.`,
  });

  // 4. Horario operativo
  const hoursValid = endMin > startMin && startMin >= openMin && endMin <= closeMin;
  checks.push({
    code: 'OPERATING_HOURS',
    label: 'Dentro del horario permitido',
    passed: hoursValid,
    message: hoursValid
      ? `Horario ${minutesToTime(startMin)}–${minutesToTime(endMin)} dentro de la franja operativa (${minutesToTime(
          openMin,
        )}–${minutesToTime(closeMin)}).`
      : `El horario solicitado (${minutesToTime(startMin)}–${minutesToTime(
          endMin,
        )}) está fuera del horario operativo del espacio (${minutesToTime(openMin)}–${minutesToTime(closeMin)}).`,
  });

  // 5. Duración mínima y máxima
  const maxDurationMin = space.bookingMode === 'FULL_DAY' ? closeMin - openMin : space.maxHoursPerSlot * 60;
  const minDurationMin = space.bookingMode === 'FULL_DAY' ? closeMin - openMin : space.minDurationMinutes;
  const durationPassed =
    endMin > startMin && durationMinutes >= minDurationMin && durationMinutes <= maxDurationMin;
  checks.push({
    code: 'DURATION_LIMITS',
    label: 'Duración del turno dentro del límite',
    passed: durationPassed,
    message: durationPassed
      ? `Duración de ${durationMinutes} min (${durationHours} h) válida.`
      : `La duración solicitada (${durationMinutes} min) debe estar entre ${minDurationMin} min y ${maxDurationMin} min (${
          maxDurationMin / 60
        } h).`,
  });

  // 6. Ventana de anticipación (mínima en horas y máxima en días)
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const startHr = Math.floor(startMin / 60);
  const startMn = startMin % 60;
  const slotStartDate = new Date(yr, (mo || 1) - 1, dy || 1, startHr, startMn, 0);
  const diffHours = (slotStartDate.getTime() - now.getTime()) / (3600 * 1000);
  const diffDays = diffHours / 24;
  const advancePassed = diffHours >= space.minHoursNotice && diffDays <= space.maxAdvanceDays;
  checks.push({
    code: 'ADVANCE_WINDOW',
    label: 'Anticipación de la reserva',
    passed: advancePassed,
    message: advancePassed
      ? `Solicitada con ${Math.max(0, Math.round(diffHours))} h de anticipación (válido).`
      : diffHours < space.minHoursNotice
      ? `Este espacio exige reservar con al menos ${space.minHoursNotice} hora(s) de anticipación.`
      : `No se puede reservar con más de ${space.maxAdvanceDays} días de anticipación.`,
  });

  // 7. Aforo máximo
  const guests = request.guestCount ?? 1;
  const capacityPassed = !space.capacity || guests <= space.capacity;
  checks.push({
    code: 'CAPACITY_LIMIT',
    label: 'Aforo máximo respetado',
    passed: capacityPassed,
    message: capacityPassed
      ? space.capacity
        ? `Aforo solicitado (${guests}) dentro de la capacidad máxima (${space.capacity} personas).`
        : 'Sin restricción de aforo específico.'
      : `La cantidad de asistentes (${guests}) supera el aforo máximo permitido del espacio (${space.capacity} personas).`,
  });

  // 8. Bloqueos administrativos por mantenimiento / eventos (Blackouts)
  const conflictingBlackout = blackouts.find((b) => {
    const bStart = b.startDate.slice(0, 10);
    const bEnd = b.endDate.slice(0, 10);
    if (dateStr < bStart || dateStr > bEnd) return false;
    const bStartMin = timeToMinutes(b.startTime || '00:00');
    const bEndMin = timeToMinutes(b.endTime || '23:59');
    return startMin < bEndMin && endMin > bStartMin;
  });
  checks.push({
    code: 'NO_BLACKOUT',
    label: 'Sin cierres por mantenimiento o eventos',
    passed: !conflictingBlackout,
    message: conflictingBlackout
      ? `El espacio tiene un bloqueo programado: «${conflictingBlackout.title}» (${minutesToTime(
          timeToMinutes(conflictingBlackout.startTime),
        )}–${minutesToTime(timeToMinutes(conflictingBlackout.endTime))}).`
      : 'No existen bloqueos de mantenimiento en la fecha y hora seleccionadas.',
  });

  // 9. Disponibilidad de horario + Colchón de limpieza/entrega (bufferMinutes) + concurrencia
  const activeReservationsSameDay = existingReservations.filter(
    (r) =>
      r.reservationDate.slice(0, 10) === dateStr &&
      (r.status === 'PENDING' || r.status === 'APPROVED' || r.status === 'COMPLETED'),
  );

  const buffer = Math.max(0, space.bufferMinutes || 0);
  const overlappingReservations = activeReservationsSameDay.filter((r) => {
    const rStart = timeToMinutes(r.startTime) - buffer;
    const rEnd = timeToMinutes(r.endTime) + buffer;
    return startMin < rEnd && endMin > rStart;
  });

  const maxConcurrent = Math.max(1, space.maxConcurrentBookings || 1);
  const slotAvailable = overlappingReservations.length < maxConcurrent;
  checks.push({
    code: 'SLOT_AVAILABILITY_AND_BUFFER',
    label: `Disponibilidad de turno y colchón de entrega (${buffer} min)`,
    passed: slotAvailable,
    message: slotAvailable
      ? `Turno disponible (${overlappingReservations.length}/${maxConcurrent} cupos ocupados; incluye ${buffer} min de colchón entre vecinos).`
      : `Conflicto de horario: se solapa con otra reserva activa o con los ${buffer} min obligatorios de limpieza/entrega entre vecinos.`,
  });

  // 10. Cuotas de equidad del inmueble (Anti-acaparamiento)
  const unitValidReservations = existingReservations.filter(
    (r) =>
      r.propertyUnitId === request.propertyUnitId &&
      (r.status === 'PENDING' || r.status === 'APPROVED' || r.status === 'COMPLETED'),
  );

  // 10a. Reservas activas futuras del inmueble
  const todayYmd = now.toISOString().slice(0, 10);
  const unitActiveFuture = unitValidReservations.filter(
    (r) =>
      (r.status === 'PENDING' || r.status === 'APPROVED') &&
      r.reservationDate.slice(0, 10) >= todayYmd,
  );
  const activeQuotaPassed = unitActiveFuture.length < space.maxActivePerUnit;
  checks.push({
    code: 'UNIT_ACTIVE_QUOTA',
    label: 'Límite de reservas activas simultáneas por inmueble',
    passed: activeQuotaPassed,
    message: activeQuotaPassed
      ? `El inmueble tiene ${unitActiveFuture.length} de ${space.maxActivePerUnit} reservas activas permitidas.`
      : `El inmueble ya alcanzó el máximo de ${space.maxActivePerUnit} reserva(s) activa(s) simultánea(s) para este espacio.`,
  });

  // 10b. Cuota mensual del inmueble
  const targetYearMonth = dateStr.slice(0, 7);
  const unitSameMonth = unitValidReservations.filter(
    (r) => r.reservationDate.slice(0, 7) === targetYearMonth,
  );
  const monthlyQuotaPassed = unitSameMonth.length < space.maxPerUnitPerMonth;
  checks.push({
    code: 'UNIT_MONTHLY_QUOTA',
    label: 'Cuota máxima mensual por inmueble',
    passed: monthlyQuotaPassed,
    message: monthlyQuotaPassed
      ? `Uso mensual del inmueble en ${targetYearMonth}: ${unitSameMonth.length} de ${space.maxPerUnitPerMonth} permitidos.`
      : `El inmueble alcanzó el límite equitativo de ${space.maxPerUnitPerMonth} reserva(s) en el mes (${targetYearMonth}) para este espacio.`,
  });

  // 10c. Días mínimos de enfriamiento (cooldownDays) entre usos del mismo inmueble
  const cooldown = Math.max(0, space.cooldownDays || 0);
  const tooCloseReservation =
    cooldown > 0
      ? unitValidReservations.find((r) => {
          const d = daysBetweenDates(r.reservationDate.slice(0, 10), dateStr);
          return d <= cooldown;
        })
      : undefined;
  const cooldownPassed = !tooCloseReservation;
  checks.push({
    code: 'UNIT_COOLDOWN',
    label: 'Período de rotación / enfriamiento entre reservas',
    passed: cooldownPassed,
    message: cooldownPassed
      ? cooldown > 0
        ? `Respeta los ${cooldown} día(s) de espera entre usos del mismo inmueble.`
        : 'Sin días de espera adicionales entre reservas.'
      : `Regla de rotación vecinal: deben transcurrir más de ${cooldown} día(s) respecto a la reserva del ${tooCloseReservation?.reservationDate.slice(
          0,
          10,
        )}.`,
  });

  const violations = checks.filter((c) => !c.passed);
  const allowed = violations.length === 0;
  const initialStatus =
    space.approvalMode === 'AUTO_APPROVE' && !requiresPayment ? 'APPROVED' : 'PENDING';

  return {
    allowed,
    checks,
    violations,
    pricing: {
      durationMinutes,
      durationHours,
      feeAmountUsd,
      cleaningFeeUsd,
      depositAmountUsd,
      totalPayableUsd,
      requiresPayment,
    },
    effectiveSlot: {
      reservationDate: dateStr,
      startTime: minutesToTime(startMin),
      endTime: minutesToTime(endMin),
      bufferBeforeTime: minutesToTime(Math.max(0, startMin - buffer)),
      bufferAfterTime: minutesToTime(Math.min(23 * 60 + 59, endMin + buffer)),
    },
    initialStatus,
  };
}
