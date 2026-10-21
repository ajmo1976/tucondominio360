'use client';

import React from 'react';
import { X, Shield, Building2, Home, UserCheck, Lock, Unlock, AlertCircle, CheckCircle } from 'lucide-react';
import { ROLE_LABELS } from './UserFormModal';
import { CondoPermission, effectivePermissions } from '@tucondominio360/shared';

interface UserWithAccess {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_superadmin: boolean;
  condos: Array<{
    condoId: string;
    condoName: string;
    role: string;
    tenantRole?: string;
    permissions: string[];
    units?: number;
    unitsDetail?: Array<{
      id: string;
      code: string;
      occupantRole: string;
      isPrimaryContact: boolean;
      isBillingRecipient: boolean;
    }>;
  }>;
  emailVerified?: boolean;
  authProviders?: string[];
}

interface AccessSummaryModalProps {
  user: UserWithAccess;
  onClose: () => void;
}

const ALL_PERMISSIONS: CondoPermission[] = [
  'CONDO_MANAGE', 'USERS_MANAGE', 'UNITS_MANAGE', 'AUDIT_VIEW',
  'BILLING_MANAGE', 'EXPENSES_MANAGE', 'PAYMENTS_MANAGE', 'PAYMENTS_REPORT',
  'ACCESS_MANAGE', 'ACCESS_GUEST',
  'AMENITIES_MANAGE', 'AMENITIES_BOOK',
  'MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT',
  'ANNOUNCEMENTS_MANAGE', 'ANNOUNCEMENTS_VIEW', 'ANNOUNCEMENTS_ACK',
  'CONSULTATIONS_MANAGE', 'CONSULTATIONS_VOTE',
  'COMMUNITY_VIEW',
];

const PERMISSION_LABELS: Record<string, string> = {
  CONDO_MANAGE: 'Gestionar Condominio',
  USERS_MANAGE: 'Gestionar Usuarios',
  UNITS_MANAGE: 'Gestionar Unidades',
  AUDIT_VIEW: 'Ver Auditoría',
  BILLING_MANAGE: 'Gestionar Facturación',
  EXPENSES_MANAGE: 'Gestionar Gastos',
  PAYMENTS_MANAGE: 'Gestionar Pagos',
  PAYMENTS_REPORT: 'Ver Reportes de Pagos',
  ACCESS_MANAGE: 'Gestionar Accesos',
  ACCESS_GUEST: 'Gestionar Invitados',
  AMENITIES_MANAGE: 'Gestionar Áreas Comunes',
  AMENITIES_BOOK: 'Reservar Áreas Comunes',
  MAINTENANCE_MANAGE: 'Gestionar Mantenimiento',
  MAINTENANCE_REPORT: 'Reportar Mantenimiento',
  ANNOUNCEMENTS_MANAGE: 'Gestionar Cartelera',
  ANNOUNCEMENTS_VIEW: 'Ver Cartelera',
  ANNOUNCEMENTS_ACK: 'Acusar Recibos',
  CONSULTATIONS_MANAGE: 'Gestionar Consultas',
  CONSULTATIONS_VOTE: 'Votar en Consultas',
  COMMUNITY_VIEW: 'Ver Portal Comunidad',
};

const MODULE_PERMISSIONS: Record<string, string[]> = {
  DASHBOARD: ['COMMUNITY_VIEW'],
  COMMUNITY: ['COMMUNITY_VIEW'],
  BILLING: ['BILLING_MANAGE'],
  UNITS: ['UNITS_MANAGE'],
  USERS: ['USERS_MANAGE'],
  EXPENSES: ['EXPENSES_MANAGE'],
  PAYMENTS: ['PAYMENTS_MANAGE'],
  ACCESS: ['ACCESS_MANAGE', 'ACCESS_GUEST'],
  AMENITIES: ['AMENITIES_MANAGE', 'AMENITIES_BOOK'],
  MAINTENANCE: ['MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT'],
  ANNOUNCEMENTS: ['ANNOUNCEMENTS_MANAGE', 'ANNOUNCEMENTS_VIEW', 'ANNOUNCEMENTS_ACK'],
  CONSULTATIONS: ['CONSULTATIONS_MANAGE', 'CONSULTATIONS_VOTE'],
};

export function AccessSummaryModal({ user, onClose }: AccessSummaryModalProps) {
  if (!user) return null;

  const fullName = `${user.first_name} ${user.last_name}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Permisos y Accesos</h2>
              <p className="text-sm text-slate-500">{fullName} · {user.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Global badges */}
          <div className="flex flex-wrap gap-2">
            {user.is_superadmin && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 text-emerald-400 text-xs font-bold">
                <Shield className="w-3 h-3" /> Super Administrador
              </span>
            )}
            {user.authProviders?.includes('GOOGLE') && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                Google
              </span>
            )}
            {user.authProviders?.includes('LOCAL') && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                Contraseña
              </span>
            )}
          </div>

          {/* Per condo */}
          {user.condos.map((condo) => {
            const tenantRole = condo.tenantRole;
            const condoRole = condo.role;
            const permissions = condo.permissions || [];

            // Calculate which modules are actually accessible
            const moduleStatus = Object.entries(MODULE_PERMISSIONS).map(([moduleCode, requiredPerms]) => {
              const hasAccess = requiredPerms.some(p => permissions.includes(p));
              return { module: moduleCode, hasAccess };
            });

            const enabledModules = moduleStatus.filter(m => m.hasAccess).map(m => m.module);
            const disabledModules = moduleStatus.filter(m => !m.hasAccess).map(m => m.module);

            return (
              <div key={condo.condoId} className="bg-slate-50/50 rounded-xl border border-slate-200 p-5 space-y-4">
                {/* Condo header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{condo.condoName}</h3>
                      <p className="text-sm text-slate-500">{condo.condoId.slice(0, 8)}...</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {condo.tenantRole && (
                      <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                        Empresa: {condo.tenantRole}
                      </span>
                    )}
                    <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                      Residencia: {ROLE_LABELS[condo.role as keyof typeof ROLE_LABELS] || condo.role}
                    </span>
                  </div>
                </div>

                {/* Units */}
                {condo.unitsDetail && condo.unitsDetail.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Home className="w-4 h-4" /> Unidades ({condo.unitsDetail.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {condo.unitsDetail.map((unit) => (
                        <span key={unit.id} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-700 flex items-center gap-2">
                          <span className="font-mono text-emerald-600">{unit.code}</span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                            {unit.occupantRole}
                          </span>
                          {unit.isPrimaryContact && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium">Principal</span>
                          )}
                          {unit.isBillingRecipient && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium">Facturación</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Permissions grid */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Lock className="w-4 h-4" /> Permisos efectivos
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                      {condo.permissions?.length || 0} permisos
                    </span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {ALL_PERMISSIONS.map((perm) => {
                      const hasPerm = condo.permissions?.includes(perm);
                      const moduleDisabled = Object.entries(MODULE_PERMISSIONS)
                        .filter(([, perms]) => perms.includes(perm))
                        .some(([mod]) => !enabledModules.includes(mod));

                      return (
                        <div
                          key={perm}
                          className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border ${
                            hasPerm
                              ? moduleDisabled
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                          title={moduleDisabled ? 'Módulo relacionado desactivado' : undefined}
                        >
                          <div className="flex items-center gap-1.5">
                            {hasPerm ? (
                              moduleDisabled
                                ? <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                                : <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Unlock className="w-3.5 h-3.5 text-slate-300" />
                            )}
                            <span className="truncate">{PERMISSION_LABELS[perm] || perm}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Module status summary */}
                  <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                    <h5 className="text-xs font-semibold text-slate-600 mb-2">Módulos:</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {enabledModules.map((mod) => (
                        <span key={mod} className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                          {mod}
                        </span>
                      ))}
                      {disabledModules.map((mod) => (
                        <span key={mod} className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-medium line-through">
                          {mod} (desactivado)
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-slate-200 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}