import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CondosService } from './condos.service';

@ApiTags('Condominios e Inmuebles')
@Controller('condos')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class CondosController {
  constructor(private readonly condosService: CondosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar condominios (con filtro opcional por tenant)' })
  async findAll(@Query('tenantId') tenantId?: string) {
    return this.condosService.findAll(tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos generales de la residencia / condominio' })
  async updateCondo(@Param('id') id: string, @Body() body: any) {
    return this.condosService.updateCondo(id, body);
  }

  @Get(':id/summary')
  @ApiOperation({ summary: 'Resumen financiero y de deuda del condominio' })
  async getFinancialSummary(@Param('id') id: string) {
    return this.condosService.getFinancialSummary(id);
  }

  @Get(':id/buildings')
  @ApiOperation({ summary: 'Listar torres o bloques de un condominio' })
  async getBuildings(@Param('id') id: string) {
    return this.condosService.getBuildings(id);
  }

  @Get(':id/units')
  @ApiOperation({ summary: 'Listar apartamentos e inmuebles con alícuotas y propietarios' })
  async getPropertyUnits(@Param('id') id: string) {
    return this.condosService.getPropertyUnits(id);
  }

  @Get(':id/bank-accounts')
  @ApiOperation({ summary: 'Listar cuentas bancarias y datos de Pago Móvil del condominio' })
  async getBankAccounts(@Param('id') id: string) {
    return this.condosService.getBankAccounts(id);
  }

  @Post(':id/bank-accounts')
  @ApiOperation({ summary: 'Registrar nueva cuenta bancaria o Pago Móvil para este condominio' })
  async createBankAccount(@Param('id') id: string, @Body() body: any) {
    return this.condosService.createBankAccount(id, body);
  }

  @Patch('bank-accounts/:accountId')
  @ApiOperation({ summary: 'Editar cuenta bancaria o Pago Móvil' })
  async updateBankAccount(@Param('accountId') accountId: string, @Body() body: any) {
    return this.condosService.updateBankAccount(accountId, body);
  }

  @Delete('bank-accounts/:accountId')
  @ApiOperation({ summary: 'Eliminar cuenta bancaria' })
  async deleteBankAccount(@Param('accountId') accountId: string) {
    return this.condosService.deleteBankAccount(accountId);
  }

  @Post(':condoId/units/:unitId/owners')
  @ApiOperation({ summary: 'Registrar o asignar propietario/inquilino a un apartamento' })
  async createOrAssignOwner(
    @Param('condoId') condoId: string,
    @Param('unitId') unitId: string,
    @Body() body: any,
  ) {
    return this.condosService.createOrAssignOwner(condoId, unitId, body);
  }

  @Patch('owners/:userId')
  @ApiOperation({ summary: 'Editar datos de un propietario' })
  async updateOwner(@Param('userId') userId: string, @Body() body: any) {
    return this.condosService.updateOwner(userId, body);
  }

  @Post(':id/units')
  @ApiOperation({ summary: 'Registrar nueva unidad inmobiliaria (apto, casa, etc.)' })
  async createPropertyUnit(@Param('id') condoId: string, @Body() body: any) {
    return this.condosService.createPropertyUnit(condoId, body);
  }

  @Patch('units/:unitId')
  @ApiOperation({ summary: 'Actualizar unidad inmobiliaria' })
  async updatePropertyUnit(@Param('unitId') unitId: string, @Body() body: any) {
    return this.condosService.updatePropertyUnit(unitId, body);
  }

  @Delete('units/:unitId')
  @ApiOperation({ summary: 'Eliminar unidad inmobiliaria' })
  async deletePropertyUnit(@Param('unitId') unitId: string) {
    return this.condosService.deletePropertyUnit(unitId);
  }
}
