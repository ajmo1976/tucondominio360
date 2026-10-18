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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SuperAdminGuard } from './guards/super-admin.guard';

@ApiTags('Usuarios y Accesos')
@Controller('users')
@UseGuards(AuthGuard('jwt'), SuperAdminGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Listar usuarios del SaaS con sus residencias y unidades asignadas' })
  @ApiQuery({ name: 'search', required: false, description: 'Filtra por nombre, apellido, correo o documento' })
  async list(@Query('search') search?: string) {
    return this.usersService.list(search || '');
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Dashboard de un usuario: residencias, roles, unidades, deuda y pagos reportados' })
  async getDashboard(@Param('id') id: string) {
    return this.usersService.getDashboard(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un usuario con sus accesos a residencias y unidades' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un usuario (con contraseña inicial y asignaciones)' })
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos y/o reemplazar por completo las asignaciones de un usuario' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Post(':id/invitation/resend')
  @ApiOperation({ summary: 'Reenviar la invitación por correo a un usuario que aún no activó su cuenta' })
  async resendInvitation(@Param('id') id: string) {
    return this.usersService.resendInvitation(id);
  }

  @Post(':id/invitation/revoke')
  @ApiOperation({ summary: 'Anular las invitaciones pendientes de un usuario' })
  async revokeInvitation(@Param('id') id: string) {
    return this.usersService.revokeInvitation(id);
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: 'Restablecer la contraseña de un usuario desde la administración' })
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.usersService.resetPassword(id, dto.password);
  }

  @Post(':id/password-reset-link')
  @ApiOperation({ summary: 'Enviar por correo un enlace para que el usuario defina su contraseña' })
  async sendPasswordResetLink(@Param('id') id: string) {
    return this.usersService.sendPasswordResetLink(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar usuario sin historial (si tiene historial, la API responde 409 y hay que desactivarlo)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.usersService.remove(id, req.user.id);
  }
}