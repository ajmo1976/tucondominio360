/**
 * Catálogo de eventos de auditoría del módulo de autenticación. Se persisten en
 * `audit_logs` con `entity_name = 'users'` y `entity_id = user_id`.
 */
export const AUTH_AUDIT_EVENTS: readonly string[] = [
  'LOGIN_OK',
  'LOGIN_FAILED',
  'LOGOUT',
  'GOOGLE_LOGIN',
  'GOOGLE_LINKED',
  'EMAIL_VERIFIED',
  'EMAIL_VERIFICATION_RESENT',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_DONE',
  'INVITATION_SENT',
  'INVITATION_ACCEPTED',
  'USER_INVITED',
  'USER_INVITED_ACCEPTED',
];

export type AuthAuditEvent = (typeof AUTH_AUDIT_EVENTS)[number];
