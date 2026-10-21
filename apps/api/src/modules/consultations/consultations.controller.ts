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
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AddElectorDto } from './dto/add-elector.dto';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { VoteDto } from './dto/vote.dto';
import { ConsultationManageGuard } from './guards/consultation-manage.guard';
import { ConsultationMemberGuard } from './guards/consultation-member.guard';
import { ConsultationsService } from './consultations.service';
import { ModuleEnabledGuard, RequireModule } from '../modules';

@ApiTags('Consultas y Asambleas')
@Controller('consultations')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard)
@RequireModule('CONSULTATIONS')
export class ConsultationsController {
  constructor(private readonly service: ConsultationsService) {}

  @Post()
  @UseGuards(ConsultationManageGuard)
  @ApiOperation({ summary: 'Crea una consulta en borrador (requiere CONSULTATIONS_MANAGE)' })
  create(@Request() req, @Body() dto: CreateConsultationDto) {
    return this.service.create(req.user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista las consultas de una residencia' })
  list(@Request() req, @Query('condoId') condoId: string) {
    return this.service.listForUser(req.user, condoId);
  }

  @Post(':id/cancel')
  @UseGuards(ConsultationManageGuard)
  @ApiOperation({ summary: 'Cancela una consulta con auditoría (requiere CONSULTATIONS_MANAGE)' })
  cancel(@Request() req, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.cancel(req.user, id, body?.reason);
  }

  @Get(':id')
  @UseGuards(ConsultationMemberGuard)
  @ApiOperation({ summary: 'Detalle de una consulta con sus opciones y votos' })
  getOne(@Request() req, @Param('id') id: string) {
    return this.service.getOne(req.user, id);
  }

  @Patch(':id')
  @UseGuards(ConsultationManageGuard)
  @ApiOperation({ summary: 'Edita una consulta en borrador (requiere CONSULTATIONS_MANAGE)' })
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdateConsultationDto) {
    return this.service.update(req.user, id, dto);
  }

  @Post(':id/publish')
  @UseGuards(ConsultationManageGuard)
  @ApiOperation({ summary: 'Publica la consulta y congela el padrón (requiere CONSULTATIONS_MANAGE)' })
  publish(@Request() req, @Param('id') id: string) {
    return this.service.publish(req.user, id);
  }

  @Post(':id/close')
  @UseGuards(ConsultationManageGuard)
  @ApiOperation({ summary: 'Cierra la consulta y congela el resultado (requiere CONSULTATIONS_MANAGE)' })
  close(@Request() req, @Param('id') id: string) {
    return this.service.close(req.user, id);
  }

  @Get(':id/results')
  @UseGuards(ConsultationMemberGuard)
  @ApiOperation({ summary: 'Resultados de la consulta (recuento en vivo o congelado) y votos públicos' })
  results(@Request() req, @Param('id') id: string) {
    return this.service.getResults(req.user, id);
  }

  @Get(':id/my-eligibility')
  @UseGuards(ConsultationMemberGuard)
  @ApiOperation({ summary: 'Unidades del padrón del usuario y su estado de votación' })
  eligibility(@Request() req, @Param('id') id: string) {
    return this.service.getEligibility(req.user, id);
  }

  @Post(':id/vote')
  @UseGuards(ConsultationMemberGuard)
  @ApiOperation({ summary: 'Emite el voto de una unidad y devuelve el comprobante' })
  vote(@Request() req, @Param('id') id: string, @Body() dto: VoteDto) {
    return this.service.vote(req.user, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get(':id/electors')
  @UseGuards(ConsultationManageGuard)
  @ApiOperation({ summary: 'Lista el padrón de habilitados (requiere CONSULTATIONS_MANAGE)' })
  electors(@Request() req, @Param('id') id: string) {
    return this.service.listElectors(req.user, id);
  }

  @Post(':id/electors')
  @UseGuards(ConsultationManageGuard)
  @ApiOperation({ summary: 'Agrega un habilitado al padrón (requiere CONSULTATIONS_MANAGE)' })
  addElector(@Request() req, @Param('id') id: string, @Body() dto: AddElectorDto) {
    return this.service.addElector(req.user, id, dto);
  }

  @Delete(':id/electors/:electorId')
  @UseGuards(ConsultationManageGuard)
  @ApiOperation({ summary: 'Elimina un habilitado del padrón (requiere CONSULTATIONS_MANAGE)' })
  removeElector(@Request() req, @Param('id') id: string, @Param('electorId') electorId: string) {
    return this.service.removeElector(req.user, id, electorId);
  }

  @Get(':id/acta.pdf')
  @UseGuards(ConsultationMemberGuard)
  @ApiOperation({ summary: 'Descarga PDF: acta de la consulta (tras el cierre o cancelación)' })
  async acta(@Request() req, @Param('id') id: string, @Res() res: Response) {
    const buffer = await this.service.buildActa(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="acta-consulta.pdf"',
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get(':id/receipt.pdf')
  @UseGuards(ConsultationMemberGuard)
  @ApiOperation({ summary: 'Descarga PDF: constancia de votación de una unidad (solo su propietario)' })
  async receipt(
    @Request() req,
    @Param('id') id: string,
    @Query('propertyUnitId') propertyUnitId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.buildReceipt(id, propertyUnitId, req.user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="constancia-voto.pdf"',
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
