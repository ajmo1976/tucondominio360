const API_BASE = 'http://localhost:3001/api';

const TOKEN_KEY = 'tc360.sessionToken';
const SESSION_KEY = 'tc360.session';

let cachedToken: string | null = null;

export interface SessionCondo {
  condo_id: string;
  condo_name: string;
  role: string;
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
}

export interface Session {
  accessToken: string;
  user: SessionUser;
  condos: SessionCondo[];
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

/** Inicia sesión real con email/contraseña y guarda la sesión persistente. */
export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    // Se propaga el mensaje real del backend: "Credenciales inválidas",
    // "El usuario se encuentra desactivado", etc.
    let message = 'No se pudo iniciar sesión. Verifica tus datos.';
    try {
      const data = await res.json();
      if (Array.isArray(data.message)) message = data.message.join(', ');
      else if (typeof data.message === 'string' && data.message) message = data.message;
      else if (typeof data.error === 'string' && data.error) message = data.error;
    } catch {
      // Sin cuerpo JSON legible.
    }
    throw new Error(message);
  }

  const data = (await res.json()) as Session;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TOKEN_KEY, data.accessToken);
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }
  cachedToken = data.accessToken;
  return data;
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