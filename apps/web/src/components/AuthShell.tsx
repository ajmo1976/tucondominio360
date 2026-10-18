import React from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

/**
 * Marco visual compartido por las pantallas de autenticación (invitación,
 * verificación, reseteo y callback). Mantiene la misma identidad que el login.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-slate-900">
      <div className="w-full max-w-md">
        <Link href="/login" className="flex items-center space-x-2 mb-8 justify-center">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
            360
          </div>
          <span className="font-bold text-slate-900 text-lg">
            TuCondominio<span className="text-emerald-600">360</span>
          </span>
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="mb-6">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Aviso de error uniforme para las pantallas de autenticación. */
export function AuthError({ message }: { message: string }) {
  return (
    <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2 text-sm">
      <span>{message}</span>
    </div>
  );
}

/** Aviso de éxito uniforme para las pantallas de autenticación. */
export function AuthSuccess({ message }: { message: string }) {
  return (
    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm">
      {message}
    </div>
  );
}
