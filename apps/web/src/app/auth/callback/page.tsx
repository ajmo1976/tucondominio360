'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { loginWithGoogleToken } from '../../../lib/api';
import { AuthError, AuthShell } from '../../../components/AuthShell';

/** Punto de llegada del callback de Google: canjea el JWT por una sesión. */
export default function GoogleCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setError('No recibimos el token de Google. Intenta de nuevo desde el inicio de sesión.');
      return;
    }

    loginWithGoogleToken(token)
      .then(() => router.replace('/'))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google'),
      );
  }, [router]);

  return (
    <AuthShell title="Iniciando sesión con Google">
      {error ? (
        <>
          <AuthError message={error} />
          <Link
            href="/login"
            className="mt-2 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
          >
            Volver al inicio de sesión
          </Link>
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Validando tu cuenta...
        </div>
      )}
    </AuthShell>
  );
}
