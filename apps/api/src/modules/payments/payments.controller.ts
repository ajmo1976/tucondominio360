import { Controller, Post, Get, Body, Param, Query, UseGuards, Request, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PaymentsService } from './payments.service';
import { ReportPaymentDto } from './dto/report-payment.dto';

@ApiTags('Pagos y Conciliación')
@Controller('payments')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('report')
  @ApiOperation({ summary: 'Reportar pago (Pago Móvil, Transferencia, Zelle, etc.) con cálculo BCV y autoconciliación' })
  async reportPayment(@Request() req: any, @Body() dto: ReportPaymentDto) {
    return this.paymentsService.reportPayment(req.user.id, dto);
  }

  @Get('condos/:condoId')
  @ApiOperation({ summary: 'Listar pagos reportados por residentes' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'VERIFIED', 'REJECTED'] })
  async getPayments(
    @Param('condoId') condoId: string,
    @Query('status') status?: string,
  ) {
    return this.paymentsService.getPayments(condoId, status);
  }

  @Patch(':id/verify')
  @ApiOperation({ summary: 'Aprobar o rechazar un pago manualmente' })
  async verifyPayment(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { approved: boolean; rejectionReason?: string },
  ) {
    return this.paymentsService.verifyPayment(id, req.user.id, body.approved, body.rejectionReason);
  }
}
