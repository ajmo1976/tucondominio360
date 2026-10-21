'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle,
  Home,
  Loader2,
  Lock,
  Shield,
  Unlock,
  X,
} from 'lucide-react';
import {
  ALL_CONDO_PERMISSIONS,
  CondoPermission,
  effectivePermissions,
} from '@tucondominio360/shared/dist/permissions';
import { fetchWithAuth } from '../lib/api';
import { ROLE_LABELS } from './UserFormModal';

/**
 * Resumen de accesos de un usuario: por residencia muestra el rol en la
 * residencia, el rol en la empresa administradora (si aplica), las unidades
 * que ocupa con su rol de ocupante y los permisos efectivos calculados con la
 * misma lógica del backend (`effectivePermissions`, Fase B). Si un permiso
 * pertenece a un módulo apagado para esa residencia, se muestra atenuado.
 */

const OCCUPANT_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propietario',
  CO_OWNER: 'Copropietario',
  TENANT: 'Arrendatario',
  RESIDENT: 'Residente',
  AUTHORIZED: 'Autorizado',
};

/** Etiquetas legibles de cada permiso. */
const PERMISSION_LABELS: Partial<Record<CondoPermission, string>> = {
  CONDO_MANAGE: 'Gestionar Residencia',
  USERS_MANAGE: 'Gestionar Usuarios',
  UNITS_MANAGE: 'Gestionar Unidades',
  AUDIT_VIEW: 'Ver Auditoría',
  BILLING_MANAGE: 'Gestionar Facturación',
  EXPENSES_MANAGE: 'Gestionar Gastos',
  PAYMENTS_MANAGE: 'Gestionar Pagos',
  PAYMENTS_REPORT: 'Reportes de Pagos',
  ACCESS_MANAGE: 'Gestionar Accesos',
  ACCESS_GUEST: 'Invitados de Acceso',
  AMENITIES_MANAGE: 'Gestionar Áreas Comunes',
  AMENITIES_BOOK: 'Reservar Áreas Comunes',
  MAINTENANCE_MANAGE: 'Gestionar Mantenimiento',
  MAINTENANCE_REPORT: 'Reportar Mantenimiento',
  ANNOUNCEMENTS_MANAGE: 'Gestionar Cartelera',
  ANNOUNCEMENTS_VIEW: 'Ver Cartelera',
  ANNOUNCEMENTS_ACK: 'Acusar Recibos',
  CONSULTATIONS_MANAGE: 'Gestionar Consultas',
  CONSULTATIONS_VOTE: 'Votar en Consultas',
  COMMUNITY_VIEW: 'Ver Portal de Comunidad',
};

/** Módulo (código) al que pertenece cada permiso, para atenuar si está apagado. */
const PERMISSION_MODULE: Partial<Record<CondoPermission, string>> = {
  BILLING_MANAGE: 'BILLING',
  EXPENSES_MANAGE: 'BILLING',
  PAYMENTS_MANAGE: 'PAYMENTS',
  PAYMENTS_REPORT: 'PAYMENTS',
  ACCESS_MANAGE: 'ACCESS',
  ACCESS_GUEST: 'ACCESS',
  AMENITIES_MANAGE: 'AMENITIES',
  AMENITIES_BOOK: 'AMENITIES',
  MAINTENANCE_MANAGE: 'MAINTENANCE',
  MAINTENANCE_REPORT: 'MAINTENANCE',
  ANNOUNCEMENTS_MANAGE: 'ANNOUNCEMENTS',
  ANNOUNCEMENTS_VIEW: 'ANNOUNCEMENTS',
  ANNOUNCEMENTS_ACK: 'ANNOUNCEMENTS',
  CONSULTATIONS_MANAGE: 'CONSULTATIONS',
  CONSULTATIONS_VOTE: 'CONSULTATIONS',
  USERS_MANAGE: 'USERS',
  UNITS_MANAGE: 'UNITS',
  CONDO_MANAGE: 'CONDO',
};

interface UnitDetail {
  unitId: string;
  unitCode: string;
  condoId: string;
  role: string;
  isPrimaryContact: boolean;
  isBillingRecipient: boolean;
}

interface CondoAccess {
  condoId: string;
  condoName: string;
  role: string;
  tenantRole?: string;
}

interface UserWithAccess {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_superadmin: boolean;
  condos: CondoAccess[];
  units?: UnitDetail[];
  emailVerified?: boolean;
  authProviders?: string[];
}

interface AccessSummaryModalProps {
  /** El modal carga el detalle completo (condos + units) vía GET /users/:id. */
  userId: string;
  /** Nombre precalculado para el header mientras carga. */
  fallbackName?: string;
  /** Módulos apagados por condoId (opcional): { [condoId]: string[] de códigos off }. */
  disabledModulesByCondo?: Record<string, string[]>;
  onClose: () => void;
}

export function AccessSummaryModal({
  userId,
  fallbackName,
  disabledModulesByCondo,
  onClose,
}: AccessSummaryModalProps) {
  const [user, setUser] = useState<UserWithAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetchWithAuth(`/users/${userId}`);
        if (alive) setUser(res as UserWithAccess);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'No se pudo cargar el usuario');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const unitsByCondo = useMemo(() => {
    const map: Record<string, UnitDetail[]> = {};
    for (const u of user?.units || []) {
      (map[u.condoId] ||= []).push(u);
    }
    return map;
  }, [user?.units]);

  const fullName = user
    ? `${user.first_name} ${user.last_name}`
    : fallbackName || 'Cargando…';

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
              <p className="text-sm text-slate-500">
                {fullName}
                {user ? ` · ${user.email}` : ''}
              </p>
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
          {loading && (
            <div className="flex items-center justify-center gap-2 text-slate-400 py-16 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando accesos…
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          {!loading && !error && user && (
            <>
          {/* Badges globales */}
          <div className="flex flex-wrap gap-2">
            {user.is_superadmin && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 text-emerald-400 text-xs font-bold">
                <Shield className="w-3 h-3" /> Super Administrador
              </span>
            )}
            {user.emailVerified === false && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                <AlertCircle className="w-3 h-3" /> Correo sin verificar
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

          {/* Por residencia */}
          {user.condos.length === 0 ? (
            <p className="text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
              Este usuario no tiene acceso a ninguna residencia.
            </p>
          ) : (
            user.condos.map((condo) => {
              const perms = effectivePermissions(
                (condo.tenantRole as any) ?? null,
                (condo.role as any) ?? null,
                user.is_superadmin,
              );
              const units = unitsByCondo[condo.condoId] || [];
              const disabled = disabledModulesByCondo?.[condo.condoId] || [];

              return (
                <div
                  key={condo.condoId}
                  className="bg-slate-50/50 rounded-xl border border-slate-200 p-5 space-y-4"
                >
                  {/* Condo header */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{condo.condoName}</h3>
                        <p className="text-sm text-slate-500">
                          {condo.condoId.slice(0, 8)}…
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {condo.tenantRole && (
                        <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                          Empresa: {condo.tenantRole}
                        </span>
                      )}
                      <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                        Residencia:{' '}
                        {ROLE_LABELS[condo.role] || condo.role}
                      </span>
                    </div>
                  </div>

                  {/* Unidades */}
                  {units.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Home className="w-4 h-4" /> Unidades ({units.length})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {units.map((unit) => (
                          <span
                            key={unit.unitId}
                            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-700 flex items-center gap-2"
                          >
                            <span className="font-mono text-emerald-600">
                              {unit.unitCode}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                              {OCCUPANT_ROLE_LABELS[unit.role] || unit.role}
                            </span>
                            {unit.isPrimaryContact && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium">
                                Principal
                              </span>
                            )}
                            {unit.isBillingRecipient && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium">
                                Boletas
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Permisos efectivos */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <Lock className="w-4 h-4" /> Permisos efectivos
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                        {perms.length} permisos
                      </span>
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {ALL_CONDO_PERMISSIONS.map((perm) => {
                        const has = perms.includes(perm);
                        const modOff = has
                          ? disabled.includes(PERMISSION_MODULE[perm] || '')
                          : false;
                        return (
                          <div
                            key={perm}
                            className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border flex items-center gap-1.5 ${
                              has
                                ? modOff
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                            }`}
                            title={modOff ? 'Módulo desactivado en esta residencia' : undefined}
                          >
                            {has ? (
                              modOff ? (
                                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              ) : (
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              )
                            ) : (
                              <Unlock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                            )}
                            <span className="truncate">
                              {PERMISSION_LABELS[perm] || perm}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
            </>
          )}
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
    </div>
  );
}
