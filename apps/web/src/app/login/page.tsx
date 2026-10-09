'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  FileCheck2,
  Loader2,
  Lock,
  Mail,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import { login, getSession } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Si ya hay una sesión activa, no tiene sentido mostrar el login.
  useEffect(() => {
    if (getSession()) router.replace('/');
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
      setLoading(false);
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
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Contraseña
                </label>
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

            <p className="mt-6 text-[11px] text-slate-400 text-center leading-relaxed">
              Desarrollo local: cualquier usuario registrado entra con la
              contraseña de prueba <span className="font-mono text-slate-500">secret123</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}