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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdminGuard } from '../users/guards/super-admin.guard';
import { AddElectorDto } from './dto/add-elector.dto';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { VoteDto } from './dto/vote.dto';
import { ConsultationMemberGuard } from './guards/consultation-member.guard';
import { ConsultationsService } from './consultations.service';

@ApiTags('Consultas y Asambleas')
@Controller('consultations')
@UseGuards(AuthGuard('jwt'))
export class ConsultationsController {
  constructor(private readonly service: ConsultationsService) {}

  @Post()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Crea una consulta en borrador (solo Super Administrador)' })
  create(@Request() req, @Body() dto: CreateConsultationDto) {
    return this.service.create(req.user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista las consultas de una residencia' })
  list(@Request() req, @Query('condoId') condoId: string) {
    return this.service.listForUser(req.user, condoId);
  }

  @Get(':id')
  @UseGuards(ConsultationMemberGuard)
  @ApiOperation({ summary: 'Detalle de una consulta con sus opciones y votos' })
  getOne(@Request() req, @Param('id') id: string) {
    return this.service.getOne(req.user, id);
  }

  @Patch(':id')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Edita una consulta en borrador (solo Super Administrador)' })
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdateConsultationDto) {
    return this.service.update(req.user, id, dto);
  }

  @Post(':id/publish')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Publica la consulta y congela el padrón (solo Super Administrador)' })
  publish(@Request() req, @Param('id') id: string) {
    return this.service.publish(req.user, id);
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
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Lista el padrón de habilitados (solo Super Administrador)' })
  electors(@Request() req, @Param('id') id: string) {
    return this.service.listElectors(req.user, id);
  }

  @Post(':id/electors')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Agrega un habilitado al padrón (solo Super Administrador)' })
  addElector(@Request() req, @Param('id') id: string, @Body() dto: AddElectorDto) {
    return this.service.addElector(req.user, id, dto);
  }

  @Delete(':id/electors/:electorId')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Elimina un habilitado del padrón (solo Super Administrador)' })
  removeElector(@Request() req, @Param('id') id: string, @Param('electorId') electorId: string) {
    return this.service.removeElector(req.user, id, electorId);
  }
}
