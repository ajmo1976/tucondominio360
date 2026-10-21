import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ModulesService } from './modules.service';
import { UpdateGlobalModuleDto, UpdateModulesDto } from './dto/update-modules.dto';
import { CondoPermissionGuard, RequireCondoPermission } from '../access-core';

@ApiTags('Módulos (on/off)')
@Controller('modules')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ModulesController {
  constructor(private readonly service: ModulesService) {}

  @Get()
  @ApiOperation({ summary: 'Catálogo global de módulos con default_enabled actual' })
  async getGlobal() {
    return this.service.getGlobal();
  }

  @Patch(':code')
  @ApiOperation({ summary: 'Cambiar default global de un módulo (solo superadmin)' })
  async setGlobalDefault(
    @Param('code') code: string,
    @Body() dto: UpdateGlobalModuleDto,
    @Request() req: any,
  ) {
    if (!req.user.is_superadmin) {
      throw new ForbiddenException('Solo superadmin puede cambiar el default global');
    }
    return this.service.setGlobalDefault(code as any, dto.defaultEnabled);
  }
}

@ApiTags('Módulos por Empresa Administradora (Tenant)')
@Controller('tenants/:id/modules')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class TenantModulesController {
  constructor(private readonly service: ModulesService) {}

  @Get()
  @ApiOperation({ summary: 'Overrides de módulos de la administradora' })
  async getTenantModules(@Param('id') tenantId: string, @Request() req: any) {
    // Autorización: superadmin o tenant OWNER/ADMIN
    if (!req.user.is_superadmin) {
      const tu = await this.service['db'].query(
        `SELECT role FROM tenant_users WHERE tenant_id = $1 AND user_id = $2 AND is_active = TRUE`,
        [tenantId, req.user.id],
      );
      if (!tu.rows[0] || !['OWNER', 'ADMIN'].includes(tu.rows[0].role)) {
        throw new ForbiddenException('Solo OWNER/ADMIN del tenant pueden ver módulos');
      }
    }
    return this.service.getTenantOverrides(tenantId);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar overrides de módulos del tenant' })
  async setTenantModules(
    @Param('id') tenantId: string,
    @Body() dto: UpdateModulesDto,
    @Request() req: any,
  ) {
    // Autorización
    let tenantRole: string | null = null;
    if (!req.user.is_superadmin) {
      const tu = await this.service['db'].query(
        `SELECT role FROM tenant_users WHERE tenant_id = $1 AND user_id = $2 AND is_active = TRUE`,
        [tenantId, req.user.id],
      );
      if (!tu.rows[0] || !['OWNER', 'ADMIN'].includes(tu.rows[0].role)) {
        throw new ForbiddenException('Solo OWNER/ADMIN del tenant pueden cambiar módulos');
      }
      tenantRole = tu.rows[0].role;
    }
    for (const m of dto.modules) {
      await this.service.setTenantOverride(tenantId, m.code, m.enabled, {
        isSuperadmin: req.user.is_superadmin,
        tenantId,
        tenantRole,
      });
    }
    return this.service.getTenantOverrides(tenantId);
  }
}

@ApiTags('Módulos por Residencia (Condo)')
@Controller('condos/:id/modules')
@UseGuards(AuthGuard('jwt'), CondoPermissionGuard)
@RequireCondoPermission('CONDO_MANAGE')
@ApiBearerAuth()
export class CondoModulesController {
  constructor(private readonly service: ModulesService) {}

  @Get()
  @ApiOperation({ summary: 'Módulos efectivos de la residencia (con source)' })
  async getCondoModules(@Param('id') condoId: string) {
    return this.service.getEffectiveForCondo(condoId);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar overrides de módulos de la residencia' })
  async setCondoModules(
    @Param('id') condoId: string,
    @Body() dto: UpdateModulesDto,
    @Request() req: any,
  ) {
    for (const m of dto.modules) {
      await this.service.setCondoOverride(condoId, m.code, m.enabled, {
        isSuperadmin: req.user.is_superadmin,
        hasCondoManage: true, // ya validado por el guard
      });
    }
    return this.service.getEffectiveForCondo(condoId);
  }
}