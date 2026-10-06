import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class BcvService {
  private readonly logger = new Logger(BcvService.name);

  constructor(private readonly db: DatabaseService) {}

  async fetchLiveBcvRate(): Promise<number> {
    try {
      const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        headers: { 'User-Agent': 'TuCondominio360/1.0' },
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      if (data && data.promedio && Number(data.promedio) > 0) {
        // En Venezuela la tasa BCV oficial se mantiene estable en torno a 36-45 VES/USD.
        // Si la API devuelve un valor anómalo (ej. por error de fuente o desactualización), lo limitamos a un rango razonable.
        let liveRate = Number(data.promedio);
        // Permitir la tasa real obtenida de la API oficial (ej. 871 o cualquier valor actual del BCV sin topes artificiales)
        if (liveRate <= 0) {
          liveRate = 36.85; // Tasa oficial segura de respaldo
        }
        const today = new Date().toISOString().split('T')[0];
        
        await this.db.query(
          `INSERT INTO exchange_rates (rate_date, base_currency, target_currency, rate, source)
           VALUES ($1, 'USD', 'VES', $2, 'BCV_OFFICIAL_LIVE')
           ON CONFLICT (rate_date, base_currency, target_currency, source) 
           DO UPDATE SET rate = EXCLUDED.rate, created_at = NOW()`,
          [today, liveRate],
        );
        return liveRate;
      }
    } catch (err: any) {
      this.logger.warn(`No se pudo actualizar la tasa BCV en vivo: ${err.message}. Usando base de datos.`);
    }
    return 36.85;
  }

  async getCurrentRate() {
    // Intentar actualizar en vivo primero
    await this.fetchLiveBcvRate();

    const res = await this.db.query(
      `SELECT rate_date, base_currency, target_currency, rate, source, created_at
       FROM exchange_rates
       WHERE base_currency = 'USD' AND target_currency = 'VES'
       ORDER BY rate_date DESC, created_at DESC
       LIMIT 1`,
    );

    if (res.rows.length === 0) {
      return {
        rateDate: new Date().toISOString().split('T')[0],
        baseCurrency: 'USD',
        targetCurrency: 'VES',
        rate: 36.85,
        source: 'DEFAULT',
      };
    }

    return res.rows[0];
  }

  async getHistory(limit = 30) {
    const res = await this.db.query(
      `SELECT rate_date, base_currency, target_currency, rate, source
       FROM exchange_rates
       WHERE base_currency = 'USD' AND target_currency = 'VES'
       ORDER BY rate_date DESC
       LIMIT $1`,
      [limit],
    );
    return res.rows;
  }
}
