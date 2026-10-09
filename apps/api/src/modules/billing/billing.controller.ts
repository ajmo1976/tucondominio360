import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { BillingService } from './billing.service';

@ApiTags('Facturación y Recibos')
@Controller('billing')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('condos/:condoId/periods')
  @ApiOperation({ summary: 'Listar periodos mensuales de cobro de un condominio' })
  async getPeriods(@Param('condoId') condoId: string) {
    return this.billingService.getPeriods(condoId);
  }

  @Post('condos/:condoId/periods')
  @ApiOperation({ summary: 'Aperturar nuevo período mensual de cobro para el condominio' })
  async createBillingPeriod(@Param('condoId') condoId: string, @Body() data: any) {
    return this.billingService.createBillingPeriod(condoId, data);
  }

  @Get('condos/:condoId/bills')
  @ApiOperation({ summary: 'Listar recibos emitidos (con filtro por periodo o unidad)' })
  async getBills(
    @Param('condoId') condoId: string,
    @Query('periodId') periodId?: string,
    @Query('unitId') unitId?: string,
  ) {
    return this.billingService.getBills(condoId, periodId, unitId);
  }

  @Get('bills/:billId')
  @ApiOperation({ summary: 'Obtener detalle completo de un recibo con desglose de gastos y alícuota' })
  async getBillDetail(@Param('billId') billId: string) {
    return this.billingService.getBillDetail(billId);
  }

  @Patch('periods/:periodId')
  @ApiOperation({ summary: 'Modificar período o recibo mensual' })
  async updateBillingPeriod(@Param('periodId') periodId: string, @Body() data: any) {
    return this.billingService.updateBillingPeriod(periodId, data);
  }

  @Delete('periods/:periodId')
  @ApiOperation({ summary: 'Eliminar período / recibo mensual' })
  async deleteBillingPeriod(@Param('periodId') periodId: string) {
    return this.billingService.deleteBillingPeriod(periodId);
  }

  @Post('periods/:periodId/calculate')
  @ApiOperation({ summary: 'Gestar y generar recibos masivos calculados por alícuotas para todos los apartamentos' })
  async calculateAndGenerateBills(@Param('periodId') periodId: string) {
    return this.billingService.calculateAndGenerateBills(periodId);
  }

  @Post('condos/:condoId/expenses')
  @ApiOperation({ summary: 'Cargar factura o egreso del condominio' })
  async createExpense(@Param('condoId') condoId: string, @Body() data: any) {
    return this.billingService.createExpense(condoId, data);
  }
  @Get('condos/:condoId/expenses')
  @ApiOperation({ summary: 'Listar gastos del condominio' })
  async getExpenses(@Param('condoId') condoId: string, @Query('periodId') periodId?: string) {
    return this.billingService.getExpenses(condoId, periodId);
  }

  @Patch('expenses/:expenseId')
  @ApiOperation({ summary: 'Modificar un gasto o factura' })
  async updateExpense(@Param('expenseId') expenseId: string, @Body() data: any) {
    return this.billingService.updateExpense(expenseId, data);
  }

  @Delete('expenses/:expenseId')
  @ApiOperation({ summary: 'Eliminar un gasto de la relación' })
  async deleteExpense(@Param('expenseId') expenseId: string) {
    return this.billingService.deleteExpense(expenseId);
  }

  @Get('condos/:condoId/categories')
  @ApiOperation({ summary: 'Listar categorías de gastos' })
  async getCategories(@Param('condoId') condoId: string) {
    return this.billingService.getCategories(condoId);
  }

  @Post('condos/:condoId/categories')
  @ApiOperation({ summary: 'Crear categoría de gasto' })
  async createCategory(@Param('condoId') condoId: string, @Body() body: { name: string; code?: string }) {
    return this.billingService.createCategory(condoId, body.name, body.code);
  }
}
