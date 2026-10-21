import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AccessService } from '../access-core';
import { ModulesService } from '../modules/modules.service';

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
}
