import { Injectable } from '@nestjs/common';
import {
  AUTH_TOKEN_TTL_MS,
  EmailTokenPurpose,
  generateToken,
  hashToken,
} from '@tucondominio360/shared';
import { DatabaseService } from '../../database/database.service';

export interface ConsumedToken {
  userId: string;
  email: string;
}

/**
 * Tokens de un solo uso enviados por correo (invitación, verificación,
 * reseteo). Solo se persiste el sha256 del token; el token en claro viaja
 * únicamente en el enlace del correo y se consume una sola vez.
 */
@Injectable()
export class TokensService {
  constructor(private readonly db: DatabaseService) {}

  /** Emite un token nuevo e invalida los pendientes del mismo propósito. */
  async issue(userId: string, purpose: EmailTokenPurpose, email: string): Promise<string> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + AUTH_TOKEN_TTL_MS[purpose]);

    await this.db.query(
      `DELETE FROM auth_tokens
        WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
      [userId, purpose],
    );

    await this.db.query(
      `INSERT INTO auth_tokens (user_id, purpose, token_hash, email, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, purpose, hashToken(token), email, expiresAt],
    );

    return token;
  }

  /**
   * Consume un token: lo marca usado y devuelve su dueño. Devuelve `null` si
   * el token no existe, ya fue usado, es de otro propósito o expiró.
   */
  async consume(token: string, purpose: EmailTokenPurpose): Promise<ConsumedToken | null> {
    const res = await this.db.query(
      `UPDATE auth_tokens
          SET consumed_at = NOW()
        WHERE token_hash = $1
          AND purpose = $2
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING user_id, email`,
      [hashToken(token), purpose],
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0] as { user_id: string; email: string };
    return { userId: row.user_id, email: row.email };
  }
}
