'use client';

import React, { useEffect, useState } from 'react';
import {
  ClipboardList,
  Plus,
  Loader2,
  RefreshCw,
  Search,
  CheckCircle2,
  X,
  AlertTriangle,
  Sparkles,
  Clock,
  BarChart3,
  Edit,
  ShieldCheck,
  Trash2,
  Eye,
  Wrench,
  MapPin,
  User,
  MessageSquare,
} from 'lucide-react';
import { fetchWithAuth } from '../lib/api';

const PRIORITY_BADGES: Record<string, { label: string; style: string }> = {
  LOW: { label: 'Baja', style: 'bg-green-50 text-green-800 border-green-200' },
  MEDIUM: { label: 'Media', style: 'bg-amber-50 text-amber-800 border-amber-200' },
  HIGH: { label: 'Alta', style: 'bg-orange-50 text-orange-700 border-orange-200' },
  EMERGENCY: { label: 'Emergencia', style: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const STATUS_BADGES: Record<string, { label: string; style: string }> = {
  OPEN: { label: 'Abierta', style: 'bg-sky-50 text-sky-700 border-sky-200' },
  ASSIGNED: { label: 'Asignada', style: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  IN_PROGRESS: { label: 'En Progreso', style: 'bg-amber-50 text-amber-700 border-amber-200' },
  RESOLVED: { label: 'Resuelta', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CLOSED: { label: 'Cerrada', style: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const CATEGORY_LABELS: Record<string, string> = {
  PLUMBING: 'Fontanería',
  ELECTRICAL: 'Eléctrica',
  STRUCTURAL: 'Estructural',
  HVAC: 'HVAC / Clima',
  PAINTING: 'Pintura',
  SECURITY: 'Seguridad',
  OTHER: 'Otro',
};

const EMPTY_KPIS = {
  open: 0,
  assigned: 0,
  inProgress: 0,
  resolved: 0,
  closed: 0,
  byPriority: { LOW: 0, MEDIUM: 0, HIGH: 0, EMERGENCY: 0 } as Record<string, number>,
  byCategory: {
    PLUMBING: 0,
    ELECTRICAL: 0,
    STRUCTURAL: 0,
    HVAC: 0,
    PAINTING: 0,
    SECURITY: 0,
    OTHER: 0,
  } as Record<string, number>,
};

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'MEDIUM',
  status: 'OPEN',
  category: 'PLUMBING',
  propertyUnitId: '',
  locationArea: '',
  isPublicIssue: true,
  estimatedCostUsd: '',
};

/** Quita cadenas vacías para no enviar UUIDs inválidos al backend. */
function cleanUuid(value: string): string | undefined {
  const v = (value || '').trim();
  return v ? v : undefined;
}

export function MaintenanceView({ condoId }: { condoId: string }) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>(EMPTY_KPIS);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState<'tickets' | 'kpis'>('tickets');
  const [filters, setFilters] = useState({ status: 'ALL', priority: 'ALL', category: 'ALL', q: '' });

  // Modales
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const [commentTicket, setCommentTicket] = useState<any | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);

  const [detail, setDetail] = useState<any | null>(null);

  const notify = (msg: string) => {
    setNotification(msg);
    window.setTimeout(() => setNotification(null), 4000);
  };

  const loadAll = async () => {
    if (!condoId) return;
    setLoading(true);
    setError(null);
    try {
      const [ticketsRes, kpisRes, unitsRes] = await Promise.all([
        fetchWithAuth(`/maintenance/tickets?condoId=${condoId}`).catch(() => []),
        fetchWithAuth(`/maintenance/tickets/kpis?condoId=${condoId}`).catch(() => null),
        fetchWithAuth(`/condos/${condoId}/units`).catch(() => []),
      ]);
      setTickets(Array.isArray(ticketsRes) ? ticketsRes : []);
      setUnits(Array.isArray(unitsRes) ? unitsRes : []);
      if (kpisRes && typeof kpisRes === 'object') {
        setKpis({
          ...EMPTY_KPIS,
          ...kpisRes,
          byPriority: { ...EMPTY_KPIS.byPriority, ...(kpisRes.byPriority || {}) },
          byCategory: { ...EMPTY_KPIS.byCategory, ...(kpisRes.byCategory || {}) },
        });
      }
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el módulo de Mantenimiento');
    } finally {
      setLoading(false);
    }
  };

  const loadTickets = async () => {
    try {
      const params = new URLSearchParams({ condoId });
      if (filters.status !== 'ALL') params.set('status', filters.status);
      if (filters.priority !== 'ALL') params.set('priority', filters.priority);
      if (filters.category !== 'ALL') params.set('category', filters.category);
      if (filters.q.trim()) params.set('q', filters.q.trim());
      const data = await fetchWithAuth(`/maintenance/tickets?${params.toString()}`);
      if (Array.isArray(data)) setTickets(data);
    } catch (e: any) {
      alert(e.message);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condoId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) {
      alert('El título y la descripción son obligatorios.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await fetchWithAuth('/maintenance/tickets', {
        method: 'POST',
        body: JSON.stringify({
          condoId,
          title: form.title.trim(),
          description: form.description.trim(),
          priority: form.priority,
          status: form.status,
          category: form.category,
          propertyUnitId: cleanUuid(form.propertyUnitId),
          locationArea: form.locationArea.trim() || undefined,
          isPublicIssue: form.isPublicIssue,
          estimatedCostUsd: form.estimatedCostUsd === '' ? 0 : Number(form.estimatedCostUsd),
        }),
      });
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      notify(`Incidencia reportada: ${created.ticket_code} (${STATUS_BADGES[created.status]?.label || created.status})`);
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (t: any) => {
    setEditForm({
      title: t.title || '',
      description: t.description || '',
      priority: t.priority || 'MEDIUM',
      status: t.status || 'OPEN',
      category: t.category || 'PLUMBING',
      actualCostUsd: t.actualCostUsd ?? '',
      resolutionNotes: '',
    });
    setEditingId(t.id);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSubmitting(true);
    try {
      await fetchWithAuth(`/maintenance/tickets/${editingId}?condoId=${condoId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          priority: editForm.priority,
          status: editForm.status,
          actualCostUsd: editForm.actualCostUsd === '' ? 0 : Number(editForm.actualCostUsd),
          resolutionNotes: editForm.resolutionNotes || undefined,
        }),
      });
      setEditingId(null);
      notify('Incidencia actualizada');
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const quickStatus = async (id: string, status: string) => {
    try {
      await fetchWithAuth(`/maintenance/tickets/${id}?condoId=${condoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      notify(`Incidencia marcada como ${STATUS_BADGES[status]?.label || status}`);
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentTicket) return;
    if (!commentText.trim()) {
      alert('Escribe un comentario.');
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithAuth(`/maintenance/tickets/${commentTicket.id}/comments?condoId=${condoId}`, {
        method: 'POST',
        body: JSON.stringify({ comment: commentText.trim(), isInternalOnly: commentInternal }),
      });
      const ticketId = commentTicket.id;
      const wasDetail = detail && detail.id === ticketId;
      setCommentTicket(null);
      setCommentText('');
      setCommentInternal(false);
      notify('Comentario agregado');
      await loadAll();
      if (wasDetail) await openDetail(ticketId);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta incidencia? Esta acción no se puede deshacer.')) return;
    try {
      await fetchWithAuth(`/maintenance/tickets/${id}?condoId=${condoId}`, { method: 'DELETE' });
      notify('Incidencia eliminada');
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const openDetail = async (id: string) => {
    try {
      const data = await fetchWithAuth(`/maintenance/tickets/${id}?condoId=${condoId}`);
      setDetail(data);
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading && tickets.length === 0 && (kpis?.open ?? 0) === 0) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-500">Cargando Mantenimiento y Tickets…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Mantenimiento y Tickets de Incidencias
            </h1>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                (kpis?.open ?? 0) > 0
                  ? 'bg-orange-50 text-orange-700 border-orange-200'
                  : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}>
              {kpis?.open ?? 0} abiertas
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Reporta averías, haz seguimiento y registra la liquidación de mantenimientos del condominio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadAll}
            className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition">
            <Plus className="w-4 h-4" /> Nueva Incidencia
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Abiertas" value={kpis.open} icon={<Sparkles className="w-4 h-4 text-sky-600" />} hint="Sin resolver" />
        <KpiCard label="Asignadas" value={kpis.assigned} icon={<Clock className="w-4 h-4 text-indigo-600" />} hint="Con responsable" />
        <KpiCard label="En Progreso" value={kpis.inProgress} icon={<Wrench className="w-4 h-4 text-amber-600" />} hint="Trabajo en curso" />
        <KpiCard label="Resueltas" value={kpis.resolved} icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} hint="Solucionadas" />
        <KpiCard label="Cerradas" value={kpis.closed} icon={<ShieldCheck className="w-4 h-4 text-slate-600" />} hint="Verificadas" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('tickets')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'tickets' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}>
            <ClipboardList className="w-4 h-4" /> Tickets ({tickets.length})
          </button>
          <button
            onClick={() => setActiveTab('kpis')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'kpis' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}>
            <BarChart3 className="w-4 h-4" /> KPIs
          </button>
        </div>

        {activeTab === 'tickets' && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
              <option value="ALL">Todos los estados</option>
              <option value="OPEN">Abiertas</option>
              <option value="ASSIGNED">Asignadas</option>
              <option value="IN_PROGRESS">En Progreso</option>
              <option value="RESOLVED">Resueltas</option>
              <option value="CLOSED">Cerradas</option>
            </select>

            <select
              value={filters.priority}
              onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
              <option value="ALL">Toda prioridad</option>
              <option value="LOW">Baja</option>
              <option value="MEDIUM">Media</option>
              <option value="HIGH">Alta</option>
              <option value="EMERGENCY">Emergencia</option>
            </select>

            <select
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
              <option value="ALL">Toda categoría</option>
              {Object.keys(CATEGORY_LABELS).map((cat) => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
              ))}
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && loadTickets()}
                placeholder="Buscar ticket o descripción…"
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 w-56"
              />
            </div>
            <button
              onClick={loadTickets}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold">
              Filtrar
            </button>
          </div>
        )}
      </div>

      {activeTab === 'tickets' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          {tickets.length === 0 ? (
            <div className="p-12 text-center">
              <Wrench className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">No hay incidencias registradas</p>
              <p className="text-xs text-slate-400 mt-1">Usa “Nueva Incidencia” para reportar la primera avería.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Reportar avería
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Incidencia</th>
                    <th className="py-3 px-4">Inmueble</th>
                    <th className="py-3 px-4">Categoría</th>
                    <th className="py-3 px-4">Prioridad</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.map((t) => {
                    const priorityBadge = PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.MEDIUM;
                    const statusBadge = STATUS_BADGES[t.status] || STATUS_BADGES.OPEN;
                    return (
                      <tr key={t.id} className="hover:bg-slate-50 align-top">
                        <td className="py-3 px-4 font-mono text-[11px] font-bold text-emerald-700 whitespace-nowrap">
                          {t.ticketCode}
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <span className="font-bold text-slate-800">{t.title}</span>
                          <p className="text-[11px] text-slate-500 line-clamp-2">{t.description}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <User className="w-3 h-3" /> {t.reportedByName || 'Desconocido'}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700">
                          {t.propertyUnitCode || 'Área común'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{CATEGORY_LABELS[t.category] || t.category}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityBadge.style}`}>
                            {priorityBadge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusBadge.style}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <button
                              onClick={() => openDetail(t.id)}
                              title="Ver detalle y comentarios"
                              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setCommentTicket(t)}
                              title="Agregar comentario"
                              className="p-1.5 text-amber-700 hover:bg-amber-50 rounded-lg">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openEdit(t)}
                              title="Editar / cambiar estado"
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            {t.status !== 'RESOLVED' && t.status !== 'CLOSED' && (
                              <button
                                onClick={() => quickStatus(t.id, 'RESOLVED')}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold">
                                Resolver
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(t.id)}
                              title="Eliminar incidencia"
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg">
                              <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {activeTab === 'kpis' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Indicadores de Mantenimiento</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiBox label="Abiertas" value={kpis.open} />
              <KpiBox label="Asignadas" value={kpis.assigned} />
              <KpiBox label="En Progreso" value={kpis.inProgress} />
              <KpiBox label="Resueltas" value={kpis.resolved} />
            </div>

            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mt-8 mb-3">Por Prioridad</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiBox label="Baja" value={kpis.byPriority?.LOW || 0} tone="emerald" />
              <KpiBox label="Media" value={kpis.byPriority?.MEDIUM || 0} tone="amber" />
              <KpiBox label="Alta" value={kpis.byPriority?.HIGH || 0} tone="orange" />
              <KpiBox label="Emergencia" value={kpis.byPriority?.EMERGENCY || 0} tone="rose" />
            </div>

            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mt-8 mb-3">Por Categoría</h4>
            <div className="space-y-2">
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">{label}</span>
                  <span className="text-slate-500 font-semibold">{kpis.byCategory?.[key] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <Modal title="Reportar nueva incidencia" icon={<Plus className="w-4 h-4 text-emerald-600" />} onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            <Field label="Título de la avería *">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ej: Filtración de agua en el techo"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                required
              />
            </Field>
            <Field label="Descripción detallada *">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Describe qué ocurre, desde cuándo y qué áreas afecta…"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prioridad">
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm">
                  <option value="LOW">Baja</option>
                  <option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option>
                  <option value="EMERGENCY">Emergencia</option>
                </select>
              </Field>
              <Field label="Categoría">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm">
                  {Object.keys(CATEGORY_LABELS).map((cat) => (
                    <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Inmueble / Unidad afectada">
              <select
                value={form.propertyUnitId}
                onChange={(e) => setForm({ ...form, propertyUnitId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm">
                <option value="">Área común / No aplica</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_code || u.code || u.id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ubicación / Área">
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  value={form.locationArea}
                  onChange={(e) => setForm({ ...form, locationArea: e.target.value })}
                  placeholder="Ej: Pasillo piso 3, estacionamiento, recepción…"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
            </Field>
            <Field label="Costo estimado (USD)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.estimatedCostUsd}
                onChange={(e) => setForm({ ...form, estimatedCostUsd: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </Field>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={form.isPublicIssue}
                onChange={(e) => setForm({ ...form, isPublicIssue: e.target.checked })}
              />
              Visibilidad pública para vecinos (recomendado para áreas comunes)
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Reportar incidencia
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingId && (
        <Modal title="Gestionar incidencia" icon={<Edit className="w-4 h-4 text-indigo-600" />} onClose={() => setEditingId(null)}>
          <form onSubmit={handleUpdate} className="p-6 space-y-4">
            <Field label="Título">
              <input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </Field>
            <Field label="Descripción">
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prioridad">
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm">
                  <option value="LOW">Baja</option>
                  <option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option>
                  <option value="EMERGENCY">Emergencia</option>
                </select>
              </Field>
              <Field label="Estado">
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm">
                  <option value="OPEN">Abierta</option>
                  <option value="ASSIGNED">Asignada</option>
                  <option value="IN_PROGRESS">En Progreso</option>
                  <option value="RESOLVED">Resuelta</option>
                  <option value="CLOSED">Cerrada</option>
                </select>
              </Field>
            </div>
            <Field label="Costo real (USD)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={editForm.actualCostUsd}
                onChange={(e) => setEditForm({ ...editForm, actualCostUsd: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </Field>
            <Field label="Notas de resolución">
              <textarea
                value={editForm.resolutionNotes}
                onChange={(e) => setEditForm({ ...editForm, resolutionNotes: e.target.value })}
                rows={2}
                placeholder="Qué se hizo para resolver la avería…"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </Field>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Guardar cambios
              </button>
            </div>
          </form>
        </Modal>
      )}

      {commentTicket && (
        <Modal
          title={`Comentario — ${commentTicket.ticketCode}`}
          icon={<MessageSquare className="w-4 h-4 text-amber-600" />}
          onClose={() => setCommentTicket(null)}
          maxWidth="max-w-md">
          <form onSubmit={handleAddComment} className="p-6 space-y-4">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={4}
              placeholder="Escribe una actualización o nota técnica…"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              required
            />
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={commentInternal}
                onChange={(e) => setCommentInternal(e.target.checked)}
              />
              Comentario interno (solo junta y administración)
            </label>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCommentTicket(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Publicar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.title} subtitle={detail.ticketCode} onClose={() => setDetail(null)} maxWidth="max-w-2xl">
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Info label="Estado" value={STATUS_BADGES[detail.status]?.label || detail.status} />
              <Info label="Prioridad" value={PRIORITY_BADGES[detail.priority]?.label || detail.priority} />
              <Info label="Categoría" value={CATEGORY_LABELS[detail.category] || detail.category || '—'} />
              <Info label="Unidad" value={detail.propertyUnitCode || 'Área común'} />
              <Info label="Reportó" value={detail.reportedByName || '—'} />
              <Info label="Asignado a" value={detail.assignedToName || 'Sin asignar'} />
              <Info label="Costo estimado" value={`$${detail.estimatedCostUsd || 0}`} />
              <Info label="Costo real" value={`$${detail.actualCostUsd || 0}`} />
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase mb-1">Descripción</h4>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.description}</p>
            </div>

            {detail.resolutionNotes && (
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-1">Resolución</h4>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.resolutionNotes}</p>
              </div>
            )}

            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">
                Historial de comentarios ({(detail.comments || []).length})
              </h4>
              {(detail.comments || []).length === 0 ? (
                <p className="text-xs text-slate-400">Aún no hay comentarios.</p>
              ) : (
                <div className="space-y-2">
                  {detail.comments.map((c: any) => (
                    <div
                      key={c.id}
                      className={`rounded-xl p-3 text-xs ${
                        c.isInternalOnly ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200'
                      }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-700">{c.authorName || 'Usuario'}</span>
                        <span className="text-[10px] text-slate-400">
                          {c.isInternalOnly ? 'INTERNO · ' : ''}
                          {c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}
                        </span>
                      </div>
                      <p className="text-slate-700 whitespace-pre-wrap">{c.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setCommentTicket(detail);
                  setDetail(null);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Agregar comentario
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  subtitle,
  icon,
  children,
  onClose,
  maxWidth = 'max-w-lg',
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              {icon}
              {title}
            </h3>
            {subtitle && <p className="text-[11px] text-slate-500 font-mono mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="font-semibold text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}

function KpiCard({ label, value, icon, hint }: { label: string; value: any; icon: React.ReactNode; hint: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
      <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
        <span>{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-extrabold text-slate-900 mt-1">{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>
    </div>
  );
}

const TONES: Record<string, string> = {
  slate: 'bg-slate-50 text-slate-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  orange: 'bg-orange-50 text-orange-700',
  rose: 'bg-rose-50 text-rose-700',
};

function KpiBox({ label, value, tone = 'slate' }: { label: string; value: any; tone?: string }) {
  return (
    <div className={`rounded-xl p-4 ${TONES[tone] || TONES.slate}`}>
      <div className="text-[11px] uppercase tracking-wider opacity-80 mb-1">{label}</div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
