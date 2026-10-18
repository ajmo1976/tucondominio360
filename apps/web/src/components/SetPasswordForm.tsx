'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Lock } from 'lucide-react';
import { AuthError, AuthSuccess } from './AuthShell';
import { GOOGLE_AUTH_URL } from '../lib/api';

/**
 * Formulario para definir contraseña con un token de correo. Lo usan la
 * aceptación de invitación y el reseteo; solo cambia la llamada de envío.
 */
export function SetPasswordForm({
  submit,
  submitLabel,
  showGoogle = false,
}: {
  submit: (token: string, newPassword: string) => Promise<void>;
  submitLabel: string;
  showGoogle?: boolean;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    setToken(t);
    setReady(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('El enlace no es válido o expiró.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await submit(token, password);
      setDone(true);
      setTimeout(() => router.replace('/login'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la operación');
      setLoading(false);
    }
  };

  if (!ready) return null;

  if (!token) {
    return <AuthError message="El enlace no es válido o expiró. Solicita uno nuevo a la administración." />;
  }

  if (done) {
    return (
      <AuthSuccess message="¡Listo! Ya puedes iniciar sesión con tu nueva contraseña. Te estamos llevando al inicio de sesión..." />
    );
  }

  const inputClass =
    'w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 transition';

  return (
    <>
      {error && <AuthError message={error} />}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Nueva contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              autoFocus
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Confirmar contraseña
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className={inputClass}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg text-sm font-bold shadow-sm transition"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              {submitLabel}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {showGoogle && (
        <a
          href={GOOGLE_AUTH_URL}
          className="mt-4 flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          Prefiero entrar con Google
        </a>
      )}
    </>
  );
}
