import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>('DATABASE_URL');

    if (connectionString) {
      this.pool = new Pool({
        connectionString,
        ssl: {
          rejectUnauthorized: false,
        },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    } else {
      const isSsl = this.configService.get<string>('DATABASE_SSL', 'false') === 'true';
      this.pool = new Pool({
        host: this.configService.get<string>('DATABASE_HOST', 'localhost'),
        port: Number(this.configService.get<number>('DATABASE_PORT', 5433)),
        user: this.configService.get<string>('DATABASE_USER', 'postgres'),
        password: this.configService.get<string>('DATABASE_PASSWORD', 'postgrespassword'),
        database: this.configService.get<string>('DATABASE_NAME', 'tucondominio360'),
        ssl: isSsl ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    }
  }

  async onModuleInit() {
    try {
      const client = await this.pool.connect();
      this.logger.log('Conexión exitosa a la base de datos PostgreSQL');
      client.release();
    } catch (error) {
      this.logger.error('Error conectando a PostgreSQL:', error);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    const res = await this.pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      this.logger.warn(`Query lenta (${duration}ms): ${text}`);
    }
    return res;
  }

  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }
}
