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
  Mail,
  Shield,
  AlertCircle,
  MoreHorizontal,
  CheckCircle,
  AlertTriangle,
  Send,
  Key,
} from 'lucide-react';
import { fetchWithAuth, getSession, resendInvitation, revokeInvitation, sendPasswordResetLink } from '../lib/api';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { UserFormModal, ROLE_LABELS } from './UserFormModal';
import { ResetPasswordModal } from './ResetPasswordModal';
import { UserDashboardModal } from './UserDashboardModal';
import { AccessSummaryModal } from './AccessSummaryModal';

interface CondoUnit {
  id: string;
  code: string;
  occupantRole: string;
  isPrimaryContact: boolean;
  isBillingRecipient: boolean;
}

interface CondoAccess {
  condoId: string;
  condoName: string;
  role: string;
  accessActive: boolean;
  units: number;
  tenantRole?: string;
  permissions: string[];
  unitsDetail?: CondoUnit[];
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
  emailVerified?: boolean;
  authProviders?: string[];
  invitationPending?: boolean;
  avatar_url?: string;
}

type AccountStatus = 'ACTIVE' | 'PENDING_INVITATION' | 'EMAIL_UNVERIFIED' | 'INACTIVE';

type InvitationStatus = 'NONE' | 'PENDING' | 'EXPIRED' | 'ACCEPTED';

interface UserFilters {
  search: string;
  condoId: string;
  role: string;
  status: string;
  provider: string;
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

function getAccountStatus(user: UserRow): AccountStatus {
  if (!user.is_active) return 'INACTIVE';
  if (user.invitationPending) return 'PENDING_INVITATION';
  if (!user.emailVerified) return 'EMAIL_UNVERIFIED';
  return 'ACTIVE';
}

function getProviderLabel(user: UserRow): string {
  const providers = user.authProviders || [];
  if (providers.includes('GOOGLE') && providers.includes('LOCAL')) return 'Google + Contraseña';
  if (providers.includes('GOOGLE')) return 'Google';
  if (providers.includes('LOCAL')) return 'Contraseña';
  return 'Sin proveedor';
}

const STATUS_LABELS: Record<AccountStatus, { label: string; color: string; icon: React.ReactNode }> = {
  ACTIVE: { label: 'Activo', color: 'bg-emerald-50 text-emerald-700', icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> },
  PENDING_INVITATION: { label: 'Invitación pendiente', color: 'bg-amber-50 text-amber-700', icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> },
  EMAIL_UNVERIFIED: { label: 'Correo sin verificar', color: 'bg-amber-50 text-amber-700', icon: <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> },
  INACTIVE: { label: 'Inactivo', color: 'bg-rose-50 text-rose-700', icon: <Power className="w-3.5 h-3.5 text-rose-500" /> },
};

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  Google: <Send className="w-3 h-3" />,
  'Google + Contraseña': <Send className="w-3 h-3" />,
  Contraseña: <Key className="w-3 h-3" />,
  'Sin proveedor': <AlertCircle className="w-3 h-3" />,
};

export function UsersView() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<UserFilters>({
    search: '',
    condoId: '',
    role: '',
    status: '',
    provider: '',
  });
  const [condos, setCondos] = useState<Array<{ id: string; name: string }>>([]);

  const [showForm, setShowForm] = useState(false);
  const [formUser, setFormUser] = useState<UserRow | null>(null);
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [dashboardUser, setDashboardUser] = useState<UserRow | null>(null);
  const [accessUser, setAccessUser] = useState<UserRow | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [actionMenu, setActionMenu] = useState<{ user: UserRow; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const selfId = getSession()?.user.id;
  const hasUsersManage = useMemo(() => {
    const perms = getSession()?.condos?.flatMap((c: any) => c.permissions) || [];
    return perms.includes('USERS_MANAGE') || getSession()?.user.isSuperadmin;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, condosRes] = await Promise.all([
        fetchWithAuth('/users').catch(() => []),
        fetchWithAuth('/condos').catch(() => []),
      ]);
      if (Array.isArray(usersRes)) setUsers(usersRes);
      if (Array.isArray(condosRes)) setCondos(condosRes);
    } catch {
      setUsers([]);
      setCondos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const q = filters.search.trim().toLowerCase();
      if (q && !(
        u.first_name.toLowerCase().includes(q) ||
        u.last_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        `${u.doc_number}`.toLowerCase().includes(q)
      )) return false;

      if (filters.condoId && !u.condos.some(c => c.condoId === filters.condoId)) return false;
      if (filters.role && !u.condos.some(c => c.role === filters.role)) return false;
      if (filters.status) {
        const status = getAccountStatus(u);
        if (status !== filters.status) return false;
      }
      if (filters.provider) {
        const providerLabel = getProviderLabel(u);
        if (providerLabel !== filters.provider) return false;
      }
      return true;
    });
  }, [users, filters]);

  const flash = (msg: string, type: 'success' | 'error' = 'success') => showToast(msg, type);

  const openForm = async (u: UserRow | null) => {
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
      flash(err instanceof Error ? err.message : 'No se pudo cambiar el estado.', 'error');
    }
  };

  const handleResendInvitation = async (u: UserRow) => {
    try {
      await resendInvitation(u.id);
      flash('Invitación reenviada correctamente.');
      load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'No se pudo reenviar la invitación.', 'error');
    }
  };

  const handleRevokeInvitation = async (u: UserRow) => {
    try {
      await revokeInvitation(u.id);
      flash('Invitación revocada.');
      load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'No se pudo revocar la invitación.', 'error');
    }
  };

  const handleSendPasswordReset = async (u: UserRow) => {
    try {
      await sendPasswordResetLink(u.id);
      flash('Enlace de restablecimiento enviado.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'No se pudo enviar el enlace.', 'error');
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
      showToast('Usuario eliminado definitivamente del sistema.');
      load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo eliminar el usuario');
      setDeleting(false);
    }
  };

  const closeActionMenu = () => setActionMenu(null);

  // Click outside to close action menu
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (actionMenu && !(e.target as HTMLElement).closest('[data-action-menu]')) {
        closeActionMenu();
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [actionMenu]);

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
        {hasUsersManage && (
          <button
            onClick={() => openForm(null)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Nuevo Usuario
          </button>
        )}
      </div>

      {toast && (
        <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border border-rose-200 text-rose-800'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-500" />
          )}
          {toast.message}
        </div>
      )}

      {/* Barra de filtros */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 space-y-4">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Buscar por nombre, correo o cédula…"
            className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 transition"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={filters.condoId}
            onChange={(e) => setFilters(f => ({ ...f, condoId: e.target.value }))}
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
          >
            <option value="">Todas las residencias</option>
            {condos.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={filters.role}
            onChange={(e) => setFilters(f => ({ ...f, role: e.target.value }))}
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
          >
            <option value="">Todos los roles</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
          >
            <option value="">Todos los estados</option>
            <option value="ACTIVE">Activo</option>
            <option value="PENDING_INVITATION">Invitación pendiente</option>
            <option value="EMAIL_UNVERIFIED">Correo sin verificar</option>
            <option value="INACTIVE">Inactivo</option>
          </select>

          <select
            value={filters.provider}
            onChange={(e) => setFilters(f => ({ ...f, provider: e.target.value }))}
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
          >
            <option value="">Todos los proveedores</option>
            <option value="Google">Google</option>
            <option value="Contraseña">Contraseña</option>
            <option value="Google + Contraseña">Google + Contraseña</option>
            <option value="Sin proveedor">Sin proveedor</option>
          </select>
        </div>
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
            <p className="font-semibold text-slate-700">No hay usuarios{filters.search ? ' que coincidan con la búsqueda' : ''}</p>
            <p className="text-sm text-slate-400 mt-1">
              {filters.search ? 'Prueba con otro término.' : hasUsersManage ? 'Crea el primer usuario con "Nuevo Usuario".' : 'No tienes permisos para crear usuarios.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-200 bg-slate-50/60">
                  <th className="px-5 py-3 font-bold">Usuario</th>
                  <th className="px-5 py-3 font-bold">Cédula</th>
                  <th className="px-5 py-3 font-bold">Residencias y roles</th>
                  <th className="px-5 py-3 font-bold">Estado</th>
                  <th className="px-5 py-3 font-bold">Proveedor</th>
                  <th className="px-5 py-3 font-bold">Último ingreso</th>
                  <th className="px-5 py-3 font-bold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = u.id === selfId;
                  const status = getAccountStatus(u);
                  const statusInfo = STATUS_LABELS[status];
                  const providerLabel = getProviderLabel(u);

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
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${statusInfo.color}`}>
                          {statusInfo.icon}
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 text-[11px] font-medium">
                          {PROVIDER_ICONS[providerLabel] || PROVIDER_ICONS['Sin proveedor']}
                          {providerLabel}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="relative" data-action-menu>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setActionMenu({ user: u, x: rect.right, y: rect.bottom });
                            }}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                            title="Más acciones"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>

                          {actionMenu?.user.id === u.id && (
                            <div
                              className="absolute right-0 top-full mt-1 z-20 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1"
                              role="menu"
                            >
                              <button
                                onClick={() => {
                                  setDashboardUser(u);
                                  closeActionMenu();
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                role="menuitem"
                              >
                                <Eye className="w-4 h-4" />
                                Ver dashboard
                              </button>

                              {hasUsersManage && (
                                <button
                                  onClick={() => {
                                    openForm(u);
                                    closeActionMenu();
                                  }}
                                  className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  role="menuitem"
                                >
                                  <Edit2 className="w-4 h-4" />
                                  Editar
                                </button>
                              )}

                              {hasUsersManage && u.invitationPending && (
                                <button
                                  onClick={() => { handleResendInvitation(u); closeActionMenu(); }}
                                  className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  role="menuitem"
                                >
                                  <Mail className="w-4 h-4" />
                                  Reenviar invitación
                                </button>
                              )}

                              {hasUsersManage && u.invitationPending && (
                                <button
                                  onClick={() => { handleRevokeInvitation(u); closeActionMenu(); }}
                                  className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  role="menuitem"
                                >
                                  <AlertTriangle className="w-4 h-4" />
                                  Revocar invitación
                                </button>
                              )}

                              {hasUsersManage && !u.invitationPending && u.is_active && (
                                <button
                                  onClick={() => { handleSendPasswordReset(u); closeActionMenu(); }}
                                  className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  role="menuitem"
                                >
                                  <Key className="w-4 h-4" />
                                  Enviar enlace de restablecimiento
                                </button>
                              )}

                              <button
                                onClick={() => { setAccessUser(u); closeActionMenu(); }}
                                className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                role="menuitem"
                              >
                                <Shield className="w-4 h-4" />
                                Ver permisos
                              </button>

                              <hr className="my-1 border-slate-200" />

                              <button
                                onClick={() => toggleActive(u)}
                                disabled={isSelf}
                                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                                  u.is_active
                                    ? 'text-rose-600 hover:bg-rose-50'
                                    : 'text-emerald-600 hover:bg-emerald-50'
                                } disabled:opacity-30 disabled:cursor-not-allowed`}
                                role="menuitem"
                              >
                                <Power className="w-4 h-4" />
                                {u.is_active ? 'Desactivar' : 'Activar'}
                              </button>

                              <button
                                onClick={() => {
                                  setDeleteTarget(u);
                                  setDeleteError(null);
                                  closeActionMenu();
                                }}
                                disabled={isSelf}
                                className="w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                                role="menuitem"
                              >
                                <Trash2 className="w-4 h-4" />
                                Eliminar
                              </button>
                            </div>
                          )}
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
            showToast('Usuario guardado correctamente.');
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
            showToast('Contraseña restablecida.');
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

      {accessUser && (
        <AccessSummaryModal
          user={accessUser}
          onClose={() => setAccessUser(null)}
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

      {/* Toast global */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 p-4 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border border-rose-200 text-rose-800'
        }`}>
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