const API_BASE = 'http://localhost:3001/api';

let cachedToken: string | null = null;

// Usuarios de demostración del "modo propietario": la misma app puede iniciar
// sesión como la administración o como un propietario registrado para probar
// el portal de recibos sin construir todavía el login real de dueños (Fase 3).
// Los emails usan el casing guardado en la BD para que el selector coincida
// con lo que devuelve /auth/me.
export const DEV_USERS = [
  { email: 'superadmin@tucondominio360.com', label: 'Super Admin', roleLabel: 'Administración' },
  { email: 'Leticia.Sucre@gmail.com', label: 'Leticia Sucre', roleLabel: 'Propietaria' },
  { email: 'jferrer@gmail.com', label: 'Jesús Ferrer', roleLabel: 'Propietario' },
  { email: 'arnaldo.martinez@gmail.com', label: 'Arnaldo Martínez', roleLabel: 'Propietario' },
] as const;

const DEV_USER_KEY = 'tc360.devUserEmail';

/** Email de la persona elegida para la sesión demo (por defecto, la administración). */
export function getDevUserEmail(): string {
  if (typeof window === 'undefined') return DEV_USERS[0].email;
  const saved = window.localStorage.getItem(DEV_USER_KEY);
  return DEV_USERS.some((u) => u.email === saved) ? (saved as string) : DEV_USERS[0].email;
}

/** Cambia la persona de la sesión demo (la página se recarga desde el llamador). */
export function setDevUserEmail(email: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEV_USER_KEY, email);
  // El token se emite por usuario; al cambiar de persona hay que invalidarlo.
  cachedToken = null;
}

export async function getAuthToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: getDevUserEmail(),
        password: 'secret123',
      }),
    });
    if (!res.ok) throw new Error('Login failed');
    const data = await res.json();
    cachedToken = data.accessToken;
    return data.accessToken;
  } catch (err) {
    console.error('Error fetching auth token:', err);
    return '';
  }
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

  if (!response.ok) {
    // El backend responde 400/404 con { message } (p. ej. al intentar borrar un
    // período con pagos, o al reportar un pago de un inmueble ajeno). Se
    // propaga ese mensaje para que la UI muestre el motivo real y no un
    // "API Error: Bad Request" genérico.
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