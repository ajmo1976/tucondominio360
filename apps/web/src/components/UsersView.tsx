'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Edit2,
  Eye,
  KeyRound,
  Loader2,
  Plus,
  Power,
  Search,
  Trash2,
  Users as UsersIcon,
  UserCog,
} from 'lucide-react';
import { fetchWithAuth, getSession } from '../lib/api';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { UserFormModal, ROLE_LABELS } from './UserFormModal';
import { ResetPasswordModal } from './ResetPasswordModal';
import { UserDashboardModal } from './UserDashboardModal';

interface CondoAccess {
  condoId: string;
  condoName: string;
  role: string;
  accessActive: boolean;
  units: number;
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
  created_at: string;
  condos: CondoAccess[];
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

export function UsersView() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [formUser, setFormUser] = useState<UserRow | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [dashboardUser, setDashboardUser] = useState<UserRow | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [notice, setNotice] = useState('');
  const selfId = getSession()?.user.id;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithAuth('/users').catch(() => []);
    if (Array.isArray(res)) setUsers(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      `${u.doc_number}`.toLowerCase().includes(q),
    );
  }, [users, search]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3500);
  };

  const openForm = async (u: UserRow | null) => {
    // La lista de /users no incluye las unidades ocupadas. Al editar se carga
    // el detalle (GET /users/:id) para que el formulario preserve las unidades
    // asignadas; si el detalle falla, se edita con lo que se tiene.
    if (u) {
      const detail = await fetchWithAuth(`/users/${u.id}`).catch(() => null);
      setFormUser(detail || u);
    } else {
      setFormUser(null);
    }
    setShowForm(true);
  };

  const toggleActive = async (u: UserRow) => {
    if (u.id === selfId) return;
    try {
      await fetchWithAuth(`/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !u.is_active }),
      });
      flash(
        u.is_active
          ? `${u.first_name} ${u.last_name} fue desactivado/a: ya no puede iniciar sesión.`
          : `${u.first_name} ${u.last_name} fue activado/a y ya puede iniciar sesión.`,
      );
      load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await fetchWithAuth(`/users/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setDeleting(false);
      flash('Usuario eliminado definitivamente del sistema.');
      load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo eliminar el usuario');
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Encabezado del módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-emerald-600" />
            Usuarios y Accesos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cuentas del SaaS, sus residencias, roles y unidades asignadas.
          </p>
        </div>
        <button
          onClick={() => openForm(null)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo Usuario
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium">
          {notice}
        </div>
      )}

      {/* Barra de búsqueda */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, correo o cédula…"
          className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 transition"
        />
      </div>

      {/* Tabla de usuarios */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-slate-400 py-16 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando usuarios…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <UserCog className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-700">No hay usuarios{search ? ' que coincidan con la búsqueda' : ''}</p>
            <p className="text-sm text-slate-400 mt-1">
              {search ? 'Prueba con otro término.' : 'Crea el primer usuario con "Nuevo Usuario".'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-200 bg-slate-50/60">
                  <th className="px-5 py-3 font-bold">Usuario</th>
                  <th className="px-5 py-3 font-bold">Cédula</th>
                  <th className="px-5 py-3 font-bold">Roles y residencias</th>
                  <th className="px-5 py-3 font-bold">Estado</th>
                  <th className="px-5 py-3 font-bold">Creado</th>
                  <th className="px-5 py-3 font-bold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = u.id === selfId;
                  return (
                    <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition">
                      <td className="px-5 py-3">
                        <div className="flex items-center space-x-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            u.is_superadmin ? 'bg-slate-900 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {initialsOf(`${u.first_name} ${u.last_name}`)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">
                              {u.first_name} {u.last_name}
                              {isSelf && <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">tú</span>}
                            </p>
                            <p className="text-xs text-slate-400 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600 font-mono text-xs">
                        {u.doc_type}-{u.doc_number}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.is_superadmin && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-900 text-emerald-400 text-[10px] font-bold">
                              Super Administrador
                            </span>
                          )}
                          {u.condos.length === 0 && !u.is_superadmin && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-semibold">
                              Sin accesos
                            </span>
                          )}
                          {u.condos.map((c) => (
                            <span
                              key={`${u.id}-${c.condoId}`}
                              className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold"
                            >
                              {ROLE_LABELS[c.role] || c.role} · {c.condoName}
                              {c.units > 0 && <span className="text-emerald-500"> ({c.units})</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          {u.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {new Date(u.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDashboardUser(u)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            title="Ver dashboard del usuario"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openForm(u)}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Editar usuario"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setResetUser(u)}
                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                            title="Restablecer contraseña"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleActive(u)}
                            disabled={isSelf}
                            className={`p-2 rounded-lg transition ${
                              u.is_active
                                ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                            } disabled:opacity-30 disabled:cursor-not-allowed`}
                            title={u.is_active ? 'Desactivar usuario' : 'Activar usuario'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget(u);
                              setDeleteError(null);
                            }}
                            disabled={isSelf}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modales */}
      {showForm && (
        <UserFormModal
          user={formUser}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            flash(formUser ? 'Cambios guardados.' : 'Usuario creado exitosamente.');
            load();
          }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          userId={resetUser.id}
          userName={`${resetUser.first_name} ${resetUser.last_name}`}
          onClose={() => setResetUser(null)}
          onSaved={() => {
            setResetUser(null);
            flash('Contraseña restablecida.');
          }}
        />
      )}

      {dashboardUser && (
        <UserDashboardModal
          userId={dashboardUser.id}
          userName={`${dashboardUser.first_name} ${dashboardUser.last_name}`}
          onClose={() => setDashboardUser(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          title="Eliminar usuario"
          resourceName={`${deleteTarget.first_name} ${deleteTarget.last_name} (${deleteTarget.email})`}
          typePhrase={deleteTarget.email}
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
          risks={[
            'Se perderá permanentemente el acceso del usuario a todas sus residencias y unidades.',
            'Sus registros históricos de pagos, asambleas y demás quedarán sin autor (si tiene historial, el sistema lo bloqueará y habrá que desactivarlo en su lugar).',
            'Esta acción no puede deshacerse.',
          ]}
        />
      )}
    </div>
  );
}