import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AnnouncementsService } from './announcements.service';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  AcknowledgeAnnouncementDto,
} from './dto/announcements.dto';
import {
  CondoPermissionGuard,
  RequireCondoPermission,
} from '../access-core';

// Mapa checks → permisos por residencia (Fase B):
//   GET  /, /kpis, /my-acks, /:id            → ANNOUNCEMENTS_VIEW
//   POST /                                   → ANNOUNCEMENTS_MANAGE
//   PATCH /:id                               → ANNOUNCEMENTS_MANAGE (o autor, resuelto en el servicio)
//   POST /:id/acknowledge                    → ANNOUNCEMENTS_ACK

@Controller('announcements')
@UseGuards(AuthGuard('jwt'))
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  // ---------------------------------------------------------------------------
  // 1. Listado y creación de comunicados
  // ---------------------------------------------------------------------------

  @Get()
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ANNOUNCEMENTS_VIEW')
  listAnnouncements(@Request() req: any, @Query() dto: {
    condoId: string;
    category?: string;
    isUrgent?: boolean;
    status?: string;
    q?: string;
  }) {
    return this.service.listAnnouncements(req.user, dto.condoId, {
      category: dto.category,
      isUrgent: dto.isUrgent,
      status: dto.status,
      q: dto.q,
    });
  }

  @Post()
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ANNOUNCEMENTS_MANAGE')
  createAnnouncement(@Request() req: any, @Body() dto: CreateAnnouncementDto) {
    return this.service.createAnnouncement(req.user, dto);
  }

  // ---------------------------------------------------------------------------
  // 2. KPIs de cumplimiento (declarado ANTES de :id para no ser capturado)
  // ---------------------------------------------------------------------------

  @Get('kpis')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ANNOUNCEMENTS_VIEW')
  async getKpis(@Request() req: any, @Query('condoId') condoId: string) {
    return this.service.getKpis(req.user, condoId);
  }

  // ---------------------------------------------------------------------------
  // 3. Acuses de recibo del usuario autenticado
  // ---------------------------------------------------------------------------

  @Get('my-acks')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ANNOUNCEMENTS_VIEW')
  async getUserAcks(@Request() req: any, @Query('condoId') condoId: string) {
    return this.service.getUserAcks(req.user, condoId);
  }

  // ---------------------------------------------------------------------------
  // 4. Obtener un comunicado
  // ---------------------------------------------------------------------------

  @Get(':id')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ANNOUNCEMENTS_VIEW')
  async getAnnouncement(@Request() req: any, @Param('id') id: string, @Query('condoId') condoId: string) {
    return this.service.getAnnouncement(req.user, condoId || '', id);
  }

  // ---------------------------------------------------------------------------
  // 5. Actualizar comunicado
  // ---------------------------------------------------------------------------

  @Patch(':id')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ANNOUNCEMENTS_MANAGE')
  async updateAnnouncement(@Request() req: any, @Param('id') id: string, @Query('condoId') condoId: string, @Body() dto: UpdateAnnouncementDto) {
    return this.service.updateAnnouncement(req.user, condoId || '', id, dto);
  }

  // ---------------------------------------------------------------------------
  // 6. Acuse de recibo legal
  // ---------------------------------------------------------------------------

  @Post(':id/acknowledge')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('ANNOUNCEMENTS_ACK')
  async acknowledgeAnnouncement(
    @Request() req: any,
    @Param('id') id: string,
    @Query('condoId') condoId: string,
    @Body() dto: AcknowledgeAnnouncementDto,
  ) {
    return this.service.acknowledgeAnnouncement(req.user, condoId || '', { ...dto, announcementId: id });
  }
}
