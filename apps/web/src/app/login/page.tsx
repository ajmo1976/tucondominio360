'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileCheck2,
  Loader2,
  Lock,
  Mail,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import { ApiError, GOOGLE_AUTH_URL, login, getSession, resendVerification } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [loading, setLoading] = useState(false);

  // Si ya hay una sesión activa, no tiene sentido mostrar el login.
  useEffect(() => {
    if (getSession()) router.replace('/');
  }, [router]);

  // El callback de Google vuelve a /login?error=<code> cuando no puede entrar.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    if (!code) return;
    const known: Record<string, string> = {
      INVITE_REQUIRED:
        'Este correo todavía no tiene una cuenta. Pide a la administración que te invite.',
      google_not_configured: 'El acceso con Google no está disponible por ahora.',
    };
    setError(known[code] ?? 'No se pudo iniciar sesión con Google.');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNeedsVerification(false);
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo iniciar sesión';
      const unverified =
        (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') ||
        /verific/i.test(message);
      setNeedsVerification(unverified);
      setError(message);
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError('Escribe tu correo para reenviar la verificación.');
      return;
    }
    setResendState('sending');
    try {
      await resendVerification(email);
      setResendState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar la verificación');
      setResendState('idle');
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Panel de marca (solo pantallas grandes) */}
      <div className="hidden lg:flex flex-col justify-between w-[46%] bg-slate-950 p-12">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black text-xl">
            360
          </div>
          <div>
            <h1 className="font-bold text-white text-lg leading-none">
              TuCondominio<span className="text-emerald-400">360</span>
            </h1>
            <p className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold mt-1">
              SaaS Multinivel
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-white leading-tight">
            La administración de tu condominio,
            <span className="text-emerald-400"> en un solo lugar</span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Portal para la administración y para los propietarios: recibos,
            conciliación bancaria y pago de servicios en una sola plataforma.
          </p>

          <ul className="space-y-4 text-sm text-slate-300">
            <li className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </span>
              Recibos de condominio al día (USD / VES)
            </li>
            <li className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <FileCheck2 className="w-4 h-4" />
              </span>
              Conciliación de pagos con Pago Móvil, transferencias y Zelle
            </li>
            <li className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </span>
              Acceso seguro por rol: administración o portal del propietario
            </li>
          </ul>
        </div>

        <p className="text-xs text-slate-500">
          © 2026 TuCondominio360 · Gestión inmobiliaria y condominios en Venezuela
        </p>
      </div>

      {/* Panel del formulario */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo compacto para móvil */}
          <div className="lg:hidden flex items-center space-x-2 mb-8 justify-center">
            <div className="w-9 h-9 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
              360
            </div>
            <h1 className="font-bold text-slate-900 text-lg">
              TuCondominio<span className="text-emerald-600">360</span>
            </h1>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <div className="mb-6">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                <Building2 className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Inicia sesión</h2>
              <p className="text-sm text-slate-500 mt-1">
                Accede a tu panel de administración o al portal de propietarios.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {needsVerification && resendState !== 'sent' && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-sm space-y-2">
                <p>Tu correo aún no está verificado.</p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendState === 'sending'}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-xs font-bold transition"
                >
                  {resendState === 'sending' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Reenviando...
                    </>
                  ) : (
                    'Reenviar verificación'
                  )}
                </button>
              </div>
            )}

            {resendState === 'sent' && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Si el correo está registrado, recibirás el enlace de verificación.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Contraseña
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 transition"
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
                    Verificando...
                  </>
                ) : (
                  <>
                    Entrar a la aplicación
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-[11px] uppercase tracking-widest font-semibold text-slate-400">
                o
              </span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <a
              href={GOOGLE_AUTH_URL}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
                />
              </svg>
              Continuar con Google
            </a>

            <p className="mt-6 text-[11px] text-slate-400 text-center leading-relaxed">
              ¿Te invitaron a una residencia? Revisa tu correo y activa tu cuenta
              desde el enlace de invitación.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}