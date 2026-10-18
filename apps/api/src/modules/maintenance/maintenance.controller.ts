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
import { Response } from 'express';

import { MaintenanceService } from './maintenance.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  CreateTicketCommentDto,
} from './dto/maintenance.dto';
import { TicketKPIs } from './dto/maintenance.dto';

@Controller('maintenance')
@UseGuards(AuthGuard('jwt'))
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  // ---------------------------------------------------------------------------
  // 1. CRUD de Tickets de Mantenimiento
  // ---------------------------------------------------------------------------

  @Get('tickets')
  listTickets(@Request() req: any, @Query() dto: { condoId: string; status?: string; priority?: string; category?: string; q?: string }) {
    return this.service.listTickets(req.user, dto.condoId, {
      status: dto.status ? (dto.status as any) : undefined,
      priority: dto.priority ? (dto.priority as any) : undefined,
      category: dto.category ? (dto.category as any) : undefined,
      q: dto.q,
    });
  }

  @Post('tickets')
  createTicket(@Request() req: any, @Body() dto: CreateTicketDto) {
    return this.service.createTicket(req.user, dto);
  }

  @Get('tickets/kpis')
  async getKpis(@Request() req: any, @Query('condoId') condoId: string) {
    return this.service.getKpis(req.user, condoId);
  }

  // ---------------------------------------------------------------------------
  // 2. Obtener un ticket y sus comentarios
  // ---------------------------------------------------------------------------

  @Get('tickets/:id')
  async getTicket(@Request() req: any, @Param('id') id: string) {
    return this.service.getTicket(req.user, req.query.condoId || '', id);
  }

  // ---------------------------------------------------------------------------
  // 3. Comentarios en un ticket
  // ---------------------------------------------------------------------------

  @Post('tickets/:id/comments')
  async addComment(@Request() req: any, @Param('id') id: string, @Body() dto: CreateTicketCommentDto) {
    return this.service.addComment(req.user, req.query.condoId || '', { ...dto, ticketId: id });
  }

  @Get('tickets/:id/comments')
  async listComments(@Request() req: any, @Param('id') id: string) {
    return this.service.listComments(req.user, req.query.condoId || '', id);
  }

  // ---------------------------------------------------------------------------
  // 4. Actualizar ticket (estado, prioridad, asignación, costo real)
  // ---------------------------------------------------------------------------

  @Patch('tickets/:id')
  async updateTicket(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.service.updateTicket(req.user, req.query.condoId || '', id, dto);
  }

  @Delete('tickets/:id')
  async deleteTicket(@Request() req: any, @Param('id') id: string) {
    return this.service.deleteTicket(req.user, req.query.condoId || '', id);
  }
}