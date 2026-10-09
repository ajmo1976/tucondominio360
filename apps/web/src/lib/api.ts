const API_BASE = 'http://localhost:3001/api';

let cachedToken: string | null = null;

export async function getAuthToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'superadmin@tucondominio360.com',
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
    // período con pagos). Se propaga ese mensaje para que la UI muestre el
    // motivo real y no un "API Error: Bad Request" genérico.
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
