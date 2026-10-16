'use client';

/**
 * Vista de administración de Consultas y Asambleas digitales (Task 9).
 *
 * Componente cliente autocontenido: consume la API de consultas (Tasks 2–7)
 * con `fetchWithAuth` / `downloadWithAuth` y permite, como Super Administrador:
 *  - Listar las consultas de la residencia con votos y barras por opción.
 *  - Crear / editar (solo DRAFT) con opciones dinámicas y validación en cliente.
 *  - Publicar (con aviso de inmuebles sin votante), cerrar (congela el
 *    resultado) y cancelar (con motivo opcional).
 *  - Gestionar el padrón de habilitados (agregar / quitar).
 *  - Ver resultados (tablas de opciones y votos) y descargar el acta PDF.
 *
 * Se integra en la app (Task 8) como <ConsultationsAdminView condoId={...} />.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Ban,
  ChartColumn,
  CircleCheck,
  Download,
  Eye,
  ListChecks,
  LoaderCircle,
  Lock,
  Pencil,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  Users,
  Vote,
  X,
} from 'lucide-react';
import { downloadWithAuth, fetchWithAuth } from '../lib/api';

// ============================================================
// Tipos (contrato de la API — Tasks 2–7)
// ============================================================

type ConsultationStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
type ConsultationType = 'CARTA_CONSULTA' | 'ASAMBLEA_ORDINARIA' | 'ASAMBLEA_EXTRAORDINARIA';

/** Fila de GET /consultations?condoId= */
interface ConsultationListItem {
  id: string;
  condo_id: string;
  title: string;
  description: string;
  consultation_type: ConsultationType;
  status: ConsultationStatus;
  start_date: string;
  end_date: string;
  is_secret_ballot: boolean;
  created_at: string;
  option_count: number;
  vote_count: number;
}

interface TallyOptionResult {
  optionId: string;
  title: string;
  units: number;
  unitPercentage: number;
  aliquotSum: number;
  aliquotPercentage: number;
}

interface TallyResult {
  totalUnits: number;
  totalAliquot: number;
  options: TallyOptionResult[];
  winnerOptionId: string | null;
  result: 'APPROVED' | 'TIED' | 'NO_VOTES';
}

interface PublicVote {
  unitCode: string;
  voter: string;
  optionId: string;
  votedAt: string;
}

interface ResultsData {
  tally: TallyResult;
  votes: PublicVote[];
  closed: boolean;
  result: string | null;
}

interface Elector {
  id: string;
  unitCode: string;
  userId: string;
  name: string;
  source: string;
}

interface PropertyUnit {
  id: string;
  unit_code: string;
  aliquot_percentage: number;
}

interface AppUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface OptionFormItem {
  title: string;
  description: string;
}

interface ConsultationFormState {
  title: string;
  consultationType: ConsultationType | '';
  description: string;
  startDate: string;
  endDate: string;
  options: OptionFormItem[];
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  withReason?: boolean;
  action: (reason?: string) => Promise<void>;
}

// ============================================================
// Constantes y helpers
// ============================================================

const CONSULTATION_TYPE_LABELS: Record<ConsultationType, string> = {
  CARTA_CONSULTA: 'Carta Consulta',
  ASAMBLEA_ORDINARIA: 'Asamblea Ordinaria',
  ASAMBLEA_EXTRAORDINARIA: 'Asamblea Extraordinaria',
};

const CONSULTATION_TYPE_OPTIONS: Array<{ value: ConsultationType; label: string; hint: string }> = [
  { value: 'CARTA_CONSULTA', label: 'Carta Consulta', hint: 'Consulta simple a los copropietarios' },
  { value: 'ASAMBLEA_ORDINARIA', label: 'Asamblea Ordinaria', hint: 'Asamblea general de copropietarios' },
  { value: 'ASAMBLEA_EXTRAORDINARIA', label: 'Asamblea Extraordinaria', hint: 'Convocada fuera de agenda' },
];

const STATUS_LABELS: Record<ConsultationStatus, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicada',
  CLOSED: 'Cerrada',
  CANCELLED: 'Cancelada',
};

const STATUS_BADGE_STYLES: Record<ConsultationStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  PUBLISHED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-sky-50 text-sky-700 border-sky-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};

const RESULT_LABELS: Record<string, string> = {
  APPROVED: 'Decisión tomada',
  TIED: 'Empate (sin decisión)',
  NO_VOTES: 'Sin votos',
};

const RESULT_BANNER_STYLES: Record<string, string> = {
  APPROVED: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  TIED: 'bg-amber-50 border-amber-200 text-amber-800',
  NO_VOTES: 'bg-slate-100 border-slate-200 text-slate-600',
};

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** ISO → valor para <input type="datetime-local"> (en hora local). */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : '0.0%';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Ocurrió un error inesperado.';
}

const EMPTY_FORM: ConsultationFormState = {
  title: '',
  consultationType: '',
  description: '',
  startDate: '',
  endDate: '',
  options: [
    { title: '', description: '' },
    { title: '', description: '' },
  ],
};

// ============================================================
// Componente
// ============================================================

export function ConsultationsAdminView({ condoId }: { condoId: string }) {
  // ---- Listado ----
  const [consultations, setConsultations] = useState<ConsultationListItem[]>([]);
  const [tallyMap, setTallyMap] = useState<Record<string, TallyResult | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const notifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Modal formulario (crear / editar) ----
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ConsultationFormState>(EMPTY_FORM);
  const [showFormErrors, setShowFormErrors] = useState(false);

  // ---- Modal padrón ----
  const [showPadron, setShowPadron] = useState(false);
  const [padronConsultation, setPadronConsultation] = useState<ConsultationListItem | null>(null);
  const [electors, setElectors] = useState<Elector[]>([]);
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [padronLoading, setPadronLoading] = useState(false);
  const [newElectorUnitId, setNewElectorUnitId] = useState('');
  const [newElectorUserId, setNewElectorUserId] = useState('');

  // ---- Modal resultados ----
  const [showResults, setShowResults] = useState(false);
  const [resultsConsultation, setResultsConsultation] = useState<ConsultationListItem | null>(null);
  const [results, setResults] = useState<ResultsData | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  // ---- Modal de confirmación (cerrar / cancelar) ----
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmReason, setConfirmReason] = useState('');

  const notify = (msg: string) => {
    setNotification(msg);
    if (notifyTimer.current) clearTimeout(notifyTimer.current);
    notifyTimer.current = setTimeout(() => setNotification(null), 6000);
  };

  // ---- Carga: lista + recuento por opción para las barras de progreso ----
  const loadConsultations = async () => {
    if (!condoId) {
      setError('Se requiere una residencia para listar las consultas.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = (await fetchWithAuth(`/consultations?condoId=${condoId}`)) as ConsultationListItem[];
      setConsultations(list);

      // Barras de progreso por opción: el listado no trae el recuento por
      // opción, así que se pide el tally de cada consulta en paralelo. Un
      // fallo individual (p. ej. permisos) solo oculta esas barras.
      const entries = await Promise.allSettled(
        list.map((c) =>
          fetchWithAuth(`/consultations/${c.id}/results`).then((r) => [c.id, r.tally] as const),
        ),
      );
      const map: Record<string, TallyResult | null> = {};
      entries.forEach((entry, i) => {
        map[list[i].id] = entry.status === 'fulfilled' ? entry.value[1] : null;
      });
      setTallyMap(map);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConsultations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condoId]);

  // ============================================================
  // Formulario crear / editar
  // ============================================================

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowFormErrors(false);
    setShowForm(true);
  };

  const openEditForm = async (c: ConsultationListItem) => {
    try {
      const full = (await fetchWithAuth(`/consultations/${c.id}`)) as ConsultationListItem & {
        options: Array<{ id: string; title: string; description: string | null }>;
      };
      setEditingId(c.id);
      setForm({
        title: full.title,
        consultationType: full.consultation_type,
        description: full.description,
        startDate: toLocalInputValue(full.start_date),
        endDate: toLocalInputValue(full.end_date),
        options: (full.options ?? []).map((o) => ({ title: o.title, description: o.description ?? '' })),
      });
      setShowFormErrors(false);
      setShowForm(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const updateOption = (index: number, patch: Partial<OptionFormItem>) => {
    setForm((f) => ({
      ...f,
      options: f.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    }));
  };

  const addOption = () => {
    if (form.options.length >= MAX_OPTIONS) return;
    setForm((f) => ({ ...f, options: [...f.options, { title: '', description: '' }] }));
  };

  const removeOption = (index: number) => {
    if (form.options.length <= MIN_OPTIONS) return;
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== index) }));
  };

  /** Validación en cliente. El servidor vuelve a validar (confianza en él). */
  const validateForm = (f: ConsultationFormState): string[] => {
    const errors: string[] = [];
    const title = f.title.trim();
    const description = f.description.trim();
    if (title.length < 3 || title.length > 200) {
      errors.push('El título debe tener entre 3 y 200 caracteres.');
    }
    if (description.length < 3 || description.length > 5000) {
      errors.push('La descripción debe tener entre 3 y 5000 caracteres.');
    }
    if (!f.consultationType) {
      errors.push('Selecciona el tipo de consulta.');
    }
    if (!f.startDate) {
      errors.push('Indica la fecha y hora de inicio.');
    }
    if (!f.endDate) {
      errors.push('Indica la fecha y hora de cierre.');
    }
    if (f.startDate && f.endDate && new Date(f.endDate) <= new Date(f.startDate)) {
      errors.push('La fecha de cierre debe ser posterior a la de inicio.');
    }
    if (f.options.length < MIN_OPTIONS) {
      errors.push(`Agrega al menos ${MIN_OPTIONS} opciones.`);
    }
    if (f.options.length > MAX_OPTIONS) {
      errors.push(`Máximo ${MAX_OPTIONS} opciones.`);
    }
    const titles = f.options.map((o) => o.title.trim());
    if (titles.some((t) => !t)) {
      errors.push('Todas las opciones deben tener un título.');
    }
    if (new Set(titles).size !== titles.length) {
      errors.push('Las opciones deben tener títulos distintos.');
    }
    return errors;
  };

  const formErrors = validateForm(form);
  const formValid = formErrors.length === 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm(form);
    if (errors.length > 0) {
      setShowFormErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        consultationType: form.consultationType,
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        options: form.options.map((o) => ({ title: o.title.trim(), description: o.description.trim() })),
      };
      if (editingId) {
        await fetchWithAuth(`/consultations/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        notify('Consulta actualizada en borrador.');
      } else {
        await fetchWithAuth('/consultations', {
          method: 'POST',
          body: JSON.stringify({ condoId, ...payload }),
        });
        notify('Consulta creada en borrador. Publícala cuando esté lista.');
      }
      setShowForm(false);
      await loadConsultations();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // Acciones de ciclo de vida
  // ============================================================

  const handlePublish = (c: ConsultationListItem) => {
    setConfirmReason('');
    setConfirmState({
      title: 'Publicar consulta',
      message: `«${c.title}» quedará visible para los residentes y se creará el padrón de habilitados (un voto por unidad). Esta acción no se puede deshacer.`,
      confirmLabel: 'Publicar',
      action: async () => {
        const res = (await fetchWithAuth(`/consultations/${c.id}/publish`, {
          method: 'POST',
        })) as { electorsCreated: number; unitsWithoutElector: string[] };
        if (res.unitsWithoutElector.length > 0) {
          notify(
            `${res.unitsWithoutElector.length} inmueble(s) quedaron sin votante habilitado. Agrégalos en el padrón.`,
          );
        } else {
          notify(`Consulta «${c.title}» publicada.`);
        }
        await loadConsultations();
      },
    });
  };

  const handleClose = (c: ConsultationListItem) => {
    setConfirmReason('');
    setConfirmState({
      title: 'Cerrar consulta',
      message:
        'Al cerrar la consulta, el resultado queda congelado y no se podrán emitir más votos. ¿Confirmas el cierre?',
      confirmLabel: 'Cerrar consulta',
      danger: true,
      action: async () => {
        await fetchWithAuth(`/consultations/${c.id}/close`, { method: 'POST' });
        notify('Consulta cerrada. El resultado quedó congelado.');
        await loadConsultations();
      },
    });
  };

  const handleCancel = (c: ConsultationListItem) => {
    setConfirmReason('');
    setConfirmState({
      title: 'Cancelar consulta',
      message:
        'La consulta quedará cancelada y no podrá volver a publicarse. Los votos ya emitidos se conservan para trazabilidad.',
      confirmLabel: 'Cancelar consulta',
      danger: true,
      withReason: true,
      action: async (reason) => {
        await fetchWithAuth(`/consultations/${c.id}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason?.trim() ? reason.trim() : undefined }),
        });
        notify('Consulta cancelada.');
        await loadConsultations();
      },
    });
  };

  const runConfirm = async () => {
    if (!confirmState) return;
    const action = confirmState.action;
    setConfirmState(null);
    try {
      await action(confirmReason);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // ============================================================
  // Padrón de habilitados
  // ============================================================

  const padronReadOnly = (c: ConsultationListItem) => c.status === 'CLOSED' || c.status === 'CANCELLED';

  const openPadron = async (c: ConsultationListItem) => {
    setPadronConsultation(c);
    setShowPadron(true);
    setElectors([]);
    setUnits([]);
    setUsers([]);
    setNewElectorUnitId('');
    setNewElectorUserId('');
    setPadronLoading(true);
    setError(null);
    try {
      const [electorList, unitList, userList] = await Promise.all([
        fetchWithAuth(`/consultations/${c.id}/electors`) as Promise<Elector[]>,
        fetchWithAuth(`/condos/${condoId}/units`) as Promise<PropertyUnit[]>,
        fetchWithAuth('/users') as Promise<AppUser[]>,
      ]);
      setElectors(electorList);
      setUnits(unitList);
      setUsers(userList);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPadronLoading(false);
    }
  };

  const handleAddElector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!padronConsultation || !newElectorUnitId || !newElectorUserId) return;
    setError(null);
    try {
      await fetchWithAuth(`/consultations/${padronConsultation.id}/electors`, {
        method: 'POST',
        body: JSON.stringify({ propertyUnitId: newElectorUnitId, userId: newElectorUserId }),
      });
      setNewElectorUnitId('');
      setNewElectorUserId('');
      const electorList = (await fetchWithAuth(
        `/consultations/${padronConsultation.id}/electors`,
      )) as Elector[];
      setElectors(electorList);
      notify('Habilitado agregado al padrón.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleRemoveElector = async (elector: Elector) => {
    if (!padronConsultation) return;
    if (!window.confirm(`¿Quitar a ${elector.name} del padrón de ${elector.unitCode}?`)) return;
    setError(null);
    try {
      await fetchWithAuth(`/consultations/${padronConsultation.id}/electors/${elector.id}`, {
        method: 'DELETE',
      });
      setElectors((prev) => prev.filter((e) => e.id !== elector.id));
      notify('Habilitado retirado del padrón.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // ============================================================
  // Resultados y acta
  // ============================================================

  const openResults = async (c: ConsultationListItem) => {
    setResultsConsultation(c);
    setShowResults(true);
    setResults(null);
    setResultsLoading(true);
    setError(null);
    try {
      const data = (await fetchWithAuth(`/consultations/${c.id}/results`)) as ResultsData;
      setResults(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResultsLoading(false);
    }
  };

  const handleDownloadActa = async () => {
    if (!resultsConsultation) return;
    setError(null);
    try {
      await downloadWithAuth(`/consultations/${resultsConsultation.id}/acta.pdf`, 'acta-consulta.pdf');
      notify('Acta descargada.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // ============================================================
  // Render
  // ============================================================

  const inputCls =
    'w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';
  const labelCls = 'block font-semibold text-slate-700 mb-1 text-xs';

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Vote className="w-6 h-6 text-emerald-600" />
            Consultas y Asambleas
          </h1>
          <p className="text-sm text-slate-500">
            Crea consultas digitales, publícala, gestiona el padrón de habilitados, cierra y descarga el acta.
          </p>
        </div>
        <button
          onClick={openCreateForm}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva consulta</span>
        </button>
      </div>

      {/* Notificación de éxito */}
      {notification && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CircleCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <TriangleAlert className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-700 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Listado */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
          <LoaderCircle className="w-5 h-5 animate-spin" />
          <span>Cargando consultas…</span>
        </div>
      ) : consultations.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200/80">
          <Vote className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No hay consultas registradas en esta residencia.</p>
          <p className="text-xs mt-1">Crea la primera con el botón «Nueva consulta».</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {consultations.map((c) => {
            const tally = tallyMap[c.id];
            return (
              <div
                key={c.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:border-emerald-300 transition flex flex-col"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm leading-snug">{c.title}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {CONSULTATION_TYPE_LABELS[c.consultation_type]}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wide shrink-0 ${STATUS_BADGE_STYLES[c.status]}`}
                  >
                    {STATUS_LABELS[c.status]}
                  </span>
                </div>

                {c.description && (
                  <p className="text-xs text-slate-600 mt-2 line-clamp-2">{c.description}</p>
                )}

                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <span className="font-semibold text-slate-400">Inicio:</span>
                    <span className="font-medium text-slate-700">{formatDateTime(c.start_date)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <span className="font-semibold text-slate-400">Cierre:</span>
                    <span className="font-medium text-slate-700">{formatDateTime(c.end_date)}</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 mt-2">
                  Votos emitidos: <strong className="text-slate-800">{c.vote_count}</strong>
                  <span className="text-slate-400"> · {c.option_count} opciones</span>
                </div>

                {/* Barras de progreso por opción */}
                {tally && tally.options.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {tally.options.map((o) => (
                      <div key={o.optionId}>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-slate-600 font-medium truncate pr-2">{o.title}</span>
                          <span className="text-slate-500 shrink-0 font-mono">
                            {o.units} · {formatPercent(o.unitPercentage)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, o.unitPercentage))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Acciones según estado */}
                <div className="flex flex-wrap gap-1.5 pt-3 mt-auto border-t border-slate-100">
                  {c.status === 'DRAFT' && (
                    <>
                      <button
                        onClick={() => openEditForm(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                      >
                        <Pencil className="w-3 h-3" />
                        Editar
                      </button>
                      <button
                        onClick={() => openPadron(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                      >
                        <Users className="w-3 h-3" />
                        Padrón
                      </button>
                      <button
                        onClick={() => handlePublish(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition"
                      >
                        <Send className="w-3 h-3" />
                        Publicar
                      </button>
                      <button
                        onClick={() => handleCancel(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-rose-200 text-rose-600 hover:bg-rose-50 transition"
                      >
                        <Ban className="w-3 h-3" />
                        Cancelar
                      </button>
                    </>
                  )}
                  {c.status === 'PUBLISHED' && (
                    <>
                      <button
                        onClick={() => openResults(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-sky-600 hover:bg-sky-700 text-white transition"
                      >
                        <ChartColumn className="w-3 h-3" />
                        Resultados
                      </button>
                      <button
                        onClick={() => openPadron(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                      >
                        <Users className="w-3 h-3" />
                        Padrón
                      </button>
                      <button
                        onClick={() => handleClose(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white transition"
                      >
                        <Lock className="w-3 h-3" />
                        Cerrar
                      </button>
                      <button
                        onClick={() => handleCancel(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-rose-200 text-rose-600 hover:bg-rose-50 transition"
                      >
                        <Ban className="w-3 h-3" />
                        Cancelar
                      </button>
                    </>
                  )}
                  {(c.status === 'CLOSED' || c.status === 'CANCELLED') && (
                    <>
                      <button
                        onClick={() => openResults(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-sky-600 hover:bg-sky-700 text-white transition"
                      >
                        <Eye className="w-3 h-3" />
                        Ver resultados
                      </button>
                      <button
                        onClick={() => openPadron(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                      >
                        <Users className="w-3 h-3" />
                        Padrón
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ Modal: formulario crear / editar ============ */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="font-bold text-slate-900 text-base">
                {editingId ? 'Editar consulta (borrador)' : 'Nueva consulta'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              {showFormErrors && formErrors.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 space-y-1">
                  {formErrors.map((err) => (
                    <p key={err} className="text-[11px] font-semibold flex items-center gap-1.5">
                      <TriangleAlert className="w-3 h-3 shrink-0" />
                      {err}
                    </p>
                  ))}
                </div>
              )}

              <div>
                <label className={labelCls} htmlFor="f-title">
                  Título <span className="text-slate-400 font-normal">(3–200 caracteres)</span>
                </label>
                <input
                  id="f-title"
                  type="text"
                  value={form.title}
                  maxLength={200}
                  placeholder="Ej: Consulta sobre el aumento de la cuota de condominio"
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className={inputCls}
                />
                <p className="text-[10px] text-slate-400 mt-0.5 text-right">{form.title.length}/200</p>
              </div>

              <div>
                <label className={labelCls} htmlFor="f-type">
                  Tipo de consulta
                </label>
                <select
                  id="f-type"
                  value={form.consultationType}
                  onChange={(e) => setForm((f) => ({ ...f, consultationType: e.target.value as ConsultationType | '' }))}
                  className={inputCls}
                >
                  <option value="">Selecciona un tipo…</option>
                  {CONSULTATION_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.hint}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls} htmlFor="f-description">
                  Descripción <span className="text-slate-400 font-normal">(3–5000 caracteres)</span>
                </label>
                <textarea
                  id="f-description"
                  value={form.description}
                  rows={4}
                  maxLength={5000}
                  placeholder="Explica el propósito de la consulta y el contexto para los copropietarios…"
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className={inputCls}
                />
                <p className="text-[10px] text-slate-400 mt-0.5 text-right">{form.description.length}/5000</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="f-start">
                    Fecha y hora de inicio
                  </label>
                  <input
                    id="f-start"
                    type="datetime-local"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="f-end">
                    Fecha y hora de cierre
                  </label>
                  <input
                    id="f-end"
                    type="datetime-local"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* Opciones dinámicas */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-emerald-600" />
                    Opciones de voto
                    <span className="text-slate-400 font-normal">
                      ({form.options.length}/{MAX_OPTIONS}, mínimo {MIN_OPTIONS})
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={addOption}
                    disabled={form.options.length >= MAX_OPTIONS}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3 h-3" />
                    Agregar opção
                  </button>
                </div>

                {form.options.map((opt, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                        Opción {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        disabled={form.options.length <= MIN_OPTIONS}
                        className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Quitar opção"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={opt.title}
                      maxLength={150}
                      placeholder="Título de la opción (ej: Sí / No / Abstención)"
                      onChange={(e) => updateOption(i, { title: e.target.value })}
                      className={inputCls}
                    />
                    <input
                      type="text"
                      value={opt.description}
                      maxLength={1000}
                      placeholder="Descripción de la opción (opcional)"
                      onChange={(e) => updateOption(i, { description: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <p className="text-[10px] text-slate-400">
                  {formValid
                    ? 'Todo listo para guardar.'
                    : 'Completa todos los campos para habilitar «Guardar».'}
                </p>
                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!formValid || saving}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
                    {editingId ? 'Guardar cambios' : 'Guardar consulta'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============ Modal: padrón de habilitados ============ */}
      {showPadron && padronConsultation && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-600" />
                  Padrón de habilitados
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {padronConsultation.title}{' '}
                  <span className={`ml-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${STATUS_BADGE_STYLES[padronConsultation.status]}`}>
                    {STATUS_LABELS[padronConsultation.status]}
                  </span>
                </p>
              </div>
              <button onClick={() => setShowPadron(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {padronReadOnly(padronConsultation) && (
              <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2 mb-4">
                La consulta está {STATUS_LABELS[padronConsultation.status].toLowerCase()}: el padrón es de solo lectura.
              </p>
            )}

            {/* Formulario agregar habilitado */}
            {!padronReadOnly(padronConsultation) && (
              <form onSubmit={handleAddElector} className="p-3 bg-slate-50 border border-slate-200 rounded-xl mb-4">
                <p className="font-semibold text-slate-800 mb-2">Agregar habilitado</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={newElectorUnitId}
                    onChange={(e) => setNewElectorUnitId(e.target.value)}
                    className={inputCls}
                    required
                  >
                    <option value="">Unidad…</option>
                    {units
                      .filter((u) => !electors.some((e) => e.unitCode === u.unit_code))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.unit_code} · {Number(u.aliquot_percentage).toFixed(5)}%
                        </option>
                      ))}
                  </select>
                  <select
                    value={newElectorUserId}
                    onChange={(e) => setNewElectorUserId(e.target.value)}
                    className={inputCls}
                    required
                  >
                    <option value="">Usuario…</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.first_name} {u.last_name} · {u.email}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={!newElectorUnitId || !newElectorUserId}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Agregar
                  </button>
                </div>
                {units.length > 0 && units.every((u) => electors.some((e) => e.unitCode === u.unit_code)) && (
                  <p className="text-[10px] text-slate-400 mt-2">
                    Todas las unidades de la residencia ya están en el padrón.
                  </p>
                )}
              </form>
            )}

            {/* Lista del padrón */}
            {padronLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
                <LoaderCircle className="w-4 h-4 animate-spin" />
                <span>Cargando padrón…</span>
              </div>
            ) : electors.length === 0 ? (
              <p className="text-center py-10 text-slate-400 text-sm">
                Aún no hay habilitados en el padrón de esta consulta.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-left">
                      <th className="px-3 py-2 font-semibold">Unidad</th>
                      <th className="px-3 py-2 font-semibold">Habilitado</th>
                      <th className="px-3 py-2 font-semibold">Origen</th>
                      {!padronReadOnly(padronConsultation) && (
                        <th className="px-3 py-2 font-semibold text-right">Acciones</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {electors.map((e) => (
                      <tr key={e.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono font-bold text-slate-800">{e.unitCode}</td>
                        <td className="px-3 py-2 text-slate-700">{e.name}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              e.source === 'MANUAL'
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {e.source === 'MANUAL' ? 'Manual' : 'Propietario'}
                          </span>
                        </td>
                        {!padronReadOnly(padronConsultation) && (
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => handleRemoveElector(e)}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition"
                              title="Quitar del padrón"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ Modal: resultados ============ */}
      {showResults && resultsConsultation && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <ChartColumn className="w-4 h-4 text-sky-600" />
                  Resultados
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {resultsConsultation.title}{' '}
                  <span className={`ml-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${STATUS_BADGE_STYLES[resultsConsultation.status]}`}>
                    {STATUS_LABELS[resultsConsultation.status]}
                  </span>
                </p>
              </div>
              <button onClick={() => setShowResults(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {resultsLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
                <LoaderCircle className="w-4 h-4 animate-spin" />
                <span>Cargando resultados…</span>
              </div>
            ) : !results ? (
              <p className="text-center py-10 text-slate-400 text-sm">No se pudieron cargar los resultados.</p>
            ) : (
              <div className="space-y-5">
                {/* Banner de resultado */}
                {results.result && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${RESULT_BANNER_STYLES[results.result] ?? 'bg-slate-100 border-slate-200 text-slate-600'}`}
                  >
                    {results.result === 'APPROVED' ? (
                      <>
                        <CircleCheck className="w-4 h-4 shrink-0" />
                        <span>
                          {RESULT_LABELS[results.result]}:{' '}
                          {results.tally.options.find((o) => o.optionId === results.tally.winnerOptionId)?.title ??
                            '—'}
                        </span>
                      </>
                    ) : (
                      <>
                        <TriangleAlert className="w-4 h-4 shrink-0" />
                        <span>{RESULT_LABELS[results.result]}</span>
                      </>
                    )}
                  </div>
                )}

                {/* Resumen */}
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-semibold">
                    Votos emitidos: {results.tally.totalUnits}
                  </span>
                  <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-semibold">
                    Alícuota votante: {Number(results.tally.totalAliquot).toFixed(5)}%
                  </span>
                  <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-semibold">
                    {results.closed ? 'Resultado congelado' : 'Recuento en vivo'}
                  </span>
                </div>

                {/* Tabla de opciones */}
                <div>
                  <p className="font-semibold text-slate-800 text-xs mb-2">Por opción</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-left">
                          <th className="px-3 py-2 font-semibold">Opción</th>
                          <th className="px-3 py-2 font-semibold text-right">Unidades</th>
                          <th className="px-3 py-2 font-semibold text-right">% Unidades</th>
                          <th className="px-3 py-2 font-semibold text-right">% Alícuota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.tally.options.map((o) => (
                          <tr
                            key={o.optionId}
                            className={`border-t border-slate-100 ${
                              o.optionId === results.tally.winnerOptionId ? 'bg-emerald-50/60' : ''
                            }`}
                          >
                            <td className="px-3 py-2 font-medium text-slate-800">
                              {o.title}
                              {o.optionId === results.tally.winnerOptionId && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold uppercase">
                                  Ganadora
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">{o.units}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">
                              {formatPercent(o.unitPercentage)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-700">
                              {formatPercent(o.aliquotPercentage)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tabla de votos por unidad */}
                <div>
                  <p className="font-semibold text-slate-800 text-xs mb-2">Votos por unidad</p>
                  {results.votes.length === 0 ? (
                    <p className="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-slate-200">
                      Aún no se emiten votos.
                    </p>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-left">
                            <th className="px-3 py-2 font-semibold">Unidad</th>
                            <th className="px-3 py-2 font-semibold">Votante</th>
                            <th className="px-3 py-2 font-semibold">Opción</th>
                            <th className="px-3 py-2 font-semibold">Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.votes.map((v, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-mono font-bold text-slate-800">{v.unitCode}</td>
                              <td className="px-3 py-2 text-slate-700">{v.voter}</td>
                              <td className="px-3 py-2 text-slate-700">
                                {results.tally.options.find((o) => o.optionId === v.optionId)?.title ?? '—'}
                              </td>
                              <td className="px-3 py-2 text-slate-500">{formatDateTime(v.votedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Acta PDF */}
                {results.closed && (
                  <div className="flex justify-end pt-4 border-t border-slate-200">
                    <button
                      onClick={handleDownloadActa}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Descargar acta (PDF)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ Modal: confirmación (cerrar / cancelar) ============ */}
      {confirmState && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              {confirmState.danger ? (
                <TriangleAlert className="w-5 h-5 text-rose-500" />
              ) : (
                <Send className="w-5 h-5 text-emerald-600" />
              )}
              {confirmState.title}
            </h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">{confirmState.message}</p>

            {confirmState.withReason && (
              <textarea
                value={confirmReason}
                onChange={(e) => setConfirmReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Motivo de la cancelación (opcional)…"
                className={`${inputCls} mt-3`}
              />
            )}

            <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200 mt-4">
              <button
                onClick={() => setConfirmState(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
              >
                Volver
              </button>
              <button
                onClick={runConfirm}
                className={`px-4 py-2 text-white rounded-lg font-semibold shadow-sm transition ${
                  confirmState.danger
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
