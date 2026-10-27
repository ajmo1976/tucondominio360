import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const API_BASE = 'http://localhost:3001/api';

export const API_BASE_URL = API_BASE;
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

export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export async function getSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw) {
      const session = JSON.parse(raw) as Session;
      cachedToken = session.accessToken;
      return session;
    }
  } catch {
    return null;
  }
  return null;
}

export async function getStoredToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    cachedToken = token;
    return token;
  } catch {
    return null;
  }
}

async function persistSession(data: Session): Promise<Session> {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, data.accessToken);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {}
  cachedToken = data.accessToken;
  return data;
}

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    let message = 'No se pudo iniciar sesión. Verifica tus datos.';
    let code: string | undefined;
    try {
      const data = await res.json();
      if (Array.isArray(data.message)) message = data.message.join(', ');
      else if (typeof data.message === 'string' && data.message) message = data.message;
      else if (typeof data.error === 'string' && data.error) message = data.error;
      if (typeof data.code === 'string') code = data.code;
    } catch {}
    throw new ApiError(message, code);
  }

  const data = (await res.json()) as Session;
  return persistSession(data);
}

export async function logout(): Promise<void> {
  cachedToken = null;
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {}
}

export async function getMyModules(): Promise<Record<string, string[]>> {
  try {
    const res = await fetchWithAuth('/auth/me');
    return (res as any)?.modulesByCondo ?? {};
  } catch {
    return {};
  }
}

export async function getAuthToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  cachedToken = await getStoredToken();
  return cachedToken || '';
}

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = await getAuthToken();
  const headers: any = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && token) {
    await logout();
    throw new Error('La sesión expiró. Inicia sesión de nuevo.');
  }

  if (!response.ok) {
    let message = `API Error: ${response.statusText}`;
    try {
      const data = await response.json();
      if (data) {
        if (Array.isArray(data.message)) message = data.message.join(', ');
        else if (typeof data.message === 'string' && data.message) message = data.message;
        else if (typeof data.error === 'string' && data.error) message = data.error;
      }
    } catch {}
    throw new Error(message);
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}
