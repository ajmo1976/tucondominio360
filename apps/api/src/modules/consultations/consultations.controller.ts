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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdminGuard } from '../users/guards/super-admin.guard';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
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
}
