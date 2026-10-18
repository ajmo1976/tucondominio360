import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AccessService } from './access.service';
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
import {
  CondoPermissionGuard,
  RequireCondoPermission,
} from '../access-core';

@Controller('access')
@UseGuards(AuthGuard('jwt'))
export class AccessController {
  constructor(private readonly service: AccessService) {}

  // ---------------------------------------------------------------------------
  // Configuración por condominio y Resumen general (KPIs + Permisos)
  // ---------------------------------------------------------------------------

  @Get('overview')
  getOverview(@Request() req: any, @Query('condoId') condoId: string) {
    return this.service.getOverview(req.user, condoId);
  }

  @Get('config')
  getConfig(@Request() req: any, @Query('condoId') condoId: string) {
    return this.service.getConfig(req.user, condoId);
  }

  @Patch('config')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ACCESS_MANAGE')
  updateConfig(@Request() req: any, @Body() dto: UpdateAccessConfigDto) {
    return this.service.updateConfig(req.user, dto);
  }

  // ---------------------------------------------------------------------------
  // 1. Gestión de Residentes y Vehículos
  // ---------------------------------------------------------------------------

  @Get('vehicles')
  listVehicles(
    @Request() req: any,
    @Query('condoId') condoId: string,
    @Query('q') q?: string,
  ) {
    return this.service.listVehicles(req.user, condoId, q);
  }

  @Post('vehicles')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ACCESS_MANAGE')
  createVehicle(@Request() req: any, @Body() dto: CreateVehicleDto) {
    return this.service.createVehicle(req.user, dto);
  }

  @Patch('vehicles/:id')
  updateVehicle(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.service.updateVehicle(req.user, id, dto);
  }

  @Delete('vehicles/:id')
  removeVehicle(@Request() req: any, @Param('id') id: string) {
    return this.service.removeVehicle(req.user, id);
  }

  @Get('directory')
  getDirectory(
    @Request() req: any,
    @Query('condoId') condoId: string,
    @Query('q') q?: string,
  ) {
    return this.service.getResidentDirectory(req.user, condoId, q);
  }

  // ---------------------------------------------------------------------------
  // 2. Gestión de Visitas, Peatones y Pases QR / PIN
  // ---------------------------------------------------------------------------

  @Get('invitations')
  listInvitations(
    @Request() req: any,
    @Query('condoId') condoId: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.service.listInvitations(req.user, condoId, status, q);
  }

  @Post('invitations')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ACCESS_MANAGE')
  createInvitation(@Request() req: any, @Body() dto: CreateInvitationDto) {
    return this.service.createInvitation(req.user, dto);
  }

  @Post('invitations/validate')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ACCESS_MANAGE', 'ACCESS_GUEST')
  validateInvitation(@Request() req: any, @Body() dto: ValidateAccessCodeDto) {
    return this.service.validateInvitationCode(req.user, dto);
  }

  @Post('invitations/:id/cancel')
  cancelInvitation(@Request() req: any, @Param('id') id: string) {
    return this.service.cancelInvitation(req.user, id);
  }

  @Get('invitations/:id/pass.pdf')
  async downloadPassPdf(
    @Request() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.buildInvitationPassPdf(req.user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="pase-acceso-${id.slice(0, 8)}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  // ---------------------------------------------------------------------------
  // 3. Bitácora Digital de Garita (Entradas, Salidas, Proveedores y Delivery)
  // ---------------------------------------------------------------------------

  @Get('logs')
  listLogs(
    @Request() req: any,
    @Query('condoId') condoId: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listLogs(req.user, condoId, { status, category, q, from, to });
  }

  @Post('logs/check-in')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ACCESS_MANAGE')
  checkIn(@Request() req: any, @Body() dto: CheckInLogDto) {
    return this.service.checkIn(req.user, dto);
  }

  @Post('logs/:id/check-out')
  checkOut(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CheckOutLogDto,
  ) {
    return this.service.checkOut(req.user, id, dto);
  }

  @Get('reports/logbook.pdf')
  async downloadLogbookPdf(
    @Request() req: any,
    @Query('condoId') condoId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('category') category: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.service.buildLogbookReportPdf(req.user, condoId, {
      from,
      to,
      category,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="bitacora-garita-oficial.pdf"',
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  // ---------------------------------------------------------------------------
  // 4. Paquetería y Encomiendas en Garita
  // ---------------------------------------------------------------------------

  @Get('packages')
  listPackages(
    @Request() req: any,
    @Query('condoId') condoId: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.service.listPackages(req.user, condoId, status, q);
  }

  @Post('packages')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ACCESS_MANAGE')
  receivePackage(@Request() req: any, @Body() dto: ReceivePackageDto) {
    return this.service.receivePackage(req.user, dto);
  }

  @Post('packages/:id/deliver')
  deliverPackage(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: DeliverPackageDto,
  ) {
    return this.service.deliverPackage(req.user, id, dto);
  }
}
