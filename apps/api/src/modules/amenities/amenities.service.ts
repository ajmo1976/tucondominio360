import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Buffer } from 'buffer';
import { DatabaseService } from '../../database/database.service';
import {
  CancelReservationDto,
  CreateAmenitySpaceDto,
  CreateBlackoutDto,
  CreateReservationDto,
  EvaluateReservationDto,
  InspectReservationDto,
  RegisterReservationPaymentDto,
  UpdateAmenitiesConfigDto,
  UpdateAmenitySpaceDto,
  UpdateReservationStatusDto,
} from './dto/amenities.dto';
import {
  BlackoutWindow,
  ExistingReservationSlot,
  SpaceRulesConfig,
  evaluateReservationRules,
} from './rules-engine';
import { buildReservationVoucherPdf, buildReservationsReportPdf } from './pdf';

export interface AmenitiesModuleConfig {
  enabled: boolean;
  globalBlockDelinquentUnits: boolean;
  allowResidentCancellations: boolean;
  minHoursBeforeCancel: number;
}

const DEFAULT_AMENITIES_CONFIG: AmenitiesModuleConfig = {
  enabled: true,
  globalBlockDelinquentUnits: true,
  allowResidentCancellations: true,
  minHoursBeforeCancel: 12,
};

const STAFF_ROLES = [
  'ADMIN',
  'BOARD_PRESIDENT',
  'BOARD_TREASURER',
  'BOARD_MEMBER',
  'CONCIERGE',
  'AUDITOR',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidUuid(id: string | undefined | null, label = 'Identificador'): void {
  if (!id || !UUID_REGEX.test(id)) {
    throw new BadRequestException(`${label} inválido`);
  }
}

@Injectable()
export class AmenitiesService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Determina el alcance del usuario en el condominio:
   *  - Verifica pertenencia (si no pertenece → 403).
   *  - Devuelve `isStaff` y la lista de unidades (`units`) con su estado de solvencia real.
   */
  async resolveScope(user: any, condoId: string) {
    assertValidUuid(condoId, 'condoId');

    const condoRes = await this.db.query(
      `SELECT id, name, rif, code, settings FROM condos WHERE id = $1`,
      [condoId],
    );
    if (condoRes.rows.length === 0) {
      throw new NotFoundException('Residencia no encontrada');
    }
    const condo = condoRes.rows[0];

    let isStaff = Boolean(user.is_superadmin);
    let hasAccess = isStaff;

    if (!isStaff) {
      const roleRes = await this.db.query(
        `SELECT role FROM condo_user_access
         WHERE condo_id = $1 AND user_id = $2 AND is_active = TRUE`,
        [condoId, user.id],
      );
      if (roleRes.rows.length > 0) {
        hasAccess = true;
        isStaff = roleRes.rows.some((r) => STAFF_ROLES.includes(r.role));
      }
    }

    const unitsQuery = isStaff
      ? await this.db.query(
          `SELECT pu.id, pu.unit_code AS "unitCode", pu.floor,
                  pu.current_balance_usd::numeric(14,2) AS "currentBalanceUsd",
                  EXISTS (
                    SELECT 1 FROM condo_bills cb
                    WHERE cb.property_unit_id = pu.id
                      AND cb.status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')
                      AND (cb.total_amount_usd - cb.total_paid_usd) > 0.004
                  ) AS "hasOverdueBills",
                  COALESCE((
                    SELECT SUM(GREATEST(cb.total_amount_usd - cb.total_paid_usd, 0))
                    FROM condo_bills cb
                    WHERE cb.property_unit_id = pu.id
                      AND cb.status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')
                  ), 0)::numeric(14,2) AS "pendingBillsUsd"
           FROM property_units pu
           WHERE pu.condo_id = $1 AND pu.is_active = TRUE
           ORDER BY pu.unit_code ASC`,
          [condoId],
        )
      : await this.db.query(
          `SELECT DISTINCT pu.id, pu.unit_code AS "unitCode", pu.floor,
                  pu.current_balance_usd::numeric(14,2) AS "currentBalanceUsd",
                  EXISTS (
                    SELECT 1 FROM condo_bills cb
                    WHERE cb.property_unit_id = pu.id
                      AND cb.status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')
                      AND (cb.total_amount_usd - cb.total_paid_usd) > 0.004
                  ) AS "hasOverdueBills",
                  COALESCE((
                    SELECT SUM(GREATEST(cb.total_amount_usd - cb.total_paid_usd, 0))
                    FROM condo_bills cb
                    WHERE cb.property_unit_id = pu.id
                      AND cb.status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')
                  ), 0)::numeric(14,2) AS "pendingBillsUsd"
           FROM unit_occupants uo
           JOIN property_units pu ON pu.id = uo.property_unit_id
           WHERE pu.condo_id = $1 AND uo.user_id = $2 AND pu.is_active = TRUE
             AND (uo.valid_to IS NULL OR uo.valid_to >= CURRENT_DATE)
           ORDER BY pu.unit_code ASC`,
          [condoId, user.id],
        );

    if (!hasAccess && unitsQuery.rows.length === 0) {
      throw new ForbiddenException('No tienes acceso a esta residencia');
    }

    const units = unitsQuery.rows.map((u) => {
      const debt = Math.max(Number(u.currentBalanceUsd || 0), Number(u.pendingBillsUsd || 0));
      return {
        id: u.id,
        unitCode: u.unitCode,
        floor: u.floor,
        currentDebtUsd: Math.round(debt * 100) / 100,
        hasOverdueBills: Boolean(u.hasOverdueBills) || debt > 0.004,
      };
    });

    return {
      condo,
      isStaff,
      unitIds: units.map((u) => u.id),
      units,
    };
  }

  private readModuleConfig(condo: any): AmenitiesModuleConfig {
    const raw = condo.settings?.amenitiesConfig ?? {};
    return {
      ...DEFAULT_AMENITIES_CONFIG,
      ...raw,
    };
  }

  async getConfig(user: any, condoId: string): Promise<AmenitiesModuleConfig> {
    const { condo } = await this.resolveScope(user, condoId);
    return this.readModuleConfig(condo);
  }

  async updateConfig(user: any, dto: UpdateAmenitiesConfigDto): Promise<AmenitiesModuleConfig> {
    const { condo, isStaff } = await this.resolveScope(user, dto.condoId);
    if (!isStaff) {
      throw new ForbiddenException('Solo la administración puede configurar las políticas del módulo');
    }

    const current = this.readModuleConfig(condo);
    const updated: AmenitiesModuleConfig = {
      enabled: dto.enabled ?? current.enabled,
      globalBlockDelinquentUnits: dto.globalBlockDelinquentUnits ?? current.globalBlockDelinquentUnits,
      allowResidentCancellations: dto.allowResidentCancellations ?? current.allowResidentCancellations,
      minHoursBeforeCancel: dto.minHoursBeforeCancel ?? current.minHoursBeforeCancel,
    };

    await this.db.query(
      `UPDATE condos
       SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('amenitiesConfig', $2::jsonb),
           updated_at = NOW()
       WHERE id = $1`,
      [dto.condoId, JSON.stringify(updated)],
    );

    await this.writeAudit(dto.condoId, user.id, 'AMENITIES_CONFIG_UPDATED', 'condos', dto.condoId, updated);
    return updated;
  }

  /**
   * Si un condominio aún no tiene ningún espacio configurado, inicializa 4 espacios
   * modelo parametrizados (Salón de Fiestas, Parrillera, Cancha Deportiva y Ascensor de Mudanzas)
   * que demuestran el desacoplamiento físico del motor de reglas.
   */
  private async ensureDefaultSpacesIfEmpty(condoId: string) {
    const countRes = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM amenities WHERE condo_id = $1`,
      [condoId],
    );
    if (countRes.rows[0].count > 0) return;

    const defaults = [
      {
        name: 'Salón de Fiestas y Eventos Sociales',
        description:
          'Espacio social climatizado con cocina de apoyo, mobiliario base y baños privados para eventos familiares.',
        spaceCategory: 'SOCIAL_HALL',
        bookingMode: 'FULL_DAY',
        approvalMode: 'ADMIN_APPROVAL',
        feeType: 'FLAT_PER_BOOKING',
        capacity: 60,
        feeUsd: 50,
        cleaningFeeUsd: 15,
        depositUsd: 100,
        openTime: '10:00:00',
        closeTime: '22:00:00',
        allowedDays: [0, 5, 6], // Viernes, Sábado y Domingo
        minHoursNotice: 48,
        minDurationMinutes: 240,
        maxHoursPerSlot: 12,
        maxAdvanceDays: 90,
        bufferMinutes: 60,
        maxConcurrentBookings: 1,
        maxActivePerUnit: 1,
        maxPerUnitPerMonth: 1,
        cooldownDays: 14,
        blockDelinquentUnits: true,
        maxAllowedDebtUsd: 0,
        rules:
          'Volumen moderado a partir de las 9:00 PM. Prohibido el uso de pirotecnia o equipos de sonido industriales. El área debe entregarse libre de desechos.',
      },
      {
        name: 'Parrillera y Terraza Gourmet',
        description:
          'Área abierta equipada con parrillera de acero inoxidable, lavaplatos, mesón y pérgola techada.',
        spaceCategory: 'BBQ_GRILL',
        bookingMode: 'HOURLY',
        approvalMode: 'ADMIN_APPROVAL',
        feeType: 'FLAT_PER_BOOKING',
        capacity: 20,
        feeUsd: 20,
        cleaningFeeUsd: 10,
        depositUsd: 40,
        openTime: '11:00:00',
        closeTime: '21:00:00',
        allowedDays: [0, 1, 2, 3, 4, 5, 6],
        minHoursNotice: 24,
        minDurationMinutes: 180,
        maxHoursPerSlot: 6,
        maxAdvanceDays: 45,
        bufferMinutes: 45,
        maxConcurrentBookings: 1,
        maxActivePerUnit: 1,
        maxPerUnitPerMonth: 2,
        cooldownDays: 5,
        blockDelinquentUnits: true,
        maxAllowedDebtUsd: 0,
        rules:
          'Dejar la rejilla limpia tras el uso. Prohibido el uso de envases de vidrio fuera del área techada.',
      },
      {
        name: 'Cancha Deportiva / Usos Múltiples',
        description:
          'Cancha iluminada para práctica deportiva por turnos horarios. Uso gratuito con reserva equitativa.',
        spaceCategory: 'SPORTS_COURT',
        bookingMode: 'HOURLY',
        approvalMode: 'AUTO_APPROVE',
        feeType: 'FREE',
        capacity: 12,
        feeUsd: 0,
        cleaningFeeUsd: 0,
        depositUsd: 0,
        openTime: '07:00:00',
        closeTime: '21:00:00',
        allowedDays: [0, 1, 2, 3, 4, 5, 6],
        minHoursNotice: 1,
        minDurationMinutes: 60,
        maxHoursPerSlot: 2,
        maxAdvanceDays: 14,
        bufferMinutes: 15,
        maxConcurrentBookings: 1,
        maxActivePerUnit: 2,
        maxPerUnitPerMonth: 8,
        cooldownDays: 1,
        blockDelinquentUnits: true,
        maxAllowedDebtUsd: 0,
        rules:
          'Uso exclusivo con calzado deportivo de goma. Máximo 2 horas por turno para garantizar rotación vecinal.',
      },
      {
        name: 'Ascensor de Carga y Horario de Mudanzas',
        description:
          'Reserva exclusiva del ascensor de servicio con forro protector para mudanzas, ingreso de línea blanca o escombros.',
        spaceCategory: 'FREIGHT_ELEVATOR',
        bookingMode: 'HOURLY',
        approvalMode: 'ADMIN_APPROVAL',
        feeType: 'FREE',
        capacity: 6,
        feeUsd: 0,
        cleaningFeeUsd: 10,
        depositUsd: 80,
        openTime: '08:00:00',
        closeTime: '17:00:00',
        allowedDays: [1, 2, 3, 4, 5, 6], // Lunes a Sábado (Domingos prohibido por descanso vecinal)
        minHoursNotice: 24,
        minDurationMinutes: 120,
        maxHoursPerSlot: 4,
        maxAdvanceDays: 30,
        bufferMinutes: 30,
        maxConcurrentBookings: 1,
        maxActivePerUnit: 1,
        maxPerUnitPerMonth: 2,
        cooldownDays: 0,
        blockDelinquentUnits: false,
        maxAllowedDebtUsd: 500,
        rules:
          'Prohibidas las mudanzas los días domingo. Conserjería colocará las lonas protectoras antes de iniciar el turno.',
      },
    ];

    for (const sp of defaults) {
      await this.db.query(
        `INSERT INTO amenities (
           condo_id, name, description, space_category, booking_mode, approval_mode,
           fee_type, capacity, fee_usd, cleaning_fee_usd, deposit_usd,
           open_time, close_time, allowed_days, min_hours_notice, min_duration_minutes,
           max_hours_per_slot, max_advance_days, buffer_minutes, max_concurrent_bookings,
           max_active_per_unit, max_per_unit_per_month, cooldown_days,
           block_delinquent_units, max_allowed_debt_usd, rules
         )
         VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11,
           $12, $13, $14::jsonb, $15, $16,
           $17, $18, $19, $20,
           $21, $22, $23,
           $24, $25, $26
         )`,
        [
          condoId,
          sp.name,
          sp.description,
          sp.spaceCategory,
          sp.bookingMode,
          sp.approvalMode,
          sp.feeType,
          sp.capacity,
          sp.feeUsd,
          sp.cleaningFeeUsd,
          sp.depositUsd,
          sp.openTime,
          sp.closeTime,
          JSON.stringify(sp.allowedDays),
          sp.minHoursNotice,
          sp.minDurationMinutes,
          sp.maxHoursPerSlot,
          sp.maxAdvanceDays,
          sp.bufferMinutes,
          sp.maxConcurrentBookings,
          sp.maxActivePerUnit,
          sp.maxPerUnitPerMonth,
          sp.cooldownDays,
          sp.blockDelinquentUnits,
          sp.maxAllowedDebtUsd,
          sp.rules,
        ],
      );
    }
  }

  async getOverview(user: any, condoId: string) {
    const scope = await this.resolveScope(user, condoId);
    const config = this.readModuleConfig(scope.condo);
    await this.ensureDefaultSpacesIfEmpty(condoId);

    const spaces = await this.listSpaces(user, condoId);

    if (scope.isStaff) {
      const kpiRes = await this.db.query(
        `SELECT
           (SELECT COUNT(*)::int FROM amenities WHERE condo_id = $1 AND is_active = TRUE) AS "activeSpacesCount",
           (SELECT COUNT(*)::int FROM amenity_reservations WHERE condo_id = $1 AND status = 'PENDING') AS "pendingApprovalsCount",
           (SELECT COUNT(*)::int FROM amenity_reservations WHERE condo_id = $1 AND status = 'APPROVED' AND reservation_date >= CURRENT_DATE) AS "upcomingApprovedCount",
           (SELECT COALESCE(SUM(fee_amount_usd + cleaning_fee_usd), 0)::numeric(12,2) FROM amenity_reservations WHERE condo_id = $1 AND status IN ('APPROVED', 'COMPLETED')) AS "revenueConfirmedUsd",
           (SELECT COALESCE(SUM(deposit_amount_usd - deposit_refunded_usd - damage_deduction_usd), 0)::numeric(12,2) FROM amenity_reservations WHERE condo_id = $1 AND status IN ('APPROVED', 'COMPLETED') AND deposit_refunded = FALSE AND deposit_amount_usd > 0) AS "depositsInCustodyUsd"`,
        [condoId],
      );
      const row = kpiRes.rows[0];
      return {
        config,
        isStaff: true,
        units: scope.units,
        spaces,
        kpis: {
          activeSpacesCount: row.activeSpacesCount,
          pendingApprovalsCount: row.pendingApprovalsCount,
          upcomingApprovedCount: row.upcomingApprovedCount,
          revenueConfirmedUsd: Number(row.revenueConfirmedUsd || 0),
          depositsInCustodyUsd: Math.max(0, Number(row.depositsInCustodyUsd || 0)),
        },
      };
    }

    const unitIds = scope.unitIds;
    const ownerKpiRes =
      unitIds.length > 0
        ? await this.db.query(
            `SELECT
               (SELECT COUNT(*)::int FROM amenities WHERE condo_id = $1 AND is_active = TRUE) AS "activeSpacesCount",
               (SELECT COUNT(*)::int FROM amenity_reservations WHERE condo_id = $1 AND property_unit_id = ANY($2::uuid[]) AND status = 'PENDING') AS "pendingApprovalsCount",
               (SELECT COUNT(*)::int FROM amenity_reservations WHERE condo_id = $1 AND property_unit_id = ANY($2::uuid[]) AND status = 'APPROVED' AND reservation_date >= CURRENT_DATE) AS "upcomingApprovedCount",
               (SELECT COALESCE(SUM(fee_amount_usd + cleaning_fee_usd), 0)::numeric(12,2) FROM amenity_reservations WHERE condo_id = $1 AND property_unit_id = ANY($2::uuid[]) AND status IN ('APPROVED', 'COMPLETED')) AS "revenueConfirmedUsd",
               (SELECT COALESCE(SUM(deposit_amount_usd), 0)::numeric(12,2) FROM amenity_reservations WHERE condo_id = $1 AND property_unit_id = ANY($2::uuid[]) AND status IN ('APPROVED', 'COMPLETED') AND deposit_refunded = FALSE AND deposit_amount_usd > 0) AS "depositsInCustodyUsd"`,
            [condoId, unitIds],
          )
        : {
            rows: [
              {
                activeSpacesCount: spaces.filter((s) => s.isActive).length,
                pendingApprovalsCount: 0,
                upcomingApprovedCount: 0,
                revenueConfirmedUsd: 0,
                depositsInCustodyUsd: 0,
              },
            ],
          };

    const row = ownerKpiRes.rows[0];
    return {
      config,
      isStaff: false,
      units: scope.units,
      spaces,
      kpis: {
        activeSpacesCount: row.activeSpacesCount,
        pendingApprovalsCount: row.pendingApprovalsCount,
        upcomingApprovedCount: row.upcomingApprovedCount,
        revenueConfirmedUsd: Number(row.revenueConfirmedUsd || 0),
        depositsInCustodyUsd: Number(row.depositsInCustodyUsd || 0),
      },
    };
  }

  // ===========================================================================
  // 1. CATÁLOGO PARAMETRIZABLE DE ESPACIOS COMUNES (`amenities`)
  // ===========================================================================

  private mapSpaceRow(r: any): SpaceRulesConfig & Record<string, any> {
    return {
      id: r.id,
      condoId: r.condo_id,
      name: r.name,
      description: r.description,
      spaceCategory: r.space_category,
      bookingMode: r.booking_mode,
      approvalMode: r.approval_mode,
      feeType: r.fee_type,
      capacity: r.capacity !== null ? Number(r.capacity) : null,
      feeUsd: Number(r.fee_usd || 0),
      cleaningFeeUsd: Number(r.cleaning_fee_usd || 0),
      depositUsd: Number(r.deposit_usd || 0),
      openTime: String(r.open_time || '08:00').slice(0, 5),
      closeTime: String(r.close_time || '22:00').slice(0, 5),
      allowedDays: Array.isArray(r.allowed_days) ? r.allowed_days.map(Number) : [0, 1, 2, 3, 4, 5, 6],
      minHoursNotice: Number(r.min_hours_notice ?? 24),
      minDurationMinutes: Number(r.min_duration_minutes ?? 60),
      maxHoursPerSlot: Number(r.max_hours_per_slot ?? 6),
      maxAdvanceDays: Number(r.max_advance_days ?? 60),
      bufferMinutes: Number(r.buffer_minutes ?? 30),
      maxConcurrentBookings: Number(r.max_concurrent_bookings ?? 1),
      maxActivePerUnit: Number(r.max_active_per_unit ?? 2),
      maxPerUnitPerMonth: Number(r.max_per_unit_per_month ?? 4),
      cooldownDays: Number(r.cooldown_days ?? 0),
      blockDelinquentUnits: Boolean(r.block_delinquent_units),
      maxAllowedDebtUsd: Number(r.max_allowed_debt_usd || 0),
      isActive: Boolean(r.is_active),
      rules: r.rules,
    };
  }

  async listSpaces(user: any, condoId: string) {
    await this.resolveScope(user, condoId);
    const res = await this.db.query(
      `SELECT * FROM amenities WHERE condo_id = $1 ORDER BY is_active DESC, name ASC`,
      [condoId],
    );
    return res.rows.map((r) => this.mapSpaceRow(r));
  }

  async createSpace(user: any, dto: CreateAmenitySpaceDto) {
    const scope = await this.resolveScope(user, dto.condoId);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo la administración puede crear espacios comunes');
    }

    const res = await this.db.query(
      `INSERT INTO amenities (
         condo_id, name, description, space_category, booking_mode, approval_mode,
         fee_type, capacity, fee_usd, cleaning_fee_usd, deposit_usd,
         open_time, close_time, allowed_days, min_hours_notice, min_duration_minutes,
         max_hours_per_slot, max_advance_days, buffer_minutes, max_concurrent_bookings,
         max_active_per_unit, max_per_unit_per_month, cooldown_days,
         block_delinquent_units, max_allowed_debt_usd, is_active, rules
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14::jsonb, $15, $16,
         $17, $18, $19, $20,
         $21, $22, $23,
         $24, $25, $26, $27
       )
       RETURNING *`,
      [
        dto.condoId,
        dto.name.trim(),
        dto.description?.trim() || null,
        dto.spaceCategory || 'SOCIAL_HALL',
        dto.bookingMode || 'HOURLY',
        dto.approvalMode || 'ADMIN_APPROVAL',
        dto.feeType || 'FLAT_PER_BOOKING',
        dto.capacity ?? null,
        dto.feeUsd ?? 0,
        dto.cleaningFeeUsd ?? 0,
        dto.depositUsd ?? 0,
        dto.openTime || '08:00:00',
        dto.closeTime || '22:00:00',
        JSON.stringify(dto.allowedDays ?? [0, 1, 2, 3, 4, 5, 6]),
        dto.minHoursNotice ?? 24,
        dto.minDurationMinutes ?? 60,
        dto.maxHoursPerSlot ?? 6,
        dto.maxAdvanceDays ?? 60,
        dto.bufferMinutes ?? 30,
        dto.maxConcurrentBookings ?? 1,
        dto.maxActivePerUnit ?? 2,
        dto.maxPerUnitPerMonth ?? 4,
        dto.cooldownDays ?? 0,
        dto.blockDelinquentUnits ?? true,
        dto.maxAllowedDebtUsd ?? 0,
        dto.isActive ?? true,
        dto.rules?.trim() || null,
      ],
    );

    const space = this.mapSpaceRow(res.rows[0]);
    await this.writeAudit(dto.condoId, user.id, 'AMENITY_SPACE_CREATED', 'amenities', space.id, {
      name: space.name,
      spaceCategory: space.spaceCategory,
    });
    return space;
  }

  async updateSpace(user: any, id: string, dto: Partial<UpdateAmenitySpaceDto>) {
    assertValidUuid(id, 'ID de espacio');
    const existingRes = await this.db.query(`SELECT * FROM amenities WHERE id = $1`, [id]);
    if (existingRes.rows.length === 0) throw new NotFoundException('Espacio común no encontrado');
    const cur = this.mapSpaceRow(existingRes.rows[0]);

    const scope = await this.resolveScope(user, cur.condoId);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo la administración puede modificar espacios comunes');
    }

    const res = await this.db.query(
      `UPDATE amenities
       SET name = $2,
           description = $3,
           space_category = $4,
           booking_mode = $5,
           approval_mode = $6,
           fee_type = $7,
           capacity = $8,
           fee_usd = $9,
           cleaning_fee_usd = $10,
           deposit_usd = $11,
           open_time = $12,
           close_time = $13,
           allowed_days = $14::jsonb,
           min_hours_notice = $15,
           min_duration_minutes = $16,
           max_hours_per_slot = $17,
           max_advance_days = $18,
           buffer_minutes = $19,
           max_concurrent_bookings = $20,
           max_active_per_unit = $21,
           max_per_unit_per_month = $22,
           cooldown_days = $23,
           block_delinquent_units = $24,
           max_allowed_debt_usd = $25,
           is_active = $26,
           rules = $27,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        dto.name !== undefined ? dto.name.trim() : cur.name,
        dto.description !== undefined ? dto.description?.trim() || null : cur.description,
        dto.spaceCategory ?? cur.spaceCategory,
        dto.bookingMode ?? cur.bookingMode,
        dto.approvalMode ?? cur.approvalMode,
        dto.feeType ?? cur.feeType,
        dto.capacity !== undefined ? dto.capacity : cur.capacity,
        dto.feeUsd ?? cur.feeUsd,
        dto.cleaningFeeUsd ?? cur.cleaningFeeUsd,
        dto.depositUsd ?? cur.depositUsd,
        dto.openTime ?? cur.openTime,
        dto.closeTime ?? cur.closeTime,
        JSON.stringify(dto.allowedDays ?? cur.allowedDays),
        dto.minHoursNotice ?? cur.minHoursNotice,
        dto.minDurationMinutes ?? cur.minDurationMinutes,
        dto.maxHoursPerSlot ?? cur.maxHoursPerSlot,
        dto.maxAdvanceDays ?? cur.maxAdvanceDays,
        dto.bufferMinutes ?? cur.bufferMinutes,
        dto.maxConcurrentBookings ?? cur.maxConcurrentBookings,
        dto.maxActivePerUnit ?? cur.maxActivePerUnit,
        dto.maxPerUnitPerMonth ?? cur.maxPerUnitPerMonth,
        dto.cooldownDays ?? cur.cooldownDays,
        dto.blockDelinquentUnits !== undefined ? dto.blockDelinquentUnits : cur.blockDelinquentUnits,
        dto.maxAllowedDebtUsd ?? cur.maxAllowedDebtUsd,
        dto.isActive !== undefined ? dto.isActive : cur.isActive,
        dto.rules !== undefined ? dto.rules?.trim() || null : cur.rules,
      ],
    );

    const updated = this.mapSpaceRow(res.rows[0]);
    await this.writeAudit(cur.condoId, user.id, 'AMENITY_SPACE_UPDATED', 'amenities', id, {
      name: updated.name,
      isActive: updated.isActive,
    });
    return updated;
  }

  async deleteSpace(user: any, id: string) {
    assertValidUuid(id, 'ID de espacio');
    const existingRes = await this.db.query(`SELECT id, condo_id, name FROM amenities WHERE id = $1`, [id]);
    if (existingRes.rows.length === 0) throw new NotFoundException('Espacio común no encontrado');
    const cur = existingRes.rows[0];

    const scope = await this.resolveScope(user, cur.condo_id);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo la administración puede eliminar espacios comunes');
    }

    await this.db.query(`DELETE FROM amenities WHERE id = $1`, [id]);
    await this.writeAudit(cur.condo_id, user.id, 'AMENITY_SPACE_DELETED', 'amenities', id, { name: cur.name });
    return { ok: true };
  }

  // ===========================================================================
  // 2. BLOQUEOS POR MANTENIMIENTO / EVENTOS (`amenity_blackouts`)
  // ===========================================================================

  async listBlackouts(user: any, condoId: string, amenityId?: string) {
    await this.resolveScope(user, condoId);
    const params: any[] = [condoId];
    let filterSql = '';
    if (amenityId) {
      assertValidUuid(amenityId, 'amenityId');
      params.push(amenityId);
      filterSql = `AND b.amenity_id = $2`;
    }

    const res = await this.db.query(
      `SELECT b.id, b.condo_id AS "condoId", b.amenity_id AS "amenityId",
              a.name AS "amenityName", b.title,
              b.start_date::text AS "startDate", b.end_date::text AS "endDate",
              b.start_time::text AS "startTime", b.end_time::text AS "endTime",
              b.reason, b.created_at AS "createdAt"
       FROM amenity_blackouts b
       JOIN amenities a ON a.id = b.amenity_id
       WHERE b.condo_id = $1 ${filterSql}
       ORDER BY b.start_date DESC, b.start_time ASC`,
      params,
    );
    return res.rows;
  }

  async createBlackout(user: any, dto: CreateBlackoutDto) {
    const scope = await this.resolveScope(user, dto.condoId);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo la administración puede programar cierres por mantenimiento');
    }

    const res = await this.db.query(
      `INSERT INTO amenity_blackouts (
         condo_id, amenity_id, title, start_date, end_date, start_time, end_time, reason, created_by_user_id
       )
       VALUES ($1, $2, $3, $4::date, $5::date, $6::time, $7::time, $8, $9)
       RETURNING id, title, start_date::text AS "startDate", end_date::text AS "endDate"`,
      [
        dto.condoId,
        dto.amenityId,
        dto.title.trim(),
        dto.startDate.slice(0, 10),
        dto.endDate.slice(0, 10),
        dto.startTime || '00:00:00',
        dto.endTime || '23:59:00',
        dto.reason?.trim() || null,
        user.id,
      ],
    );

    await this.writeAudit(dto.condoId, user.id, 'AMENITY_BLACKOUT_CREATED', 'amenity_blackouts', res.rows[0].id, {
      title: dto.title,
      amenityId: dto.amenityId,
    });
    return res.rows[0];
  }

  async deleteBlackout(user: any, id: string) {
    assertValidUuid(id, 'ID de bloqueo');
    const existing = await this.db.query(`SELECT id, condo_id, title FROM amenity_blackouts WHERE id = $1`, [id]);
    if (existing.rows.length === 0) throw new NotFoundException('Bloqueo no encontrado');
    const scope = await this.resolveScope(user, existing.rows[0].condo_id);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo la administración puede eliminar bloqueos de mantenimiento');
    }

    await this.db.query(`DELETE FROM amenity_blackouts WHERE id = $1`, [id]);
    return { ok: true };
  }

  // ===========================================================================
  // 3. MOTOR DE EVALUACIÓN Y CREACIÓN TRANSACCIONAL DE RESERVAS
  // ===========================================================================

  async evaluateReservation(user: any, dto: EvaluateReservationDto) {
    const scope = await this.resolveScope(user, dto.condoId);
    const config = this.readModuleConfig(scope.condo);

    if (!scope.isStaff && !scope.unitIds.includes(dto.propertyUnitId)) {
      throw new ForbiddenException('Solo puedes evaluar o solicitar reservas para tus propios inmuebles');
    }

    const spaceRes = await this.db.query(
      `SELECT * FROM amenities WHERE id = $1 AND condo_id = $2`,
      [dto.amenityId, dto.condoId],
    );
    if (spaceRes.rows.length === 0) {
      throw new NotFoundException('Espacio común no encontrado en esta residencia');
    }
    const space = this.mapSpaceRow(spaceRes.rows[0]);
    if (!config.globalBlockDelinquentUnits) {
      space.blockDelinquentUnits = false;
    }

    const unitInfo = scope.units.find((u) => u.id === dto.propertyUnitId);
    if (!unitInfo) {
      throw new BadRequestException('Inmueble no encontrado o inactivo en la residencia');
    }

    const [resRows, blackoutRows] = await Promise.all([
      this.db.query(
        `SELECT id, property_unit_id AS "propertyUnitId",
                reservation_date::text AS "reservationDate",
                start_time::text AS "startTime",
                end_time::text AS "endTime",
                status
         FROM amenity_reservations
         WHERE amenity_id = $1 AND status IN ('PENDING', 'APPROVED', 'COMPLETED')`,
        [dto.amenityId],
      ),
      this.db.query(
        `SELECT id, title, start_date::text AS "startDate", end_date::text AS "endDate",
                start_time::text AS "startTime", end_time::text AS "endTime", reason
         FROM amenity_blackouts
         WHERE amenity_id = $1`,
        [dto.amenityId],
      ),
    ]);

    return evaluateReservationRules({
      moduleEnabled: config.enabled,
      space,
      request: {
        propertyUnitId: dto.propertyUnitId,
        reservationDate: dto.reservationDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        guestCount: dto.guestCount,
      },
      unitFinancials: {
        currentDebtUsd: unitInfo.currentDebtUsd,
        hasOverdueBills: unitInfo.hasOverdueBills,
        solvencyOverride: scope.isStaff && Boolean(dto.solvencyOverride),
      },
      existingReservations: resRows.rows as ExistingReservationSlot[],
      blackouts: blackoutRows.rows as BlackoutWindow[],
    });
  }

  async createReservation(user: any, dto: CreateReservationDto) {
    const scope = await this.resolveScope(user, dto.condoId);
    const config = this.readModuleConfig(scope.condo);

    if (!scope.isStaff && !scope.unitIds.includes(dto.propertyUnitId)) {
      throw new ForbiddenException('No estás autorizado para reservar en nombre de un inmueble ajeno');
    }

    const unitInfo = scope.units.find((u) => u.id === dto.propertyUnitId);
    if (!unitInfo) {
      throw new BadRequestException('Inmueble no válido');
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      // Bloquear fila del espacio para serializar solicitudes concurrentes sobre el mismo turno
      const spaceRes = await client.query(
        `SELECT * FROM amenities WHERE id = $1 AND condo_id = $2 FOR UPDATE`,
        [dto.amenityId, dto.condoId],
      );
      if (spaceRes.rows.length === 0) {
        throw new NotFoundException('Espacio común no encontrado');
      }
      const space = this.mapSpaceRow(spaceRes.rows[0]);
      if (!config.globalBlockDelinquentUnits) {
        space.blockDelinquentUnits = false;
      }

      const existingRes = await client.query(
        `SELECT id, property_unit_id AS "propertyUnitId",
                reservation_date::text AS "reservationDate",
                start_time::text AS "startTime",
                end_time::text AS "endTime",
                status
         FROM amenity_reservations
         WHERE amenity_id = $1 AND status IN ('PENDING', 'APPROVED', 'COMPLETED')`,
        [dto.amenityId],
      );

      const blackoutsRes = await client.query(
        `SELECT id, title, start_date::text AS "startDate", end_date::text AS "endDate",
                start_time::text AS "startTime", end_time::text AS "endTime", reason
         FROM amenity_blackouts
         WHERE amenity_id = $1`,
        [dto.amenityId],
      );

      const evaluation = evaluateReservationRules({
        moduleEnabled: config.enabled,
        space,
        request: {
          propertyUnitId: dto.propertyUnitId,
          reservationDate: dto.reservationDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          guestCount: dto.guestCount,
        },
        unitFinancials: {
          currentDebtUsd: unitInfo.currentDebtUsd,
          hasOverdueBills: unitInfo.hasOverdueBills,
          solvencyOverride: scope.isStaff && Boolean(dto.solvencyOverride),
        },
        existingReservations: existingRes.rows as ExistingReservationSlot[],
        blackouts: blackoutsRes.rows as BlackoutWindow[],
      });

      if (!evaluation.allowed) {
        const reasons = evaluation.violations.map((v) => v.message).join(' · ');
        throw new ConflictException(`Conflicto en reglas de convivencia: ${reasons}`);
      }

      const codePrefix = (scope.condo.code || 'COND').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      const ym = dto.reservationDate.slice(0, 7).replace('-', '');
      const shortHex = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
      const reservationCode = `RES-${codePrefix}-${ym}-${shortHex}`;

      const { pricing, effectiveSlot, initialStatus } = evaluation;
      const paymentStatus = !pricing.requiresPayment
        ? 'NOT_REQUIRED'
        : dto.paymentReference
        ? 'PENDING'
        : 'PENDING';

      const insertRes = await client.query(
        `INSERT INTO amenity_reservations (
           condo_id, amenity_id, property_unit_id, requested_by_user_id,
           reservation_code, event_title, event_description,
           reservation_date, start_time, end_time, guest_count,
           status, fee_amount_usd, cleaning_fee_usd, deposit_amount_usd, total_amount_usd,
           payment_status, payment_reference, payment_method,
           approved_by_user_id, approved_at, solvency_override
         )
         VALUES (
           $1, $2, $3, $4,
           $5, $6, $7,
           $8::date, $9::time, $10::time, $11,
           $12, $13, $14, $15, $16,
           $17, $18, $19,
           $20, $21, $22
         )
         RETURNING id, reservation_code AS "reservationCode", status, total_amount_usd AS "totalAmountUsd"`,
        [
          dto.condoId,
          dto.amenityId,
          dto.propertyUnitId,
          user.id,
          reservationCode,
          dto.eventTitle.trim(),
          dto.eventDescription?.trim() || null,
          effectiveSlot.reservationDate,
          effectiveSlot.startTime,
          effectiveSlot.endTime,
          dto.guestCount ?? 1,
          initialStatus,
          pricing.feeAmountUsd,
          pricing.cleaningFeeUsd,
          pricing.depositAmountUsd,
          pricing.totalPayableUsd,
          paymentStatus,
          dto.paymentReference?.trim() || null,
          dto.paymentMethod?.trim() || null,
          initialStatus === 'APPROVED' ? user.id : null,
          initialStatus === 'APPROVED' ? new Date().toISOString() : null,
          Boolean(scope.isStaff && dto.solvencyOverride),
        ],
      );

      await client.query(
        `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
         VALUES ($1, $2, 'AMENITY_RESERVATION_CREATED', 'amenity_reservations', $3, $4::jsonb)`,
        [
          dto.condoId,
          user.id,
          insertRes.rows[0].id,
          JSON.stringify({
            reservationCode,
            amenityId: dto.amenityId,
            propertyUnitId: dto.propertyUnitId,
            status: initialStatus,
            totalAmountUsd: pricing.totalPayableUsd,
          }),
        ],
      );

      await client.query('COMMIT');
      return {
        ...insertRes.rows[0],
        pricing,
        effectiveSlot,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listReservations(
    user: any,
    condoId: string,
    filters: { amenityId?: string; status?: string; from?: string; to?: string; q?: string } = {},
  ) {
    const scope = await this.resolveScope(user, condoId);
    if (!scope.isStaff && scope.unitIds.length === 0) return [];

    const params: any[] = [condoId];
    const where: string[] = [`ar.condo_id = $1`];

    if (!scope.isStaff) {
      params.push(scope.unitIds);
      where.push(`ar.property_unit_id = ANY($${params.length}::uuid[])`);
    }

    if (filters.amenityId && filters.amenityId !== 'ALL') {
      assertValidUuid(filters.amenityId, 'amenityId');
      params.push(filters.amenityId);
      where.push(`ar.amenity_id = $${params.length}`);
    }

    if (filters.status && filters.status !== 'ALL') {
      params.push(filters.status);
      where.push(`ar.status = $${params.length}`);
    }

    if (filters.from) {
      params.push(filters.from.slice(0, 10));
      where.push(`ar.reservation_date >= $${params.length}::date`);
    }

    if (filters.to) {
      params.push(filters.to.slice(0, 10));
      where.push(`ar.reservation_date <= $${params.length}::date`);
    }

    if (filters.q && filters.q.trim()) {
      params.push(`%${filters.q.trim()}%`);
      const idx = params.length;
      where.push(
        `(ar.reservation_code ILIKE $${idx} OR ar.event_title ILIKE $${idx} OR a.name ILIKE $${idx} OR pu.unit_code ILIKE $${idx})`,
      );
    }

    const res = await this.db.query(
      `SELECT ar.id, ar.condo_id AS "condoId", ar.amenity_id AS "amenityId",
              a.name AS "amenityName", a.space_category AS "spaceCategory",
              a.buffer_minutes AS "bufferMinutes",
              ar.property_unit_id AS "propertyUnitId", pu.unit_code AS "unitCode",
              CONCAT(u.first_name, ' ', u.last_name) AS "requestedByName",
              ar.reservation_code AS "reservationCode",
              ar.event_title AS "eventTitle",
              ar.event_description AS "eventDescription",
              ar.reservation_date::text AS "reservationDate",
              ar.start_time::text AS "startTime",
              ar.end_time::text AS "endTime",
              ar.guest_count AS "guestCount",
              ar.status,
              ar.fee_amount_usd::numeric(10,2) AS "feeAmountUsd",
              ar.cleaning_fee_usd::numeric(10,2) AS "cleaningFeeUsd",
              ar.deposit_amount_usd::numeric(10,2) AS "depositAmountUsd",
              ar.total_amount_usd::numeric(10,2) AS "totalAmountUsd",
              ar.payment_status AS "paymentStatus",
              ar.payment_reference AS "paymentReference",
              ar.payment_method AS "paymentMethod",
              ar.inspection_status AS "inspectionStatus",
              ar.inspection_notes AS "inspectionNotes",
              ar.damage_deduction_usd::numeric(10,2) AS "damageDeductionUsd",
              ar.deposit_refunded_usd::numeric(10,2) AS "depositRefundedUsd",
              ar.deposit_refunded AS "depositRefunded",
              ar.admin_notes AS "adminNotes",
              ar.cancel_reason AS "cancelReason",
              ar.created_at AS "createdAt"
       FROM amenity_reservations ar
       JOIN amenities a ON a.id = ar.amenity_id
       JOIN property_units pu ON pu.id = ar.property_unit_id
       JOIN users u ON u.id = ar.requested_by_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY ar.reservation_date DESC, ar.start_time DESC
       LIMIT 150`,
      params,
    );

    return res.rows.map((r) => ({
      ...r,
      startTime: String(r.startTime).slice(0, 5),
      endTime: String(r.endTime).slice(0, 5),
      feeAmountUsd: Number(r.feeAmountUsd || 0),
      cleaningFeeUsd: Number(r.cleaningFeeUsd || 0),
      depositAmountUsd: Number(r.depositAmountUsd || 0),
      totalAmountUsd: Number(r.totalAmountUsd || 0),
      damageDeductionUsd: Number(r.damageDeductionUsd || 0),
      depositRefundedUsd: Number(r.depositRefundedUsd || 0),
    }));
  }

  async updateReservationStatus(user: any, id: string, dto: UpdateReservationStatusDto) {
    assertValidUuid(id, 'ID de reserva');
    const existingRes = await this.db.query(
      `SELECT id, condo_id, reservation_code, status, total_amount_usd, payment_status
       FROM amenity_reservations WHERE id = $1`,
      [id],
    );
    if (existingRes.rows.length === 0) throw new NotFoundException('Reserva no encontrada');
    const r = existingRes.rows[0];

    const scope = await this.resolveScope(user, r.condo_id);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo la administración puede aprobar, rechazar o concluir reservas');
    }

    const nextPaymentStatus =
      dto.status === 'APPROVED' && Number(r.total_amount_usd) > 0 ? 'VERIFIED' : r.payment_status;

    const res = await this.db.query(
      `UPDATE amenity_reservations
       SET status = $2,
           payment_status = $3,
           approved_by_user_id = $4,
           approved_at = NOW(),
           admin_notes = COALESCE($5, admin_notes)
       WHERE id = $1
       RETURNING id, status, payment_status AS "paymentStatus"`,
      [id, dto.status, nextPaymentStatus, user.id, dto.adminNotes?.trim() || null],
    );

    await this.writeAudit(r.condo_id, user.id, `AMENITY_RESERVATION_${dto.status}`, 'amenity_reservations', id, {
      reservationCode: r.reservation_code,
      status: dto.status,
    });
    return res.rows[0];
  }

  async cancelReservation(user: any, id: string, dto: CancelReservationDto) {
    assertValidUuid(id, 'ID de reserva');
    const existingRes = await this.db.query(
      `SELECT id, condo_id, property_unit_id, reservation_code, status, reservation_date, start_time
       FROM amenity_reservations WHERE id = $1`,
      [id],
    );
    if (existingRes.rows.length === 0) throw new NotFoundException('Reserva no encontrada');
    const r = existingRes.rows[0];

    const scope = await this.resolveScope(user, r.condo_id);
    if (!scope.isStaff && !scope.unitIds.includes(r.property_unit_id)) {
      throw new ForbiddenException('No tienes permiso para cancelar esta reserva');
    }

    if (r.status === 'CANCELLED' || r.status === 'COMPLETED' || r.status === 'REJECTED') {
      throw new BadRequestException('Esta reserva ya no puede ser cancelada');
    }

    await this.db.query(
      `UPDATE amenity_reservations
       SET status = 'CANCELLED',
           cancelled_at = NOW(),
           cancel_reason = $2
       WHERE id = $1`,
      [id, dto.reason?.trim() || 'Cancelada por el usuario'],
    );

    await this.writeAudit(r.condo_id, user.id, 'AMENITY_RESERVATION_CANCELLED', 'amenity_reservations', id, {
      reservationCode: r.reservation_code,
      reason: dto.reason,
    });
    return { ok: true };
  }

  async registerPayment(user: any, id: string, dto: RegisterReservationPaymentDto) {
    assertValidUuid(id, 'ID de reserva');
    const existingRes = await this.db.query(
      `SELECT id, condo_id, property_unit_id, reservation_code FROM amenity_reservations WHERE id = $1`,
      [id],
    );
    if (existingRes.rows.length === 0) throw new NotFoundException('Reserva no encontrada');
    const r = existingRes.rows[0];

    const scope = await this.resolveScope(user, r.condo_id);
    if (!scope.isStaff && !scope.unitIds.includes(r.property_unit_id)) {
      throw new ForbiddenException('No tienes permiso para reportar pago en esta reserva');
    }

    const nextPaymentStatus = scope.isStaff && dto.verifyImmediately ? 'VERIFIED' : 'PENDING';
    const res = await this.db.query(
      `UPDATE amenity_reservations
       SET payment_reference = $2,
           payment_method = $3,
           payment_status = $4
       WHERE id = $1
       RETURNING id, payment_status AS "paymentStatus", payment_reference AS "paymentReference"`,
      [id, dto.paymentReference.trim(), dto.paymentMethod.trim(), nextPaymentStatus],
    );

    await this.writeAudit(r.condo_id, user.id, 'AMENITY_PAYMENT_REGISTERED', 'amenity_reservations', id, {
      reservationCode: r.reservation_code,
      paymentReference: dto.paymentReference,
      paymentStatus: nextPaymentStatus,
    });
    return res.rows[0];
  }

  /**
   * Registra la inspección post-evento y liquida el depósito en garantía:
   *  - Calcula automáticamente el monto reintegrado (`deposit_amount_usd - damage_deduction_usd`).
   */
  async inspectAndSettleDeposit(user: any, id: string, dto: InspectReservationDto) {
    assertValidUuid(id, 'ID de reserva');
    const existingRes = await this.db.query(
      `SELECT id, condo_id, reservation_code, deposit_amount_usd, status
       FROM amenity_reservations WHERE id = $1`,
      [id],
    );
    if (existingRes.rows.length === 0) throw new NotFoundException('Reserva no encontrada');
    const r = existingRes.rows[0];

    const scope = await this.resolveScope(user, r.condo_id);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo la administración puede registrar la inspección y liquidar la garantía');
    }

    const deposit = Number(r.deposit_amount_usd || 0);
    const deduction = Math.min(deposit, Math.max(0, Number(dto.damageDeductionUsd || 0)));
    const refundedAmount = Math.round(Math.max(0, deposit - deduction) * 100) / 100;
    const isRefunded = dto.depositRefunded ?? (dto.inspectionStatus === 'CLEAN_OK' || refundedAmount >= 0);

    const res = await this.db.query(
      `UPDATE amenity_reservations
       SET status = CASE WHEN status = 'APPROVED' THEN 'COMPLETED'::reservation_status ELSE status END,
           inspection_status = $2,
           damage_deduction_usd = $3,
           deposit_refunded_usd = $4,
           deposit_refunded = $5,
           inspection_notes = $6,
           inspected_at = NOW(),
           inspected_by_user_id = $7
       WHERE id = $1
       RETURNING id, status, inspection_status AS "inspectionStatus",
                 damage_deduction_usd AS "damageDeductionUsd",
                 deposit_refunded_usd AS "depositRefundedUsd",
                 deposit_refunded AS "depositRefunded"`,
      [
        id,
        dto.inspectionStatus,
        deduction,
        refundedAmount,
        isRefunded,
        dto.inspectionNotes?.trim() || null,
        user.id,
      ],
    );

    await this.writeAudit(r.condo_id, user.id, 'AMENITY_RESERVATION_INSPECTED', 'amenity_reservations', id, {
      reservationCode: r.reservation_code,
      inspectionStatus: dto.inspectionStatus,
      damageDeductionUsd: deduction,
      depositRefundedUsd: refundedAmount,
    });
    return res.rows[0];
  }

  // ===========================================================================
  // 4. DOCUMENTOS OFICIALES EN PDF
  // ===========================================================================

  async buildVoucherPdf(user: any, reservationId: string): Promise<Buffer> {
    assertValidUuid(reservationId, 'ID de reserva');
    const res = await this.db.query(
      `SELECT ar.*, a.name AS amenity_name, a.space_category, a.buffer_minutes, a.capacity, a.rules,
              pu.unit_code, CONCAT(u.first_name, ' ', u.last_name) AS requested_by_name,
              co.name AS condo_name, co.rif AS condo_rif, co.code AS condo_code
       FROM amenity_reservations ar
       JOIN amenities a ON a.id = ar.amenity_id
       JOIN property_units pu ON pu.id = ar.property_unit_id
       JOIN users u ON u.id = ar.requested_by_user_id
       JOIN condos co ON co.id = ar.condo_id
       WHERE ar.id = $1`,
      [reservationId],
    );
    if (res.rows.length === 0) throw new NotFoundException('Reserva no encontrada');
    const r = res.rows[0];

    const scope = await this.resolveScope(user, r.condo_id);
    if (!scope.isStaff && !scope.unitIds.includes(r.property_unit_id)) {
      throw new ForbiddenException('No tienes permiso para descargar la constancia de esta reserva');
    }

    return buildReservationVoucherPdf({
      reservationCode: r.reservation_code || `RES-${r.id.slice(0, 8).toUpperCase()}`,
      condoName: r.condo_name,
      condoRif: r.condo_rif,
      condoCode: r.condo_code,
      amenityName: r.amenity_name,
      spaceCategory: r.space_category,
      unitCode: r.unit_code,
      requestedByName: r.requested_by_name,
      eventTitle: r.event_title,
      eventDescription: r.event_description,
      reservationDate: r.reservation_date,
      startTime: String(r.start_time).slice(0, 5),
      endTime: String(r.end_time).slice(0, 5),
      bufferMinutes: Number(r.buffer_minutes || 0),
      guestCount: r.guest_count,
      capacity: r.capacity,
      status: r.status,
      feeAmountUsd: Number(r.fee_amount_usd || 0),
      cleaningFeeUsd: Number(r.cleaning_fee_usd || 0),
      depositAmountUsd: Number(r.deposit_amount_usd || 0),
      totalAmountUsd: Number(r.total_amount_usd || 0),
      paymentStatus: r.payment_status,
      paymentReference: r.payment_reference,
      paymentMethod: r.payment_method,
      inspectionStatus: r.inspection_status,
      inspectionNotes: r.inspection_notes,
      damageDeductionUsd: Number(r.damage_deduction_usd || 0),
      depositRefundedUsd: Number(r.deposit_refunded_usd || 0),
      depositRefunded: Boolean(r.deposit_refunded),
      rules: r.rules,
      adminNotes: r.admin_notes,
    });
  }

  async buildReportPdf(user: any, condoId: string): Promise<Buffer> {
    const scope = await this.resolveScope(user, condoId);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo la administración puede exportar el reporte general de áreas comunes');
    }

    const reservations = await this.listReservations(user, condoId);
    const approved = reservations.filter((r) => r.status === 'APPROVED' || r.status === 'COMPLETED');
    const totalRevenueUsd = approved.reduce((sum, r) => sum + r.feeAmountUsd + r.cleaningFeeUsd, 0);
    const totalDepositsHeldUsd = approved
      .filter((r) => !r.depositRefunded && r.depositAmountUsd > 0)
      .reduce((sum, r) => sum + Math.max(0, r.depositAmountUsd - r.damageDeductionUsd), 0);

    return buildReservationsReportPdf({
      condoName: scope.condo.name,
      condoRif: scope.condo.rif,
      condoCode: scope.condo.code,
      totalReservations: reservations.length,
      approvedCount: approved.length,
      totalRevenueUsd,
      totalDepositsHeldUsd,
      rows: reservations.map((r) => ({
        reservationCode: r.reservationCode || r.id.slice(0, 8),
        amenityName: r.amenityName,
        unitCode: r.unitCode,
        requestedByName: r.requestedByName,
        reservationDate: r.reservationDate,
        timeSlot: `${r.startTime}–${r.endTime}`,
        status: r.status,
        totalAmountUsd: r.totalAmountUsd,
        depositAmountUsd: r.depositAmountUsd,
        inspectionStatus: r.inspectionStatus,
      })),
    });
  }

  private async writeAudit(
    condoId: string,
    userId: string,
    action: string,
    entityName: string,
    entityId: string,
    newValues: Record<string, any>,
  ) {
    await this.db.query(
      `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [condoId, userId, action, entityName, entityId, JSON.stringify(newValues)],
    );
  }
}
