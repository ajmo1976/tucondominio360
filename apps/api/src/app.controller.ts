import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from './database/database.service';

@ApiTags('Estado del Sistema')
@Controller()
export class AppController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Estado y bienvenida de la API' })
  async getStatus() {
    let dbStatus = 'connected';
    try {
      await this.db.query('SELECT 1');
    } catch {
      dbStatus = 'disconnected';
    }

    return {
      name: 'TuCondominio360 API',
      version: '1.0.0',
      status: 'online',
      database: dbStatus,
      environment: process.env.NODE_ENV || 'development',
      documentation: '/api/docs',
      timestamp: new Date().toISOString(),
    };
  }
}
