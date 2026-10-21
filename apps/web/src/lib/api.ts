const API_BASE = 'http://localhost:3001/api';

/** Base pública de la API (para enlaces que salen del fetch, p. ej. Google). */
export const API_BASE_URL = API_BASE;

/** URL que inicia el flujo OAuth de Google (redirige y vuelve a /auth/callback). */
export const GOOGLE_AUTH_URL = `${API_BASE}/auth/google`;

const TOKEN_KEY = 'tc360.sessionToken';
const SESSION_KEY = 'tc360.session';

let cachedToken: string | null = null;

export interface SessionCondo {
  condo_id: string;
  condo_name: string;
  role: string;
  permissions?: string[];
}

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  docType: string;
  docNumber: string;
  phone: string;
  isSuperadmin: boolean;
  emailVerified?: boolean;
}

export interface Session {
  accessToken: string;
  user: SessionUser;
  condos: SessionCondo[];
  modulesByCondo?: Record<string, string[]>;
}

/** Sesión persistente del usuario que inició sesión (o null si no hay). */
export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

/** Guarda la sesión en localStorage y en caché (uso interno). */
function persistSession(data: Session): Session {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TOKEN_KEY, data.accessToken);
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }
  cachedToken = data.accessToken;
  return data;
}

/** Inicia sesión real con email/contraseña y guarda la sesión persistente. */
export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    // Se propaga el mensaje real del backend y el `code` opcional
    // (p. ej. EMAIL_NOT_VERIFIED) para que la UI reaccione.
    let message = 'No se pudo iniciar sesión. Verifica tus datos.';
    let code: string | undefined;
    try {
      const data = await res.json();
      if (Array.isArray(data.message)) message = data.message.join(', ');
      else if (typeof data.message === 'string' && data.message) message = data.message;
      else if (typeof data.error === 'string' && data.error) message = data.error;
      if (typeof data.code === 'string') code = data.code;
    } catch {
      // Sin cuerpo JSON legible.
    }
    throw new ApiError(message, code);
  }

  const data = (await res.json()) as Session;
  return persistSession(data);
}

/**
 * Completa el ingreso por Google: el callback entrega el JWT y aquí se pide el
 * perfil (`/auth/me`) para armar y persistir la misma `Session` que el login local.
 */
export async function loginWithGoogleToken(token: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('No se pudo validar la sesión de Google');

  const data = await res.json();
  const user: SessionUser = {
    id: data?.user?.id ?? '',
    email: data?.user?.email ?? '',
    firstName: data?.user?.first_name ?? '',
    lastName: data?.user?.last_name ?? '',
    docType: data?.user?.doc_type ?? '',
    docNumber: data?.user?.doc_number ?? '',
    phone: data?.user?.phone ?? '',
    isSuperadmin: Boolean(data?.user?.is_superadmin),
    emailVerified: data?.user?.emailVerified,
  };

  return persistSession({
    accessToken: token,
    user,
    condos: data?.condos ?? [],
    modulesByCondo: data?.modulesByCondo ?? {},
  });
}

/** Error de API con el código opcional que envía el backend (`code`). */
export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** POST de auth sin sesión; lanza `ApiError` con el mensaje real del backend. */
async function postAuth(endpoint: string, body: unknown, fallback: string): Promise<any> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = fallback;
    let code: string | undefined;
    try {
      const data = await res.json();
      if (Array.isArray(data.message)) message = data.message.join(', ');
      else if (typeof data.message === 'string' && data.message) message = data.message;
      else if (typeof data.error === 'string' && data.error) message = data.error;
      if (typeof data.code === 'string') code = data.code;
    } catch {
      // Sin cuerpo JSON legible.
    }
    throw new ApiError(message, code);
  }
  return res.json().catch(() => ({}));
}

/**
 * Solicita el enlace de reseteo. El backend responde 202 siempre, así que aquí
 * no se revela si el correo existe.
 */
export async function forgotPassword(email: string): Promise<void> {
  await postAuth('/auth/password/forgot', { email }, 'No se pudo solicitar el reseteo');
}

/** Define la nueva contraseña con el token recibido por correo. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await postAuth(
    '/auth/password/reset',
    { token, newPassword },
    'El enlace no es válido o expiró',
  );
}

/** Verifica el correo electrónico con el token recibido. */
export async function verifyEmail(token: string): Promise<void> {
  await postAuth('/auth/email/verify', { token }, 'El enlace no es válido o expiró');
}

/** Reenvía el correo de verificación (respuesta uniforme del backend). */
export async function resendVerification(email: string): Promise<void> {
  await postAuth('/auth/email/resend', { email }, 'No se pudo reenviar la verificación');
}

/** Acepta una invitación: define la contraseña y activa la cuenta. */
export async function acceptInvitation(token: string, newPassword: string): Promise<void> {
  await postAuth(
    '/auth/invitation/accept',
    { token, newPassword },
    'La invitación no es válida o expiró',
  );
}

/** Reenvía la invitación a un usuario pendiente. */
export async function resendInvitation(userId: string): Promise<void> {
  await postAuth(`/users/${userId}/invitation/resend`, {}, 'No se pudo reenviar la invitación');
}

/** Anula la invitación pendiente de un usuario. */
export async function revokeInvitation(userId: string): Promise<void> {
  await postAuth(`/users/${userId}/invitation/revoke`, {}, 'No se pudo revocar la invitación');
}

/** Envía al usuario un enlace para que defina su nueva contraseña. */
export async function sendPasswordResetLink(userId: string): Promise<void> {
  await postAuth(`/users/${userId}/password-reset-link`, {}, 'No se pudo enviar el enlace de restablecimiento');
}

/** Obtiene el acceso efectivo de un usuario (para AccessSummaryModal). */
export async function getUserAccess(userId: string): Promise<any> {
  const res = await fetchWithAuth(`/users/${userId}/access`).catch(() => null);
  return res;
}

/** Cierra la sesión local (el token desaparece y deja de ser válido). */
export function logout(): void {
  cachedToken = null;
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(SESSION_KEY);
  // Limpieza de claves del antiguo "modo propietario demo".
  window.localStorage.removeItem('tc360.devUserEmail');
}

/** Obtiene los módulos habilitados por condominio para el usuario autenticado. */
export async function getMyModules(): Promise<Record<string, string[]>> {
  const res = await fetchWithAuth('/auth/me');
  return (res as any)?.modulesByCondo ?? {};
}

/**
 * Token JWT de la sesión actual. A diferencia del modo demo anterior, aquí NO
 * se hace login automático: si no hay sesión la app redirige a /login.
 */
export async function getAuthToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  cachedToken = getStoredToken();
  return cachedToken || '';
}

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && token) {
    // Token vencido o invalidado: se limpia la sesión y se devuelve al login.
    logout();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('La sesión expiró. Inicia sesión de nuevo.');
  }

  if (!response.ok) {
    // El backend responde 400/404/409/403 con { message }. Se propaga el
    // motivo real para que la UI lo muestre (p. ej. al eliminar un usuario con
    // historial, o al reportar un pago de un inmueble ajeno).
    let message = `API Error: ${response.statusText}`;
    try {
      const data = await response.json();
      if (data) {
        if (Array.isArray(data.message)) message = data.message.join(', ');
        else if (typeof data.message === 'string' && data.message) message = data.message;
        else if (typeof data.error === 'string' && data.error) message = data.error;
      }
    } catch {
      // Sin cuerpo JSON legible; se queda con el fallback.
    }
    throw new Error(message);
  }

  return response.json();
}

/** Descarga un archivo autenticado (PDF) disparando la descarga del navegador. */
export async function downloadWithAuth(endpoint: string, filename: string): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    let message = `No se pudo descargar el documento (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data?.message === 'string' && data.message) message = data.message;
    } catch {
      // Sin cuerpo legible.
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}