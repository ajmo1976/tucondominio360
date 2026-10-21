'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, KeyRound, Loader2, Mail, Plus, Save, UserCircle2, X } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';

/**
 * Modal de creación/edición de usuario.
 *
 * En modo creación se distingue entre:
 *  - "Invitar por correo": no se define contraseña; el backend crea la cuenta
 *    y envía un enlace de invitación para que el usuario la defina.
 *  - "Crear con contraseña": se asigna una contraseña inicial directamente.
 *
 * Por residencia se elige el rol dentro del condominio (condo_role) y, para
 * cada unidad que ocupa, su rol de ocupante (OWNER/CO_OWNER/TENANT/…) y los
 * flags de contacto principal / destinatario de boletas.
 */

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  BOARD_PRESIDENT: 'Presidente de Junta',
  BOARD_TREASURER: 'Tesorero',
  BOARD_MEMBER: 'Miembro de Junta',
  TENANT: 'Arrendatario',
  GUARD: 'Guardia',
  CONCIERGE: 'Conserje',
  AUDITOR: 'Auditor',
};

export const OCCUPANT_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propietario',
  CO_OWNER: 'Copropietario',
  TENANT: 'Arrendatario',
  RESIDENT: 'Residente',
  AUTHORIZED: 'Autorizado',
};

const DOC_TYPES = ['V', 'E', 'J', 'G', 'P'];

interface CondoUnit {
  id: string;
  unit_code: string;
  unit_type?: string;
}

interface CondoOption {
  id: string;
  name: string;
  units: CondoUnit[];
}

interface UnitState {
  occupantRole: string;
  isPrimaryContact: boolean;
  isBillingRecipient: boolean;
}

interface Assignment {
  role: string;
  units: Record<string, UnitState>;
}

interface UnitAssignmentApi {
  unitId: string;
  occupantRole: string;
  isPrimaryContact?: boolean;
  isBillingRecipient?: boolean;
}

interface UserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  doc_type: string;
  doc_number: string;
  phone: string;
  is_active: boolean;
  is_superadmin: boolean;
  condos: Array<{ condoId: string; role: string }>;
  units?: Array<{
    unitId: string;
    condoId: string;
    /** El API de GET /users/:id lo devuelve como `role`; el de detalle como `occupantRole`. */
    role?: string;
    occupantRole?: string;
    isPrimaryContact?: boolean;
    isBillingRecipient?: boolean;
  }>;
}

interface UserFormModalProps {
  user: UserRow | null; // null → crear
  onClose: () => void;
  onSaved: () => void;
}

const defaultUnitState = (role: string): UnitState => ({
  occupantRole: role === 'TENANT' ? 'TENANT' : 'OWNER',
  isPrimaryContact: false,
  isBillingRecipient: false,
});

export function UserFormModal({ user, onClose, onSaved }: UserFormModalProps) {
  const isCreate = !user;

  const [condos, setCondos] = useState<CondoOption[]>([]);
  const [loadingCtx, setLoadingCtx] = useState(true);

  // 'invite' → sin contraseña (correo de invitación); 'password' → clave inicial.
  const [mode, setMode] = useState<'invite' | 'password'>('invite');

  const [form, setForm] = useState({
    firstName: user?.first_name || '',
    lastName: user?.last_name || '',
    email: user?.email || '',
    docType: user?.doc_type || 'V',
    docNumber: user?.doc_number || '',
    phone: user?.phone || '',
    password: '',
    isSuperadmin: user?.is_superadmin || false,
    isActive: user?.is_active ?? true,
  });

  // asignaciones: residencia → { rol condominio, unidades → estado ocupante }
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Cerrar con Escape y poner el foco inicial en el diálogo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      const res = await fetchWithAuth('/condos').catch(() => []);
      if (!Array.isArray(res)) return;

      const withUnits = await Promise.all(
        res.map(async (c: any) => {
          const units = await fetchWithAuth(`/condos/${c.id}/units`).catch(() => []);
          return {
            id: c.id,
            name: c.name,
            units: Array.isArray(units) ? units : [],
          };
        }),
      );
      setCondos(withUnits);

      // Prefill de asignaciones al editar
      if (user) {
        const pre: Record<string, Assignment> = {};
        for (const acc of user.condos || []) {
          const units: Record<string, UnitState> = {};
          for (const u of (user.units || []).filter((x) => x.condoId === acc.condoId)) {
            units[u.unitId] = {
              occupantRole: u.occupantRole || u.role || 'OWNER',
              isPrimaryContact: Boolean(u.isPrimaryContact),
              isBillingRecipient: Boolean(u.isBillingRecipient),
            };
          }
          pre[acc.condoId] = { role: acc.role || 'OWNER', units };
        }
        setAssignments(pre);
      }

      setLoadingCtx(false);
    })();
  }, [user]);

  const toggleCondo = (condoId: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (next[condoId]) {
        delete next[condoId];
      } else {
        next[condoId] = { role: 'OWNER', units: {} };
      }
      return next;
    });
  };

  const setRole = (condoId: string, role: string) => {
    setAssignments((prev) => {
      const current = prev[condoId] || { role: 'OWNER', units: {} };
      return { ...prev, [condoId]: { ...current, role } };
    });
  };

  const addUnit = (condoId: string, unitId: string, condoRole: string) => {
    setAssignments((prev) => {
      const current = prev[condoId];
      if (!current) return prev;
      return {
        ...prev,
        [condoId]: {
          ...current,
          units: { ...current.units, [unitId]: defaultUnitState(condoRole) },
        },
      };
    });
  };

  const removeUnit = (condoId: string, unitId: string) => {
    setAssignments((prev) => {
      const current = prev[condoId];
      if (!current) return prev;
      const units = { ...current.units };
      delete units[unitId];
      return { ...prev, [condoId]: { ...current, units } };
    });
  };

  const setUnitField = (
    condoId: string,
    unitId: string,
    field: keyof UnitState,
    value: string | boolean,
  ) => {
    setAssignments((prev) => {
      const current = prev[condoId];
      if (!current || !current.units[unitId]) return prev;
      return {
        ...prev,
        [condoId]: {
          ...current,
          units: {
            ...current.units,
            [unitId]: { ...current.units[unitId], [field]: value },
          },
        },
      };
    });
  };

  const enabledCondos = useMemo(() => Object.keys(assignments).length, [assignments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('El correo electrónico no es válido.');
      return;
    }
    if (mode === 'password' && !form.docNumber.trim()) {
      setError('El documento de identidad es requerido al crear con contraseña.');
      return;
    }
    if (mode === 'password' && isCreate && form.password.length < 6) {
      setError('La contraseña inicial debe tener al menos 6 caracteres.');
      return;
    }

    const body: Record<string, unknown> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      docType: form.docType,
      docNumber: form.docNumber.trim() || undefined,
      phone: form.phone.trim() || null,
      isSuperadmin: form.isSuperadmin,
      assignments: Object.entries(assignments).map(([condoId, a]) => ({
        condoId,
        role: a.role,
        units: Object.entries(a.units).map(
          ([unitId, us]): UnitAssignmentApi => ({
            unitId,
            occupantRole: us.occupantRole,
            isPrimaryContact: us.isPrimaryContact,
            isBillingRecipient: us.isBillingRecipient,
          }),
        ),
      })),
    };
    if (isCreate && mode === 'password') body.password = form.password;
    else if (!isCreate) body.isActive = form.isActive;

    setSaving(true);
    try {
      await fetchWithAuth(isCreate ? '/users' : `/users/${user!.id}`, {
        method: isCreate ? 'POST' : 'PATCH',
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el usuario');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isCreate ? 'Nuevo usuario' : 'Editar usuario'}
        tabIndex={-1}
        className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col focus:outline-none"
      >
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <UserCircle2 className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-base">{isCreate ? 'Nuevo Usuario' : `Editar · ${user!.first_name} ${user!.last_name}`}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Modo de creación: invitar vs crear con contraseña */}
          {isCreate && (
            <section>
              <h4 className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-3">Método de acceso</h4>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode('invite')}
                  className={`p-3 rounded-xl border text-left transition ${
                    mode === 'invite'
                      ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-400'
                      : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                  }`}
                >
                  <Mail className={`w-4 h-4 mb-1 ${mode === 'invite' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className="block font-bold text-slate-800">Invitar por correo</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    Se envía un enlace para que la persona defina su contraseña y active la cuenta.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('password')}
                  className={`p-3 rounded-xl border text-left transition ${
                    mode === 'password'
                      ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-400'
                      : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                  }`}
                >
                  <KeyRound className={`w-4 h-4 mb-1 ${mode === 'password' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className="block font-bold text-slate-800">Crear con contraseña</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">
                    Se asigna una contraseña inicial que el usuario podrá cambiar después.
                  </span>
                </button>
              </div>
            </section>
          )}

          {/* Datos personales */}
          <section>
            <h4 className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-3">Datos personales</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Apellido</label>
                <input
                  type="text"
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="correo@dominio.com"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tipo de documento</label>
                <select
                  value={form.docType}
                  onChange={(e) => setForm({ ...form, docType: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'V' ? 'V · Venezolano' : t === 'E' ? 'E · Extranjero' : t === 'J' ? 'J · Jurídico' : t === 'G' ? 'G · Gobierno' : 'P · Pasaporte'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  N° Documento {isCreate && mode === 'invite' && <span className="text-slate-400 font-normal">(opcional al invitar)</span>}
                </label>
                <input
                  type="text"
                  required={isCreate && mode === 'password'}
                  value={form.docNumber}
                  onChange={(e) => setForm({ ...form, docNumber: e.target.value })}
                  placeholder="18456123"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+584120000000"
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                />
              </div>
              {isCreate && mode === 'password' && (
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Contraseña inicial <span className="text-slate-400 font-normal">(el usuario podrá cambiarla en su perfil)</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
              )}
            </div>
          </section>

          {/* Nivel de acceso global */}
          <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-semibold text-slate-700">
                Super Administrador
                <span className="block text-[11px] text-slate-400 font-normal">
                  Control total del SaaS: ve y administra todas las residencias y usuarios.
                </span>
              </span>
              <span
                role="switch"
                aria-checked={form.isSuperadmin}
                tabIndex={0}
                onClick={() => setForm({ ...form, isSuperadmin: !form.isSuperadmin })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setForm({ ...form, isSuperadmin: !form.isSuperadmin });
                  }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition cursor-pointer ${form.isSuperadmin ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${form.isSuperadmin ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </span>
            </label>
            {!isCreate && (
              <label className="flex items-center justify-between cursor-pointer pt-2 border-t border-slate-200">
                <span className="font-semibold text-slate-700">
                  Usuario activo
                  <span className="block text-[11px] text-slate-400 font-normal">
                    Un usuario inactivo no puede iniciar sesión.
                  </span>
                </span>
                <span
                  role="switch"
                  aria-checked={form.isActive}
                  tabIndex={0}
                  onClick={() => setForm({ ...form, isActive: !form.isActive })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setForm({ ...form, isActive: !form.isActive });
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition cursor-pointer ${form.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${form.isActive ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </span>
              </label>
            )}
          </section>

          {/* Residencias y unidades */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Residencias y unidades</h4>
              <span className="text-[11px] text-slate-400">
                {enabledCondos === 0 ? 'Sin accesos asignados' : `${enabledCondos} residencia(s)`}
              </span>
            </div>

            {loadingCtx ? (
              <div className="flex items-center gap-2 text-slate-400 py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando residencias…
              </div>
            ) : condos.length === 0 ? (
              <p className="text-slate-400 bg-slate-50 border-dashed border-slate-200 rounded-xl p-4 text-center">
                No hay residencias registradas aún.
              </p>
            ) : (
              <div className="space-y-3">
                {condos.map((c) => {
                  const enabled = Boolean(assignments[c.id]);
                  const sel = assignments[c.id];
                  const availableUnits = c.units.filter((u) => !enabled || !sel.units[u.id]);
                  return (
                    <div key={c.id} className={`border rounded-xl transition ${enabled ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
                      <div className="p-3 flex items-center justify-between">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => toggleCondo(c.id)}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="font-semibold text-slate-800">{c.name}</span>
                          {!enabled && <span className="text-[11px] text-slate-400">sin acceso</span>}
                        </label>
                        {enabled && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500">Rol en la residencia:</span>
                            <select
                              value={sel.role}
                              onChange={(e) => setRole(c.id, e.target.value)}
                              className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800"
                            >
                              {Object.entries(ROLE_LABELS).map(([val, label]) => (
                                <option key={val} value={val}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {enabled && (
                        <div className="px-3 pb-3 space-y-2">
                          {Object.keys(sel.units).length === 0 ? (
                            <p className="text-[11px] text-slate-400">Sin unidades asignadas.</p>
                          ) : (
                            Object.entries(sel.units).map(([unitId, us]) => {
                              const unit = c.units.find((u) => u.id === unitId);
                              return (
                                <div
                                  key={unitId}
                                  className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg p-2"
                                >
                                  <span className="font-mono text-[11px] font-bold text-emerald-700">
                                    {unit?.unit_code || unitId.slice(0, 8)}
                                  </span>
                                  <select
                                    value={us.occupantRole}
                                    onChange={(e) => setUnitField(c.id, unitId, 'occupantRole', e.target.value)}
                                    className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px] text-slate-800"
                                    title="Rol de ocupante en la unidad"
                                  >
                                    {Object.entries(OCCUPANT_ROLE_LABELS).map(([val, label]) => (
                                      <option key={val} value={val}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                  <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={us.isPrimaryContact}
                                      onChange={(e) => setUnitField(c.id, unitId, 'isPrimaryContact', e.target.checked)}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600"
                                    />
                                    Contacto principal
                                  </label>
                                  <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={us.isBillingRecipient}
                                      onChange={(e) => setUnitField(c.id, unitId, 'isBillingRecipient', e.target.checked)}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600"
                                    />
                                    Destinatario de boletas
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => removeUnit(c.id, unitId)}
                                    className="ml-auto text-[11px] text-rose-500 hover:text-rose-700 font-semibold"
                                  >
                                    Quitar
                                  </button>
                                </div>
                              );
                            })
                          )}

                          {availableUnits.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-slate-500 font-semibold">Agregar unidad:</span>
                              {availableUnits.map((u) => (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => addUnit(c.id, u.id, sel.role)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition bg-white text-slate-600 border-slate-300 hover:border-emerald-400 hover:text-emerald-700 inline-flex items-center gap-1"
                                >
                                  <Plus className="w-3 h-3" />
                                  {u.unit_code}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || loadingCtx}
              className="px-4 py-2 rounded-lg font-semibold shadow-sm transition inline-flex items-center gap-2 text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isCreate ? <Plus className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving
                ? 'Guardando...'
                : isCreate
                  ? mode === 'invite'
                    ? 'Enviar invitación'
                    : 'Crear usuario'
                  : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
