'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Home,
  KeyRound,
  Loader2,
  Mail,
  Plus,
  Save,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
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

/** Tipos de usuario que define el superadmin (selector del formulario). */
const ACCOUNT_TYPE_OPTIONS = [
  {
    value: 'PROPIETARIO',
    label: 'Propietario',
    icon: Home,
    hint: 'Dueño o ocupante de unidades; entra al portal del propietario.',
  },
  {
    value: 'JUNTA',
    label: 'Junta',
    icon: Users,
    hint: 'Miembro de junta de condominio: una sola residencia.',
  },
  {
    value: 'ADMINISTRADORA',
    label: 'Administradora',
    icon: Building2,
    hint: 'Empresa administradora: cartera de residencias según el plan.',
  },
] as const;

interface CondoUnit {
  id: string;
  unit_code: string;
  unit_type?: string;
}

interface CondoOption {
  id: string;
  name: string;
  /** Tenant al que pertenece la residencia (para la cartera de la empresa). */
  tenant_id?: string;
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
  /** Tipo principal que define el superadmin. */
  accountType?: 'PROPIETARIO' | 'JUNTA' | 'ADMINISTRADORA';
  /** Empresa (tenant COMPANY) del usuario, si tiene. */
  company?: {
    id: string;
    name: string;
    rif: string | null;
    email: string | null;
    phone: string | null;
    maxCondos: number | null;
    condoIds: string[];
  } | null;
  /** Una entrada por residencia; `role` es null si el acceso es solo por empresa. */
  condos: Array<{ condoId: string; condoName?: string; role: string | null; roles?: string[] }>;
  units?: Array<{
    unitId: string;
    unitCode?: string;
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
  /**
   * Roles adicionales del usuario en una residencia (el formulario solo puede
   * editar un rol por residencia). Se conservan al guardar: el submit emite un
   * assignment extra por cada rol secundario para no perderlos.
   */
  const [extraRoles, setExtraRoles] = useState<Record<string, string[]>>({});
  /**
   * Unidades que ocupa en residencias sin rol de residencia asignado: al
   * guardar, `update()` reemplaza todas las asignaciones, así que estas
   * unidades se quitarían. Se avisa antes de perderlas.
   */
  const [orphanUnits, setOrphanUnits] = useState<Array<{ unitId: string; unitCode: string; condoId: string; condoName?: string }>>([]);

  // Tipo de usuario que define el superadmin (y datos de su empresa).
  const [accountType, setAccountType] = useState<'PROPIETARIO' | 'JUNTA' | 'ADMINISTRADORA'>(
    user?.accountType || 'PROPIETARIO',
  );
  const [companyForm, setCompanyForm] = useState({
    name: user?.company?.name || '',
    rif: user?.company?.rif || '',
    email: user?.company?.email || '',
    phone: user?.company?.phone || '',
  });
  /** Residencias marcadas para SUMAR a la cartera de la empresa al guardar. */
  const [portfolioSel, setPortfolioSel] = useState<string[]>([]);

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
    let alive = true;
    (async () => {
      const res = await fetchWithAuth('/condos').catch(() => []);
      if (!alive || !Array.isArray(res)) {
        if (alive) setLoadingCtx(false);
        return;
      }

      const withUnits = await Promise.all(
        res.map(async (c: any) => {
          const units = await fetchWithAuth(`/condos/${c.id}/units`).catch(() => []);
          return {
            id: c.id,
            name: c.name,
            tenant_id: c.tenant_id,
            units: Array.isArray(units) ? units : [],
          };
        }),
      );
      if (!alive) return;
      setCondos(withUnits);

      // Prefill de asignaciones al editar
      if (user) {
        const pre: Record<string, Assignment> = {};
        const extra: Record<string, string[]> = {};
        const condoNameById: Record<string, string> = {};
        for (const c of withUnits) condoNameById[c.id] = c.name;

        // El detalle agrupa por residencia: un usuario puede tener varios roles
        // en la misma. El formulario edita el primero; los demás se conservan
        // como "roles adicionales" para no perderlos al guardar.
        for (const acc of user.condos || []) {
          if (!acc.role) continue; // acceso solo por empresa (tenant): sin rol en la residencia
          const roles = (acc.roles?.length ? acc.roles : [acc.role]).filter(
            (r): r is string => Boolean(r),
          );
          const units: Record<string, UnitState> = {};
          for (const u of (user.units || []).filter((x) => x.condoId === acc.condoId)) {
            units[u.unitId] = {
              occupantRole: u.occupantRole || u.role || 'OWNER',
              isPrimaryContact: Boolean(u.isPrimaryContact),
              isBillingRecipient: Boolean(u.isBillingRecipient),
            };
          }
          pre[acc.condoId] = { role: roles[0], units };
          if (roles.length > 1) extra[acc.condoId] = roles.slice(1);
        }

        // Unidades huérfanas: ocupadas en residencias SIN rol de residencia.
        // `update()` reemplaza todas las asignaciones, así que se pierden.
        const assignedCondoIds = new Set(Object.keys(pre));
        const orphans: Array<{ unitId: string; unitCode: string; condoId: string }> = [];
        for (const u of user.units || []) {
          if (!assignedCondoIds.has(u.condoId)) {
            orphans.push({
              unitId: u.unitId,
              unitCode: u.unitCode || u.unitId.slice(0, 8),
              condoId: u.condoId,
            });
          }
        }

        setAssignments(pre);
        setExtraRoles(extra);
        setOrphanUnits(
          orphans.map((o) => ({
            ...o,
            condoName: condoNameById[o.condoId] || o.condoId.slice(0, 8),
          })) as any,
        );
      }

      setLoadingCtx(false);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const toggleCondo = (condoId: string) => {
    // Regla de Junta de Condominio: UNA sola residencia.
    if (accountType === 'JUNTA' && !assignments[condoId] && Object.keys(assignments).length >= 1) {
      setError('Una Junta de Condominio solo puede tener una residencia asignada.');
      return;
    }
    setAssignments((prev) => {
      const next = { ...prev };
      if (next[condoId]) {
        delete next[condoId];
      } else {
        next[condoId] = { role: 'OWNER', units: {} };
      }
      return next;
    });
    // Al quitar la residencia también se descartan sus roles adicionales.
    setExtraRoles((prev) => {
      if (!prev[condoId]) return prev;
      const next = { ...prev };
      delete next[condoId];
      return next;
    });
  };

  const setRole = (condoId: string, role: string) => {
    setAssignments((prev) => {
      const current = prev[condoId] || { role: 'OWNER', units: {} };
      return { ...prev, [condoId]: { ...current, role } };
    });
    // Si el nuevo rol principal ya era un rol adicional, el rol anterior pasa
    // a la lista de adicionales para no perderlo.
    setExtraRoles((prev) => {
      const extras = prev[condoId];
      if (!extras?.length) return prev;
      const oldPrimary = assignments[condoId]?.role;
      const merged = new Set(extras.filter((r) => r !== role));
      if (oldPrimary && oldPrimary !== role) merged.add(oldPrimary);
      const next = { ...prev };
      if (merged.size === 0) delete next[condoId];
      else next[condoId] = Array.from(merged);
      return next;
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

  /** Residencias ya incorporadas a la cartera de la empresa del usuario. */
  const inCartera = useMemo(
    () => condos.filter((c) => user?.company?.id && c.tenant_id === user.company.id),
    [condos, user?.company?.id],
  );
  /** Residencias disponibles para SUMAR a la cartera (las de otras empresas o nuevas). */
  const portfolioCandidates = useMemo(
    () => condos.filter((c) => !user?.company?.id || c.tenant_id !== user.company!.id),
    [condos, user?.company?.id],
  );
  /** Cuántas más caben según el plan (maxCondos; null = sin límite). */
  const portfolioRoom = useMemo(() => {
    const max = user?.company?.maxCondos;
    if (max == null) return Number.POSITIVE_INFINITY;
    return Math.max(0, max - inCartera.length);
  }, [user?.company?.maxCondos, inCartera.length]);

  /** El usuario todavía no tiene empresa: los datos son requeridos al guardar. */
  const needsCompanyData = accountType === 'ADMINISTRADORA' && !user?.company;
  /** Límite del plan de la empresa (null = sin límite). */
  const planMax = user?.company?.maxCondos ?? null;

  const togglePortfolio = (condoId: string) => {
    setPortfolioSel((prev) =>
      prev.includes(condoId) ? prev.filter((x) => x !== condoId) : [...prev, condoId],
    );
  };

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
    if (!isCreate && orphanUnits.length > 0) {
      const list = orphanUnits.map((o) => `${o.unitCode} (${o.condoName || o.condoId.slice(0, 8)})`).join(', ');
      const ok = window.confirm(
        `Al guardar se quitarán las unidades sin rol de residencia asignado: ${list}. ` +
          'Si quieres conservarlas, cancela y asigna primero la residencia con su rol. ¿Continuar?',
      );
      if (!ok) return;
    }

    // Reglas del tipo de usuario.
    if (accountType === 'JUNTA' && Object.keys(assignments).length > 1) {
      setError('Una Junta de Condominio solo puede tener una residencia asignada.');
      return;
    }
    // La empresa se crea solo si el usuario todavía no tiene una.
    const creatingCompany = accountType === 'ADMINISTRADORA' && !user?.company;
    if (creatingCompany && !companyForm.name.trim()) {
      setError('Indica el nombre comercial de la empresa administradora.');
      return;
    }
    if (creatingCompany && !companyForm.rif.trim()) {
      setError('El RIF de la empresa es requerido para crearla.');
      return;
    }
    if (
      accountType === 'ADMINISTRADORA' &&
      companyForm.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyForm.email.trim())
    ) {
      setError('El correo de la empresa no es válido.');
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
      accountType,
      assignments: Object.entries(assignments).flatMap(([condoId, a]) => {
        // El rol principal carga las unidades; los roles adicionales se
        // re-emiten como assignments extra (sin unidades) para conservarlos:
        // `update()` borra y reinserta todas las asignaciones del usuario.
        const extras = extraRoles[condoId] || [];
        return [
          {
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
          },
          ...extras
            .filter((r) => r !== a.role)
            .map((role) => ({ condoId, role, units: [] })),
        ];
      }),
    };
    // Administradora: datos de su empresa (se crean solo si aún no existe) y
    // las residencias que se suman a su cartera (validadas contra el plan).
    if (accountType === 'ADMINISTRADORA' && companyForm.name.trim()) {
      body.company = {
        name: companyForm.name.trim(),
        rif: companyForm.rif.trim() || undefined,
        email: companyForm.email.trim() || undefined,
        phone: companyForm.phone.trim() || undefined,
      };
      if (portfolioSel.length > 0) body.portfolioCondoIds = portfolioSel;
    }
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

          {/* Tipo de usuario: lo define el superadmin */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Tipo de usuario</h4>
              <span className="text-[11px] text-slate-400">Lo define el Super Admin</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {ACCOUNT_TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = accountType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setAccountType(opt.value);
                      setError('');
                    }}
                    className={`p-3 rounded-xl border text-left transition ${
                      active
                        ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-400'
                        : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mb-1 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span className="block font-bold text-slate-800">{opt.label}</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
            {accountType === 'JUNTA' && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Una Junta de Condominio solo puede tener UNA residencia asignada.
              </p>
            )}
          </section>

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

          {/* Empresa administradora: se crea automáticamente al guardar */}
          {accountType === 'ADMINISTRADORA' && (
            <section className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] uppercase tracking-widest text-blue-500 font-bold flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  Empresa administradora
                </h4>
                <span className="text-[11px] text-slate-500">
                  {user?.company
                    ? planMax != null
                      ? `Plan: ${planMax} residencias máx.`
                      : 'Plan: sin límite'
                    : 'Se creará al guardar'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nombre comercial {needsCompanyData && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="text"
                    required={needsCompanyData}
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                    placeholder="Administradora Inmobiliaria Capital C.A."
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    RIF {needsCompanyData && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="text"
                    required={needsCompanyData}
                    value={companyForm.rif}
                    onChange={(e) => setCompanyForm({ ...companyForm, rif: e.target.value })}
                    placeholder="J-31456789-0"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Correo de la empresa</label>
                  <input
                    type="email"
                    value={companyForm.email}
                    onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                    placeholder="contacto@empresa.com"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Teléfono de la empresa</label>
                  <input
                    type="text"
                    value={companyForm.phone}
                    onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                    placeholder="+582129991122"
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="border-t border-blue-200 pt-3">
                <h5 className="text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-2">
                  Residencias de la empresa (cartera)
                </h5>

                {inCartera.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {inCartera.map((c) => (
                      <span
                        key={c.id}
                        className="px-2 py-0.5 rounded-full bg-blue-100 border border-blue-200 text-blue-700 text-[10px] font-semibold"
                        title="Residencia que ya pertenece a la cartera de la empresa"
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>
                )}

                {portfolioCandidates.length === 0 ? (
                  <p className="text-[11px] text-slate-400">
                    No hay otras residencias disponibles para incorporar.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {portfolioCandidates.map((c) => {
                      const selected = portfolioSel.includes(c.id);
                      const blocked = !selected && portfolioSel.length >= portfolioRoom;
                      return (
                        <label
                          key={c.id}
                          className={`flex items-center gap-2 text-xs py-1 ${
                            blocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={blocked}
                            onChange={() => togglePortfolio(c.id)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-slate-700">{c.name}</span>
                          {selected && (
                            <span className="text-[10px] font-semibold text-blue-600">
                              se sumará a la cartera
                            </span>
                          )}
                          {blocked && (
                            <span className="text-[10px] font-semibold text-rose-500">
                              plan alcanzado
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}

                <p className="text-[11px] text-slate-400 mt-2">
                  {planMax != null
                    ? `Plan: ${inCartera.length + portfolioSel.length} de ${planMax} residencias.`
                    : 'Sin límite de plan definido; puedes fijarlo desde la pantalla de Empresas.'}
                </p>
              </div>
            </section>
          )}

          {/* Residencias y unidades */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Residencias y unidades</h4>
              <span className="text-[11px] text-slate-400">
                {enabledCondos === 0 ? 'Sin accesos asignados' : `${enabledCondos} residencia(s)`}
                {accountType === 'JUNTA' && ' · Junta: máx. 1'}
              </span>
            </div>

            {!isCreate && orphanUnits.length > 0 && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                <span>
                  <b>Atención:</b> este usuario ocupa unidades en residencias sin rol de residencia
                  asignado. Al guardar, esas unidades se quitarán:{' '}
                  {orphanUnits
                    .map((o) => `${o.unitCode} (${o.condoName || o.condoId.slice(0, 8)})`)
                    .join(', ')}. Cancela y asigna primero la residencia con su rol para conservarlas.
                </span>
              </div>
            )}

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
                        <label
                          className={`flex items-center space-x-2 ${
                            accountType === 'JUNTA' && !enabled && enabledCondos >= 1
                              ? 'opacity-50 cursor-not-allowed'
                              : 'cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={accountType === 'JUNTA' && !enabled && enabledCondos >= 1}
                            onChange={() => toggleCondo(c.id)}
                            title={
                              accountType === 'JUNTA' && !enabled && enabledCondos >= 1
                                ? 'Una Junta de Condominio solo puede tener una residencia'
                                : undefined
                            }
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed"
                          />
                          <span className="font-semibold text-slate-800">{c.name}</span>
                          {!enabled && <span className="text-[11px] text-slate-400">sin acceso</span>}
                        </label>
                        {enabled && (
                          <div className="flex items-center gap-2 flex-wrap">
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
                            {(extraRoles[c.id] || []).length > 0 && (
                              <span
                                className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium"
                                title="Roles adicionales que el usuario ya tiene en esta residencia y que se conservarán al guardar."
                              >
                                +{(extraRoles[c.id] || [])
                                  .filter((r) => r !== sel.role)
                                  .map((r) => ROLE_LABELS[r] || r)
                                  .join(', ')}{' '}
                                (se conservan)
                              </span>
                            )}
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
