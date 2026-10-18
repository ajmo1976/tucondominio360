'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { verifyEmail } from '../../lib/api';
import { AuthError, AuthShell, AuthSuccess } from '../../components/AuthShell';

type State = 'loading' | 'ok' | 'error';

export default function VerifyEmailPage() {
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('Estamos verificando tu correo...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const token = params.get('token');

    // El backend ya verificó y redirigió con ?status=ok|error.
    if (status === 'ok') {
      setState('ok');
      setMessage('Tu correo fue verificado. Ya puedes iniciar sesión.');
      return;
    }
    if (status === 'error') {
      setState('error');
      setMessage('No pudimos verificar tu correo: el enlace no es válido o expiró.');
      return;
    }

    // Flujo alterno: la página recibe el token y hace la verificación.
    if (token) {
      verifyEmail(token)
        .then(() => {
          setState('ok');
          setMessage('Tu correo fue verificado. Ya puedes iniciar sesión.');
        })
        .catch((err) => {
          setState('error');
          setMessage(err instanceof Error ? err.message : 'No pudimos verificar tu correo.');
        });
      return;
    }

    setState('error');
    setMessage('El enlace de verificación no es válido o expiró.');
  }, []);

  return (
    <AuthShell title="Verificación de correo">
      {state === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          {message}
        </div>
      )}
      {state === 'ok' && <AuthSuccess message={message} />}
      {state === 'error' && <AuthError message={message} />}

      {state !== 'loading' && (
        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
        >
          Ir al inicio de sesión
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </AuthShell>
  );
}
