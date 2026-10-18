// =============================================================================
// @tucondominio360/shared - Identidad y tokens de autenticación
// =============================================================================

import { createHash, randomBytes } from 'node:crypto';

/** Proveedores de acceso soportados por una cuenta. */
export type AuthProvider = 'LOCAL' | 'GOOGLE';

/** Propósitos de los tokens de un solo uso enviados por correo. */
export type EmailTokenPurpose = 'INVITATION' | 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

/** Vigencia de cada tipo de token, en milisegundos. */
export const AUTH_TOKEN_TTL_MS: Record<EmailTokenPurpose, number> = {
  INVITATION: 7 * 24 * 60 * 60 * 1000, // 7 días
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000, // 24 horas
  PASSWORD_RESET: 60 * 60 * 1000, // 1 hora
};

/** Genera un token opaco en base64url (32 bytes de entropía). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash determinista de un token (sha256 en hex). Es lo único que se persiste:
 * el token en claro viaja solo en el enlace del correo.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
