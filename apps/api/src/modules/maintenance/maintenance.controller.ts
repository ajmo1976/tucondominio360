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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { MaintenanceService } from './maintenance.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  CreateTicketCommentDto,
} from './dto/maintenance.dto';
import { TicketKPIs } from './dto/maintenance.dto';
import {
  CondoPermissionGuard,
  RequireCondoPermission,
} from '../access-core';
import { ModuleEnabledGuard, RequireModule } from '../modules';

// Mapa checks → permisos por residencia (Fase B):
//   GET    /tickets, /tickets/kpis, /tickets/:id, /tickets/:id/comments → MAINTENANCE_MANAGE | MAINTENANCE_REPORT
//   POST   /tickets                                                   → MAINTENANCE_MANAGE | MAINTENANCE_REPORT
//   POST   /tickets/:id/comments                                      → MAINTENANCE_MANAGE | MAINTENANCE_REPORT (interno: MANAGE)
//   PATCH  /tickets/:id                                               → MAINTENANCE_MANAGE
//   DELETE /tickets/:id                                               → MAINTENANCE_MANAGE

@Controller('maintenance')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard)
@RequireModule('MAINTENANCE')
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  // ---------------------------------------------------------------------------
  // 1. CRUD de Tickets de Mantenimiento
  // ---------------------------------------------------------------------------

  @Get('tickets')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT')
  listTickets(@Request() req: any, @Query() dto: { condoId: string; status?: string; priority?: string; category?: string; q?: string }) {
    return this.service.listTickets(req.user, dto.condoId, {
      status: dto.status ? (dto.status as any) : undefined,
      priority: dto.priority ? (dto.priority as any) : undefined,
      category: dto.category ? (dto.category as any) : undefined,
      q: dto.q,
    });
  }

  @Post('tickets')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT')
  createTicket(@Request() req: any, @Body() dto: CreateTicketDto) {
    return this.service.createTicket(req.user, dto);
  }

  @Get('tickets/kpis')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT')
  async getKpis(@Request() req: any, @Query('condoId') condoId: string) {
    return this.service.getKpis(req.user, condoId);
  }

  // ---------------------------------------------------------------------------
  // 2. Obtener un ticket y sus comentarios
  // ---------------------------------------------------------------------------

  @Get('tickets/:id')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT')
  async getTicket(@Request() req: any, @Param('id') id: string) {
    return this.service.getTicket(req.user, req.query.condoId || '', id);
  }

  // ---------------------------------------------------------------------------
  // 3. Comentarios en un ticket
  // ---------------------------------------------------------------------------

  @Post('tickets/:id/comments')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT')
  async addComment(@Request() req: any, @Param('id') id: string, @Body() dto: CreateTicketCommentDto) {
    return this.service.addComment(req.user, req.query.condoId || '', { ...dto, ticketId: id });
  }

  @Get('tickets/:id/comments')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT')
  async listComments(@Request() req: any, @Param('id') id: string) {
    return this.service.listComments(req.user, req.query.condoId || '', id);
  }

  // ---------------------------------------------------------------------------
  // 4. Actualizar ticket (estado, prioridad, asignación, costo real)
  // ---------------------------------------------------------------------------

  @Patch('tickets/:id')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('MAINTENANCE_MANAGE')
  async updateTicket(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.service.updateTicket(req.user, req.query.condoId || '', id, dto);
  }

  @Delete('tickets/:id')
  @UseGuards(CondoPermissionGuard)
  @RequireCondoPermission('MAINTENANCE_MANAGE')
  async deleteTicket(@Request() req: any, @Param('id') id: string) {
    return this.service.deleteTicket(req.user, req.query.condoId || '', id);
  }
}
