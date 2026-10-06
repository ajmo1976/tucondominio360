import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BcvService } from './bcv.service';

@ApiTags('Tasas de Cambio (BCV)')
@Controller('bcv')
export class BcvController {
  constructor(private readonly bcvService: BcvService) {}

  @Get('current')
  @ApiOperation({ summary: 'Consultar tasa de cambio oficial vigente del BCV (USD/VES)' })
  async getCurrentRate() {
    return this.bcvService.getCurrentRate();
  }

  @Get('history')
  @ApiOperation({ summary: 'Histórico de tasas de cambio oficiales' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getHistory(@Query('limit') limit?: number) {
    return this.bcvService.getHistory(limit ? Number(limit) : 30);
  }
}
