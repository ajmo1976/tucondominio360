'use client';

import React from 'react';
import {
  AccountType,
  MODULE_VISIBILITY_BY_ACCOUNT_TYPE,
  modulesVisibleForAccountType,
} from '../lib/account-modules';
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
  CalendarDays,
  ClipboardList,
  Megaphone,
  Building2,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  isSuperadmin: boolean;
  /** Staff de empresa administradora/junta o con rol de residencia: ve el menú de gestión. */
  isStaff?: boolean;
  permissions?: string[];
  modulesByCondo?: Record<string, string[]>;
  selectedCondoId?: string;
  /** Tipo de cuenta del usuario (PROPIETARIO | JUNTA | ADMINISTRADORA): filtra
   *  modulos de menu segun el rol de cuenta, complementando modulosByCondo. */
  accountType?: AccountType | null;
}

export function Sidebar({
  currentTab,
  onTabChange,
  isSuperadmin,
  isStaff = false,
  permissions = [],
  modulesByCondo = {},
  selectedCondoId,
  accountType,
}: SidebarProps) {
  // Permisos mínimos requeridos por cada ítem de menú (para usuarios no superadmin).
  const MENU_PERMISSIONS: Record<string, string[]> = {
    maintenance: ['MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT'],
    users: ['USERS_MANAGE'],
    expenses: ['EXPENSES_MANAGE'],
    bills: ['BILLING_MANAGE'],
    payments: ['PAYMENTS_MANAGE'],
    units: ['UNITS_MANAGE'],
    access: ['ACCESS_MANAGE'],
    amenities: ['AMENITIES_MANAGE', 'AMENITIES_BOOK'],
    announcements: ['ANNOUNCEMENTS_MANAGE', 'ANNOUNCEMENTS_VIEW'],
    consultations: ['CONSULTATIONS_MANAGE', 'CONSULTATIONS_VOTE'],
    community: ['COMMUNITY_VIEW'],
    'my-bills': ['PAYMENTS_REPORT'],
    'my-units': ['COMMUNITY_VIEW'],
  };

  // Mapeo de ítem de menú → código de módulo (para filtrar por módulo habilitado)
  const MENU_TO_MODULE: Record<string, string> = {
    maintenance: 'MAINTENANCE',
    users: 'USERS',
    expenses: 'EXPENSES',
    bills: 'BILLING',
    payments: 'PAYMENTS',
    units: 'UNITS',
    access: 'ACCESS',
    amenities: 'AMENITIES',
    announcements: 'ANNOUNCEMENTS',
    consultations: 'CONSULTATIONS',
    community: 'COMMUNITY',
    'my-bills': 'COMMUNITY',
    'my-units': 'COMMUNITY',
    dashboard: 'DASHBOARD',
  };

  /** Verifica si el usuario tiene permiso para ver un ítem. */
  function hasPermission(itemId: string, perms: string[]): boolean {
    const required = MENU_PERMISSIONS[itemId];
    return !required || required.some((p) => perms.includes(p));
  }

  /** Verifica si el módulo está habilitado para el condominio actual. */
  function isModuleEnabled(itemId: string): boolean {
    if (!selectedCondoId) return true;
    const moduleCode = MENU_TO_MODULE[itemId];
    if (!moduleCode) return true;
    const condoModules = modulesByCondo[selectedCondoId];
    if (!condoModules) return true;
    return condoModules.includes(moduleCode);
  }

  /** Verifica si el módulo es visible para el tipo de cuenta del usuario. */
  function isModuleVisibleForAccountType(itemId: string): boolean {
    if (!accountType) return true;
    const moduleCode = MENU_TO_MODULE[itemId];
    if (!moduleCode) return true;
    const visible = modulesVisibleForAccountType(accountType, [moduleCode]);
    return visible.length > 0;
  }

  /** Filtra los ítems del menú basándose en permisos, módulos habilitados
   *  por condominio y visibilidad por tipo de cuenta. */
  function filterMenuItems(
    items: { id: string; label: string; icon: any }[],
    perms: string[],
  ): { id: string; label: string; icon: any }[] {
    if (!perms || perms.length === 0) return items;
    return items.filter((item) => {
      return (
        hasPermission(item.id, perms) &&
        isModuleEnabled(item.id) &&
        isModuleVisibleForAccountType(item.id)
      );
    });
  }

  // Menú de administración (junta, personal de empresa o superadmin): todos
  // los módulos de gestión; el filtro de permisos + módulos habilitados de
  // abajo se encarga de ocultar lo que el rol no pueda usar.
  const ADMIN_MENU_ITEMS = [
    { id: 'dashboard', label: 'Dashboard General', icon: LayoutDashboard },
    { id: 'maintenance', label: 'Mantenimiento', icon: ClipboardList },
    { id: 'announcements', label: 'Cartelera Digital', icon: Megaphone },
    { id: 'expenses', label: 'Gastos y Facturas', icon: FileSpreadsheet },
    { id: 'bills', label: 'Gestión de Recibos', icon: Receipt },
    { id: 'payments', label: 'Conciliación de Pagos', icon: ArrowLeftRight },
    { id: 'units', label: 'Propietarios y Alícuotas', icon: Home },
    { id: 'access', label: 'Control de Acceso / Garita', icon: QrCode },
    { id: 'amenities', label: 'Reserva de Áreas Comunes', icon: CalendarDays },
    { id: 'users', label: 'Usuarios y Accesos', icon: Users },
    { id: 'companies', label: 'Empresas Administradoras', icon: Building2 },
    { id: 'consultations', label: 'Consultas y Asambleas', icon: Vote },
  ];

  // Menú del portal del propietario (solo lo propio: transparencia y recibos).
  const PORTAL_MENU_ITEMS = [
    { id: 'community', label: 'Dashboard General', icon: LayoutDashboard },
    { id: 'announcements', label: 'Cartelera Digital', icon: Megaphone },
    { id: 'consultations', label: 'Consultas y Asambleas', icon: Vote },
    { id: 'amenities', label: 'Reserva de Áreas Comunes', icon: CalendarDays },
    { id: 'maintenance', label: 'Mantenimiento', icon: ClipboardList },
    { id: 'access', label: 'Visitas, Garita y Paquetes', icon: QrCode },
    { id: 'my-bills', label: 'Mis Recibos', icon: Receipt },
    { id: 'my-units', label: 'Mis Unidades', icon: Building2 },
  ];

  // En modo propietario el menú se reduce a lo que el dueño necesita; el
  // personal de gestión ve los módulos de administración (más su portal
  // personal, por si también es propietario de una unidad).
  const baseMenuItems = isSuperadmin
    ? ADMIN_MENU_ITEMS
    : isStaff
      ? [
          ...ADMIN_MENU_ITEMS,
          { id: 'my-bills', label: 'Mis Recibos', icon: Receipt },
          { id: 'my-units', label: 'Mis Unidades', icon: Building2 },
        ]
      : PORTAL_MENU_ITEMS;

  // Filtrar según permisos Y módulos habilitados; "Empresas" es exclusivo
  // del superadmin (los demás roles ni siquiera la ven en el menú).
  const menuItems = filterMenuItems(baseMenuItems, permissions).filter(
    (item) => item.id !== 'companies' || isSuperadmin,
  );

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
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                <span className="flex-1 text-left leading-snug">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer con versión */}
      <div className="p-4 border-t border-slate-800">
        <p className="text-[11px] text-slate-500 text-center">
          TuCondominio360 v1.0.0
        </p>
      </div>
    </aside>
  );
}