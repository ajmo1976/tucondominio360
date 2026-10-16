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
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AmenitiesService } from './amenities.service';
import {
  CancelReservationDto,
  CreateAmenitySpaceDto,
  CreateBlackoutDto,
  CreateReservationDto,
  EvaluateReservationDto,
  InspectReservationDto,
  RegisterReservationPaymentDto,
  UpdateAmenitiesConfigDto,
  UpdateAmenitySpaceDto,
  UpdateReservationStatusDto,
} from './dto/amenities.dto';

@Controller('amenities')
@UseGuards(AuthGuard('jwt'))
export class AmenitiesController {
  constructor(private readonly service: AmenitiesService) {}

  @Get('overview')
  getOverview(@Request() req: any, @Query('condoId') condoId: string) {
    return this.service.getOverview(req.user, condoId);
  }

  @Get('config')
  getConfig(@Request() req: any, @Query('condoId') condoId: string) {
    return this.service.getConfig(req.user, condoId);
  }

  @Patch('config')
  updateConfig(@Request() req: any, @Body() dto: UpdateAmenitiesConfigDto) {
    return this.service.updateConfig(req.user, dto);
  }

  // ---------------------------------------------------------------------------
  // Catálogo parametrizable de espacios
  // ---------------------------------------------------------------------------

  @Get('spaces')
  listSpaces(@Request() req: any, @Query('condoId') condoId: string) {
    return this.service.listSpaces(req.user, condoId);
  }

  @Post('spaces')
  createSpace(@Request() req: any, @Body() dto: CreateAmenitySpaceDto) {
    return this.service.createSpace(req.user, dto);
  }

  @Patch('spaces/:id')
  updateSpace(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: Partial<UpdateAmenitySpaceDto>,
  ) {
    return this.service.updateSpace(req.user, id, dto);
  }

  @Delete('spaces/:id')
  deleteSpace(@Request() req: any, @Param('id') id: string) {
    return this.service.deleteSpace(req.user, id);
  }

  // ---------------------------------------------------------------------------
  // Bloqueos por mantenimiento / eventos (Blackouts)
  // ---------------------------------------------------------------------------

  @Get('blackouts')
  listBlackouts(
    @Request() req: any,
    @Query('condoId') condoId: string,
    @Query('amenityId') amenityId?: string,
  ) {
    return this.service.listBlackouts(req.user, condoId, amenityId);
  }

  @Post('blackouts')
  createBlackout(@Request() req: any, @Body() dto: CreateBlackoutDto) {
    return this.service.createBlackout(req.user, dto);
  }

  @Delete('blackouts/:id')
  deleteBlackout(@Request() req: any, @Param('id') id: string) {
    return this.service.deleteBlackout(req.user, id);
  }

  // ---------------------------------------------------------------------------
  // Motor de evaluación y gestión de reservas
  // ---------------------------------------------------------------------------

  @Post('reservations/evaluate')
  evaluateReservation(@Request() req: any, @Body() dto: EvaluateReservationDto) {
    return this.service.evaluateReservation(req.user, dto);
  }

  @Get('reservations')
  listReservations(
    @Request() req: any,
    @Query('condoId') condoId: string,
    @Query('amenityId') amenityId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    return this.service.listReservations(req.user, condoId, {
      amenityId,
      status,
      from,
      to,
      q,
    });
  }

  @Post('reservations')
  createReservation(@Request() req: any, @Body() dto: CreateReservationDto) {
    return this.service.createReservation(req.user, dto);
  }

  @Post('reservations/:id/status')
  updateStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateReservationStatusDto,
  ) {
    return this.service.updateReservationStatus(req.user, id, dto);
  }

  @Post('reservations/:id/cancel')
  cancelReservation(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CancelReservationDto,
  ) {
    return this.service.cancelReservation(req.user, id, dto);
  }

  @Post('reservations/:id/payment')
  registerPayment(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: RegisterReservationPaymentDto,
  ) {
    return this.service.registerPayment(req.user, id, dto);
  }

  @Post('reservations/:id/inspect')
  inspectReservation(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: InspectReservationDto,
  ) {
    return this.service.inspectAndSettleDeposit(req.user, id, dto);
  }

  // ---------------------------------------------------------------------------
  // Documentos Oficiales PDF
  // ---------------------------------------------------------------------------

  @Get('reservations/:id/voucher.pdf')
  async downloadVoucherPdf(
    @Request() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.buildVoucherPdf(req.user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="reserva-area-comun-${id.slice(0, 8)}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get('reports/reservations.pdf')
  async downloadReportPdf(
    @Request() req: any,
    @Query('condoId') condoId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.buildReportPdf(req.user, condoId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="reporte-areas-comunes.pdf"',
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
