'use client';

/**
 * Vista de copropietarios para Consultas y Asambleas digitales (Task 10).
 *
 * Permite a los copropietarios:
 *  - Ver las consultas publicadas y cerradas de su residencia (los borradores
 *    están ocultos automáticamente por la API).
 *  - Comprobar su elegibilidad de voto por inmueble.
 *  - Emitir su voto transaccional (1 voto por inmueble habilitado).
 *  - Obtener el comprobante inmediato con código de verificación y PDF.
 *  - Consultar los resultados públicos (tally y votos por inmueble) y descargar el acta.
 */

import React, { useEffect, useState } from 'react';
import {
  Vote,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  Eye,
  Check,
  X,
  Loader2,
  Building,
  ShieldCheck,
  Calendar,
  Lock,
  ChevronRight,
} from 'lucide-react';
import { downloadWithAuth, fetchWithAuth } from '../lib/api';

// ============================================================
// Tipos
// ============================================================

type ConsultationType = 'CARTA_CONSULTA' | 'ASAMBLEA_ORDINARIA' | 'ASAMBLEA_EXTRAORDINARIA';
type ConsultationStatus = 'PUBLISHED' | 'CLOSED' | 'CANCELLED';

interface ConsultationOption {
  id: string;
  title: string;
  description?: string | null;
  position: number;
}

interface ConsultationItem {
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

interface EligibleUnit {
  propertyUnitId: string;
  unitCode: string;
  alreadyVoted: boolean;
  votedOptionId: string | null;
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

// ============================================================
// Helpers
// ============================================================

const CONSULTATION_TYPE_LABELS: Record<ConsultationType, string> = {
  CARTA_CONSULTA: 'Carta Consulta',
  ASAMBLEA_ORDINARIA: 'Asamblea Ordinaria',
  ASAMBLEA_EXTRAORDINARIA: 'Asamblea Extraordinaria',
};

const STATUS_LABELS: Record<ConsultationStatus, string> = {
  PUBLISHED: 'En Votación',
  CLOSED: 'Cerrada / Finalizada',
  CANCELLED: 'Cancelada',
};

const STATUS_STYLES: Record<ConsultationStatus, string> = {
  PUBLISHED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-slate-100 text-slate-700 border-slate-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};

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

function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : '0.0%';
}

// ============================================================
// Componente principal
// ============================================================

export function ConsultationsOwnerView({ condoId }: { condoId: string }) {
  const [consultations, setConsultations] = useState<ConsultationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mapa de elegibilidad por consultationId: { [consultationId]: EligibleUnit[] }
  const [eligibilityMap, setEligibilityMap] = useState<Record<string, EligibleUnit[]>>({});

  // Modal para votar
  const [votingConsultation, setVotingConsultation] = useState<ConsultationItem | null>(null);
  const [consultationOptions, setConsultationOptions] = useState<ConsultationOption[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteReceipt, setVoteReceipt] = useState<{
    id: string;
    verificationCode: string;
    unitId: string;
    consultationId: string;
  } | null>(null);

  // Modal para ver resultados
  const [resultsModalConsultation, setResultsModalConsultation] = useState<ConsultationItem | null>(null);
  const [resultsData, setResultsData] = useState<ResultsData | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  // Descarga de PDF en curso
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Cargar consultas y elegibilidad
  const loadConsultations = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWithAuth(`/consultations?condoId=${condoId}`);
      if (!res.ok) {
        throw new Error('No se pudieron cargar las consultas');
      }
      const data: ConsultationItem[] = await res.json();
      setConsultations(data);

      // Cargar elegibilidad en paralelo para cada consulta
      const elMap: Record<string, EligibleUnit[]> = {};
      await Promise.allSettled(
        data.map(async (c) => {
          try {
            const elRes = await fetchWithAuth(`/consultations/${c.id}/my-eligibility`);
            if (elRes.ok) {
              const elData = await elRes.json();
              elMap[c.id] = elData.units || [];
            }
          } catch {
            // Ignorar error individual de elegibilidad
          }
        })
      );
      setEligibilityMap(elMap);
    } catch (err: any) {
      setError(err.message || 'Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (condoId) {
      loadConsultations();
    }
  }, [condoId]);

  // Abrir modal de votación
  const handleOpenVoteModal = async (consultation: ConsultationItem) => {
    setVotingConsultation(consultation);
    setSelectedOptionId('');
    setVoteError(null);
    setVoteReceipt(null);

    // Unidades pendientes de voto
    const units = eligibilityMap[consultation.id] || [];
    const pendingUnits = units.filter((u) => !u.alreadyVoted);
    if (pendingUnits.length > 0) {
      setSelectedUnitId(pendingUnits[0].propertyUnitId);
    } else if (units.length > 0) {
      setSelectedUnitId(units[0].propertyUnitId);
    }

    try {
      // Cargar opciones completas de la consulta
      const res = await fetchWithAuth(`/consultations/${consultation.id}`);
      if (res.ok) {
        const full = await res.json();
        setConsultationOptions(full.options || []);
      }
    } catch {
      setVoteError('No se pudieron obtener las opciones de votación');
    }
  };

  // Enviar voto
  const handleSubmitVote = async () => {
    if (!votingConsultation || !selectedOptionId || !selectedUnitId) return;

    try {
      setIsSubmittingVote(true);
      setVoteError(null);

      const res = await fetchWithAuth(`/consultations/${votingConsultation.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionId: selectedOptionId,
          propertyUnitId: selectedUnitId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Error al emitir el voto');
      }

      const receipt = await res.json();
      setVoteReceipt({
        id: receipt.id,
        verificationCode: receipt.verificationCode,
        unitId: selectedUnitId,
        consultationId: votingConsultation.id,
      });

      // Refrescar elegibilidad en segundo plano
      const elRes = await fetchWithAuth(`/consultations/${votingConsultation.id}/my-eligibility`);
      if (elRes.ok) {
        const elData = await elRes.json();
        setEligibilityMap((prev) => ({
          ...prev,
          [votingConsultation.id]: elData.units || [],
        }));
      }
    } catch (err: any) {
      setVoteError(err.message || 'No se pudo registrar el voto');
    } finally {
      setIsSubmittingVote(false);
    }
  };

  // Abrir modal de resultados
  const handleOpenResults = async (consultation: ConsultationItem) => {
    setResultsModalConsultation(consultation);
    setResultsData(null);
    setResultsError(null);
    setLoadingResults(true);

    try {
      const res = await fetchWithAuth(`/consultations/${consultation.id}/results`);
      if (!res.ok) {
        throw new Error('No se pudieron cargar los resultados');
      }
      const data = await res.json();
      setResultsData(data);
    } catch (err: any) {
      setResultsError(err.message || 'Error al cargar resultados');
    } finally {
      setLoadingResults(false);
    }
  };

  // Descargar comprobante de votación en PDF
  const handleDownloadReceipt = async (consultationId: string, propertyUnitId: string) => {
    const key = `receipt-${consultationId}-${propertyUnitId}`;
    try {
      setDownloadingId(key);
      await downloadWithAuth(
        `/consultations/${consultationId}/receipt.pdf?propertyUnitId=${propertyUnitId}`,
        `comprobante-voto-${propertyUnitId}.pdf`
      );
    } catch (err: any) {
      alert(err.message || 'Error al descargar la constancia');
    } finally {
      setDownloadingId(null);
    }
  };

  // Descargar acta oficial en PDF
  const handleDownloadActa = async (consultationId: string) => {
    const key = `acta-${consultationId}`;
    try {
      setDownloadingId(key);
      await downloadWithAuth(`/consultations/${consultationId}/acta.pdf`, `acta-consulta-${consultationId}.pdf`);
    } catch (err: any) {
      alert(err.message || 'Error al descargar el acta');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Vote className="w-6 h-6 text-emerald-600" />
            Consultas y Asambleas Digitales
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Participa con tu voto oficial por inmueble y consulta los resultados transparentes de tu comunidad.
          </p>
        </div>
        <button
          onClick={loadConsultations}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition self-start sm:self-auto"
        >
          <Clock className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Error general */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs sm:text-sm text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Estado cargando */}
      {loading && consultations.length === 0 && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-500">Cargando consultas de tu residencia...</p>
        </div>
      )}

      {/* Estado vacío */}
      {!loading && consultations.length === 0 && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
          <Vote className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-700 text-base">No hay consultas activas ni cerradas</h3>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md mx-auto">
            Cuando la junta o administradora publique una carta consulta o asamblea digital, aparecerá aquí para que puedas emitir tu voto.
          </p>
        </div>
      )}

      {/* Lista de consultas */}
      <div className="grid grid-cols-1 gap-5">
        {consultations.map((c) => {
          const eligibleUnits = eligibilityMap[c.id] || [];
          const pendingUnits = eligibleUnits.filter((u) => !u.alreadyVoted);
          const votedUnits = eligibleUnits.filter((u) => u.alreadyVoted);
          const canVote = c.status === 'PUBLISHED' && pendingUnits.length > 0;
          const isClosed = c.status === 'CLOSED';

          return (
            <div
              key={c.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6 hover:border-slate-300 transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      {CONSULTATION_TYPE_LABELS[c.consultation_type] || c.consultation_type}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                        STATUS_STYLES[c.status] || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">{c.title}</h2>
                </div>

                {/* Acciones principales de la tarjeta */}
                <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
                  {canVote && (
                    <button
                      onClick={() => handleOpenVoteModal(c)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-sm shadow-emerald-600/20 transition"
                    >
                      <Vote className="w-4 h-4" />
                      Emitir mi voto
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenResults(c)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition"
                  >
                    <Eye className="w-4 h-4 text-slate-500" />
                    {isClosed ? 'Ver Resultados Finales' : 'Ver Resultados en Vivo'}
                  </button>
                  {isClosed && (
                    <button
                      onClick={() => handleDownloadActa(c.id)}
                      disabled={downloadingId === `acta-${c.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition"
                    >
                      {downloadingId === `acta-${c.id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                      ) : (
                        <Download className="w-4 h-4 text-slate-500" />
                      )}
                      Acta PDF
                    </button>
                  )}
                </div>
              </div>

              {/* Descripción */}
              <p className="text-xs sm:text-sm text-slate-600 mb-4 whitespace-pre-line leading-relaxed">
                {c.description}
              </p>

              {/* Fechas de inicio y cierre */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Inicio: <strong className="text-slate-700">{formatDateTime(c.start_date)}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Cierre: <strong className="text-slate-700">{formatDateTime(c.end_date)}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Voto público y verificable</span>
                </div>
              </div>

              {/* Sección de elegibilidad del usuario */}
              <div className="mt-4 pt-1">
                {eligibleUnits.length === 0 ? (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs text-slate-500 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>No tienes inmuebles habilitados en el padrón para esta consulta.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-700 block">Tus inmuebles registrados:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {eligibleUnits.map((u) => (
                        <div
                          key={u.propertyUnitId}
                          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                            u.alreadyVoted
                              ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                              : 'bg-amber-50/50 border-amber-200 text-amber-900'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Building className="w-4 h-4 shrink-0 text-slate-500" />
                            <div className="truncate">
                              <span className="font-bold">Inmueble {u.unitCode}</span>
                              <p className="text-[10px] text-slate-500 truncate">
                                {u.alreadyVoted ? 'Voto registrado' : 'Pendiente de emitir'}
                              </p>
                            </div>
                          </div>
                          {u.alreadyVoted ? (
                            <button
                              onClick={() => handleDownloadReceipt(c.id, u.propertyUnitId)}
                              disabled={downloadingId === `receipt-${c.id}-${u.propertyUnitId}`}
                              title="Descargar constancia de voto"
                              className="p-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-lg text-emerald-800 transition shrink-0"
                            >
                              {downloadingId === `receipt-${c.id}-${u.propertyUnitId}` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                            </button>
                          ) : (
                            c.status === 'PUBLISHED' && (
                              <button
                                onClick={() => {
                                  handleOpenVoteModal(c);
                                  setSelectedUnitId(u.propertyUnitId);
                                }}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-[11px] transition shrink-0"
                              >
                                Votar
                              </button>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* Modal de Votación */}
      {/* ============================================================ */}
      {votingConsultation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            {/* Si ya votó y tenemos comprobante */}
            {voteReceipt ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">¡Voto Registrado con Éxito!</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Tu voto ha sido certificado de forma transparente y sellado en el libro digital de la residencia.
                </p>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 mb-4 text-left space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Código de verificación</span>
                  <p className="font-mono text-sm font-bold text-slate-800 break-all">{voteReceipt.verificationCode}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleDownloadReceipt(voteReceipt.consultationId, voteReceipt.unitId)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition"
                  >
                    <Download className="w-4 h-4" />
                    Descargar Constancia Oficial (PDF)
                  </button>
                  <button
                    onClick={() => {
                      setVotingConsultation(null);
                      setVoteReceipt(null);
                    }}
                    className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Emitir Voto Oficial</span>
                    <h3 className="text-lg font-bold text-slate-900 leading-snug">{votingConsultation.title}</h3>
                  </div>
                  <button
                    onClick={() => setVotingConsultation(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-xs text-slate-500 mb-4 whitespace-pre-line leading-relaxed">
                  {votingConsultation.description}
                </p>

                {voteError && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{voteError}</span>
                  </div>
                )}

                {/* Selector de unidad (si el usuario tiene más de una) */}
                {(() => {
                  const pending = (eligibilityMap[votingConsultation.id] || []).filter((u) => !u.alreadyVoted);
                  if (pending.length > 1) {
                    return (
                      <div className="mb-4">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Elige el inmueble con el que deseas votar:
                        </label>
                        <select
                          value={selectedUnitId}
                          onChange={(e) => setSelectedUnitId(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {pending.map((u) => (
                            <option key={u.propertyUnitId} value={u.propertyUnitId}>
                              Inmueble {u.unitCode} (Habilitado)
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  if (pending.length === 1) {
                    return (
                      <div className="mb-4 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
                        <span className="font-semibold">Votando en representación de:</span>
                        <strong className="text-emerald-700 font-bold">Inmueble {pending[0].unitCode}</strong>
                      </div>
                    );
                  }
                  return (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                      Ya has emitido voto para todos tus inmuebles habilitados.
                    </div>
                  );
                })()}

                {/* Opciones disponibles */}
                <div className="space-y-2 mb-6">
                  <span className="block text-xs font-semibold text-slate-700 mb-1">Selecciona una sola opción:</span>
                  {consultationOptions.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                      Cargando opciones...
                    </div>
                  ) : (
                    consultationOptions.map((opt) => {
                      const isSelected = selectedOptionId === opt.id;
                      return (
                        <label
                          key={opt.id}
                          className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                            isSelected
                              ? 'bg-emerald-50/80 border-emerald-500 text-emerald-950 shadow-sm'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="consultation_option"
                            value={opt.id}
                            checked={isSelected}
                            onChange={() => setSelectedOptionId(opt.id)}
                            className="mt-0.5 w-4 h-4 text-emerald-600 border-slate-300 focus:ring-emerald-500"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-sm block">{opt.title}</span>
                            {opt.description && (
                              <p className="text-xs text-slate-500 mt-0.5 leading-snug">{opt.description}</p>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>

                {/* Nota de advertencia legal */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 mb-5 text-[11px] text-slate-500 leading-snug">
                  <strong>Regla de validez:</strong> El voto es definitivo, público y verificable en el acta oficial. Cada inmueble emite un único voto. Se decide por mayoría simple de votos emitidos.
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setVotingConsultation(null)}
                    disabled={isSubmittingVote}
                    className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmitVote}
                    disabled={!selectedOptionId || !selectedUnitId || isSubmittingVote}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition"
                  >
                    {isSubmittingVote ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Registrando...
                      </>
                    ) : (
                      <>
                        <Vote className="w-4 h-4" />
                        Confirmar y Votar
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Modal de Resultados Transparentes */}
      {/* ============================================================ */}
      {resultsModalConsultation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  {resultsModalConsultation.status === 'CLOSED' ? 'Resultados Oficiales de Cierre' : 'Resultados en Vivo'}
                </span>
                <h3 className="text-lg font-bold text-slate-900 leading-snug">{resultsModalConsultation.title}</h3>
              </div>
              <button
                onClick={() => setResultsModalConsultation(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingResults && (
              <div className="py-12 text-center">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">Cargando escrutinio oficial...</p>
              </div>
            )}

            {resultsError && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {resultsError}
              </div>
            )}

            {resultsData && (
              <div className="space-y-5">
                {/* Banner de resultado final si está cerrada */}
                {resultsData.closed && (
                  <div
                    className={`p-4 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 ${
                      resultsData.result === 'APPROVED'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : resultsData.result === 'TIED'
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : 'bg-slate-100 border-slate-300 text-slate-800'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider block opacity-75">
                        Estado de resolución
                      </span>
                      <strong className="text-sm sm:text-base">
                        {resultsData.result === 'APPROVED' &&
                          `DECISIÓN TOMADA — Ganó: ${
                            resultsData.tally.options.find((o) => o.optionId === resultsData.tally.winnerOptionId)?.title ||
                            'Opción Mayoritaria'
                          }`}
                        {resultsData.result === 'TIED' && 'EMPATE — SIN DECISIÓN'}
                        {resultsData.result === 'NO_VOTES' && 'SIN VOTOS EMITIDOS'}
                      </strong>
                    </div>
                    <button
                      onClick={() => handleDownloadActa(resultsModalConsultation.id)}
                      disabled={downloadingId === `acta-${resultsModalConsultation.id}`}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition shrink-0 inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Acta PDF
                    </button>
                  </div>
                )}

                {/* Resumen numérico */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Inmuebles Votantes</span>
                    <p className="text-xl font-extrabold text-slate-800 mt-0.5">{resultsData.tally.totalUnits}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Alícuota Participante</span>
                    <p className="text-xl font-extrabold text-slate-800 mt-0.5">
                      {formatPercent(resultsData.tally.totalAliquot)}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Criterio de Decisión</span>
                    <p className="text-xs font-bold text-emerald-700 mt-1">1 Inmueble = 1 Voto</p>
                  </div>
                </div>

                {/* Tabla de opciones y escrutinio */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Escrutinio por Opción
                  </h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Opción</th>
                          <th className="py-2.5 px-3 text-right">Inmuebles</th>
                          <th className="py-2.5 px-3 text-right">% Inmuebles</th>
                          <th className="py-2.5 px-3 text-right text-slate-400 font-normal">% Alícuota</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {resultsData.tally.options.map((opt) => {
                          const isWinner = resultsData.tally.winnerOptionId === opt.optionId;
                          return (
                            <tr key={opt.optionId} className={isWinner ? 'bg-emerald-50/50' : 'bg-white'}>
                              <td className="py-2.5 px-3 font-medium text-slate-800">
                                <div className="flex items-center gap-1.5">
                                  {isWinner && <Check className="w-4 h-4 text-emerald-600 font-bold" />}
                                  <span>{opt.title}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-800">{opt.units}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                                {formatPercent(opt.unitPercentage)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-400">
                                {formatPercent(opt.aliquotPercentage)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tabla de votos por unidad (Transparencia / Votos públicos) */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Votos Emitidos por Inmueble (Auditoría Pública)
                  </h4>
                  {resultsData.votes.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                      Aún no se han registrado votos en esta consulta.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 sticky top-0">
                          <tr>
                            <th className="py-2 px-3">Inmueble</th>
                            <th className="py-2 px-3">Votante</th>
                            <th className="py-2 px-3">Opción</th>
                            <th className="py-2 px-3 text-right">Fecha / Hora</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {resultsData.votes.map((v, idx) => {
                            const optTitle =
                              resultsData.tally.options.find((o) => o.optionId === v.optionId)?.title || v.optionId;
                            return (
                              <tr key={idx} className="hover:bg-slate-50/80">
                                <td className="py-2 px-3 font-bold text-slate-800">{v.unitCode}</td>
                                <td className="py-2 px-3 text-slate-700">{v.voter}</td>
                                <td className="py-2 px-3 font-medium text-emerald-700">{optTitle}</td>
                                <td className="py-2 px-3 text-right text-slate-500">{formatDateTime(v.votedAt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setResultsModalConsultation(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
