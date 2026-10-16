'use client';

import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Settings,
  Download,
  DollarSign,
  Users,
  ShieldCheck,
  Sparkles,
  Wrench,
  Check,
  X,
  Loader2,
  RefreshCw,
  Edit,
  Trash2,
  Ban,
  FileCheck,
  CreditCard,
  Building,
  Search,
} from 'lucide-react';
import { downloadWithAuth, fetchWithAuth } from '../lib/api';

const SPACE_CATEGORY_LABELS: Record<string, string> = {
  SOCIAL_HALL: 'Salón de Fiestas / Eventos',
  BBQ_GRILL: 'Parrillera / Terraza Gourmet',
  SPORTS_COURT: 'Cancha Deportiva',
  POOL_AREA: 'Piscina / Solárium',
  COWORKING_ROOM: 'Sala de Reuniones / Coworking',
  FREIGHT_ELEVATOR: 'Ascensor de Carga / Mudanzas',
  SHARED_RESOURCE: 'Recurso / Equipo Comunitario',
  CUSTOM: 'Espacio Parametrizable',
};

const DAY_SHORT_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const STATUS_BADGES: Record<string, { label: string; style: string }> = {
  PENDING: { label: 'Pendiente Aprobación', style: 'bg-amber-50 text-amber-800 border-amber-200' },
  APPROVED: { label: 'Aprobada / Reservada', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  COMPLETED: { label: 'Concluida / Inspeccionada', style: 'bg-sky-50 text-sky-700 border-sky-200' },
  REJECTED: { label: 'Rechazada', style: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELLED: { label: 'Cancelada', style: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const INSPECTION_LABELS: Record<string, string> = {
  PENDING: 'Pendiente de revisión',
  CLEAN_OK: 'Sin daños (Garantía liberada)',
  WITH_OBSERVATIONS: 'Con observaciones',
  DAMAGE_REPORTED: 'Daños reportados (Retención)',
};

function defaultFutureDate(daysAhead = 3): string {
  const d = new Date(Date.now() + daysAhead * 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AmenitiesView({ condoId }: { condoId: string }) {
  const [overview, setOverview] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'spaces' | 'reservations' | 'blackouts'>('spaces');

  const [reservations, setReservations] = useState<any[]>([]);
  const [blackouts, setBlackouts] = useState<any[]>([]);

  // Filtros de reservas
  const [resAmenityFilter, setResAmenityFilter] = useState<string>('ALL');
  const [resStatusFilter, setResStatusFilter] = useState<string>('ALL');
  const [resSearch, setResSearch] = useState<string>('');

  // Modal Configuración Global
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState({
    enabled: true,
    globalBlockDelinquentUnits: true,
    allowResidentCancellations: true,
    minHoursBeforeCancel: 12,
  });

  // Modal Crear/Editar Espacio Parametrizable
  const [showSpaceModal, setShowSpaceModal] = useState(false);
  const [editingSpace, setEditingSpace] = useState<any | null>(null);
  const [spaceForm, setSpaceForm] = useState({
    name: '',
    description: '',
    spaceCategory: 'SOCIAL_HALL',
    bookingMode: 'HOURLY',
    approvalMode: 'ADMIN_APPROVAL',
    feeType: 'FLAT_PER_BOOKING',
    capacity: 30,
    feeUsd: 25,
    cleaningFeeUsd: 10,
    depositUsd: 50,
    openTime: '09:00',
    closeTime: '22:00',
    allowedDays: [0, 1, 2, 3, 4, 5, 6] as number[],
    minHoursNotice: 24,
    minDurationMinutes: 120,
    maxHoursPerSlot: 6,
    maxAdvanceDays: 60,
    bufferMinutes: 30,
    maxConcurrentBookings: 1,
    maxActivePerUnit: 2,
    maxPerUnitPerMonth: 2,
    cooldownDays: 3,
    blockDelinquentUnits: true,
    maxAllowedDebtUsd: 0,
    isActive: true,
    rules: '',
  });

  // Modal Solicitar Reserva + Evaluador de Reglas en Vivo
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    amenityId: '',
    propertyUnitId: '',
    eventTitle: '',
    eventDescription: '',
    reservationDate: defaultFutureDate(4),
    startTime: '14:00',
    endTime: '18:00',
    guestCount: 15,
    paymentReference: '',
    paymentMethod: 'PAGO_MOVIL',
    solvencyOverride: false,
  });
  const [liveEvaluation, setLiveEvaluation] = useState<any | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  // Modal Inspección Post-Uso y Liquidación de Garantía
  const [inspectingReservation, setInspectingReservation] = useState<any | null>(null);
  const [inspectForm, setInspectForm] = useState({
    inspectionStatus: 'CLEAN_OK',
    damageDeductionUsd: 0,
    depositRefunded: true,
    inspectionNotes: '',
  });

  // Modal Reportar Pago
  const [payingReservation, setPayingReservation] = useState<any | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    paymentReference: '',
    paymentMethod: 'PAGO_MOVIL',
    verifyImmediately: true,
  });

  // Modal Crear Bloqueo de Mantenimiento
  const [showBlackoutModal, setShowBlackoutModal] = useState(false);
  const [blackoutForm, setBlackoutForm] = useState({
    amenityId: '',
    title: '',
    startDate: defaultFutureDate(2),
    endDate: defaultFutureDate(2),
    startTime: '08:00',
    endTime: '18:00',
    reason: '',
  });

  const [submitting, setSubmitting] = useState(false);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const loadAll = async () => {
    if (!condoId) return;
    try {
      setLoading(true);
      setError(null);
      const ov = await fetchWithAuth(`/amenities/overview?condoId=${condoId}`);
      setOverview(ov);
      setConfigForm(ov.config);

      const defaultUnit = ov.units?.[0]?.id || '';
      const defaultSpace = ov.spaces?.[0]?.id || '';
      setBookingForm((prev) => ({
        ...prev,
        propertyUnitId: prev.propertyUnitId || defaultUnit,
        amenityId: prev.amenityId || defaultSpace,
      }));
      setBlackoutForm((prev) => ({
        ...prev,
        amenityId: prev.amenityId || defaultSpace,
      }));

      await Promise.all([
        loadReservations(resAmenityFilter, resStatusFilter, resSearch),
        loadBlackouts(),
      ]);
    } catch (e: any) {
      setError(e.message || 'No se pudo cargar el módulo de Áreas Comunes');
    } finally {
      setLoading(false);
    }
  };

  const loadReservations = async (
    amenityId = resAmenityFilter,
    status = resStatusFilter,
    q = resSearch,
  ) => {
    const params = new URLSearchParams({ condoId });
    if (amenityId && amenityId !== 'ALL') params.set('amenityId', amenityId);
    if (status && status !== 'ALL') params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    const data = await fetchWithAuth(`/amenities/reservations?${params.toString()}`);
    if (Array.isArray(data)) setReservations(data);
  };

  const loadBlackouts = async () => {
    const data = await fetchWithAuth(`/amenities/blackouts?condoId=${condoId}`);
    if (Array.isArray(data)) setBlackouts(data);
  };

  useEffect(() => {
    loadAll();
  }, [condoId]);

  // Evaluar reglas en vivo cada vez que cambian los campos del formulario de reserva
  useEffect(() => {
    if (!showBookingModal || !bookingForm.amenityId || !bookingForm.propertyUnitId || !bookingForm.reservationDate) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setEvaluating(true);
        const res = await fetchWithAuth('/amenities/reservations/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            condoId,
            amenityId: bookingForm.amenityId,
            propertyUnitId: bookingForm.propertyUnitId,
            reservationDate: bookingForm.reservationDate,
            startTime: bookingForm.startTime,
            endTime: bookingForm.endTime,
            guestCount: Number(bookingForm.guestCount || 1),
            solvencyOverride: bookingForm.solvencyOverride,
          }),
        });
        if (!cancelled) setLiveEvaluation(res);
      } catch (e: any) {
        if (!cancelled) setLiveEvaluation(null);
      } finally {
        if (!cancelled) setEvaluating(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    showBookingModal,
    condoId,
    bookingForm.amenityId,
    bookingForm.propertyUnitId,
    bookingForm.reservationDate,
    bookingForm.startTime,
    bookingForm.endTime,
    bookingForm.guestCount,
    bookingForm.solvencyOverride,
  ]);

  const handleSaveConfig = async (override?: any) => {
    try {
      setSubmitting(true);
      await fetchWithAuth('/amenities/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condoId, ...configForm, ...override }),
      });
      setShowConfigModal(false);
      showToast('Políticas de Áreas Comunes actualizadas');
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const url = editingSpace ? `/amenities/spaces/${editingSpace.id}` : '/amenities/spaces';
      const method = editingSpace ? 'PATCH' : 'POST';
      await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          condoId,
          ...spaceForm,
          capacity: Number(spaceForm.capacity || 1),
          feeUsd: Number(spaceForm.feeUsd || 0),
          cleaningFeeUsd: Number(spaceForm.cleaningFeeUsd || 0),
          depositUsd: Number(spaceForm.depositUsd || 0),
          minHoursNotice: Number(spaceForm.minHoursNotice || 0),
          minDurationMinutes: Number(spaceForm.minDurationMinutes || 60),
          maxHoursPerSlot: Number(spaceForm.maxHoursPerSlot || 6),
          maxAdvanceDays: Number(spaceForm.maxAdvanceDays || 60),
          bufferMinutes: Number(spaceForm.bufferMinutes || 0),
          maxConcurrentBookings: Number(spaceForm.maxConcurrentBookings || 1),
          maxActivePerUnit: Number(spaceForm.maxActivePerUnit || 1),
          maxPerUnitPerMonth: Number(spaceForm.maxPerUnitPerMonth || 1),
          cooldownDays: Number(spaceForm.cooldownDays || 0),
          maxAllowedDebtUsd: Number(spaceForm.maxAllowedDebtUsd || 0),
        }),
      });
      setShowSpaceModal(false);
      setEditingSpace(null);
      showToast(editingSpace ? 'Espacio común actualizado' : 'Nuevo espacio común creado');
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSpace = async (id: string) => {
    if (!confirm('¿Eliminar este espacio común y sus reservas asociadas?')) return;
    try {
      await fetchWithAuth(`/amenities/spaces/${id}`, { method: 'DELETE' });
      showToast('Espacio común eliminado');
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const created = await fetchWithAuth('/amenities/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          condoId,
          amenityId: bookingForm.amenityId,
          propertyUnitId: bookingForm.propertyUnitId,
          eventTitle: bookingForm.eventTitle,
          eventDescription: bookingForm.eventDescription || undefined,
          reservationDate: bookingForm.reservationDate,
          startTime: bookingForm.startTime,
          endTime: bookingForm.endTime,
          guestCount: Number(bookingForm.guestCount || 1),
          paymentReference: bookingForm.paymentReference || undefined,
          paymentMethod: bookingForm.paymentReference ? bookingForm.paymentMethod : undefined,
          solvencyOverride: bookingForm.solvencyOverride,
        }),
      });
      setShowBookingModal(false);
      setBookingForm((prev) => ({
        ...prev,
        eventTitle: '',
        eventDescription: '',
        paymentReference: '',
        solvencyOverride: false,
      }));
      showToast(`Reserva registrada exitosamente: ${created.reservationCode} (${created.status})`);
      setActiveTab('reservations');
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateReservationStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      setSubmitting(true);
      await fetchWithAuth(`/amenities/reservations/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      showToast(status === 'APPROVED' ? 'Reserva aprobada oficialmente' : 'Solicitud rechazada');
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelReservation = async (id: string) => {
    const reason = prompt('Motivo de cancelación (opcional):') ?? undefined;
    try {
      await fetchWithAuth(`/amenities/reservations/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      showToast('Reserva cancelada');
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingReservation) return;
    try {
      setSubmitting(true);
      await fetchWithAuth(`/amenities/reservations/${payingReservation.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentForm),
      });
      setPayingReservation(null);
      showToast('Pago de reserva registrado');
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleInspectReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectingReservation) return;
    try {
      setSubmitting(true);
      await fetchWithAuth(`/amenities/reservations/${inspectingReservation.id}/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspectionStatus: inspectForm.inspectionStatus,
          damageDeductionUsd: Number(inspectForm.damageDeductionUsd || 0),
          depositRefunded: inspectForm.depositRefunded,
          inspectionNotes: inspectForm.inspectionNotes || undefined,
        }),
      });
      setInspectingReservation(null);
      showToast('Inspección post-uso y liquidación de garantía registradas');
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateBlackout = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await fetchWithAuth('/amenities/blackouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condoId, ...blackoutForm }),
      });
      setShowBlackoutModal(false);
      setBlackoutForm((prev) => ({ ...prev, title: '', reason: '' }));
      showToast('Bloqueo por mantenimiento programado');
      await loadAll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBlackout = async (id: string) => {
    if (!confirm('¿Eliminar este bloqueo de fecha/hora?')) return;
    await fetchWithAuth(`/amenities/blackouts/${id}`, { method: 'DELETE' });
    showToast('Bloqueo eliminado');
    await loadAll();
  };

  if (loading && !overview) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-500">Cargando Áreas Comunes y Motor de Reglas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!overview) return null;

  const { config, isStaff, units, spaces, kpis } = overview;

  return (
    <div className="space-y-6">
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Reserva y Alquiler de Áreas Comunes
            </h1>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                config.enabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}
            >
              {config.enabled ? 'Motor de Reglas Activo' : 'Módulo Desactivado'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Espacios parametrizables con validación automática de solvencia, equidad vecinal, colchón de limpieza y garantía reembolsable.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadAll}
            className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Actualizar</span>
          </button>
          {isStaff && (
            <button
              onClick={() => setShowConfigModal(true)}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Políticas de Convivencia</span>
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Espacios Activos</span>
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{kpis.activeSpacesCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Configurados en la residencia</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Por Aprobar</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{kpis.pendingApprovalsCount}</p>
          <p className="text-[11px] text-amber-700 font-medium mt-0.5">Solicitudes en revisión</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Próximas Aprobadas</span>
            <Calendar className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{kpis.upcomingApprovedCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Turnos agendados</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>{isStaff ? 'Ingresos por Alquiler' : 'Mis Alquileres'}</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">
            ${Number(kpis.revenueConfirmedUsd || 0).toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">Canon + limpieza (USD)</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Garantías en Custodia</span>
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">
            ${Number(kpis.depositsInCustodyUsd || 0).toFixed(2)}
          </p>
          <p className="text-[11px] text-indigo-700 font-medium mt-0.5">Depósitos reembolsables</p>
        </div>
      </div>

      {/* Sub-navegación y Acciones Rápidas */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('spaces')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'spaces'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Espacios y Reglas de Uso ({spaces.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('reservations')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'reservations'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>
              {isStaff ? 'Agenda de Reservas y Garantías' : 'Mis Reservas y Constancias'} (
              {reservations.length})
            </span>
          </button>

          <button
            onClick={() => setActiveTab('blackouts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'blackouts'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Mantenimientos / Fechas Bloqueadas ({blackouts.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowBookingModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Reserva de Área Común</span>
          </button>

          {isStaff && (
            <>
              <button
                onClick={() => {
                  setEditingSpace(null);
                  setShowSpaceModal(true);
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nuevo Espacio</span>
              </button>
              <button
                onClick={() =>
                  downloadWithAuth(
                    `/amenities/reports/reservations.pdf?condoId=${condoId}`,
                    'reporte-areas-comunes.pdf',
                  )
                }
                className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Reporte PDF</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: CATÁLOGO DE ESPACIOS Y REGLAS PARAMETRIZADAS */}
      {/* ===================================================================== */}
      {activeTab === 'spaces' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {spaces.map((sp: any) => (
            <div
              key={sp.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm flex flex-col justify-between space-y-4 hover:border-emerald-300 transition"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {SPACE_CATEGORY_LABELS[sp.spaceCategory] || sp.spaceCategory}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {sp.bookingMode === 'FULL_DAY' ? 'Jornada / Evento' : 'Por Bloques de Horas'}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          sp.approvalMode === 'AUTO_APPROVE'
                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {sp.approvalMode === 'AUTO_APPROVE' ? 'Auto-Aprobación' : 'Aprobación Admin'}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">{sp.name}</h3>
                  </div>

                  {isStaff && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setEditingSpace(sp);
                          setSpaceForm({
                            name: sp.name,
                            description: sp.description || '',
                            spaceCategory: sp.spaceCategory,
                            bookingMode: sp.bookingMode,
                            approvalMode: sp.approvalMode,
                            feeType: sp.feeType,
                            capacity: sp.capacity || 20,
                            feeUsd: sp.feeUsd,
                            cleaningFeeUsd: sp.cleaningFeeUsd,
                            depositUsd: sp.depositUsd,
                            openTime: sp.openTime,
                            closeTime: sp.closeTime,
                            allowedDays: sp.allowedDays,
                            minHoursNotice: sp.minHoursNotice,
                            minDurationMinutes: sp.minDurationMinutes,
                            maxHoursPerSlot: sp.maxHoursPerSlot,
                            maxAdvanceDays: sp.maxAdvanceDays,
                            bufferMinutes: sp.bufferMinutes,
                            maxConcurrentBookings: sp.maxConcurrentBookings,
                            maxActivePerUnit: sp.maxActivePerUnit,
                            maxPerUnitPerMonth: sp.maxPerUnitPerMonth,
                            cooldownDays: sp.cooldownDays,
                            blockDelinquentUnits: sp.blockDelinquentUnits,
                            maxAllowedDebtUsd: sp.maxAllowedDebtUsd,
                            isActive: sp.isActive,
                            rules: sp.rules || '',
                          });
                          setShowSpaceModal(true);
                        }}
                        className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                        title="Editar parámetros y reglas del espacio"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSpace(sp.id)}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                        title="Eliminar espacio"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {sp.description && (
                  <p className="text-xs text-slate-600 leading-relaxed">{sp.description}</p>
                )}

                {/* Tarifa y Garantía */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Alquiler</span>
                    <strong className="text-slate-900">
                      {sp.feeType === 'FREE' || sp.feeUsd === 0
                        ? 'Gratuito ($0)'
                        : sp.feeType === 'PER_HOUR'
                        ? `$${sp.feeUsd.toFixed(2)} / hora`
                        : `$${sp.feeUsd.toFixed(2)} fijo`}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Limpieza</span>
                    <strong className="text-slate-900">${sp.cleaningFeeUsd.toFixed(2)} USD</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Garantía (Depósito)
                    </span>
                    <strong className="text-indigo-700">${sp.depositUsd.toFixed(2)} USD</strong>
                  </div>
                </div>

                {/* Reglas de Convivencia Parametrizadas */}
                <div className="space-y-1.5 text-[11px] text-slate-600">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 bg-slate-100 rounded-md font-medium">
                      Horario: <strong>{sp.openTime}–{sp.closeTime}</strong>
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 rounded-md font-medium">
                      Aforo máx: <strong>{sp.capacity || 'S/L'} pers.</strong>
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 rounded-md font-medium">
                      Buffer limpieza: <strong>+{sp.bufferMinutes} min</strong>
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 rounded-md font-medium">
                      Cuota: <strong>{sp.maxPerUnitPerMonth}/mes por apto</strong>
                    </span>
                    {sp.cooldownDays > 0 && (
                      <span className="px-2 py-0.5 bg-slate-100 rounded-md font-medium">
                        Rotación: <strong>{sp.cooldownDays}d espera</strong>
                      </span>
                    )}
                    {sp.blockDelinquentUnits && (
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md font-semibold">
                        Exige solvencia al día
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400">
                    Días hábiles:{' '}
                    <span className="text-slate-700 font-semibold">
                      {(sp.allowedDays || []).map((d: number) => DAY_SHORT_LABELS[d]).join(', ')}
                    </span>
                  </p>
                </div>

                {sp.rules && (
                  <p className="text-[11px] text-slate-500 bg-amber-50/50 border border-amber-200/60 p-2.5 rounded-xl">
                    <strong>Norma del espacio:</strong> {sp.rules}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Anticipación mín: {sp.minHoursNotice}h · Máx: {sp.maxAdvanceDays} días
                </span>
                <button
                  onClick={() => {
                    setBookingForm((prev) => ({
                      ...prev,
                      amenityId: sp.id,
                      startTime: sp.bookingMode === 'FULL_DAY' ? sp.openTime : '14:00',
                      endTime: sp.bookingMode === 'FULL_DAY' ? sp.closeTime : '16:00',
                    }));
                    setShowBookingModal(true);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition"
                >
                  Reservar este Espacio
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: AGENDA DE RESERVAS, APROBACIONES E INSPECCIÓN DE GARANTÍAS */}
      {/* ===================================================================== */}
      {activeTab === 'reservations' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'ALL', label: 'Todas' },
                { id: 'PENDING', label: `Pendientes (${kpis.pendingApprovalsCount})` },
                { id: 'APPROVED', label: 'Aprobadas' },
                { id: 'COMPLETED', label: 'Concluidas' },
                { id: 'CANCELLED', label: 'Canceladas' },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => {
                    setResStatusFilter(st.id);
                    loadReservations(resAmenityFilter, st.id, resSearch);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    resStatusFilter === st.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}

              <select
                value={resAmenityFilter}
                onChange={(e) => {
                  setResAmenityFilter(e.target.value);
                  loadReservations(e.target.value, resStatusFilter, resSearch);
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="ALL">Todos los Espacios</option>
                {spaces.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={resSearch}
                onChange={(e) => setResSearch(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' && loadReservations(resAmenityFilter, resStatusFilter, resSearch)
                }
                placeholder="Buscar código, evento, unidad..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 w-60"
              />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {reservations.length === 0 ? (
              <div className="p-10 text-center text-xs sm:text-sm text-slate-400">
                No hay reservas registradas para los filtros seleccionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Reserva / Evento</th>
                      <th className="py-3 px-4">Espacio / Inmueble</th>
                      <th className="py-3 px-4">Fecha y Horario</th>
                      <th className="py-3 px-4">Canon y Garantía</th>
                      <th className="py-3 px-4">Estado / Inspección</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reservations.map((r) => {
                      const badge = STATUS_BADGES[r.status] || {
                        label: r.status,
                        style: 'bg-slate-100 text-slate-600',
                      };
                      return (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <span className="font-mono text-[11px] font-bold text-emerald-700">
                              {r.reservationCode}
                            </span>
                            <p className="font-bold text-slate-900">{r.eventTitle}</p>
                            <p className="text-[11px] text-slate-500">
                              Por: {r.requestedByName} ({r.guestCount || 1} pers.)
                            </p>
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-800">{r.amenityName}</span>
                            <p className="text-[11px] font-semibold text-indigo-700">
                              Inmueble {r.unitCode}
                            </p>
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900">{r.reservationDate}</span>
                            <p className="text-[11px] text-slate-600">
                              {r.startTime} a {r.endTime} (+{r.bufferMinutes}m buffer)
                            </p>
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900">
                              Total: ${r.totalAmountUsd.toFixed(2)} USD
                            </span>
                            <p className="text-[11px] text-slate-500">
                              Alquiler/Limp: ${(r.feeAmountUsd + r.cleaningFeeUsd).toFixed(2)} · Garantía: $
                              {r.depositAmountUsd.toFixed(2)}
                            </p>
                            <span className="text-[10px] font-semibold text-slate-500">
                              Pago: {r.paymentStatus}
                              {r.paymentReference ? ` (${r.paymentReference})` : ''}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <span
                              className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${badge.style}`}
                            >
                              {badge.label}
                            </span>
                            <p className="text-[11px] text-slate-500 mt-1">
                              {INSPECTION_LABELS[r.inspectionStatus] || r.inspectionStatus}
                            </p>
                            {r.depositAmountUsd > 0 && r.inspectionStatus !== 'PENDING' && (
                              <p className="text-[10px] font-bold text-emerald-700">
                                Reintegrado: ${r.depositRefundedUsd.toFixed(2)} USD
                              </p>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right space-y-1">
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              <button
                                onClick={() =>
                                  downloadWithAuth(
                                    `/amenities/reservations/${r.id}/voucher.pdf`,
                                    `reserva-${r.reservationCode}.pdf`,
                                  )
                                }
                                title="Descargar Acuerdo / Constancia PDF"
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold inline-flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                <span>PDF</span>
                              </button>

                              {r.totalAmountUsd > 0 && r.paymentStatus !== 'VERIFIED' && (
                                <button
                                  onClick={() => {
                                    setPayingReservation(r);
                                    setPaymentForm({
                                      paymentReference: r.paymentReference || '',
                                      paymentMethod: r.paymentMethod || 'PAGO_MOVIL',
                                      verifyImmediately: isStaff,
                                    });
                                  }}
                                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold"
                                >
                                  Pago
                                </button>
                              )}

                              {isStaff && r.status === 'PENDING' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateReservationStatus(r.id, 'APPROVED')}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold"
                                  >
                                    Aprobar
                                  </button>
                                  <button
                                    onClick={() => handleUpdateReservationStatus(r.id, 'REJECTED')}
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[11px] font-bold"
                                  >
                                    Rechazar
                                  </button>
                                </>
                              )}

                              {isStaff && (r.status === 'APPROVED' || r.status === 'COMPLETED') && (
                                <button
                                  onClick={() => {
                                    setInspectingReservation(r);
                                    setInspectForm({
                                      inspectionStatus:
                                        r.inspectionStatus === 'PENDING' ? 'CLEAN_OK' : r.inspectionStatus,
                                      damageDeductionUsd: r.damageDeductionUsd || 0,
                                      depositRefunded: true,
                                      inspectionNotes: r.inspectionNotes || '',
                                    });
                                  }}
                                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold"
                                >
                                  Inspección / Garantía
                                </button>
                              )}

                              {(r.status === 'PENDING' || r.status === 'APPROVED') && (
                                <button
                                  onClick={() => handleCancelReservation(r.id)}
                                  title="Cancelar reserva"
                                  className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
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
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: BLOQUEOS POR MANTENIMIENTO / EVENTOS DEL CONDOMINIO */}
      {/* ===================================================================== */}
      {activeTab === 'blackouts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Fechas y horarios bloqueados por fumigación, mantenimiento preventivo o asambleas de la comunidad.
            </p>
            {isStaff && (
              <button
                onClick={() => setShowBlackoutModal(true)}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Programar Cierre / Mantenimiento</span>
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {blackouts.length === 0 ? (
              <div className="p-10 text-center text-xs sm:text-sm text-slate-400">
                No hay cierres por mantenimiento programados actualmente.
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Espacio</th>
                    <th className="py-3 px-4">Motivo del Bloqueo</th>
                    <th className="py-3 px-4">Fechas y Horario</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {blackouts.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900">{b.amenityName}</td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800">{b.title}</span>
                        {b.reason && <p className="text-[11px] text-slate-500">{b.reason}</p>}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {b.startDate} al {b.endDate} ({String(b.startTime).slice(0, 5)}–
                        {String(b.endTime).slice(0, 5)})
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isStaff && (
                          <button
                            onClick={() => handleDeleteBlackout(b.id)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: SOLICITAR RESERVA + MOTOR DE REGLAS DE CONVIVENCIA EN VIVO */}
      {/* ===================================================================== */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleCreateReservation}
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 max-h-[92vh] overflow-y-auto space-y-4 text-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600">
                  Solicitud con Validación Automática de Convivencia
                </span>
                <h3 className="text-lg font-bold text-slate-900">Reservar Espacio o Recurso Común</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBookingModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Espacio a Reservar *</label>
                <select
                  required
                  value={bookingForm.amenityId}
                  onChange={(e) => {
                    const sp = spaces.find((s: any) => s.id === e.target.value);
                    setBookingForm({
                      ...bookingForm,
                      amenityId: e.target.value,
                      startTime: sp?.bookingMode === 'FULL_DAY' ? sp.openTime : bookingForm.startTime,
                      endTime: sp?.bookingMode === 'FULL_DAY' ? sp.closeTime : bookingForm.endTime,
                    });
                  }}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-bold"
                >
                  {spaces.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Inmueble Responsable *</label>
                <select
                  required
                  value={bookingForm.propertyUnitId}
                  onChange={(e) => setBookingForm({ ...bookingForm, propertyUnitId: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-bold"
                >
                  {units.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      Inmueble {u.unitCode}{' '}
                      {u.currentDebtUsd > 0 ? `(Deuda: $${u.currentDebtUsd.toFixed(2)})` : '(Solvente)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Título / Motivo de la Reserva *
                </label>
                <input
                  type="text"
                  required
                  value={bookingForm.eventTitle}
                  onChange={(e) => setBookingForm({ ...bookingForm, eventTitle: e.target.value })}
                  placeholder="Ej: Cumpleaños familiar, Turno deportivo, Mudanza de mobiliario..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fecha de la Reserva *</label>
                <input
                  type="date"
                  required
                  value={bookingForm.reservationDate}
                  onChange={(e) => setBookingForm({ ...bookingForm, reservationDate: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Cantidad Estimada de Personas
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={bookingForm.guestCount}
                  onChange={(e) => setBookingForm({ ...bookingForm, guestCount: Number(e.target.value) })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Hora de Inicio *</label>
                <input
                  type="time"
                  required
                  value={bookingForm.startTime}
                  onChange={(e) => setBookingForm({ ...bookingForm, startTime: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Hora de Finalización *</label>
                <input
                  type="time"
                  required
                  value={bookingForm.endTime}
                  onChange={(e) => setBookingForm({ ...bookingForm, endTime: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>

            {isStaff && (
              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bookingForm.solvencyOverride}
                  onChange={(e) => setBookingForm({ ...bookingForm, solvencyOverride: e.target.checked })}
                  className="w-4 h-4 accent-amber-600"
                />
                <span className="font-semibold">
                  Autorizar excepción administrativa si el inmueble presenta saldo pendiente (uso de emergencia/mudanza)
                </span>
              </label>
            )}

            {/* Panel de Evaluación del Motor de Reglas en Vivo */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-bold tracking-wider text-slate-500">
                  Dictamen del Motor de Reglas de Convivencia
                </span>
                {evaluating ? (
                  <span className="text-slate-400 flex items-center gap-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Evaluando reglas...
                  </span>
                ) : liveEvaluation ? (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      liveEvaluation.allowed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {liveEvaluation.allowed
                      ? 'CUMPLE TODAS LAS REGLAS — DISPONIBLE'
                      : `${liveEvaluation.violations.length} CONFLICTO(S) DETECTADO(S)`}
                  </span>
                ) : null}
              </div>

              {liveEvaluation && (
                <>
                  {/* Resumen Financiero */}
                  <div className="grid grid-cols-4 gap-2 p-2.5 bg-white rounded-xl border border-slate-200 text-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Alquiler</span>
                      <strong>${liveEvaluation.pricing.feeAmountUsd.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Limpieza</span>
                      <strong>${liveEvaluation.pricing.cleaningFeeUsd.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Garantía</span>
                      <strong className="text-indigo-700">
                        ${liveEvaluation.pricing.depositAmountUsd.toFixed(2)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Total</span>
                      <strong className="text-emerald-700">
                        ${liveEvaluation.pricing.totalPayableUsd.toFixed(2)} USD
                      </strong>
                    </div>
                  </div>

                  {/* Lista de reglas verificadas */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
                    {liveEvaluation.checks.map((chk: any) => (
                      <div
                        key={chk.code}
                        className={`p-2 rounded-lg border text-[11px] flex items-start gap-1.5 ${
                          chk.passed
                            ? 'bg-white border-slate-200/80 text-slate-700'
                            : 'bg-rose-50 border-rose-200 text-rose-800 font-semibold'
                        }`}
                      >
                        {chk.passed ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span className="block font-bold">{chk.label}</span>
                          <span className="text-[10px] opacity-85 leading-tight block">{chk.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBookingModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || (liveEvaluation && !liveEvaluation.allowed)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold"
              >
                {submitting ? 'Procesando...' : 'Confirmar Reserva'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: CREAR / EDITAR ESPACIO PARAMETRIZABLE */}
      {/* ===================================================================== */}
      {showSpaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleSaveSpace}
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 max-h-[92vh] overflow-y-auto space-y-4 text-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600">
                  Modelo de Espacio Desacoplado
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingSpace ? 'Configurar Parámetros del Espacio' : 'Crear Nuevo Espacio o Recurso Común'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSpaceModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Nombre del Espacio *</label>
                <input
                  type="text"
                  required
                  value={spaceForm.name}
                  onChange={(e) => setSpaceForm({ ...spaceForm, name: e.target.value })}
                  placeholder="Ej: Salón de Fiestas Torre A"
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Categoría</label>
                <select
                  value={spaceForm.spaceCategory}
                  onChange={(e) => setSpaceForm({ ...spaceForm, spaceCategory: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                >
                  {Object.entries(SPACE_CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Modo de Reserva</label>
                <select
                  value={spaceForm.bookingMode}
                  onChange={(e) => setSpaceForm({ ...spaceForm, bookingMode: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                >
                  <option value="HOURLY">Por Horas</option>
                  <option value="FULL_DAY">Jornada / Turno Completo</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Flujo de Aprobación</label>
                <select
                  value={spaceForm.approvalMode}
                  onChange={(e) => setSpaceForm({ ...spaceForm, approvalMode: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                >
                  <option value="ADMIN_APPROVAL">Requiere Aprobación Admin</option>
                  <option value="AUTO_APPROVE">Auto-Aprobación Inmediata</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Esquema de Tarifa</label>
                <select
                  value={spaceForm.feeType}
                  onChange={(e) => setSpaceForm({ ...spaceForm, feeType: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                >
                  <option value="FREE">Gratuito ($0)</option>
                  <option value="FLAT_PER_BOOKING">Tarifa Fija por Reserva</option>
                  <option value="PER_HOUR">Tarifa por Hora</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Canon Alquiler (USD)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={spaceForm.feeUsd}
                  onChange={(e) => setSpaceForm({ ...spaceForm, feeUsd: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cargo Limpieza (USD)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={spaceForm.cleaningFeeUsd}
                  onChange={(e) => setSpaceForm({ ...spaceForm, cleaningFeeUsd: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Depósito Garantía (USD)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={spaceForm.depositUsd}
                  onChange={(e) => setSpaceForm({ ...spaceForm, depositUsd: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Hora Apertura</label>
                <input
                  type="time"
                  value={spaceForm.openTime}
                  onChange={(e) => setSpaceForm({ ...spaceForm, openTime: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Hora Cierre</label>
                <input
                  type="time"
                  value={spaceForm.closeTime}
                  onChange={(e) => setSpaceForm({ ...spaceForm, closeTime: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Aforo Máx (Pers.)</label>
                <input
                  type="number"
                  min={1}
                  value={spaceForm.capacity}
                  onChange={(e) => setSpaceForm({ ...spaceForm, capacity: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Buffer Limpieza (Min)</label>
                <input
                  type="number"
                  min={0}
                  value={spaceForm.bufferMinutes}
                  onChange={(e) => setSpaceForm({ ...spaceForm, bufferMinutes: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cuota Mensual / Apto</label>
                <input
                  type="number"
                  min={1}
                  value={spaceForm.maxPerUnitPerMonth}
                  onChange={(e) => setSpaceForm({ ...spaceForm, maxPerUnitPerMonth: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Días Enfriamiento</label>
                <input
                  type="number"
                  min={0}
                  value={spaceForm.cooldownDays}
                  onChange={(e) => setSpaceForm({ ...spaceForm, cooldownDays: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Reglamento Específico de Convivencia del Espacio
              </label>
              <textarea
                rows={2}
                value={spaceForm.rules}
                onChange={(e) => setSpaceForm({ ...spaceForm, rules: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-xl"
              />
            </div>

            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={spaceForm.blockDelinquentUnits}
                onChange={(e) => setSpaceForm({ ...spaceForm, blockDelinquentUnits: e.target.checked })}
                className="w-4 h-4 accent-emerald-600"
              />
              <span className="font-semibold">
                Bloquear solicitudes de inmuebles con recibos vencidos o mora en este espacio
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSpaceModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold"
              >
                {submitting ? 'Guardando...' : 'Guardar Espacio'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: INSPECCIÓN POST-EVENTO Y LIQUIDACIÓN DE DEPÓSITO EN GARANTÍA */}
      {/* ===================================================================== */}
      {inspectingReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleInspectReservation}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600">
                  Acta de Entrega del Espacio
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  Inspección y Liquidación de Garantía · {inspectingReservation.reservationCode}
                </h3>
                <p className="text-slate-500">
                  Depósito en custodia: <strong>${inspectingReservation.depositAmountUsd.toFixed(2)} USD</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingReservation(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Resultado de Inspección</label>
                <select
                  value={inspectForm.inspectionStatus}
                  onChange={(e) =>
                    setInspectForm({
                      ...inspectForm,
                      inspectionStatus: e.target.value,
                      damageDeductionUsd: e.target.value === 'CLEAN_OK' ? 0 : inspectForm.damageDeductionUsd,
                    })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-bold"
                >
                  <option value="CLEAN_OK">Entregado en perfecto estado (Liberar 100% garantía)</option>
                  <option value="WITH_OBSERVATIONS">Con observaciones menores</option>
                  <option value="DAMAGE_REPORTED">Daños o limpieza incumplida (Aplicar deducción)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Monto Deducido por Daños / Limpieza Extra (USD)
                </label>
                <input
                  type="number"
                  min={0}
                  max={inspectingReservation.depositAmountUsd}
                  step="0.01"
                  value={inspectForm.damageDeductionUsd}
                  onChange={(e) =>
                    setInspectForm({ ...inspectForm, damageDeductionUsd: Number(e.target.value) })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-bold"
                />
                <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                  Monto a reintegrar al propietario: $
                  {Math.max(
                    0,
                    inspectingReservation.depositAmountUsd - Number(inspectForm.damageDeductionUsd || 0),
                  ).toFixed(2)}{' '}
                  USD
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Observaciones del Acta de Entrega
                </label>
                <textarea
                  rows={2}
                  value={inspectForm.inspectionNotes}
                  onChange={(e) => setInspectForm({ ...inspectForm, inspectionNotes: e.target.value })}
                  placeholder="Estado de mobiliario, limpieza, llaves..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInspectingReservation(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold"
              >
                {submitting ? 'Certificando...' : 'Certificar Inspección y Liquidar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: REPORTAR / VERIFICAR PAGO DE RESERVA */}
      {/* ===================================================================== */}
      {payingReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleRegisterPayment}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600">
                  Compromiso Financiero
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  Registrar Pago · {payingReservation.reservationCode}
                </h3>
                <p className="text-slate-500">
                  Total a cancelar: <strong>${payingReservation.totalAmountUsd.toFixed(2)} USD</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayingReservation(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Método de Pago</label>
                <select
                  value={paymentForm.paymentMethod}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-bold"
                >
                  <option value="PAGO_MOVIL">Pago Móvil</option>
                  <option value="TRANSFER_VES">Transferencia Bancaria Bs</option>
                  <option value="ZELLE">Zelle USD</option>
                  <option value="CASH_USD">Efectivo USD en Administración</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Referencia / Comprobante *</label>
                <input
                  type="text"
                  required
                  value={paymentForm.paymentReference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })}
                  placeholder="Ej: PM-9948210"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingReservation(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
              >
                {submitting ? 'Guardando...' : 'Guardar Pago'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: PROGRAMAR CIERRE / BLOQUEO POR MANTENIMIENTO */}
      {/* ===================================================================== */}
      {showBlackoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleCreateBlackout}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  Mantenimiento Preventivo
                </span>
                <h3 className="text-lg font-bold text-slate-900">Programar Cierre de Espacio Común</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBlackoutModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Espacio *</label>
                <select
                  required
                  value={blackoutForm.amenityId}
                  onChange={(e) => setBlackoutForm({ ...blackoutForm, amenityId: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-bold"
                >
                  {spaces.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Motivo del Cierre *</label>
                <input
                  type="text"
                  required
                  value={blackoutForm.title}
                  onChange={(e) => setBlackoutForm({ ...blackoutForm, title: e.target.value })}
                  placeholder="Ej: Fumigación general y pulitura de pisos"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Desde</label>
                  <input
                    type="date"
                    required
                    value={blackoutForm.startDate}
                    onChange={(e) => setBlackoutForm({ ...blackoutForm, startDate: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Hasta</label>
                  <input
                    type="date"
                    required
                    value={blackoutForm.endDate}
                    onChange={(e) => setBlackoutForm({ ...blackoutForm, endDate: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBlackoutModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold"
              >
                {submitting ? 'Guardando...' : 'Programar Bloqueo'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 6: CONFIGURACIÓN DEL MÓDULO POR CONDOMINIO */}
      {/* ===================================================================== */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600">
                  Políticas de la Residencia
                </span>
                <h3 className="text-lg font-bold text-slate-900">Configuración Global de Áreas Comunes</h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <div>
                  <span className="font-bold text-slate-900 block">Habilitar Módulo de Áreas Comunes</span>
                  <span className="text-slate-500 text-[11px]">
                    Permite reservar salones, parrilleras, canchas o ascensor de mudanzas.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={configForm.enabled}
                  onChange={(e) => setConfigForm({ ...configForm, enabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 cursor-pointer">
                <div>
                  <span className="font-bold text-slate-800 block">
                    Regla Global de Solvencia (Anti-Morosidad)
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Exige estar al día en recibos de condominio según la regla de cada espacio.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={configForm.globalBlockDelinquentUnits}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, globalBlockDelinquentUnits: e.target.checked })
                  }
                  className="w-4 h-4 accent-emerald-600"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSaveConfig()}
                disabled={submitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
              >
                Guardar Políticas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
