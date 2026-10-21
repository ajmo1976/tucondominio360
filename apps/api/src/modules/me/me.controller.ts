import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AccessService } from '../access-core';
import { ModulesService } from '../modules/modules.service';
import { DatabaseService } from '../../database/database.service';

/**
 * Recursos del usuario autenticado. `GET /api/me/access` es la fuente única que
 * consumen el frontend (selector de residencia, sidebar) y las fases siguientes
 * (`/api/me/modules` en Fase C).
 */
@ApiTags('Yo (usuario actual)')
@Controller('me')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class MeController {
  constructor(
    private readonly access: AccessService,
    private readonly modules: ModulesService,
    private readonly db: DatabaseService,
  ) {}

  @Get('access')
  @ApiOperation({ summary: 'Residencias accesibles con rol y permisos efectivos' })
  getAccess(@Request() req: any) {
    return this.access.resolveUserAccess(req.user.id);
  }

  @Get('modules')
  @ApiOperation({ summary: 'Módulos habilitados por residencia para el usuario actual' })
  async getModules(@Request() req: any) {
    return this.modules.getEffectiveForUser(req.user.id);
  }

  /**
   * Unidades que ocupa el usuario actual en todas sus residencias, con la
   * alícuota, el rol de ocupante y el saldo consolidado de la unidad. Es la
   * fuente de la vista "Mis Unidades" del portal (Fase D).
   */
  @Get('units')
  @ApiOperation({ summary: 'Unidades ocupadas por el usuario con alícuota, rol y saldo' })
  async getMyUnits(@Request() req: any) {
    const userId = req.user.id;

    const res = await this.db.query(
      `SELECT c.id AS condo_id, c.name AS condo_name, c.rif AS condo_rif,
              pu.id AS unit_id, pu.unit_code, pu.unit_type, pu.floor,
              pu.aliquot_percentage, pu.current_balance_usd,
              bld.name AS building_name,
              uo.role AS occupant_role, uo.is_primary_contact, uo.is_billing_recipient
       FROM unit_occupants uo
       JOIN property_units pu ON pu.id = uo.property_unit_id AND pu.is_active = TRUE
       JOIN condos c ON c.id = pu.condo_id AND c.is_active = TRUE
       LEFT JOIN buildings bld ON bld.id = pu.building_id
       WHERE uo.user_id = $1
         AND (uo.valid_to IS NULL OR uo.valid_to >= CURRENT_DATE)
       ORDER BY c.name ASC, pu.unit_code ASC`,
      [userId],
    );

    // Agrupar por residencia.
    const condosMap = new Map<string, any>();
    for (const row of res.rows) {
      let condo = condosMap.get(row.condo_id);
      if (!condo) {
        condo = {
          id: row.condo_id,
          name: row.condo_name,
          rif: row.condo_rif,
          units: [],
        };
        condosMap.set(row.condo_id, condo);
      }
      condo.units.push({
        id: row.unit_id,
        unitCode: row.unit_code,
        unitType: row.unit_type,
        floor: row.floor,
        buildingName: row.building_name,
        aliquotPercentage: row.aliquot_percentage,
        currentBalanceUsd: Number(row.current_balance_usd ?? 0),
        occupantRole: row.occupant_role,
        isPrimaryContact: row.is_primary_contact,
        isBillingRecipient: row.is_billing_recipient,
      });
    }

    return { condos: [...condosMap.values()] };
  }
}
