import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CommunityService } from './community.service';
import { CondoMemberGuard } from './guards/condo-member.guard';

@ApiTags('Dashboard Comunitario (Transparencia)')
@Controller('community')
@UseGuards(AuthGuard('jwt'), CondoMemberGuard)
@ApiBearerAuth()
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get('dashboard/:condoId')
  @ApiOperation({
    summary:
      'Dashboard de transparencia de la residencia: KPIs financieros 100% agregados, distribución del gasto, flujo de caja, cuentas y documentos',
  })
  async dashboard(@Param('condoId') condoId: string) {
    return this.communityService.getDashboard(condoId);
  }

  @Get('documents/:condoId/bank-reconciliation')
  @ApiOperation({ summary: 'Descarga PDF: conciliación bancaria oficial más reciente' })
  async bankReconciliationPdf(@Param('condoId') condoId: string, @Res() res: Response) {
    const buffer = await this.communityService.buildBankReconciliationPdf(condoId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="conciliacion-bancaria.pdf"',
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get('documents/:condoId/expenses-report')
  @ApiOperation({ summary: 'Descarga PDF: relación de facturas y soportes de gastos del período' })
  async expensesReportPdf(
    @Res() res: Response,
    @Param('condoId') condoId: string,
    @Query('periodId') periodId?: string,
  ) {
    const buffer = await this.communityService.buildExpensesReportPdf(condoId, periodId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="relacion-de-gastos.pdf"',
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}