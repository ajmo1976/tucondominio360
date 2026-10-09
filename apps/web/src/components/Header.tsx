'use client';

import React from 'react';
import { Bell, Building2, ChevronDown, LogOut, UserCog } from 'lucide-react';

interface HeaderProps {
  bcvRate: string;
  condoName: string;
  condoRif: string;
  condoLocation: string;
  userName: string;
  userEmail: string;
  isSuperadmin: boolean;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenCondoSelector: () => void;
}

/** Iniciales a partir del nombre (p. ej. "Leticia Sucre" → "LS"). */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

export function Header({
  bcvRate,
  condoName,
  condoRif,
  condoLocation,
  userName,
  userEmail,
  isSuperadmin,
  onLogout,
  onOpenProfile,
  onOpenCondoSelector,
}: HeaderProps) {
  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
      {/* Selector de Condominio Activo (Clickable para cambiar) */}
      <button
        onClick={onOpenCondoSelector}
        className="flex items-center space-x-3 text-left p-1.5 -ml-1.5 rounded-xl hover:bg-slate-50 transition border border-transparent hover:border-slate-200 group"
        title="Haz clic para cambiar de residencia o conjunto administrado"
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold group-hover:bg-emerald-600 group-hover:text-white transition shadow-sm">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="font-bold text-slate-800 text-sm md:text-base leading-tight group-hover:text-emerald-700 transition flex items-center gap-1.5">
              <span>{condoName || '—'}</span>
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition" />
            </h2>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
              RIF: {condoRif || '—'}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {condoLocation || '—'} ·{' '}
            <span className="text-emerald-600 font-semibold group-hover:underline">Cambiar Residencia</span>
          </p>
        </div>
      </button>

      {/* Badges de Información y Tasa BCV */}
      <div className="flex items-center space-x-4">
        {/* Tasa Oficial BCV */}
        <div className="hidden sm:flex items-center space-x-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-lg text-xs font-medium">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-emerald-700 font-semibold">Tasa Oficial BCV:</span>
          <span className="font-bold text-emerald-900">
            {bcvRate ? `Bs. ${bcvRate} / USD` : 'No disponible'}
          </span>
        </div>

        {/* Notificaciones */}
        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition hidden sm:block">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full"></span>
        </button>

        {/* Cerrar Sesión */}
        <button
          onClick={onLogout}
          className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition"
          title="Cerrar sesión"
        >
          <LogOut className="w-4 h-4" />
          <span>Cerrar sesión</span>
        </button>

        {/* Perfil del Usuario / Botón Editar Perfil */}
        <button
          onClick={onOpenProfile}
          className="flex items-center space-x-3 pl-3 border-l border-slate-200 hover:bg-slate-50 p-1.5 rounded-xl transition group text-left"
          title="Haz clic para editar tus datos de usuario"
        >
          <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold text-sm group-hover:bg-emerald-600 transition">
            {initialsOf(userName)}
          </div>
          <div className="hidden md:block text-xs">
            <p className="font-semibold text-slate-800 leading-tight group-hover:text-emerald-700 transition">
              {userName || userEmail || '—'}
            </p>
            <p className="text-emerald-600 font-medium flex items-center gap-1">
              <span>{isSuperadmin ? 'Super Administrador' : 'Propietario · Portal de Recibos'}</span>
              <UserCog className="w-3 h-3 text-slate-400 group-hover:text-emerald-600" />
            </p>
          </div>
        </button>
      </div>
    </header>
  );
}