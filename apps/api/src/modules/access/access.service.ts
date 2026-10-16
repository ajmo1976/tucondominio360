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
  CheckInLogDto,
  CheckOutLogDto,
  CreateInvitationDto,
  CreateVehicleDto,
  DeliverPackageDto,
  ReceivePackageDto,
  UpdateAccessConfigDto,
  UpdateVehicleDto,
  ValidateAccessCodeDto,
} from './dto/access.dto';
import { buildAccessLogbookPdf, buildVisitorPassPdf } from './pdf';

export interface AccessControlConfig {
  enabled: boolean;
  residentVehicles: boolean;
  visitorPasses: boolean;
  suppliersAndDelivery: boolean;
  packagesAndMail: boolean;
  requireDocNumberOnEntry: boolean;
  requirePlateForVehicles: boolean;
  maxActivePassesPerUnit: number;
  defaultPassDurationHours: number;
}

const DEFAULT_ACCESS_CONFIG: AccessControlConfig = {
  enabled: true,
  residentVehicles: true,
  visitorPasses: true,
  suppliersAndDelivery: true,
  packagesAndMail: true,
  requireDocNumberOnEntry: true,
  requirePlateForVehicles: true,
  maxActivePassesPerUnit: 15,
  defaultPassDurationHours: 24,
};

const STAFF_ROLES = [
  'ADMIN',
  'BOARD_PRESIDENT',
  'BOARD_TREASURER',
  'BOARD_MEMBER',
  'GUARD',
  'CONCIERGE',
  'AUDITOR',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidUuid(id: string | undefined | null, label = 'Identificador'): void {
  if (!id || !UUID_REGEX.test(id)) {
    throw new BadRequestException(`${label} inválido`);
  }
}

function normalizePlate(plate?: string | null): string | null {
  if (!plate) return null;
  const clean = plate.toUpperCase().replace(/[^A-Z0-9-]/g, '').trim();
  return clean || null;
}

@Injectable()
export class AccessService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Determina el alcance de acceso del usuario en una residencia:
   *  - Verifica membresía al condominio (si no pertenece → 403).
   *  - Indica si es personal de administración/junta/vigilancia (`isStaff: true`)
   *    o residente/propietario (`isStaff: false`), junto con sus unidades (`unitIds`).
   */
  async resolveScope(
    user: any,
    condoId: string,
  ): Promise<{ isStaff: boolean; unitIds: string[]; units: Array<{ id: string; unitCode: string; floor: string | null }> }> {
    assertValidUuid(condoId, 'condoId');

    const condoCheck = await this.db.query(`SELECT id FROM condos WHERE id = $1`, [condoId]);
    if (condoCheck.rows.length === 0) {
      throw new NotFoundException('Residencia no encontrada');
    }

    if (user.is_superadmin) {
      const allUnits = await this.db.query(
        `SELECT id, unit_code AS "unitCode", floor FROM property_units
         WHERE condo_id = $1 AND is_active = TRUE
         ORDER BY unit_code ASC`,
        [condoId],
      );
      return {
        isStaff: true,
        unitIds: allUnits.rows.map((u) => u.id),
        units: allUnits.rows,
      };
    }

    const roleRes = await this.db.query(
      `SELECT role FROM condo_user_access
       WHERE condo_id = $1 AND user_id = $2 AND is_active = TRUE`,
      [condoId, user.id],
    );

    const hasStaffRole = roleRes.rows.some((r) => STAFF_ROLES.includes(r.role));

    const occupantRes = await this.db.query(
      `SELECT DISTINCT pu.id, pu.unit_code AS "unitCode", pu.floor
       FROM unit_occupants uo
       JOIN property_units pu ON pu.id = uo.property_unit_id
       WHERE pu.condo_id = $1 AND uo.user_id = $2 AND pu.is_active = TRUE
         AND (uo.valid_to IS NULL OR uo.valid_to >= CURRENT_DATE)
       ORDER BY pu.unit_code ASC`,
      [condoId, user.id],
    );

    if (roleRes.rows.length === 0 && occupantRes.rows.length === 0) {
      throw new ForbiddenException('No tienes acceso a esta residencia');
    }

    if (hasStaffRole) {
      const allUnits = await this.db.query(
        `SELECT id, unit_code AS "unitCode", floor FROM property_units
         WHERE condo_id = $1 AND is_active = TRUE
         ORDER BY unit_code ASC`,
        [condoId],
      );
      return {
        isStaff: true,
        unitIds: allUnits.rows.map((u) => u.id),
        units: allUnits.rows,
      };
    }

    return {
      isStaff: false,
      unitIds: occupantRes.rows.map((u) => u.id),
      units: occupantRes.rows,
    };
  }

  /** Obtiene la configuración del módulo de Control de Acceso para el condominio. */
  async getConfig(user: any, condoId: string): Promise<AccessControlConfig> {
    await this.resolveScope(user, condoId);
    return this.readCondoAccessConfig(condoId);
  }

  private async readCondoAccessConfig(condoId: string): Promise<AccessControlConfig> {
    const res = await this.db.query(`SELECT settings FROM condos WHERE id = $1`, [condoId]);
    if (res.rows.length === 0) throw new NotFoundException('Residencia no encontrada');
    const raw = res.rows[0].settings?.accessControl ?? {};
    return {
      ...DEFAULT_ACCESS_CONFIG,
      ...raw,
    };
  }

  /** Actualiza la configuración del módulo de Control de Acceso por condominio (solo Admin/Superadmin). */
  async updateConfig(user: any, dto: UpdateAccessConfigDto): Promise<AccessControlConfig> {
    const scope = await this.resolveScope(user, dto.condoId);
    if (!user.is_superadmin && !scope.isStaff) {
      throw new ForbiddenException('Solo la administración puede configurar el módulo de garita');
    }

    const current = await this.readCondoAccessConfig(dto.condoId);
    const updated: AccessControlConfig = {
      enabled: dto.enabled ?? current.enabled,
      residentVehicles: dto.residentVehicles ?? current.residentVehicles,
      visitorPasses: dto.visitorPasses ?? current.visitorPasses,
      suppliersAndDelivery: dto.suppliersAndDelivery ?? current.suppliersAndDelivery,
      packagesAndMail: dto.packagesAndMail ?? current.packagesAndMail,
      requireDocNumberOnEntry: dto.requireDocNumberOnEntry ?? current.requireDocNumberOnEntry,
      requirePlateForVehicles: dto.requirePlateForVehicles ?? current.requirePlateForVehicles,
      maxActivePassesPerUnit: dto.maxActivePassesPerUnit ?? current.maxActivePassesPerUnit,
      defaultPassDurationHours: dto.defaultPassDurationHours ?? current.defaultPassDurationHours,
    };

    await this.db.query(
      `UPDATE condos
       SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('accessControl', $2::jsonb),
           updated_at = NOW()
       WHERE id = $1`,
      [dto.condoId, JSON.stringify(updated)],
    );

    await this.writeAudit(dto.condoId, user.id, 'ACCESS_CONFIG_UPDATED', 'condos', dto.condoId, updated);
    return updated;
  }

  /**
   * Resumen general del módulo de Control de Acceso / Garita:
   * devuelve configuración, alcance del usuario, sus unidades y KPIs en vivo.
   */
  async getOverview(user: any, condoId: string) {
    const scope = await this.resolveScope(user, condoId);
    const config = await this.readCondoAccessConfig(condoId);

    // Expirar invitaciones vencidas automáticamente
    await this.expireOutdatedInvitations(condoId);

    if (scope.isStaff) {
      const kpiRes = await this.db.query(
        `SELECT
           (SELECT COUNT(*)::int FROM visitor_access_logs WHERE condo_id = $1 AND status = 'INSIDE') AS "insideCount",
           (SELECT COUNT(*)::int FROM visitor_access_logs WHERE condo_id = $1 AND status = 'INSIDE' AND entry_mode = 'VEHICLE') AS "vehiclesInsideCount",
           (SELECT COUNT(*)::int FROM visitor_access_logs WHERE condo_id = $1 AND entry_time >= CURRENT_DATE) AS "entriesTodayCount",
           (SELECT COUNT(*)::int FROM visitor_access_logs WHERE condo_id = $1 AND entry_time >= CURRENT_DATE AND visitor_category IN ('DELIVERY', 'PROVIDER', 'SERVICE', 'CONTRACTOR')) AS "deliveriesTodayCount",
           (SELECT COUNT(*)::int FROM visitor_invitations WHERE condo_id = $1 AND status = 'ACTIVE' AND valid_until >= NOW()) AS "activeInvitationsCount",
           (SELECT COUNT(*)::int FROM packages WHERE condo_id = $1 AND status = 'RECEIVED_AT_GATE') AS "pendingPackagesCount",
           (SELECT COUNT(*)::int FROM resident_vehicles WHERE condo_id = $1 AND is_active = TRUE) AS "registeredVehiclesCount",
           (SELECT COUNT(*)::int FROM visitor_access_logs WHERE condo_id = $1 AND entry_time >= CURRENT_DATE AND (incident_alert = TRUE OR status = 'INCIDENT')) AS "incidentsTodayCount"`,
        [condoId],
      );

      return {
        config,
        isStaff: true,
        units: scope.units,
        kpis: kpiRes.rows[0],
      };
    }

    // Vista de propietario: KPIs acotados exclusivamente a sus inmuebles
    const unitIds = scope.unitIds;
    if (unitIds.length === 0) {
      return {
        config,
        isStaff: false,
        units: [],
        kpis: {
          insideCount: 0,
          vehiclesInsideCount: 0,
          entriesTodayCount: 0,
          deliveriesTodayCount: 0,
          activeInvitationsCount: 0,
          pendingPackagesCount: 0,
          registeredVehiclesCount: 0,
          incidentsTodayCount: 0,
        },
      };
    }

    const ownerKpiRes = await this.db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM visitor_access_logs WHERE condo_id = $1 AND property_unit_id = ANY($2::uuid[]) AND status = 'INSIDE') AS "insideCount",
         (SELECT COUNT(*)::int FROM visitor_access_logs WHERE condo_id = $1 AND property_unit_id = ANY($2::uuid[]) AND status = 'INSIDE' AND entry_mode = 'VEHICLE') AS "vehiclesInsideCount",
         (SELECT COUNT(*)::int FROM visitor_access_logs WHERE condo_id = $1 AND property_unit_id = ANY($2::uuid[]) AND entry_time >= CURRENT_DATE) AS "entriesTodayCount",
         (SELECT COUNT(*)::int FROM visitor_access_logs WHERE condo_id = $1 AND property_unit_id = ANY($2::uuid[]) AND entry_time >= CURRENT_DATE AND visitor_category IN ('DELIVERY', 'PROVIDER', 'SERVICE', 'CONTRACTOR')) AS "deliveriesTodayCount",
         (SELECT COUNT(*)::int FROM visitor_invitations WHERE condo_id = $1 AND property_unit_id = ANY($2::uuid[]) AND status = 'ACTIVE' AND valid_until >= NOW()) AS "activeInvitationsCount",
         (SELECT COUNT(*)::int FROM packages WHERE condo_id = $1 AND property_unit_id = ANY($2::uuid[]) AND status = 'RECEIVED_AT_GATE') AS "pendingPackagesCount",
         (SELECT COUNT(*)::int FROM resident_vehicles WHERE condo_id = $1 AND property_unit_id = ANY($2::uuid[]) AND is_active = TRUE) AS "registeredVehiclesCount",
         0::int AS "incidentsTodayCount"`,
      [condoId, unitIds],
    );

    return {
      config,
      isStaff: false,
      units: scope.units,
      kpis: ownerKpiRes.rows[0],
    };
  }

  // ===========================================================================
  // 1. GESTIÓN DE RESIDENTES Y VEHÍCULOS
  // ===========================================================================

  async listVehicles(user: any, condoId: string, q?: string) {
    const scope = await this.resolveScope(user, condoId);
    if (!scope.isStaff && scope.unitIds.length === 0) return [];

    const params: any[] = [condoId];
    const where: string[] = [`rv.condo_id = $1`];

    if (!scope.isStaff) {
      params.push(scope.unitIds);
      where.push(`rv.property_unit_id = ANY($${params.length}::uuid[])`);
    }

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      const idx = params.length;
      where.push(
        `(rv.plate ILIKE $${idx} OR rv.brand ILIKE $${idx} OR rv.model ILIKE $${idx} OR rv.owner_name ILIKE $${idx} OR pu.unit_code ILIKE $${idx} OR rv.tag_code ILIKE $${idx})`,
      );
    }

    const res = await this.db.query(
      `SELECT rv.id, rv.condo_id AS "condoId", rv.property_unit_id AS "propertyUnitId",
              pu.unit_code AS "unitCode", pu.floor, pu.parking_number AS "unitParkingNumber",
              rv.plate, rv.vehicle_type AS "vehicleType", rv.brand, rv.model, rv.color,
              rv.parking_spot AS "parkingSpot", rv.tag_code AS "tagCode",
              rv.owner_name AS "ownerName", rv.is_active AS "isActive", rv.notes,
              rv.created_at AS "createdAt"
       FROM resident_vehicles rv
       JOIN property_units pu ON pu.id = rv.property_unit_id
       WHERE ${where.join(' AND ')}
       ORDER BY pu.unit_code ASC, rv.plate ASC`,
      params,
    );

    return res.rows;
  }

  async createVehicle(user: any, dto: CreateVehicleDto) {
    const scope = await this.resolveScope(user, dto.condoId);
    const config = await this.readCondoAccessConfig(dto.condoId);
    if (!config.enabled || !config.residentVehicles) {
      throw new BadRequestException('El registro de vehículos no está habilitado en esta residencia');
    }

    await this.assertUnitInCondoAndAllowed(dto.condoId, dto.propertyUnitId, scope);

    const plate = normalizePlate(dto.plate);
    if (!plate || plate.length < 3) {
      throw new BadRequestException('Placa de vehículo inválida');
    }

    try {
      const res = await this.db.query(
        `INSERT INTO resident_vehicles (
           condo_id, property_unit_id, registered_by_user_id, plate, vehicle_type,
           brand, model, color, parking_spot, tag_code, owner_name, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, plate, property_unit_id AS "propertyUnitId"`,
        [
          dto.condoId,
          dto.propertyUnitId,
          user.id,
          plate,
          dto.vehicleType || 'CAR',
          dto.brand.trim(),
          dto.model.trim(),
          dto.color.trim(),
          dto.parkingSpot?.trim() || null,
          dto.tagCode?.trim() || null,
          dto.ownerName?.trim() || `${user.first_name || ''} ${user.last_name || ''}`.trim() || null,
          dto.notes?.trim() || null,
        ],
      );

      await this.writeAudit(dto.condoId, user.id, 'VEHICLE_REGISTERED', 'resident_vehicles', res.rows[0].id, {
        plate,
        propertyUnitId: dto.propertyUnitId,
        brand: dto.brand,
        model: dto.model,
      });

      return res.rows[0];
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException(`La placa ${plate} ya está registrada en esta residencia`);
      }
      throw err;
    }
  }

  async updateVehicle(user: any, id: string, dto: UpdateVehicleDto) {
    assertValidUuid(id, 'ID de vehículo');
    const existing = await this.db.query(
      `SELECT id, condo_id, property_unit_id, plate, vehicle_type, brand, model, color,
              parking_spot, tag_code, owner_name, is_active, notes
       FROM resident_vehicles WHERE id = $1`,
      [id],
    );
    if (existing.rows.length === 0) throw new NotFoundException('Vehículo no encontrado');
    const v = existing.rows[0];

    const scope = await this.resolveScope(user, v.condo_id);
    if (!scope.isStaff && !scope.unitIds.includes(v.property_unit_id)) {
      throw new ForbiddenException('No tienes permiso para modificar este vehículo');
    }

    const plate = dto.plate !== undefined ? normalizePlate(dto.plate) : v.plate;
    if (!plate || plate.length < 3) {
      throw new BadRequestException('Placa de vehículo inválida');
    }

    try {
      const res = await this.db.query(
        `UPDATE resident_vehicles
         SET plate = $2,
             vehicle_type = $3,
             brand = $4,
             model = $5,
             color = $6,
             parking_spot = $7,
             tag_code = $8,
             owner_name = $9,
             is_active = $10,
             notes = $11,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, plate`,
        [
          id,
          plate,
          dto.vehicleType ?? v.vehicle_type,
          dto.brand !== undefined ? dto.brand.trim() : v.brand,
          dto.model !== undefined ? dto.model.trim() : v.model,
          dto.color !== undefined ? dto.color.trim() : v.color,
          dto.parkingSpot !== undefined ? dto.parkingSpot?.trim() || null : v.parking_spot,
          dto.tagCode !== undefined ? dto.tagCode?.trim() || null : v.tag_code,
          dto.ownerName !== undefined ? dto.ownerName?.trim() || null : v.owner_name,
          dto.isActive !== undefined ? dto.isActive : v.is_active,
          dto.notes !== undefined ? dto.notes?.trim() || null : v.notes,
        ],
      );

      await this.writeAudit(v.condo_id, user.id, 'VEHICLE_UPDATED', 'resident_vehicles', id, { plate });
      return res.rows[0];
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException(`La placa ${plate} ya está asignada a otro vehículo en la residencia`);
      }
      throw err;
    }
  }

  async removeVehicle(user: any, id: string) {
    assertValidUuid(id, 'ID de vehículo');
    const existing = await this.db.query(
      `SELECT id, condo_id, property_unit_id, plate FROM resident_vehicles WHERE id = $1`,
      [id],
    );
    if (existing.rows.length === 0) throw new NotFoundException('Vehículo no encontrado');
    const v = existing.rows[0];

    const scope = await this.resolveScope(user, v.condo_id);
    if (!scope.isStaff && !scope.unitIds.includes(v.property_unit_id)) {
      throw new ForbiddenException('No tienes permiso para eliminar este vehículo');
    }

    await this.db.query(`DELETE FROM resident_vehicles WHERE id = $1`, [id]);
    await this.writeAudit(v.condo_id, user.id, 'VEHICLE_REMOVED', 'resident_vehicles', id, { plate: v.plate });
    return { ok: true };
  }

  /**
   * Directorio rápido de residentes, unidades y vehículos para consulta en garita.
   * Si es un residente, solo devuelve sus propias unidades.
   */
  async getResidentDirectory(user: any, condoId: string, q?: string) {
    const scope = await this.resolveScope(user, condoId);
    if (!scope.isStaff && scope.unitIds.length === 0) return [];

    const params: any[] = [condoId];
    const where: string[] = [`pu.condo_id = $1`, `pu.is_active = TRUE`];

    if (!scope.isStaff) {
      params.push(scope.unitIds);
      where.push(`pu.id = ANY($${params.length}::uuid[])`);
    }

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      const idx = params.length;
      where.push(
        `(pu.unit_code ILIKE $${idx} OR pu.parking_number ILIKE $${idx} OR EXISTS (
           SELECT 1 FROM unit_occupants uo2
           JOIN users u2 ON u2.id = uo2.user_id
           WHERE uo2.property_unit_id = pu.id
             AND (CONCAT(u2.first_name, ' ', u2.last_name) ILIKE $${idx} OR u2.doc_number ILIKE $${idx} OR u2.phone ILIKE $${idx})
         ) OR EXISTS (
           SELECT 1 FROM resident_vehicles rv2
           WHERE rv2.property_unit_id = pu.id AND (rv2.plate ILIKE $${idx} OR rv2.brand ILIKE $${idx})
         ))`,
      );
    }

    const res = await this.db.query(
      `SELECT pu.id, pu.unit_code AS "unitCode", pu.floor, pu.has_parking AS "hasParking",
              pu.parking_number AS "parkingNumber",
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'userId', u.id,
                   'name', CONCAT(u.first_name, ' ', u.last_name),
                   'doc', CONCAT(u.doc_type, '-', u.doc_number),
                   'phone', u.phone,
                   'role', uo.role
                 ))
                 FROM unit_occupants uo
                 JOIN users u ON u.id = uo.user_id
                 WHERE uo.property_unit_id = pu.id
                   AND (uo.valid_to IS NULL OR uo.valid_to >= CURRENT_DATE)),
                '[]'::json
              ) AS residents,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'id', rv.id,
                   'plate', rv.plate,
                   'brand', rv.brand,
                   'model', rv.model,
                   'color', rv.color,
                   'vehicleType', rv.vehicle_type,
                   'parkingSpot', rv.parking_spot
                 ))
                 FROM resident_vehicles rv
                 WHERE rv.property_unit_id = pu.id AND rv.is_active = TRUE),
                '[]'::json
              ) AS vehicles
       FROM property_units pu
       WHERE ${where.join(' AND ')}
       ORDER BY pu.unit_code ASC`,
      params,
    );

    return res.rows;
  }

  // ===========================================================================
  // 2. GESTIÓN DE VISITAS, PEATONES Y PASES QR / PIN
  // ===========================================================================

  private async expireOutdatedInvitations(condoId: string) {
    await this.db.query(
      `UPDATE visitor_invitations
       SET status = 'EXPIRED'
       WHERE condo_id = $1 AND status = 'ACTIVE' AND valid_until < NOW()`,
      [condoId],
    );
  }

  async listInvitations(user: any, condoId: string, status?: string, q?: string) {
    const scope = await this.resolveScope(user, condoId);
    await this.expireOutdatedInvitations(condoId);

    if (!scope.isStaff && scope.unitIds.length === 0) return [];

    const params: any[] = [condoId];
    const where: string[] = [`vi.condo_id = $1`];

    if (!scope.isStaff) {
      params.push(scope.unitIds);
      where.push(`vi.property_unit_id = ANY($${params.length}::uuid[])`);
    }

    if (status && status !== 'ALL') {
      params.push(status);
      where.push(`vi.status = $${params.length}`);
    }

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      const idx = params.length;
      where.push(
        `(vi.visitor_name ILIKE $${idx} OR vi.access_code ILIKE $${idx} OR vi.visitor_plate ILIKE $${idx} OR vi.company_name ILIKE $${idx} OR pu.unit_code ILIKE $${idx})`,
      );
    }

    const res = await this.db.query(
      `SELECT vi.id, vi.condo_id AS "condoId", vi.property_unit_id AS "propertyUnitId",
              pu.unit_code AS "unitCode",
              CONCAT(u.first_name, ' ', u.last_name) AS "createdByName",
              vi.visitor_name AS "visitorName",
              vi.visitor_doc_type AS "visitorDocType",
              vi.visitor_doc_number AS "visitorDocNumber",
              vi.visitor_plate AS "visitorPlate",
              vi.visitor_category AS "visitorCategory",
              vi.entry_mode AS "entryMode",
              vi.company_name AS "companyName",
              vi.companion_count AS "companionCount",
              vi.access_code AS "accessCode",
              vi.valid_from AS "validFrom",
              vi.valid_until AS "validUntil",
              vi.max_uses AS "maxUses",
              vi.uses_count AS "usesCount",
              vi.status,
              vi.notes,
              vi.created_at AS "createdAt"
       FROM visitor_invitations vi
       JOIN property_units pu ON pu.id = vi.property_unit_id
       JOIN users u ON u.id = vi.created_by_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY vi.created_at DESC
       LIMIT 100`,
      params,
    );

    return res.rows;
  }

  async createInvitation(user: any, dto: CreateInvitationDto) {
    const scope = await this.resolveScope(user, dto.condoId);
    const config = await this.readCondoAccessConfig(dto.condoId);

    if (!config.enabled || !config.visitorPasses) {
      throw new BadRequestException('La emisión de pases de visita no está habilitada en esta residencia');
    }

    await this.assertUnitInCondoAndAllowed(dto.condoId, dto.propertyUnitId, scope);

    // Verificar límite de pases activos por unidad
    const activeCountRes = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM visitor_invitations
       WHERE condo_id = $1 AND property_unit_id = $2 AND status = 'ACTIVE' AND valid_until >= NOW()`,
      [dto.condoId, dto.propertyUnitId],
    );
    if (activeCountRes.rows[0].count >= config.maxActivePassesPerUnit) {
      throw new BadRequestException(
        `El inmueble alcanzó el límite máximo de ${config.maxActivePassesPerUnit} pases activos simultáneos`,
      );
    }

    const now = new Date();
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : now;
    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : new Date(validFrom.getTime() + config.defaultPassDurationHours * 3600 * 1000);

    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime()) || validUntil <= validFrom) {
      throw new BadRequestException('La fecha de vencimiento del pase debe ser posterior a la fecha de inicio');
    }

    const entryMode = dto.entryMode || (dto.visitorPlate ? 'VEHICLE' : 'PEDESTRIAN');
    const plate = normalizePlate(dto.visitorPlate);
    if (entryMode === 'VEHICLE' && config.requirePlateForVehicles && !plate) {
      throw new BadRequestException('Se requiere indicar la placa del vehículo para pases de acceso vehicular');
    }

    const rawHex = randomUUID().replace(/-/g, '').toUpperCase();
    const pinPart = String(Math.floor(1000 + Math.random() * 9000));
    const accessCode = `TC360-${pinPart}-${rawHex.slice(0, 4)}`;

    const res = await this.db.query(
      `INSERT INTO visitor_invitations (
         condo_id, property_unit_id, created_by_user_id, visitor_name,
         visitor_doc_type, visitor_doc_number, visitor_plate,
         visitor_category, entry_mode, company_name, companion_count,
         access_code, valid_from, valid_until, max_uses, status, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'ACTIVE', $16)
       RETURNING id, access_code AS "accessCode", valid_from AS "validFrom", valid_until AS "validUntil", status`,
      [
        dto.condoId,
        dto.propertyUnitId,
        user.id,
        dto.visitorName.trim(),
        dto.visitorDocType || 'V',
        dto.visitorDocNumber?.trim() || null,
        plate,
        dto.visitorCategory || 'VISITOR',
        entryMode,
        dto.companyName?.trim() || null,
        dto.companionCount ?? 0,
        accessCode,
        validFrom.toISOString(),
        validUntil.toISOString(),
        dto.maxUses ?? 1,
        dto.notes?.trim() || null,
      ],
    );

    await this.writeAudit(dto.condoId, user.id, 'INVITATION_CREATED', 'visitor_invitations', res.rows[0].id, {
      accessCode,
      visitorName: dto.visitorName,
      propertyUnitId: dto.propertyUnitId,
    });

    return res.rows[0];
  }

  async cancelInvitation(user: any, id: string) {
    assertValidUuid(id, 'ID de invitación');
    const existing = await this.db.query(
      `SELECT id, condo_id, property_unit_id, access_code, status FROM visitor_invitations WHERE id = $1`,
      [id],
    );
    if (existing.rows.length === 0) throw new NotFoundException('Pase de acceso no encontrado');
    const inv = existing.rows[0];

    const scope = await this.resolveScope(user, inv.condo_id);
    if (!scope.isStaff && !scope.unitIds.includes(inv.property_unit_id)) {
      throw new ForbiddenException('No tienes permiso para anular este pase');
    }

    if (inv.status !== 'ACTIVE' && inv.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden anular pases que estén activos');
    }

    await this.db.query(
      `UPDATE visitor_invitations
       SET status = 'REVOKED', cancelled_at = NOW()
       WHERE id = $1`,
      [id],
    );

    await this.writeAudit(inv.condo_id, user.id, 'INVITATION_CANCELLED', 'visitor_invitations', id, {
      accessCode: inv.access_code,
    });

    return { ok: true };
  }

  /**
   * Valida un código QR o PIN de invitación en la garita sin consumirlo aún,
   * devolviendo la ficha lista para hacer Check-in en 1 clic.
   */
  async validateInvitationCode(user: any, dto: ValidateAccessCodeDto) {
    const scope = await this.resolveScope(user, dto.condoId);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo el personal de garita o administración puede validar códigos de ingreso');
    }

    await this.expireOutdatedInvitations(dto.condoId);

    const code = dto.accessCode.trim().toUpperCase();
    const res = await this.db.query(
      `SELECT vi.id, vi.condo_id AS "condoId", vi.property_unit_id AS "propertyUnitId",
              pu.unit_code AS "unitCode",
              CONCAT(u.first_name, ' ', u.last_name) AS "authorizedByName",
              vi.visitor_name AS "visitorName",
              vi.visitor_doc_type AS "visitorDocType",
              vi.visitor_doc_number AS "visitorDocNumber",
              vi.visitor_plate AS "visitorPlate",
              vi.visitor_category AS "visitorCategory",
              vi.entry_mode AS "entryMode",
              vi.company_name AS "companyName",
              vi.companion_count AS "companionCount",
              vi.access_code AS "accessCode",
              vi.valid_from AS "validFrom",
              vi.valid_until AS "validUntil",
              vi.max_uses AS "maxUses",
              vi.uses_count AS "usesCount",
              vi.status,
              vi.notes
       FROM visitor_invitations vi
       JOIN property_units pu ON pu.id = vi.property_unit_id
       JOIN users u ON u.id = vi.created_by_user_id
       WHERE vi.condo_id = $1 AND UPPER(vi.access_code) = $2`,
      [dto.condoId, code],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`No existe ningún pase con el código ${code} en esta residencia`);
    }

    const inv = res.rows[0];
    const now = new Date();
    const isValidStatus = inv.status === 'ACTIVE';
    const isWithinWindow = new Date(inv.validFrom) <= now && now <= new Date(inv.validUntil);
    const hasRemainingUses = inv.usesCount < inv.maxUses;
    const valid = isValidStatus && isWithinWindow && hasRemainingUses;

    let reason: string | null = null;
    if (!isValidStatus) reason = `El pase se encuentra en estado ${inv.status}`;
    else if (!hasRemainingUses) reason = `El pase ya agotó sus ${inv.maxUses} uso(s) permitidos`;
    else if (now < new Date(inv.validFrom)) reason = 'El pase aún no ha iniciado su vigencia';
    else if (now > new Date(inv.validUntil)) reason = 'El pase ha expirado';

    return {
      valid,
      reason,
      invitation: inv,
    };
  }

  // ===========================================================================
  // 3. PANEL DE CONTROL DE GARITA (BITÁCORA DIGITAL EN VIVO, PROVEEDORES Y DELIVERY)
  // ===========================================================================

  async listLogs(
    user: any,
    condoId: string,
    filters: { status?: string; category?: string; q?: string; from?: string; to?: string } = {},
  ) {
    const scope = await this.resolveScope(user, condoId);
    if (!scope.isStaff && scope.unitIds.length === 0) return [];

    const params: any[] = [condoId];
    const where: string[] = [`l.condo_id = $1`];

    if (!scope.isStaff) {
      params.push(scope.unitIds);
      where.push(`l.property_unit_id = ANY($${params.length}::uuid[])`);
    }

    if (filters.status && filters.status !== 'ALL') {
      params.push(filters.status);
      where.push(`l.status = $${params.length}`);
    }

    if (filters.category && filters.category !== 'ALL') {
      params.push(filters.category);
      where.push(`l.visitor_category = $${params.length}`);
    }

    if (filters.from) {
      params.push(filters.from);
      where.push(`l.entry_time >= $${params.length}::timestamptz`);
    }

    if (filters.to) {
      params.push(`${filters.to.slice(0, 10)}T23:59:59.999Z`);
      where.push(`l.entry_time <= $${params.length}::timestamptz`);
    }

    if (filters.q && filters.q.trim()) {
      params.push(`%${filters.q.trim()}%`);
      const idx = params.length;
      where.push(
        `(l.visitor_name ILIKE $${idx} OR l.visitor_doc_number ILIKE $${idx} OR l.vehicle_plate ILIKE $${idx} OR l.company_name ILIKE $${idx} OR pu.unit_code ILIKE $${idx})`,
      );
    }

    const res = await this.db.query(
      `SELECT l.id, l.condo_id AS "condoId", l.invitation_id AS "invitationId",
              l.property_unit_id AS "propertyUnitId", pu.unit_code AS "unitCode",
              l.visitor_name AS "visitorName", l.visitor_doc_type AS "visitorDocType",
              l.visitor_doc_number AS "visitorDocNumber", l.visitor_category AS "visitorCategory",
              l.entry_mode AS "entryMode", l.company_name AS "companyName",
              l.vehicle_plate AS "vehiclePlate", l.destination_label AS "destinationLabel",
              l.authorized_by_name AS "authorizedByName",
              l.status, l.incident_alert AS "incidentAlert",
              l.entry_time AS "entryTime", l.exit_time AS "exitTime",
              l.notes,
              CONCAT(g_in.first_name, ' ', g_in.last_name) AS "guardName",
              vi.access_code AS "accessCode"
       FROM visitor_access_logs l
       LEFT JOIN property_units pu ON pu.id = l.property_unit_id
       LEFT JOIN users g_in ON g_in.id = l.guard_user_id
       LEFT JOIN visitor_invitations vi ON vi.id = l.invitation_id
       WHERE ${where.join(' AND ')}
       ORDER BY l.entry_time DESC
       LIMIT 150`,
      params,
    );

    return res.rows;
  }

  /**
   * Registra la entrada (Check-in) en la bitácora de garita:
   *  - Puede originarse desde un pase pre-autorizado (`invitationId` o `accessCode`)
   *    o como registro directo en garita (visita anunciada por citófono, delivery, servicio técnico).
   */
  async checkIn(user: any, dto: CheckInLogDto) {
    const scope = await this.resolveScope(user, dto.condoId);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo el personal de garita o administración puede registrar entradas en bitácora');
    }

    const config = await this.readCondoAccessConfig(dto.condoId);
    if (!config.enabled) {
      throw new BadRequestException('El módulo de Control de Acceso está deshabilitado en esta residencia');
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      let inv: any = null;
      if (dto.invitationId || dto.accessCode) {
        const invRes = dto.invitationId
          ? await client.query(
              `SELECT vi.*, CONCAT(u.first_name, ' ', u.last_name) AS creator_name
               FROM visitor_invitations vi
               JOIN users u ON u.id = vi.created_by_user_id
               WHERE vi.id = $1 AND vi.condo_id = $2
               FOR UPDATE`,
              [dto.invitationId, dto.condoId],
            )
          : await client.query(
              `SELECT vi.*, CONCAT(u.first_name, ' ', u.last_name) AS creator_name
               FROM visitor_invitations vi
               JOIN users u ON u.id = vi.created_by_user_id
               WHERE vi.condo_id = $1 AND UPPER(vi.access_code) = $2
               FOR UPDATE`,
              [dto.condoId, dto.accessCode!.trim().toUpperCase()],
            );

        if (invRes.rows.length === 0) {
          throw new NotFoundException('El pase de invitación indicado no existe');
        }
        inv = invRes.rows[0];

        if (inv.status !== 'ACTIVE') {
          throw new BadRequestException(`El pase no está activo (estado actual: ${inv.status})`);
        }
        if (new Date(inv.valid_until) < new Date()) {
          await client.query(`UPDATE visitor_invitations SET status = 'EXPIRED' WHERE id = $1`, [inv.id]);
          throw new BadRequestException('El pase de invitación ha vencido');
        }
        if (inv.uses_count >= inv.max_uses) {
          throw new BadRequestException('El pase de invitación ya alcanzó el máximo de usos permitidos');
        }
      }

      const propertyUnitId = dto.propertyUnitId ?? inv?.property_unit_id ?? null;
      if (propertyUnitId) {
        const unitCheck = await client.query(
          `SELECT id FROM property_units WHERE id = $1 AND condo_id = $2`,
          [propertyUnitId, dto.condoId],
        );
        if (unitCheck.rows.length === 0) {
          throw new BadRequestException('El inmueble destino no pertenece a esta residencia');
        }
      }

      const visitorName = (dto.visitorName ?? inv?.visitor_name ?? '').trim();
      if (!visitorName) {
        throw new BadRequestException('El nombre del visitante o conductor es obligatorio');
      }

      const visitorDocType = dto.visitorDocType ?? inv?.visitor_doc_type ?? 'V';
      const visitorDocNumber = (dto.visitorDocNumber ?? inv?.visitor_doc_number ?? '').trim() || 'S/D';
      if (config.requireDocNumberOnEntry && visitorDocNumber === 'S/D' && !inv) {
        throw new BadRequestException('La política de la residencia exige el número de cédula/documento al ingresar');
      }

      const visitorCategory = dto.visitorCategory ?? inv?.visitor_category ?? 'VISITOR';
      if (
        ['PROVIDER', 'DELIVERY', 'SERVICE', 'CONTRACTOR'].includes(visitorCategory) &&
        !config.suppliersAndDelivery
      ) {
        throw new BadRequestException('El sub-módulo de proveedores y delivery está desactivado en esta residencia');
      }

      const vehiclePlate = normalizePlate(dto.vehiclePlate ?? inv?.visitor_plate);
      const entryMode = dto.entryMode ?? inv?.entry_mode ?? (vehiclePlate ? 'VEHICLE' : 'PEDESTRIAN');
      if (entryMode === 'VEHICLE' && config.requirePlateForVehicles && !vehiclePlate) {
        throw new BadRequestException('Debe registrar la placa del vehículo para un ingreso vehicular');
      }

      const companyName = (dto.companyName ?? inv?.company_name ?? '').trim() || null;
      const authorizedByName =
        (dto.authorizedByName ?? inv?.creator_name ?? '').trim() || 'Control de Garita';
      const status = dto.incidentAlert ? 'INCIDENT' : 'INSIDE';

      const insertRes = await client.query(
        `INSERT INTO visitor_access_logs (
           condo_id, invitation_id, property_unit_id, guard_user_id,
           visitor_name, visitor_doc_type, visitor_doc_number,
           visitor_category, entry_mode, company_name, vehicle_plate,
           destination_label, authorized_by_name, status, incident_alert, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id, entry_time AS "entryTime", status`,
        [
          dto.condoId,
          inv ? inv.id : null,
          propertyUnitId,
          user.id,
          visitorName,
          visitorDocType,
          visitorDocNumber,
          visitorCategory,
          entryMode,
          companyName,
          vehiclePlate,
          dto.destinationLabel?.trim() || null,
          authorizedByName,
          status,
          Boolean(dto.incidentAlert),
          dto.notes?.trim() || inv?.notes || null,
        ],
      );

      if (inv) {
        const nextUses = inv.uses_count + 1;
        const nextStatus = nextUses >= inv.max_uses ? 'USED' : 'ACTIVE';
        await client.query(
          `UPDATE visitor_invitations
           SET uses_count = $2, status = $3
           WHERE id = $1`,
          [inv.id, nextUses, nextStatus],
        );
      }

      await client.query(
        `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
         VALUES ($1, $2, 'ACCESS_ENTRY_LOGGED', 'visitor_access_logs', $3, $4::jsonb)`,
        [
          dto.condoId,
          user.id,
          insertRes.rows[0].id,
          JSON.stringify({
            visitorName,
            visitorCategory,
            entryMode,
            vehiclePlate,
            invitationId: inv?.id ?? null,
          }),
        ],
      );

      await client.query('COMMIT');
      return insertRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Registra la salida (Check-out) de un visitante, vehículo o proveedor. */
  async checkOut(user: any, logId: string, dto: CheckOutLogDto) {
    assertValidUuid(logId, 'ID de bitácora');
    const existing = await this.db.query(
      `SELECT id, condo_id, visitor_name, exit_time, status, incident_alert, notes
       FROM visitor_access_logs WHERE id = $1`,
      [logId],
    );
    if (existing.rows.length === 0) throw new NotFoundException('Registro de bitácora no encontrado');
    const log = existing.rows[0];

    const scope = await this.resolveScope(user, log.condo_id);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo el personal de garita o administración puede registrar salidas');
    }

    if (log.exit_time) {
      throw new BadRequestException('Este visitante ya tiene registrada su salida');
    }

    const incidentAlert = dto.incidentAlert !== undefined ? dto.incidentAlert : log.incident_alert;
    const status = incidentAlert ? 'INCIDENT' : 'COMPLETED';
    const mergedNotes = dto.notes?.trim()
      ? [log.notes, dto.notes.trim()].filter(Boolean).join(' · ')
      : log.notes;

    const res = await this.db.query(
      `UPDATE visitor_access_logs
       SET exit_time = NOW(),
           exit_guard_user_id = $2,
           status = $3,
           incident_alert = $4,
           notes = $5
       WHERE id = $1
       RETURNING id, exit_time AS "exitTime", status`,
      [logId, user.id, status, incidentAlert, mergedNotes],
    );

    await this.writeAudit(log.condo_id, user.id, 'ACCESS_EXIT_LOGGED', 'visitor_access_logs', logId, {
      visitorName: log.visitor_name,
      status,
    });

    return res.rows[0];
  }

  // ===========================================================================
  // 4. PAQUETERÍA Y CORRESPONDENCIA EN GARITA
  // ===========================================================================

  async listPackages(user: any, condoId: string, status?: string, q?: string) {
    const scope = await this.resolveScope(user, condoId);
    if (!scope.isStaff && scope.unitIds.length === 0) return [];

    const params: any[] = [condoId];
    const where: string[] = [`p.condo_id = $1`];

    if (!scope.isStaff) {
      params.push(scope.unitIds);
      where.push(`p.property_unit_id = ANY($${params.length}::uuid[])`);
    }

    if (status && status !== 'ALL') {
      params.push(status);
      where.push(`p.status = $${params.length}`);
    }

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      const idx = params.length;
      where.push(
        `(p.courier_company ILIKE $${idx} OR p.tracking_number ILIKE $${idx} OR p.recipient_name ILIKE $${idx} OR pu.unit_code ILIKE $${idx} OR p.pickup_pin ILIKE $${idx})`,
      );
    }

    const res = await this.db.query(
      `SELECT p.id, p.condo_id AS "condoId", p.property_unit_id AS "propertyUnitId",
              pu.unit_code AS "unitCode",
              p.courier_company AS "courierCompany",
              p.tracking_number AS "trackingNumber",
              p.recipient_name AS "recipientName",
              p.pickup_pin AS "pickupPin",
              p.status,
              p.delivered_to_name AS "deliveredToName",
              p.notes,
              p.received_at AS "receivedAt",
              p.delivered_at AS "deliveredAt",
              CONCAT(g.first_name, ' ', g.last_name) AS "receivedByGuardName"
       FROM packages p
       JOIN property_units pu ON pu.id = p.property_unit_id
       LEFT JOIN users g ON g.id = p.received_by_guard_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.received_at DESC
       LIMIT 100`,
      params,
    );

    return res.rows;
  }

  async receivePackage(user: any, dto: ReceivePackageDto) {
    const scope = await this.resolveScope(user, dto.condoId);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo el personal de garita o administración puede recepcionar paquetes');
    }

    const config = await this.readCondoAccessConfig(dto.condoId);
    if (!config.enabled || !config.packagesAndMail) {
      throw new BadRequestException('El sub-módulo de paquetería no está habilitado en esta residencia');
    }

    await this.assertUnitInCondoAndAllowed(dto.condoId, dto.propertyUnitId, scope);

    const pickupPin = String(Math.floor(100000 + Math.random() * 900000));

    const res = await this.db.query(
      `INSERT INTO packages (
         condo_id, property_unit_id, courier_company, tracking_number,
         recipient_name, received_by_guard_id, pickup_pin, status, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'RECEIVED_AT_GATE', $8)
       RETURNING id, pickup_pin AS "pickupPin", received_at AS "receivedAt", status`,
      [
        dto.condoId,
        dto.propertyUnitId,
        dto.courierCompany.trim(),
        dto.trackingNumber?.trim() || null,
        dto.recipientName?.trim() || null,
        user.id,
        pickupPin,
        dto.notes?.trim() || null,
      ],
    );

    await this.writeAudit(dto.condoId, user.id, 'PACKAGE_RECEIVED', 'packages', res.rows[0].id, {
      courierCompany: dto.courierCompany,
      propertyUnitId: dto.propertyUnitId,
      pickupPin,
    });

    return res.rows[0];
  }

  async deliverPackage(user: any, packageId: string, dto: DeliverPackageDto) {
    assertValidUuid(packageId, 'ID de paquete');
    const existing = await this.db.query(
      `SELECT id, condo_id, property_unit_id, pickup_pin, status, notes FROM packages WHERE id = $1`,
      [packageId],
    );
    if (existing.rows.length === 0) throw new NotFoundException('Paquete no encontrado');
    const pkg = existing.rows[0];

    const scope = await this.resolveScope(user, pkg.condo_id);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo el personal de garita o administración puede registrar la entrega de paquetes');
    }

    if (pkg.status !== 'RECEIVED_AT_GATE') {
      throw new BadRequestException('Este paquete ya fue entregado o devuelto');
    }

    if (dto.pickupPin && dto.pickupPin.trim() !== pkg.pickup_pin) {
      throw new BadRequestException('El PIN de retiro indicado no coincide con el asignado al paquete');
    }

    const nextStatus = dto.status ?? 'DELIVERED_TO_RESIDENT';
    const mergedNotes = dto.notes?.trim()
      ? [pkg.notes, dto.notes.trim()].filter(Boolean).join(' · ')
      : pkg.notes;

    const res = await this.db.query(
      `UPDATE packages
       SET status = $2,
           delivered_to_name = $3,
           delivered_at = NOW(),
           notes = $4
       WHERE id = $1
       RETURNING id, status, delivered_at AS "deliveredAt"`,
      [packageId, nextStatus, dto.deliveredToName?.trim() || 'Residente / Autorizado', mergedNotes],
    );

    await this.writeAudit(pkg.condo_id, user.id, 'PACKAGE_DELIVERED', 'packages', packageId, {
      status: nextStatus,
      deliveredToName: dto.deliveredToName,
    });

    return res.rows[0];
  }

  // ===========================================================================
  // 5. REPORTES OFICIALES EN PDF (PASE QR Y BITÁCORA DE GARITA)
  // ===========================================================================

  async buildInvitationPassPdf(user: any, invitationId: string): Promise<Buffer> {
    assertValidUuid(invitationId, 'ID de pase');
    const res = await this.db.query(
      `SELECT vi.*, pu.unit_code,
              CONCAT(u.first_name, ' ', u.last_name) AS created_by_name,
              co.name AS condo_name, co.rif AS condo_rif, co.code AS condo_code
       FROM visitor_invitations vi
       JOIN property_units pu ON pu.id = vi.property_unit_id
       JOIN users u ON u.id = vi.created_by_user_id
       JOIN condos co ON co.id = vi.condo_id
       WHERE vi.id = $1`,
      [invitationId],
    );
    if (res.rows.length === 0) throw new NotFoundException('Pase de acceso no encontrado');
    const inv = res.rows[0];

    const scope = await this.resolveScope(user, inv.condo_id);
    if (!scope.isStaff && !scope.unitIds.includes(inv.property_unit_id)) {
      throw new ForbiddenException('No tienes permiso para descargar este pase');
    }

    return buildVisitorPassPdf({
      id: inv.id,
      condoName: inv.condo_name,
      condoRif: inv.condo_rif,
      condoCode: inv.condo_code,
      unitCode: inv.unit_code,
      createdByName: inv.created_by_name,
      visitorName: inv.visitor_name,
      visitorDocType: inv.visitor_doc_type,
      visitorDocNumber: inv.visitor_doc_number,
      visitorPlate: inv.visitor_plate,
      visitorCategory: inv.visitor_category,
      entryMode: inv.entry_mode,
      companyName: inv.company_name,
      companionCount: inv.companion_count,
      accessCode: inv.access_code,
      validFrom: inv.valid_from,
      validUntil: inv.valid_until,
      maxUses: inv.max_uses,
      usesCount: inv.uses_count,
      status: inv.status,
      notes: inv.notes,
    });
  }

  async buildLogbookReportPdf(
    user: any,
    condoId: string,
    filters: { from?: string; to?: string; category?: string } = {},
  ): Promise<Buffer> {
    const scope = await this.resolveScope(user, condoId);
    if (!scope.isStaff) {
      throw new ForbiddenException('Solo la administración o garita puede exportar el reporte general de bitácora');
    }

    const condoRes = await this.db.query(
      `SELECT name, rif, code FROM condos WHERE id = $1`,
      [condoId],
    );
    if (condoRes.rows.length === 0) throw new NotFoundException('Residencia no encontrada');
    const condo = condoRes.rows[0];

    const logs = await this.listLogs(user, condoId, {
      from: filters.from,
      to: filters.to,
      category: filters.category,
    });

    const currentlyInside = logs.filter((l) => l.status === 'INSIDE').length;
    const vehiclesCount = logs.filter((l) => l.entryMode === 'VEHICLE' || l.vehiclePlate).length;
    const deliveriesAndServicesCount = logs.filter((l) =>
      ['PROVIDER', 'DELIVERY', 'SERVICE', 'CONTRACTOR'].includes(l.visitorCategory),
    ).length;
    const incidentsCount = logs.filter((l) => l.incidentAlert || l.status === 'INCIDENT').length;

    return buildAccessLogbookPdf({
      condoName: condo.name,
      condoRif: condo.rif,
      condoCode: condo.code,
      fromDate: filters.from ?? null,
      toDate: filters.to ?? null,
      filterCategory: filters.category ?? null,
      totalEntries: logs.length,
      currentlyInside,
      vehiclesCount,
      deliveriesAndServicesCount,
      incidentsCount,
      logs: logs.map((l) => ({
        visitorName: l.visitorName,
        visitorDoc: `${l.visitorDocType || 'V'}-${l.visitorDocNumber}`,
        category: l.visitorCategory,
        entryMode: l.entryMode,
        vehiclePlate: l.vehiclePlate,
        companyName: l.companyName,
        unitCode: l.unitCode,
        entryTime: l.entryTime,
        exitTime: l.exitTime,
        status: l.status,
        incidentAlert: l.incidentAlert,
      })),
    });
  }

  // ===========================================================================
  // Helpers internos
  // ===========================================================================

  private async assertUnitInCondoAndAllowed(
    condoId: string,
    propertyUnitId: string,
    scope: { isStaff: boolean; unitIds: string[] },
  ) {
    assertValidUuid(propertyUnitId, 'propertyUnitId');
    const unitRes = await this.db.query(
      `SELECT id FROM property_units WHERE id = $1 AND condo_id = $2`,
      [propertyUnitId, condoId],
    );
    if (unitRes.rows.length === 0) {
      throw new BadRequestException('El inmueble indicado no pertenece a esta residencia');
    }
    if (!scope.isStaff && !scope.unitIds.includes(propertyUnitId)) {
      throw new ForbiddenException('No estás autorizado para operar sobre un inmueble ajeno');
    }
  }

  private async writeAudit(
    condoId: string,
    userId: string,
    action: string,
    tableName: string,
    recordId: string,
    newValues: Record<string, any>,
  ) {
    await this.db.query(
      `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [condoId, userId, action, tableName, recordId, JSON.stringify(newValues)],
    );
  }
}
