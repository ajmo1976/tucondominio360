'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle,
  Loader2,
  Pencil,
  Search,
  Users as UsersIcon,
} from 'lucide-react';
import { fetchWithAuth } from '../lib/api';

/**
 * Pantalla de Empresas (solo superadmin): lista las empresas administradoras
 * y juntas autogestionadas, con su cartera (residencias), su personal y su
 * plan de residencias (`tenants.max_condos`; null = sin límite).
 *
 * El plan solo lo puede cambiar el superadmin y no puede quedar por debajo de
 * las residencias actuales de la empresa (lo valida el backend).
 */
interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  tenant_type: 'COMPANY' | 'SELF_MANAGED';
  rif: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  createdAt: string;
  maxCondos: number | null;
  condosCount: number;
  staffCount: number;
}

export function CompaniesView() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', planEnabled: true, plan: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/tenants').catch(() => null);
      if (Array.isArray(res)) setCompanies(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = (c: CompanyRow) => {
    setForm({
      name: c.name,
      email: c.email || '',
      phone: c.phone || '',
      planEnabled: c.maxCondos != null,
      plan: c.maxCondos != null ? String(c.maxCondos) : '',
    });
    setFormError('');
    setEditing(c);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!form.name.trim()) {
      setFormError('El nombre de la empresa es requerido.');
      return;
    }
    let maxCondos: number | null = null;
    if (form.planEnabled) {
      const n = Number(form.plan);
      if (!Number.isInteger(n) || n < 1) {
        setFormError('El plan debe ser un número entero mayor o igual a 1.');
        return;
      }
      maxCondos = n;
    }

    setSaving(true);
    setFormError('');
    try {
      await fetchWithAuth(`/tenants/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          maxCondos,
        }),
      });
      setEditing(null);
      showToast('Empresa actualizada correctamente.');
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar la empresa');
    } finally {
      setSaving(false);
    }
  };

  const filtered = companies.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.rif || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            Empresas Administradoras
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Empresas y juntas del SaaS: cartera de residencias, personal y plan (máximo de residencias).
          </p>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar empresa o RIF…"
            className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 transition"
          />
        </div>
      </div>

      {/* Tabla de empresas */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-slate-400 py-16 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando empresas…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">No hay empresas registradas</p>
            <p className="text-sm text-slate-400 mt-1">
              Define a un usuario como Administradora en el módulo de Usuarios para crear su empresa.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-200 bg-slate-50/60">
                  <th className="px-5 py-3 font-bold">Empresa</th>
                  <th className="px-5 py-3 font-bold">Tipo</th>
                  <th className="px-5 py-3 font-bold">Contacto</th>
                  <th className="px-5 py-3 font-bold">Residencias / Plan</th>
                  <th className="px-5 py-3 font-bold">Personal</th>
                  <th className="px-5 py-3 font-bold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{c.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{c.rif}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                          c.tenant_type === 'COMPANY'
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}
                      >
                        {c.tenant_type === 'COMPANY' ? 'Administradora' : 'Junta autogestionada'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600">
                      <p>{c.email || '—'}</p>
                      <p className="text-slate-400 font-mono">{c.phone || '—'}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          c.maxCondos != null && c.condosCount > c.maxCondos
                            ? 'bg-rose-50 text-rose-700'
                            : c.maxCondos != null
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                        title={
                          c.maxCondos != null
                            ? `${c.condosCount} de ${c.maxCondos} residencias del plan`
                            : `${c.condosCount} residencias (sin límite de plan)`
                        }
                      >
                        {c.condosCount} / {c.maxCondos != null ? c.maxCondos : '∞'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 text-[11px] font-medium">
                        <UsersIcon className="w-3 h-3" />
                        {c.staffCount}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => openEdit(c)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de edición */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Editar ${editing.name}`}
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base truncate">{editing.name}</h3>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Correo</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50/60">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">
                    Plan de residencias
                    <span className="block text-[11px] text-slate-400 font-normal">
                      Máximo de residencias en su cartera (solo el superadmin lo cambia).
                    </span>
                  </span>
                  <span
                    role="switch"
                    aria-checked={form.planEnabled}
                    tabIndex={0}
                    onClick={() => setForm({ ...form, planEnabled: !form.planEnabled })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setForm({ ...form, planEnabled: !form.planEnabled });
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition cursor-pointer ${
                      form.planEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                        form.planEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </span>
                </div>

                {form.planEnabled ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      required
                      value={form.plan}
                      onChange={(e) => setForm({ ...form, plan: e.target.value })}
                      className="w-24 bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-mono"
                    />
                    <span className="text-[11px] text-slate-500">
                      residencias máximas · actualmente {editing.condosCount}
                      {editing.maxCondos != null && ` (plan actual: ${editing.maxCondos})`}
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    Sin límite de residencias · actualmente {editing.condosCount}
                  </p>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  disabled={saving}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg font-semibold shadow-sm transition inline-flex items-center gap-2 text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 p-4 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-500" />
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
