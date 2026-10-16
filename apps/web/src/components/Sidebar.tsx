'use client';

import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  ArrowLeftRight,
  Home,
  QrCode,
  DollarSign,
  Shield,
  FileSpreadsheet,
  Users,
  Vote,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  isSuperadmin: boolean;
}

export function Sidebar({ currentTab, onTabChange, isSuperadmin }: SidebarProps) {
  // En modo propietario (portal de transparencia y recibos) el menú se reduce
  // a lo que el dueño necesita: su Dashboard General (solo lectura) y sus
  // propios recibos; la administración conserva todos los módulos.
  const menuItems = isSuperadmin
    ? [
        { id: 'dashboard', label: 'Dashboard General', icon: LayoutDashboard },
        { id: 'expenses', label: 'Gastos y Facturas', icon: FileSpreadsheet },
        { id: 'bills', label: 'Gestación de Recibos', icon: Receipt },
        { id: 'payments', label: 'Conciliación de Pagos', icon: ArrowLeftRight },
        { id: 'units', label: 'Propietarios y Alícuotas', icon: Home },
        { id: 'access', label: 'Control de Acceso / Garita', icon: QrCode },
        { id: 'users', label: 'Usuarios y Accesos', icon: Users },
        { id: 'consultations', label: 'Consultas y Asambleas', icon: Vote },
      ]
    : [
        { id: 'community', label: 'Dashboard General', icon: LayoutDashboard },
        { id: 'consultations', label: 'Consultas y Asambleas', icon: Vote },
        { id: 'access', label: 'Visitas, Garita y Paquetes', icon: QrCode },
        { id: 'my-bills', label: 'Mis Recibos', icon: Receipt },
      ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 min-h-screen">
      <div>
        {/* Logo / Nombre del SaaS */}
        <div className="h-16 flex items-center px-6 border-b border-slate-800 space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-black text-lg">
            360
          </div>
          <div>
            <h1 className="font-bold text-white tracking-wide text-base leading-none">
              TuCondominio<span className="text-emerald-400">360</span>
            </h1>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
              SaaS Multinivel
            </span>
          </div>
        </div>

        {/* Badge de Empresa Administradora (Tenant) — solo modo administración */}
        {isSuperadmin && (
          <div className="p-4 mx-3 my-4 bg-slate-800/60 rounded-xl border border-slate-700/50">
            <div className="flex items-center space-x-2 text-xs text-emerald-400 font-semibold mb-1">
              <Shield className="w-3.5 h-3.5" />
              <span>Tenant Administradora</span>
            </div>
            <p className="text-sm font-medium text-white truncate">Admin Inmobiliaria Capital</p>
            <p className="text-[11px] text-slate-400">J-31456789-0</p>
          </div>
        )}

        {/* Menú de Navegación */}
        <nav className="px-3 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer del Sidebar */}
      <div className="p-4 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
        <div>
          <p className="text-slate-300 font-medium">Versión 1.0.0 (Local)</p>
          <p className="text-[10px] text-slate-500">PostgreSQL + Redis Activos</p>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
      </div>
    </aside>
  );
}
