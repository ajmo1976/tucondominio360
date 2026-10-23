import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { TenantsService } from './tenants.service';
import {
  AddTenantStaffDto,
  UpdateTenantDto,
  UpdateTenantStaffDto,
} from './dto/tenant-staff.dto';

@ApiTags('Empresas administradoras (tenants)')
@Controller('tenants')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get()
  @ApiOperation({ summary: 'Empresas (superadmin: todas; personal: solo las suyas como OWNER/ADMIN)' })
  listTenants(@Request() req: any) {
    return this.service.listTenants(req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Datos de la administradora y las residencias de su cartera' })
  getTenant(@Request() req: any, @Param('id') id: string) {
    return this.service.getTenant(req.user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza datos de contacto de la administradora' })
  updateTenant(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.service.updateTenant(req.user, id, dto);
  }

  @Get(':id/staff')
  @ApiOperation({ summary: 'Personal de la empresa administradora' })
  listStaff(@Request() req: any, @Param('id') id: string) {
    return this.service.listStaff(req.user, id);
  }

  @Post(':id/staff')
  @ApiOperation({ summary: 'Asigna (o cambia) el rol de un usuario en la administradora' })
  addStaff(@Request() req: any, @Param('id') id: string, @Body() dto: AddTenantStaffDto) {
    return this.service.setStaffRole(req.user, id, dto.userId, dto.role);
  }

  @Patch(':id/staff/:userId')
  @ApiOperation({ summary: 'Cambia el rol de un miembro de la administradora' })
  updateStaff(
    @Request() req: any,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateTenantStaffDto,
  ) {
    return this.service.setStaffRole(req.user, id, userId, dto.role);
  }

  @Delete(':id/staff/:userId')
  @ApiOperation({ summary: 'Quita a un usuario del personal de la administradora' })
  removeStaff(@Request() req: any, @Param('id') id: string, @Param('userId') userId: string) {
    return this.service.removeStaff(req.user, id, userId);
  }
}
