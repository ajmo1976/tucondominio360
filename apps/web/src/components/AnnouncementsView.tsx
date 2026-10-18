'use client';

import React, { useEffect, useState } from 'react';
import {
  Megaphone,
  Plus,
  Loader2,
  RefreshCw,
  Search,
  CheckCircle2,
  X,
  AlertTriangle,
  Pin,
  ShieldCheck,
  Eye,
  FileSignature,
  Calendar,
  User,
} from 'lucide-react';
import { fetchWithAuth } from '../lib/api';

const CATEGORY_LABELS: Record<string, { label: string; style: string }> = {
  GENERAL: { label: 'General', style: 'bg-slate-100 text-slate-700 border-slate-300' },
  URGENT: { label: 'Urgente', style: 'bg-rose-50 text-rose-700 border-rose-200' },
  MAINTENANCE: { label: 'Mantenimiento', style: 'bg-amber-50 text-amber-700 border-amber-200' },
  FINANCIAL: { label: 'Financiero', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ASSEMBLY: { label: 'Asamblea', style: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  SECURITY: { label: 'Seguridad', style: 'bg-sky-50 text-sky-700 border-sky-200' },
};

const EMPTY_FORM = {
  title: '',
  content: '',
  category: 'GENERAL',
  isUrgent: false,
  requiresAcknowledgement: false,
  attachmentUrls: '',
};

export function AnnouncementsView({ condoId, isSuperadmin = false }: { condoId: string; isSuperadmin?: boolean }) {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [ackedIds, setAckedIds] = useState<Set<string>>(new Set());
  const [kpis, setKpis] = useState<any>({ totalPublished: 0, totalUrgent: 0, totalRequiringAck: 0, acknowledgmentPct: 100 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [filters, setFilters] = useState({ category: 'ALL', q: '' });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [detail, setDetail] = useState<any | null>(null);
  const [ackNote, setAckNote] = useState('');
  const [ackLoading, setAckLoading] = useState(false);

  const notify = (msg: string) => {
    setNotification(msg);
    window.setTimeout(() => setNotification(null), 4000);
  };

  const loadAll = async () => {
    if (!condoId) return;
    setLoading(true);
    setError(null);
    try {
      const [listRes, kpisRes, acksRes] = await Promise.all([
        fetchWithAuth(`/announcements?condoId=${condoId}`).catch(() => []),
        fetchWithAuth(`/announcements/kpis?condoId=${condoId}`).catch(() => null),
        fetchWithAuth(`/announcements/my-acks?condoId=${condoId}`).catch(() => []),
      ]);
      setAnnouncements(Array.isArray(listRes) ? listRes : []);
      if (kpisRes && typeof kpisRes === 'object') setKpis(kpisRes);
      if (Array.isArray(acksRes)) {
        setAckedIds(new Set(acksRes.map((a: any) => a.announcementId).filter(Boolean)));
      }
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar la Cartelera Digital');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condoId]);

  const visible = announcements.filter((a) => {
    if (filters.category !== 'ALL' && a.category !== filters.category) return false;
    if (filters.q.trim()) {
      const q = filters.q.trim().toLowerCase();
      if (!(`${a.title} ${a.content}`.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      alert('El título y el contenido son obligatorios.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await fetchWithAuth('/announcements', {
        method: 'POST',
        body: JSON.stringify({
          condoId,
          title: form.title.trim(),
          content: form.content.trim(),
          category: form.category,
          isUrgent: form.isUrgent,
          requiresAcknowledgement: form.requiresAcknowledgement,
          attachmentUrls: form.attachmentUrls.trim() || undefined,
        }),
      });
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      notify(`Comunicado publicado: ${created.announcement_code}`);
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (id: string) => {
    try {
      const data = await fetchWithAuth(`/announcements/${id}?condoId=${condoId}`);
      setDetail(data);
      setAckNote('');
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleAcknowledge = async () => {
    if (!detail) return;
    setAckLoading(true);
    try {
      const res = await fetchWithAuth(`/announcements/${detail.id}/acknowledge?condoId=${condoId}`, {
        method: 'POST',
        body: JSON.stringify({ acknowledgementNote: ackNote.trim() || undefined }),
      });
      setAckedIds((prev) => new Set(prev).add(detail.id));
      if (res.signatureCode) {
        notify(`Acuse firmado. Código de firma: ${res.signatureCode}`);
      } else {
        notify(res.message || 'Acuse registrado');
      }
      setDetail(null);
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAckLoading(false);
    }
  };

  if (loading && announcements.length === 0) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-500">Cargando Cartelera Digital…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-xs font-semibold max-w-sm">
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Cartelera Digital y Comunicados</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Publica avisos oficiales y certifica el acuse de recibo legal de los propietarios.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadAll}
            className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
          {isSuperadmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition">
              <Plus className="w-4 h-4" /> Nuevo Comunicado
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiBox label="Publicados" value={kpis.totalPublished ?? 0} tone="indigo" />
        <KpiBox label="Urgentes" value={kpis.totalUrgent ?? 0} tone="rose" />
        <KpiBox label="Acuses firmados" value={`${kpis.acknowledgmentPct ?? 0}%`} tone="emerald" />
        <KpiBox label="Pendientes de acuse" value={kpis.pendingAcknowledgments ?? 0} tone="amber" />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <select
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
          <option value="ALL">Todas las categorías</option>
          {Object.entries(CATEGORY_LABELS).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Buscar comunicado…"
            className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 w-64"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
          <Megaphone className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">No hay comunicados</p>
          <p className="text-xs text-slate-400 mt-1">
            {isSuperadmin ? 'Publica el primer aviso usando “Nuevo Comunicado”.' : 'Aún no hay avisos para esta residencia.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map((a) => {
            const cat = CATEGORY_LABELS[a.category] || CATEGORY_LABELS.GENERAL;
            const acked = ackedIds.has(a.id);
            return (
              <button
                key={a.id}
                onClick={() => openDetail(a.id)}
                className="text-left bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 hover:border-indigo-300 hover:shadow transition">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cat.style}`}>{cat.label}</span>
                  {a.isUrgent && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> URGENTE
                    </span>
                  )}
                  {a.requiresAcknowledgement && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                      ackedIds.has(a.id)
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      <ShieldCheck className="w-3 h-3" />
                      {ackedIds.has(a.id) ? 'Acuse firmado' : 'Requiere acuse'}
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 text-sm">{a.title}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-3 whitespace-pre-wrap">{a.content}</p>
                <div className="flex items-center justify-between mt-3 text-[11px] text-slate-400">
                  <span className="font-mono">{a.announcementCode}</span>
                  <span>{a.publishedAt ? new Date(a.publishedAt).toLocaleDateString() : ''}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal title="Nuevo comunicado" icon={<Megaphone className="w-4 h-4 text-indigo-600" />} onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            <Field label="Título *">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ej: Mantenimiento programado del ascensor"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                required
              />
            </Field>
            <Field label="Contenido *">
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={5}
                placeholder="Detalla el aviso, fechas y cualquier instrucción para los residentes…"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm">
                  {Object.entries(CATEGORY_LABELS).map(([key, meta]) => (
                    <option key={key} value={key}>{meta.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Adjunto (URL)">
                <input
                  value={form.attachmentUrls}
                  onChange={(e) => setForm({ ...form, attachmentUrls: e.target.value })}
                  placeholder="https://…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={form.isUrgent}
                onChange={(e) => setForm({ ...form, isUrgent: e.target.checked })}
              />
              Marcar como urgente
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-200">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.requiresAcknowledgement}
                onChange={(e) => setForm({ ...form, requiresAcknowledgement: e.target.checked })}
              />
              <span>
                <strong>Requiere acuse de recibo legal.</strong> Cada propietario deberá firmar la lectura y el sistema
                registrará un código de firma certificado.
              </span>
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
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Publicar comunicado
              </button>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal
          title={detail.title}
          subtitle={detail.announcementCode}
          icon={<Megaphone className="w-4 h-4 text-indigo-600" />}
          onClose={() => setDetail(null)}
          maxWidth="max-w-2xl">
          <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${(CATEGORY_LABELS[detail.category] || CATEGORY_LABELS.GENERAL).style}`}>
                {(CATEGORY_LABELS[detail.category] || CATEGORY_LABELS.GENERAL).label}
              </span>
              {detail.isUrgent && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200">
                  Urgente
                </span>
              )}
              {detail.requiresAcknowledgement && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Acuse de recibo legal
                </span>
              )}
            </div>

            <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.content}</p>

            {detail.attachmentUrls && Array.isArray(detail.attachmentUrls) && detail.attachmentUrls.length > 0 && (
              <div className="text-xs">
                <span className="font-bold text-slate-500 uppercase">Adjuntos: </span>
                {detail.attachmentUrls.map((u: string, i: number) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline mr-2">
                    {u}
                  </a>
                ))}
              </div>
            )}

            <div className="flex items-center gap-4 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> {detail.authorName}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {detail.publishedAt ? new Date(detail.publishedAt).toLocaleString() : ''}
              </span>
            </div>

            {detail.requiresAcknowledgement && (
              <div className="border-t border-slate-100 pt-4">
                {ackedIds.has(detail.id) ? (
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs font-semibold">
                    <ShieldCheck className="w-4 h-4" /> Ya firmaste el acuse de recibo de este comunicado.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase mb-1">Firmar acuse de recibo</h4>
                      <p className="text-[11px] text-slate-400">
                        Al firmar confirmas que has leído y comprendido el contenido de este comunicado. Se generará un
                        código de firma certificado e inmutable.
                      </p>
                    </div>
                    <textarea
                      value={ackNote}
                      onChange={(e) => setAckNote(e.target.value)}
                      rows={2}
                      placeholder="Nota opcional (ej: Recibido y de acuerdo)…"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                    <button
                      onClick={handleAcknowledge}
                      disabled={ackLoading}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
                      {ackLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      Firmar Acuse de Recibo
                    </button>
                  </div>
                )}
              </div>
            )}
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

const TONES: Record<string, string> = {
  slate: 'bg-slate-50 text-slate-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
};

function KpiBox({ label, value, tone = 'slate' }: { label: string; value: any; tone?: string }) {
  return (
    <div className={`rounded-2xl p-4 ${TONES[tone] || TONES.slate}`}>
      <div className="text-[11px] uppercase tracking-wider opacity-80 mb-1">{label}</div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
