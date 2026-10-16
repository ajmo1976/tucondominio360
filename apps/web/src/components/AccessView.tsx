'use client';

import React, { useEffect, useState } from 'react';
import {
  QrCode,
  Shield,
  Car,
  User,
  Clock,
  CheckCircle2,
  Plus,
  Search,
  Download,
  LogIn,
  LogOut,
  Package,
  Settings,
  AlertTriangle,
  Truck,
  Building,
  Check,
  X,
  Loader2,
  RefreshCw,
  FileText,
  KeyRound,
  Trash2,
  Edit,
  Phone,
  Ban,
  ShieldAlert,
} from 'lucide-react';
import { downloadWithAuth, fetchWithAuth } from '../lib/api';

interface AccessControlConfig {
  enabled: boolean;
  residentVehicles: boolean;
  visitorPasses: boolean;
  suppliersAndDelivery: boolean;
  packagesAndMail: boolean;
  requireDocNumberOnEntry: boolean;
  requirePlateForVehicles: boolean;
  maxActivePassesPerUnit: number;
  defaultPassDurationHours: number;
}

interface UnitSummary {
  id: string;
  unitCode: string;
  floor: string | null;
}

interface AccessOverview {
  config: AccessControlConfig;
  isStaff: boolean;
  units: UnitSummary[];
  kpis: {
    insideCount: number;
    vehiclesInsideCount: number;
    entriesTodayCount: number;
    deliveriesTodayCount: number;
    activeInvitationsCount: number;
    pendingPackagesCount: number;
    registeredVehiclesCount: number;
    incidentsTodayCount: number;
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  VISITOR: 'Visita Personal',
  FAMILY: 'Familiar',
  PROVIDER: 'Proveedor',
  DELIVERY: 'Delivery / Encomienda',
  SERVICE: 'Servicio Técnico',
  TAXI: 'Taxi / Transporte',
  CONTRACTOR: 'Contratista / Obra',
};

const CATEGORY_STYLES: Record<string, string> = {
  VISITOR: 'bg-sky-50 text-sky-700 border-sky-200',
  FAMILY: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PROVIDER: 'bg-amber-50 text-amber-800 border-amber-200',
  DELIVERY: 'bg-orange-50 text-orange-700 border-orange-200',
  SERVICE: 'bg-purple-50 text-purple-700 border-purple-200',
  TAXI: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  CONTRACTOR: 'bg-slate-100 text-slate-700 border-slate-300',
};

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  CAR: 'Automóvil',
  SUV: 'Camioneta / SUV',
  MOTO: 'Motocicleta',
  TRUCK: 'Camión / Carga',
  OTHER: 'Otro',
};

const QUICK_PROVIDER_PRESETS = [
  { label: 'Delivery (Yummy / PedidosYa)', category: 'DELIVERY', company: 'Delivery Express', mode: 'VEHICLE' },
  { label: 'MercadoLibre / Encomienda', category: 'DELIVERY', company: 'MercadoLibre / Courier', mode: 'VEHICLE' },
  { label: 'Ridery / Taxi', category: 'TAXI', company: 'Taxi / Ridery', mode: 'VEHICLE' },
  { label: 'Internet / Fibra (Fibex/NetUno)', category: 'SERVICE', company: 'Soporte Fibra / Internet', mode: 'VEHICLE' },
  { label: 'Camión Cisterna / Agua', category: 'PROVIDER', company: 'Suministro de Agua', mode: 'VEHICLE' },
  { label: 'Técnico / Mantenimiento', category: 'CONTRACTOR', company: 'Servicio Técnico', mode: 'PEDESTRIAN' },
];

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function durationSince(entryIso: string, exitIso?: string | null): string {
  const start = new Date(entryIso).getTime();
  const end = exitIso ? new Date(exitIso).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const mins = Math.floor((end - start) / 60000);
  if (mins < 1) return 'Hace instantes';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

export function AccessView({ condoId }: { condoId: string }) {
  const [overview, setOverview] = useState<AccessOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Sub-pestaña activa: 'logbook' | 'invitations' | 'vehicles' | 'packages'
  const [activeSubTab, setActiveSubTab] = useState<'logbook' | 'invitations' | 'vehicles' | 'packages'>('logbook');

  // Datos por sub-pestaña
  const [logs, setLogs] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);

  // Filtros de Bitácora
  const [logStatusFilter, setLogStatusFilter] = useState<string>('ALL');
  const [logCategoryFilter, setLogCategoryFilter] = useState<string>('ALL');
  const [logSearch, setLogSearch] = useState<string>('');
  const [logFromDate, setLogFromDate] = useState<string>('');
  const [logToDate, setLogToDate] = useState<string>('');

  // Filtros de Pases, Vehículos y Paquetes
  const [invStatusFilter, setInvStatusFilter] = useState<string>('ALL');
  const [invSearch, setInvSearch] = useState<string>('');
  const [vehicleSearch, setVehicleSearch] = useState<string>('');
  const [vehicleSubView, setVehicleSubView] = useState<'vehicles' | 'directory'>('vehicles');
  const [pkgStatusFilter, setPkgStatusFilter] = useState<string>('ALL');
  const [pkgSearch, setPkgSearch] = useState<string>('');

  // Validador rápido de código QR en garita
  const [quickCode, setQuickCode] = useState('');
  const [validatedResult, setValidatedResult] = useState<any | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);

  // Modales
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState<AccessControlConfig | null>(null);

  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [checkInForm, setCheckInForm] = useState({
    propertyUnitId: '',
    visitorName: '',
    visitorDocType: 'V',
    visitorDocNumber: '',
    visitorCategory: 'VISITOR',
    entryMode: 'PEDESTRIAN',
    companyName: '',
    vehiclePlate: '',
    destinationLabel: '',
    authorizedByName: '',
    incidentAlert: false,
    notes: '',
  });

  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const [invitationForm, setInvitationForm] = useState({
    propertyUnitId: '',
    visitorName: '',
    visitorDocType: 'V',
    visitorDocNumber: '',
    visitorCategory: 'VISITOR',
    entryMode: 'PEDESTRIAN',
    visitorPlate: '',
    companyName: '',
    companionCount: 0,
    maxUses: 1,
    validUntilHours: 24,
    notes: '',
  });

  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    propertyUnitId: '',
    plate: '',
    vehicleType: 'CAR',
    brand: '',
    model: '',
    color: '',
    parkingSpot: '',
    tagCode: '',
    ownerName: '',
    notes: '',
  });

  const [showPackageModal, setShowPackageModal] = useState(false);
  const [packageForm, setPackageForm] = useState({
    propertyUnitId: '',
    courierCompany: 'MRW',
    trackingNumber: '',
    recipientName: '',
    notes: '',
  });

  const [deliveringPackage, setDeliveringPackage] = useState<any | null>(null);
  const [deliverForm, setDeliverForm] = useState({
    pickupPin: '',
    deliveredToName: '',
    notes: '',
  });

  const [submitting, setSubmitting] = useState(false);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Carga inicial y refresco
  const loadOverviewAndTab = async () => {
    if (!condoId) return;
    try {
      setLoading(true);
      setError(null);
      const ovRes = await fetchWithAuth(`/access/overview?condoId=${condoId}`);
      if (!ovRes.ok) {
        const err = await ovRes.json().catch(() => ({}));
        throw new Error(err.message || 'No se pudo cargar el módulo de control de acceso');
      }
      const ov: AccessOverview = await ovRes.json();
      setOverview(ov);
      setConfigForm(ov.config);

      if (ov.units.length > 0) {
        const defaultUnit = ov.units[0].id;
        setInvitationForm((prev) => ({ ...prev, propertyUnitId: prev.propertyUnitId || defaultUnit }));
        setVehicleForm((prev) => ({ ...prev, propertyUnitId: prev.propertyUnitId || defaultUnit }));
        setPackageForm((prev) => ({ ...prev, propertyUnitId: prev.propertyUnitId || defaultUnit }));
      }

      if (ov.config.enabled) {
        await Promise.all([
          loadLogs(logStatusFilter, logCategoryFilter, logSearch, logFromDate, logToDate),
          loadInvitations(invStatusFilter, invSearch),
          loadVehicles(vehicleSearch),
          loadPackages(pkgStatusFilter, pkgSearch),
        ]);
      }
    } catch (e: any) {
      setError(e.message || 'Error al cargar Control de Acceso');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async (
    status = logStatusFilter,
    category = logCategoryFilter,
    q = logSearch,
    from = logFromDate,
    to = logToDate,
  ) => {
    const params = new URLSearchParams({ condoId });
    if (status && status !== 'ALL') params.set('status', status);
    if (category && category !== 'ALL') params.set('category', category);
    if (q.trim()) params.set('q', q.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await fetchWithAuth(`/access/logs?${params.toString()}`);
    if (res.ok) setLogs(await res.json());
  };

  const loadInvitations = async (status = invStatusFilter, q = invSearch) => {
    const params = new URLSearchParams({ condoId });
    if (status && status !== 'ALL') params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    const res = await fetchWithAuth(`/access/invitations?${params.toString()}`);
    if (res.ok) setInvitations(await res.json());
  };

  const loadVehicles = async (q = vehicleSearch) => {
    const params = new URLSearchParams({ condoId });
    if (q.trim()) params.set('q', q.trim());
    const [vRes, dRes] = await Promise.all([
      fetchWithAuth(`/access/vehicles?${params.toString()}`),
      fetchWithAuth(`/access/directory?${params.toString()}`),
    ]);
    if (vRes.ok) setVehicles(await vRes.json());
    if (dRes.ok) setDirectory(await dRes.json());
  };

  const loadPackages = async (status = pkgStatusFilter, q = pkgSearch) => {
    const params = new URLSearchParams({ condoId });
    if (status && status !== 'ALL') params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    const res = await fetchWithAuth(`/access/packages?${params.toString()}`);
    if (res.ok) setPackages(await res.json());
  };

  useEffect(() => {
    loadOverviewAndTab();
  }, [condoId]);

  // Guardar configuración del condominio
  const handleSaveConfig = async (override?: Partial<AccessControlConfig>) => {
    const payload = { ...(configForm || overview?.config), ...override, condoId };
    try {
      setSubmitting(true);
      const res = await fetchWithAuth('/access/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'No se pudo actualizar la configuración');
      }
      setShowConfigModal(false);
      showToast('Configuración de Control de Acceso actualizada para esta residencia');
      await loadOverviewAndTab();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Validar código QR/PIN en garita
  const handleValidateQuickCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCode.trim()) return;
    try {
      setValidatingCode(true);
      setValidatedResult(null);
      const res = await fetchWithAuth('/access/invitations/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condoId, accessCode: quickCode.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Código no encontrado');
      }
      setValidatedResult(await res.json());
    } catch (e: any) {
      alert(e.message);
    } finally {
      setValidatingCode(false);
    }
  };

  // Check-in en 1 clic desde pase validado
  const handleQuickCheckInFromInvitation = async (invitationId: string) => {
    try {
      setSubmitting(true);
      const res = await fetchWithAuth('/access/logs/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condoId, invitationId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'No se pudo registrar el ingreso');
      }
      setValidatedResult(null);
      setQuickCode('');
      showToast('Ingreso registrado exitosamente en la bitácora de garita');
      await loadOverviewAndTab();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Check-in manual (visita, proveedor, delivery, servicio)
  const handleManualCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await fetchWithAuth('/access/logs/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          condoId,
          propertyUnitId: checkInForm.propertyUnitId || undefined,
          visitorName: checkInForm.visitorName,
          visitorDocType: checkInForm.visitorDocType,
          visitorDocNumber: checkInForm.visitorDocNumber,
          visitorCategory: checkInForm.visitorCategory,
          entryMode: checkInForm.entryMode,
          companyName: checkInForm.companyName || undefined,
          vehiclePlate: checkInForm.vehiclePlate || undefined,
          destinationLabel: checkInForm.destinationLabel || undefined,
          authorizedByName: checkInForm.authorizedByName || undefined,
          incidentAlert: checkInForm.incidentAlert,
          notes: checkInForm.notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al registrar ingreso');
      }
      setShowCheckInModal(false);
      setCheckInForm({
        propertyUnitId: '',
        visitorName: '',
        visitorDocType: 'V',
        visitorDocNumber: '',
        visitorCategory: 'VISITOR',
        entryMode: 'PEDESTRIAN',
        companyName: '',
        vehiclePlate: '',
        destinationLabel: '',
        authorizedByName: '',
        incidentAlert: false,
        notes: '',
      });
      showToast('Entrada registrada en la bitácora digital');
      await loadOverviewAndTab();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Check-out en 1 clic
  const handleCheckOut = async (logId: string) => {
    try {
      setSubmitting(true);
      const res = await fetchWithAuth(`/access/logs/${logId}/check-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al registrar salida');
      }
      showToast('Salida registrada en la bitácora');
      await loadOverviewAndTab();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Crear Pase de Invitación QR
  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const now = new Date();
      const validUntil = new Date(now.getTime() + Number(invitationForm.validUntilHours || 24) * 3600 * 1000);
      const res = await fetchWithAuth('/access/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          condoId,
          propertyUnitId: invitationForm.propertyUnitId,
          visitorName: invitationForm.visitorName,
          visitorDocType: invitationForm.visitorDocType,
          visitorDocNumber: invitationForm.visitorDocNumber || undefined,
          visitorCategory: invitationForm.visitorCategory,
          entryMode: invitationForm.entryMode,
          visitorPlate: invitationForm.visitorPlate || undefined,
          companyName: invitationForm.companyName || undefined,
          companionCount: Number(invitationForm.companionCount || 0),
          maxUses: Number(invitationForm.maxUses || 1),
          validFrom: now.toISOString(),
          validUntil: validUntil.toISOString(),
          notes: invitationForm.notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al generar pase');
      }
      const created = await res.json();
      setShowInvitationModal(false);
      setInvitationForm((prev) => ({
        ...prev,
        visitorName: '',
        visitorDocNumber: '',
        visitorPlate: '',
        companyName: '',
        companionCount: 0,
        notes: '',
      }));
      showToast(`Pase generado con éxito: ${created.accessCode}`);
      await loadOverviewAndTab();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelInvitation = async (id: string) => {
    if (!confirm('¿Deseas anular este pase de acceso?')) return;
    const res = await fetchWithAuth(`/access/invitations/${id}/cancel`, { method: 'POST' });
    if (res.ok) {
      showToast('Pase de acceso anulado');
      await loadOverviewAndTab();
    }
  };

  // Crear / Editar Vehículo
  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const url = editingVehicle ? `/access/vehicles/${editingVehicle.id}` : '/access/vehicles';
      const method = editingVehicle ? 'PATCH' : 'POST';
      const body = editingVehicle
        ? {
            plate: vehicleForm.plate,
            vehicleType: vehicleForm.vehicleType,
            brand: vehicleForm.brand,
            model: vehicleForm.model,
            color: vehicleForm.color,
            parkingSpot: vehicleForm.parkingSpot,
            tagCode: vehicleForm.tagCode,
            ownerName: vehicleForm.ownerName,
            notes: vehicleForm.notes,
          }
        : {
            condoId,
            ...vehicleForm,
          };

      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'No se pudo guardar el vehículo');
      }
      setShowVehicleModal(false);
      setEditingVehicle(null);
      showToast(editingVehicle ? 'Vehículo actualizado' : 'Vehículo registrado en el padrón');
      await loadOverviewAndTab();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    if (!confirm('¿Eliminar este vehículo del padrón?')) return;
    const res = await fetchWithAuth(`/access/vehicles/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Vehículo eliminado');
      await loadOverviewAndTab();
    }
  };

  // Recepcionar paquete en garita
  const handleReceivePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await fetchWithAuth('/access/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          condoId,
          ...packageForm,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al registrar paquete');
      }
      const created = await res.json();
      setShowPackageModal(false);
      setPackageForm((prev) => ({
        ...prev,
        trackingNumber: '',
        recipientName: '',
        notes: '',
      }));
      showToast(`Paquete registrado · PIN de retiro asignado: ${created.pickupPin}`);
      await loadOverviewAndTab();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Entregar paquete
  const handleDeliverPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveringPackage) return;
    try {
      setSubmitting(true);
      const res = await fetchWithAuth(`/access/packages/${deliveringPackage.id}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupPin: deliverForm.pickupPin || undefined,
          deliveredToName: deliverForm.deliveredToName || undefined,
          notes: deliverForm.notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'No se pudo entregar el paquete');
      }
      setDeliveringPackage(null);
      setDeliverForm({ pickupPin: '', deliveredToName: '', notes: '' });
      showToast('Entrega de paquete certificada');
      await loadOverviewAndTab();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-500">Cargando Control de Acceso y Garita...</p>
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

  const { config, isStaff, units, kpis } = overview;

  return (
    <div className="space-y-6">
      {/* Notificación flotante */}
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
              Control de Acceso y Garita Digital
            </h1>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                config.enabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}
            >
              {config.enabled ? 'Módulo Activo' : 'Módulo Desactivado en esta Residencia'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {isStaff
              ? 'Bitácora de vigilancia en tiempo real, validación de pases QR, proveedores/delivery, padrón vehicular y paquetería.'
              : 'Gestiona tus pases de visita QR, vehículos autorizados, paquetes en garita y el historial de accesos a tu inmueble.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadOverviewAndTab}
            className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Actualizar</span>
          </button>
          {isStaff && (
            <button
              onClick={() => {
                setConfigForm(config);
                setShowConfigModal(true);
              }}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Configurar Garita del Condominio</span>
            </button>
          )}
        </div>
      </div>

      {/* Si el condominio NO utiliza Control de Acceso / Garita */}
      {!config.enabled ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center shadow-sm max-w-2xl mx-auto">
          <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800">
            Control de Garita deshabilitado para esta residencia
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
            Por su estructura o configuración operativa, esta residencia tiene desactivado el módulo de Control de Acceso y Garita.
            {isStaff && ' Puedes habilitarlo en cualquier momento y elegir qué funciones (vehículos, pases QR, delivery o paquetería) aplican.'}
          </p>
          {isStaff && (
            <button
              onClick={() => handleSaveConfig({ enabled: true })}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              Habilitar Control de Acceso y Garita
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Tarjetas KPI en Tiempo Real */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>En Recinto Ahora</span>
                <Shield className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{kpis.insideCount}</p>
              <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                {kpis.vehiclesInsideCount} con vehículo adentro
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Ingresos de Hoy</span>
                <LogIn className="w-4 h-4 text-sky-600" />
              </div>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{kpis.entriesTodayCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {kpis.deliveriesTodayCount} proveedores / delivery
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Pases QR Activos</span>
                <QrCode className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{kpis.activeInvitationsCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Autorizaciones vigentes</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Padrón Vehicular</span>
                <Car className="w-4 h-4 text-slate-700" />
              </div>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{kpis.registeredVehiclesCount}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Vehículos autorizados</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm col-span-2 md:col-span-1">
              <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                <span>Paquetes en Garita</span>
                <Package className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{kpis.pendingPackagesCount}</p>
              <p className="text-[11px] text-amber-700 font-medium mt-0.5">Pendientes por retirar</p>
            </div>
          </div>

          {/* Barra de Sub-navegación del Módulo */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveSubTab('logbook')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                  activeSubTab === 'logbook'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>{isStaff ? 'Bitácora de Garita en Vivo' : 'Historial de Ingresos a mi Unidad'}</span>
              </button>

              {config.visitorPasses && (
                <button
                  onClick={() => setActiveSubTab('invitations')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                    activeSubTab === 'invitations'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>Visitas y Pases QR ({kpis.activeInvitationsCount})</span>
                </button>
              )}

              {config.residentVehicles && (
                <button
                  onClick={() => setActiveSubTab('vehicles')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                    activeSubTab === 'vehicles'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Car className="w-4 h-4" />
                  <span>{isStaff ? 'Residentes y Vehículos' : 'Mis Vehículos'}</span>
                </button>
              )}

              {config.packagesAndMail && (
                <button
                  onClick={() => setActiveSubTab('packages')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                    activeSubTab === 'packages'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  <span>Paquetería y Encomiendas ({kpis.pendingPackagesCount})</span>
                </button>
              )}
            </div>

            {/* Acciones primarias rápidas según sub-pestaña */}
            <div className="flex flex-wrap items-center gap-2">
              {isStaff && activeSubTab === 'logbook' && (
                <>
                  <button
                    onClick={() => {
                      setCheckInForm((prev) => ({
                        ...prev,
                        visitorCategory: 'VISITOR',
                        entryMode: 'PEDESTRIAN',
                        companyName: '',
                      }));
                      setShowCheckInModal(true);
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Registrar Entrada en Garita</span>
                  </button>
                  {config.suppliersAndDelivery && (
                    <button
                      onClick={() => {
                        setCheckInForm((prev) => ({
                          ...prev,
                          visitorCategory: 'DELIVERY',
                          entryMode: 'VEHICLE',
                          companyName: 'Delivery / Encomienda',
                        }));
                        setShowCheckInModal(true);
                      }}
                      className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>Ingreso Rápido Delivery / Proveedor</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const q = new URLSearchParams({ condoId });
                      if (logFromDate) q.set('from', logFromDate);
                      if (logToDate) q.set('to', logToDate);
                      if (logCategoryFilter !== 'ALL') q.set('category', logCategoryFilter);
                      downloadWithAuth(
                        `/access/reports/logbook.pdf?${q.toString()}`,
                        'bitacora-garita-oficial.pdf',
                      );
                    }}
                    className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Bitácora PDF</span>
                  </button>
                </>
              )}

              {config.visitorPasses && (
                <button
                  onClick={() => setShowInvitationModal(true)}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Generar Pase QR</span>
                </button>
              )}
            </div>
          </div>

          {/* ===================================================================== */}
          {/* SUB-PESTAÑA 1: BITÁCORA DIGITAL DE GARITA EN VIVO */}
          {/* ===================================================================== */}
          {activeSubTab === 'logbook' && (
            <div className="space-y-4">
              {/* Validador rápido de Código QR / PIN para el Vigilante */}
              {isStaff && config.visitorPasses && (
                <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-400">
                        Control Rápido de Garita
                      </span>
                      <h3 className="text-sm sm:text-base font-bold">
                        Validar Pase Digital QR / Código de Invitación
                      </h3>
                      <p className="text-xs text-slate-400">
                        Ingresa el código del visitante (ej. <span className="font-mono text-slate-200">TC360-XXXX-XXXX</span>) para verificar su autorización y darle entrada en 1 clic.
                      </p>
                    </div>
                    <form onSubmit={handleValidateQuickCode} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={quickCode}
                        onChange={(e) => setQuickCode(e.target.value)}
                        placeholder="Ej: TC360-4821-A9F2"
                        className="px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-52 sm:w-64 uppercase"
                      />
                      <button
                        type="submit"
                        disabled={validatingCode}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition shrink-0"
                      >
                        {validatingCode ? 'Verificando...' : 'Verificar Pase'}
                      </button>
                    </form>
                  </div>

                  {validatedResult && (
                    <div
                      className={`mt-4 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        validatedResult.valid
                          ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-100'
                          : 'bg-rose-950/70 border-rose-500/50 text-rose-100'
                      }`}
                    >
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                              validatedResult.valid ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
                            }`}
                          >
                            {validatedResult.valid ? 'PASE VÁLIDO Y AUTORIZADO' : 'PASE NO VÁLIDO'}
                          </span>
                          <span className="font-mono font-bold">{validatedResult.invitation.accessCode}</span>
                        </div>
                        <p className="text-sm font-bold text-white">
                          {validatedResult.invitation.visitorName}{' '}
                          <span className="text-slate-300 font-normal">
                            ({validatedResult.invitation.visitorDocType}-{validatedResult.invitation.visitorDocNumber || 'S/D'})
                          </span>
                        </p>
                        <p className="text-slate-300">
                          Destino: <strong>Inmueble {validatedResult.invitation.unitCode}</strong> · Autoriza:{' '}
                          {validatedResult.invitation.authorizedByName} · Placa:{' '}
                          <strong>{validatedResult.invitation.visitorPlate || 'Peatonal'}</strong>
                        </p>
                        {validatedResult.reason && (
                          <p className="text-rose-300 font-semibold">Motivo: {validatedResult.reason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {validatedResult.valid && (
                          <button
                            onClick={() => handleQuickCheckInFromInvitation(validatedResult.invitation.id)}
                            disabled={submitting}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
                          >
                            <LogIn className="w-4 h-4" />
                            <span>Confirmar Entrada Ahora</span>
                          </button>
                        )}
                        <button
                          onClick={() => setValidatedResult(null)}
                          className="p-2 text-slate-400 hover:text-white rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Barra de filtros de la Bitácora */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'ALL', label: 'Todos los Movimientos' },
                    { id: 'INSIDE', label: `En Recinto (${kpis.insideCount})` },
                    { id: 'COMPLETED', label: 'Salidas Registradas' },
                    { id: 'INCIDENT', label: 'Novedades / Alertas' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => {
                        setLogStatusFilter(st.id);
                        loadLogs(st.id, logCategoryFilter, logSearch, logFromDate, logToDate);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        logStatusFilter === st.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}

                  <select
                    value={logCategoryFilter}
                    onChange={(e) => {
                      setLogCategoryFilter(e.target.value);
                      loadLogs(logStatusFilter, e.target.value, logSearch, logFromDate, logToDate);
                    }}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                  >
                    <option value="ALL">Todas las Categorías</option>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={logFromDate}
                    onChange={(e) => {
                      setLogFromDate(e.target.value);
                      loadLogs(logStatusFilter, logCategoryFilter, logSearch, e.target.value, logToDate);
                    }}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700"
                    title="Fecha desde"
                  />
                  <input
                    type="date"
                    value={logToDate}
                    onChange={(e) => {
                      setLogToDate(e.target.value);
                      loadLogs(logStatusFilter, logCategoryFilter, logSearch, logFromDate, e.target.value);
                    }}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700"
                    title="Fecha hasta"
                  />
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === 'Enter' &&
                        loadLogs(logStatusFilter, logCategoryFilter, logSearch, logFromDate, logToDate)
                      }
                      placeholder="Buscar nombre, placa, unidad..."
                      className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 w-52"
                    />
                  </div>
                </div>
              </div>

              {/* Tabla de Bitácora Digital */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                {logs.length === 0 ? (
                  <div className="p-10 text-center text-xs sm:text-sm text-slate-400">
                    No hay registros en la bitácora para los filtros seleccionados.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Visitante / Empresa</th>
                          <th className="py-3 px-4">Categoría / Modo</th>
                          <th className="py-3 px-4">Destino / Autoriza</th>
                          <th className="py-3 px-4">Entrada</th>
                          <th className="py-3 px-4">Salida / Permanencia</th>
                          <th className="py-3 px-4 text-right">Acción Garita</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {logs.map((log) => (
                          <tr
                            key={log.id}
                            className={
                              log.incidentAlert
                                ? 'bg-rose-50/40 hover:bg-rose-50/70'
                                : log.status === 'INSIDE'
                                ? 'bg-emerald-50/20 hover:bg-slate-50'
                                : 'hover:bg-slate-50'
                            }
                          >
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                {log.incidentAlert && (
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                )}
                                <span>{log.visitorName}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                {log.visitorDocType || 'V'}-{log.visitorDocNumber}
                                {log.companyName && (
                                  <span className="font-sans font-semibold text-slate-700">
                                    {' '}
                                    · {log.companyName}
                                  </span>
                                )}
                              </div>
                              {log.notes && (
                                <p className="text-[11px] text-slate-500 italic mt-0.5">{log.notes}</p>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <span
                                className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  CATEGORY_STYLES[log.visitorCategory] || 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {CATEGORY_LABELS[log.visitorCategory] || log.visitorCategory}
                              </span>
                              <div className="mt-1 text-[11px] text-slate-600 flex items-center gap-1">
                                {log.entryMode === 'VEHICLE' || log.vehiclePlate ? (
                                  <>
                                    <Car className="w-3.5 h-3.5 text-emerald-700" />
                                    <span className="font-mono font-bold text-slate-800">
                                      {log.vehiclePlate || 'VEHÍCULO'}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Peatonal</span>
                                  </>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <span className="font-bold text-slate-900">
                                {log.unitCode
                                  ? `Inmueble ${log.unitCode}`
                                  : log.destinationLabel || 'Áreas Comunes'}
                              </span>
                              <p className="text-[11px] text-slate-500">
                                Autoriza: {log.authorizedByName || 'Garita'}
                              </p>
                              {log.accessCode && (
                                <span className="text-[10px] font-mono text-indigo-600 font-semibold">
                                  Pase: {log.accessCode}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-slate-700">
                              <div className="font-semibold">{formatDateTime(log.entryTime)}</div>
                              <div className="text-[10px] text-slate-400">
                                Op: {log.guardName || 'Vigilancia'}
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              {log.exitTime ? (
                                <div>
                                  <span className="font-semibold text-slate-700">
                                    {formatDateTime(log.exitTime)}
                                  </span>
                                  <p className="text-[10px] text-slate-400">
                                    Estadía: {durationSince(log.entryTime, log.exitTime)}
                                  </p>
                                </div>
                              ) : (
                                <div>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                                    EN RECINTO
                                  </span>
                                  <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
                                    Tiempo: {durationSince(log.entryTime)}
                                  </p>
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right">
                              {isStaff && !log.exitTime ? (
                                <button
                                  onClick={() => handleCheckOut(log.id)}
                                  disabled={submitting}
                                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition"
                                >
                                  <LogOut className="w-3 h-3" />
                                  <span>Dar Salida</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-medium">Cerrado</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* SUB-PESTAÑA 2: VISITAS, PEATONES Y PASES DIGITALES QR */}
          {/* ===================================================================== */}
          {activeSubTab === 'invitations' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'ALL', label: 'Todos los Pases' },
                    { id: 'ACTIVE', label: 'Activos' },
                    { id: 'USED', label: 'Utilizados' },
                    { id: 'EXPIRED', label: 'Vencidos' },
                    { id: 'REVOKED', label: 'Anulados' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => {
                        setInvStatusFilter(st.id);
                        loadInvitations(st.id, invSearch);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        invStatusFilter === st.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadInvitations(invStatusFilter, invSearch)}
                    placeholder="Buscar código, visitante, placa..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 w-60"
                  />
                </div>
              </div>

              {invitations.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-xs sm:text-sm text-slate-400">
                  No hay pases de invitación registrados para este filtro.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {invitations.map((inv) => {
                    const isActive = inv.status === 'ACTIVE';
                    return (
                      <div
                        key={inv.id}
                        className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex flex-col justify-between space-y-4 hover:border-indigo-300 transition"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg">
                              Inmueble {inv.unitCode}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                                isActive
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : inv.status === 'USED'
                                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              {inv.status} ({inv.usesCount}/{inv.maxUses} usos)
                            </span>
                          </div>

                          <div className="flex items-start space-x-3">
                            <div className="w-14 h-14 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-center p-2 shrink-0">
                              <QrCode className="w-9 h-9 text-indigo-700" />
                            </div>
                            <div className="space-y-1 text-xs min-w-0">
                              <p className="font-bold text-slate-900 text-sm truncate">{inv.visitorName}</p>
                              <p className="text-slate-500 font-mono">
                                {inv.visitorDocType || 'V'}-{inv.visitorDocNumber || 'S/D'} ·{' '}
                                {CATEGORY_LABELS[inv.visitorCategory] || inv.visitorCategory}
                              </p>
                              {inv.visitorPlate ? (
                                <p className="text-emerald-700 font-bold flex items-center gap-1">
                                  <Car className="w-3.5 h-3.5" />
                                  <span>Placa: {inv.visitorPlate}</span>
                                </p>
                              ) : (
                                <p className="text-slate-500 flex items-center gap-1">
                                  <User className="w-3.5 h-3.5" />
                                  <span>Ingreso Peatonal</span>
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-slate-400">Código Garita</span>
                            <span className="font-mono text-xs font-extrabold text-indigo-700">
                              {inv.accessCode}
                            </span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              Vence: {formatDateTime(inv.validUntil)}
                            </span>
                            <span className="truncate max-w-[120px]">Por: {inv.createdByName}</span>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1">
                            <button
                              onClick={() =>
                                downloadWithAuth(
                                  `/access/invitations/${inv.id}/pass.pdf`,
                                  `pase-${inv.accessCode}.pdf`,
                                )
                              }
                              className="flex-1 py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 transition"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Pase PDF</span>
                            </button>

                            {isStaff && isActive && (
                              <button
                                onClick={() => handleQuickCheckInFromInvitation(inv.id)}
                                className="flex-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 transition"
                              >
                                <LogIn className="w-3.5 h-3.5" />
                                <span>Dar Entrada</span>
                              </button>
                            )}

                            {isActive && (
                              <button
                                onClick={() => handleCancelInvitation(inv.id)}
                                title="Anular pase"
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===================================================================== */}
          {/* SUB-PESTAÑA 3: GESTIÓN DE RESIDENTES Y VEHÍCULOS */}
          {/* ===================================================================== */}
          {activeSubTab === 'vehicles' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVehicleSubView('vehicles')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                      vehicleSubView === 'vehicles'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Padrón de Vehículos ({vehicles.length})
                  </button>
                  {isStaff && (
                    <button
                      onClick={() => setVehicleSubView('directory')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                        vehicleSubView === 'directory'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Directorio de Residentes por Unidad ({directory.length})
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={vehicleSearch}
                      onChange={(e) => setVehicleSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadVehicles(vehicleSearch)}
                      placeholder="Buscar placa, unidad, marca, residente..."
                      className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 w-64"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setEditingVehicle(null);
                      setVehicleForm({
                        propertyUnitId: units[0]?.id || '',
                        plate: '',
                        vehicleType: 'CAR',
                        brand: '',
                        model: '',
                        color: '',
                        parkingSpot: '',
                        tagCode: '',
                        ownerName: '',
                        notes: '',
                      });
                      setShowVehicleModal(true);
                    }}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Registrar Vehículo</span>
                  </button>
                </div>
              </div>

              {vehicleSubView === 'vehicles' ? (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  {vehicles.length === 0 ? (
                    <div className="p-10 text-center text-xs sm:text-sm text-slate-400">
                      No hay vehículos registrados con ese criterio.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4">Placa</th>
                            <th className="py-3 px-4">Inmueble / Puesto</th>
                            <th className="py-3 px-4">Vehículo / Color</th>
                            <th className="py-3 px-4">Conductor / Tag</th>
                            <th className="py-3 px-4 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {vehicles.map((v) => (
                            <tr key={v.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4">
                                <span className="font-mono text-xs font-extrabold px-2.5 py-1 bg-slate-900 text-white rounded-lg tracking-wider">
                                  {v.plate}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-bold text-slate-900">Inmueble {v.unitCode}</span>
                                <p className="text-[11px] text-slate-500">
                                  Puesto: {v.parkingSpot || v.unitParkingNumber || 'S/N'}
                                </p>
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-bold text-slate-800">
                                  {v.brand} {v.model}
                                </span>
                                <p className="text-[11px] text-slate-500">
                                  {VEHICLE_TYPE_LABELS[v.vehicleType] || v.vehicleType} · Color: {v.color}
                                </p>
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-medium text-slate-800">{v.ownerName || 'Residente'}</span>
                                {v.tagCode && (
                                  <p className="text-[11px] font-mono text-emerald-700">Tag: {v.tagCode}</p>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right space-x-1">
                                <button
                                  onClick={() => {
                                    setEditingVehicle(v);
                                    setVehicleForm({
                                      propertyUnitId: v.propertyUnitId,
                                      plate: v.plate,
                                      vehicleType: v.vehicleType,
                                      brand: v.brand,
                                      model: v.model,
                                      color: v.color,
                                      parkingSpot: v.parkingSpot || '',
                                      tagCode: v.tagCode || '',
                                      ownerName: v.ownerName || '',
                                      notes: v.notes || '',
                                    });
                                    setShowVehicleModal(true);
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteVehicle(v.id)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {directory.map((unit) => (
                    <div
                      key={unit.id}
                      className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                          <Building className="w-4 h-4 text-emerald-600" />
                          Inmueble {unit.unitCode}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Piso {unit.floor || '—'} · Puesto {unit.parkingNumber || '—'}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <span className="text-[10px] uppercase font-bold text-slate-400">
                          Residentes / Propietarios
                        </span>
                        {unit.residents.length === 0 ? (
                          <p className="text-slate-400 italic">Sin ocupantes registrados</p>
                        ) : (
                          unit.residents.map((r: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-slate-700">
                              <span className="font-semibold">{r.name}</span>
                              <span className="text-[11px] text-slate-500 font-mono">
                                {r.phone || r.doc}
                              </span>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="space-y-1.5 text-xs pt-1 border-t border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400">
                          Vehículos Autorizados
                        </span>
                        {unit.vehicles.length === 0 ? (
                          <p className="text-slate-400 italic">Sin vehículos</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {unit.vehicles.map((v: any) => (
                              <span
                                key={v.id}
                                className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[11px] font-bold text-slate-800"
                              >
                                {v.plate} ({v.brand} {v.color})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===================================================================== */}
          {/* SUB-PESTAÑA 4: PAQUETERÍA Y CORRESPONDENCIA EN GARITA */}
          {/* ===================================================================== */}
          {activeSubTab === 'packages' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {[
                    { id: 'ALL', label: 'Todos los Paquetes' },
                    { id: 'RECEIVED_AT_GATE', label: `En Garita (${kpis.pendingPackagesCount})` },
                    { id: 'DELIVERED_TO_RESIDENT', label: 'Entregados' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => {
                        setPkgStatusFilter(st.id);
                        loadPackages(st.id, pkgSearch);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        pkgStatusFilter === st.id
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={pkgSearch}
                      onChange={(e) => setPkgSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadPackages(pkgStatusFilter, pkgSearch)}
                      placeholder="Buscar guía, empresa, unidad..."
                      className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 w-56"
                    />
                  </div>
                  {isStaff && (
                    <button
                      onClick={() => setShowPackageModal(true)}
                      className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Recepcionar Paquete</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                {packages.length === 0 ? (
                  <div className="p-10 text-center text-xs sm:text-sm text-slate-400">
                    No hay paquetes ni encomiendas registradas para este filtro.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Inmueble / Destinatario</th>
                          <th className="py-3 px-4">Empresa / Guía</th>
                          <th className="py-3 px-4">PIN de Retiro</th>
                          <th className="py-3 px-4">Recepción en Garita</th>
                          <th className="py-3 px-4">Estado / Entrega</th>
                          <th className="py-3 px-4 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {packages.map((p) => {
                          const isPending = p.status === 'RECEIVED_AT_GATE';
                          return (
                            <tr key={p.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4">
                                <span className="font-bold text-slate-900">Inmueble {p.unitCode}</span>
                                <p className="text-[11px] text-slate-500">
                                  Para: {p.recipientName || 'Propietario / Residente'}
                                </p>
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-bold text-slate-800">{p.courierCompany}</span>
                                <p className="text-[11px] text-slate-500 font-mono">
                                  Guía: {p.trackingNumber || 'S/N'}
                                </p>
                                {p.notes && (
                                  <p className="text-[11px] text-slate-400 italic">{p.notes}</p>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-mono text-xs font-extrabold px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-lg">
                                  {p.pickupPin}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-600">
                                <div>{formatDateTime(p.receivedAt)}</div>
                                <div className="text-[10px] text-slate-400">
                                  Recibió: {p.receivedByGuardName || 'Garita'}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {isPending ? (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">
                                    EN GARITA (POR RETIRAR)
                                  </span>
                                ) : (
                                  <div>
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                                      ENTREGADO
                                    </span>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                      {formatDateTime(p.deliveredAt)} · {p.deliveredToName}
                                    </p>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {isStaff && isPending ? (
                                  <button
                                    onClick={() => {
                                      setDeliveringPackage(p);
                                      setDeliverForm({
                                        pickupPin: p.pickupPin,
                                        deliveredToName: p.recipientName || '',
                                        notes: '',
                                      });
                                    }}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition"
                                  >
                                    Registrar Entrega
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400">—</span>
                                )}
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
        </>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: CONFIGURACIÓN DEL MÓDULO POR CONDOMINIO */}
      {/* ===================================================================== */}
      {showConfigModal && configForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600">
                  Parámetros por Residencia
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  Configuración de Control de Acceso y Garita
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Adapta qué funciones de garita utiliza este condominio según su estructura física.
                </p>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <div>
                  <span className="font-bold text-slate-900 block">
                    Habilitar Módulo de Control de Acceso / Garita
                  </span>
                  <span className="text-slate-500 text-[11px]">
                    Desactívalo si el edificio no cuenta con vigilancia o control de entrada.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={configForm.enabled}
                  onChange={(e) => setConfigForm({ ...configForm, enabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600"
                />
              </label>

              {[
                {
                  key: 'residentVehicles',
                  title: 'Padrón de Residentes y Vehículos',
                  desc: 'Registro de placas, puestos de estacionamiento y tags por apartamento.',
                },
                {
                  key: 'visitorPasses',
                  title: 'Pases Digitales QR / PIN para Visitas y Peatones',
                  desc: 'Permite a los residentes pre-autorizar visitas con código verificable.',
                },
                {
                  key: 'suppliersAndDelivery',
                  title: 'Control de Proveedores, Servicios Públicos y Delivery',
                  desc: 'Registro rápido de motorizados, contratistas, cisternas y técnicos.',
                },
                {
                  key: 'packagesAndMail',
                  title: 'Recepción de Paquetería y Encomiendas en Garita',
                  desc: 'Control de paquetes recibidos con código PIN de retiro de 6 dígitos.',
                },
                {
                  key: 'requireDocNumberOnEntry',
                  title: 'Exigir Cédula / Documento en Entradas Manuales',
                  desc: 'Obliga al operador de garita a anotar el documento de identidad.',
                },
                {
                  key: 'requirePlateForVehicles',
                  title: 'Exigir Placa en Ingresos Vehiculares',
                  desc: 'Obligatorio indicar número de placa cuando el ingreso es con vehículo.',
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <div>
                    <span className="font-semibold text-slate-800 block">{item.title}</span>
                    <span className="text-slate-500 text-[11px]">{item.desc}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={(configForm as any)[item.key]}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, [item.key]: e.target.checked } as AccessControlConfig)
                    }
                    className="w-4 h-4 accent-emerald-600"
                  />
                </label>
              ))}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Máx. Pases Activos por Unidad
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={configForm.maxActivePassesPerUnit}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, maxActivePassesPerUnit: Number(e.target.value) })
                    }
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Vigencia por Defecto (Horas)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={configForm.defaultPassDurationHours}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, defaultPassDurationHours: Number(e.target.value) })
                    }
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSaveConfig()}
                disabled={submitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
              >
                {submitting ? 'Guardando...' : 'Guardar Configuración'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: REGISTRAR ENTRADA EN GARITA (VISITA / DELIVERY / PROVEEDOR) */}
      {/* ===================================================================== */}
      {showCheckInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleManualCheckIn}
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto space-y-4 text-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600">
                  Bitácora de Garita
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  Registrar Entrada (Peatón, Vehículo, Delivery o Proveedor)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCheckInModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Presets rápidos de Delivery / Servicio */}
            <div>
              <span className="block text-[11px] font-bold text-slate-500 mb-1.5">
                Plantillas rápidas (1 clic):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROVIDER_PRESETS.map((p, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() =>
                      setCheckInForm((prev) => ({
                        ...prev,
                        visitorCategory: p.category,
                        companyName: p.company,
                        entryMode: p.mode,
                      }))
                    }
                    className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200 rounded-lg text-[11px] font-semibold transition"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block font-semibold text-slate-700 mb-1">Nombre del Visitante *</label>
                <input
                  type="text"
                  required
                  value={checkInForm.visitorName}
                  onChange={(e) => setCheckInForm({ ...checkInForm, visitorName: e.target.value })}
                  placeholder="Ej: Carlos Pérez"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block font-semibold text-slate-700 mb-1">Cédula / Documento</label>
                <div className="flex gap-1.5">
                  <select
                    value={checkInForm.visitorDocType}
                    onChange={(e) => setCheckInForm({ ...checkInForm, visitorDocType: e.target.value })}
                    className="p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-bold"
                  >
                    <option value="V">V</option>
                    <option value="E">E</option>
                    <option value="J">J</option>
                    <option value="P">P</option>
                  </select>
                  <input
                    type="text"
                    required={config.requireDocNumberOnEntry}
                    value={checkInForm.visitorDocNumber}
                    onChange={(e) => setCheckInForm({ ...checkInForm, visitorDocNumber: e.target.value })}
                    placeholder="20123456"
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Categoría</label>
                <select
                  value={checkInForm.visitorCategory}
                  onChange={(e) => setCheckInForm({ ...checkInForm, visitorCategory: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Modo de Ingreso</label>
                <select
                  value={checkInForm.entryMode}
                  onChange={(e) => setCheckInForm({ ...checkInForm, entryMode: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                >
                  <option value="PEDESTRIAN">Peatonal (A pie)</option>
                  <option value="VEHICLE">Vehicular (Carro / Moto)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Inmueble Destino</label>
                <select
                  value={checkInForm.propertyUnitId}
                  onChange={(e) => setCheckInForm({ ...checkInForm, propertyUnitId: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                >
                  <option value="">Áreas Comunes / Conserjería</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      Inmueble {u.unitCode}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Placa del Vehículo</label>
                <input
                  type="text"
                  value={checkInForm.vehiclePlate}
                  onChange={(e) => setCheckInForm({ ...checkInForm, vehiclePlate: e.target.value.toUpperCase() })}
                  placeholder="Ej: AB123CD"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Empresa / Servicio</label>
                <input
                  type="text"
                  value={checkInForm.companyName}
                  onChange={(e) => setCheckInForm({ ...checkInForm, companyName: e.target.value })}
                  placeholder="Ej: Yummy, Hidrocapital, Fibex..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Autorizado por</label>
                <input
                  type="text"
                  value={checkInForm.authorizedByName}
                  onChange={(e) => setCheckInForm({ ...checkInForm, authorizedByName: e.target.value })}
                  placeholder="Ej: Citófono / Propietario"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Observaciones / Notas de Garita</label>
              <input
                type="text"
                value={checkInForm.notes}
                onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
                placeholder="Detalle de herramientas, maletín, paquete, etc."
                className="w-full p-2.5 border border-slate-300 rounded-xl"
              />
            </div>

            <label className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 cursor-pointer">
              <input
                type="checkbox"
                checked={checkInForm.incidentAlert}
                onChange={(e) => setCheckInForm({ ...checkInForm, incidentAlert: e.target.checked })}
                className="w-4 h-4 accent-rose-600"
              />
              <span className="font-bold">Marcar registro con Alerta / Novedad de Seguridad</span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCheckInModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
              >
                {submitting ? 'Registrando...' : 'Confirmar Entrada'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: GENERAR PASE DE INVITACIÓN QR */}
      {/* ===================================================================== */}
      {showInvitationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleCreateInvitation}
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto space-y-4 text-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600">
                  Pre-autorización Digital
                </span>
                <h3 className="text-lg font-bold text-slate-900">Generar Nuevo Pase de Acceso QR</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInvitationModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Inmueble que Autoriza *</label>
                <select
                  required
                  value={invitationForm.propertyUnitId}
                  onChange={(e) => setInvitationForm({ ...invitationForm, propertyUnitId: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-bold"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      Inmueble {u.unitCode}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Categoría de Visita</label>
                <select
                  value={invitationForm.visitorCategory}
                  onChange={(e) => setInvitationForm({ ...invitationForm, visitorCategory: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">
                  Nombre Completo del Visitante o Proveedor *
                </label>
                <input
                  type="text"
                  required
                  value={invitationForm.visitorName}
                  onChange={(e) => setInvitationForm({ ...invitationForm, visitorName: e.target.value })}
                  placeholder="Ej: María Fernanda Gómez"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cédula / Documento</label>
                <div className="flex gap-1.5">
                  <select
                    value={invitationForm.visitorDocType}
                    onChange={(e) => setInvitationForm({ ...invitationForm, visitorDocType: e.target.value })}
                    className="p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-bold"
                  >
                    <option value="V">V</option>
                    <option value="E">E</option>
                    <option value="J">J</option>
                  </select>
                  <input
                    type="text"
                    value={invitationForm.visitorDocNumber}
                    onChange={(e) => setInvitationForm({ ...invitationForm, visitorDocNumber: e.target.value })}
                    placeholder="18543210"
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Modo de Ingreso</label>
                <select
                  value={invitationForm.entryMode}
                  onChange={(e) => setInvitationForm({ ...invitationForm, entryMode: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                >
                  <option value="PEDESTRIAN">Peatonal</option>
                  <option value="VEHICLE">Con Vehículo</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Placa Vehículo (Opcional)</label>
                <input
                  type="text"
                  value={invitationForm.visitorPlate}
                  onChange={(e) =>
                    setInvitationForm({ ...invitationForm, visitorPlate: e.target.value.toUpperCase() })
                  }
                  placeholder="AB123CD"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Empresa (Si aplica)</label>
                <input
                  type="text"
                  value={invitationForm.companyName}
                  onChange={(e) => setInvitationForm({ ...invitationForm, companyName: e.target.value })}
                  placeholder="Ej: Yummy, Técnico A/A..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Vigencia (Horas)</label>
                <select
                  value={invitationForm.validUntilHours}
                  onChange={(e) =>
                    setInvitationForm({ ...invitationForm, validUntilHours: Number(e.target.value) })
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                >
                  <option value={4}>4 horas (Delivery / Visita corta)</option>
                  <option value={12}>12 horas (Mismo día)</option>
                  <option value={24}>24 horas (1 día)</option>
                  <option value={72}>72 horas (Fin de semana)</option>
                  <option value={168}>7 días (Familiar / Contratista)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cantidad de Usos Permitidos</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={invitationForm.maxUses}
                  onChange={(e) => setInvitationForm({ ...invitationForm, maxUses: Number(e.target.value) })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Instrucciones para Garita</label>
              <input
                type="text"
                value={invitationForm.notes}
                onChange={(e) => setInvitationForm({ ...invitationForm, notes: e.target.value })}
                placeholder="Ej: Autorizado a estacionar en puesto de visitantes"
                className="w-full p-2.5 border border-slate-300 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowInvitationModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold"
              >
                {submitting ? 'Generando...' : 'Crear Pase Digital'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: REGISTRAR / EDITAR VEHÍCULO DE RESIDENTE */}
      {/* ===================================================================== */}
      {showVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleSaveVehicle}
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto space-y-4 text-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600">
                  Padrón Vehicular
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingVehicle ? 'Editar Vehículo Registrado' : 'Registrar Vehículo de Residente'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowVehicleModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {!editingVehicle && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Inmueble *</label>
                  <select
                    required
                    value={vehicleForm.propertyUnitId}
                    onChange={(e) => setVehicleForm({ ...vehicleForm, propertyUnitId: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-bold"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        Inmueble {u.unitCode}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Placa *</label>
                <input
                  type="text"
                  required
                  value={vehicleForm.plate}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, plate: e.target.value.toUpperCase() })}
                  placeholder="Ej: AA987BB"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono uppercase font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tipo de Vehículo</label>
                <select
                  value={vehicleForm.vehicleType}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleType: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-semibold"
                >
                  {Object.entries(VEHICLE_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Marca *</label>
                <input
                  type="text"
                  required
                  value={vehicleForm.brand}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })}
                  placeholder="Ej: Toyota"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Modelo *</label>
                <input
                  type="text"
                  required
                  value={vehicleForm.model}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                  placeholder="Ej: Corolla"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Color *</label>
                <input
                  type="text"
                  required
                  value={vehicleForm.color}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })}
                  placeholder="Ej: Plata"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Puesto Asignado</label>
                <input
                  type="text"
                  value={vehicleForm.parkingSpot}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, parkingSpot: e.target.value })}
                  placeholder="Ej: E-14"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tag / Sticker / Control</label>
                <input
                  type="text"
                  value={vehicleForm.tagCode}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, tagCode: e.target.value })}
                  placeholder="Ej: TAG-0031"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Conductor Habitual</label>
                <input
                  type="text"
                  value={vehicleForm.ownerName}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, ownerName: e.target.value })}
                  placeholder="Nombre del propietario o residente"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowVehicleModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold"
              >
                {submitting ? 'Guardando...' : 'Guardar Vehículo'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: RECEPCIONAR PAQUETE EN GARITA */}
      {/* ===================================================================== */}
      {showPackageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleReceivePackage}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600">
                  Correspondencia y Encomiendas
                </span>
                <h3 className="text-lg font-bold text-slate-900">Recepcionar Paquete en Garita</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPackageModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Inmueble Destino *</label>
                <select
                  required
                  value={packageForm.propertyUnitId}
                  onChange={(e) => setPackageForm({ ...packageForm, propertyUnitId: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-bold"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      Inmueble {u.unitCode}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Empresa de Encomienda / Courier *</label>
                <input
                  type="text"
                  required
                  value={packageForm.courierCompany}
                  onChange={(e) => setPackageForm({ ...packageForm, courierCompany: e.target.value })}
                  placeholder="MRW, Zoom, Tealca, MercadoLibre..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">N° de Guía / Tracking</label>
                <input
                  type="text"
                  value={packageForm.trackingNumber}
                  onChange={(e) => setPackageForm({ ...packageForm, trackingNumber: e.target.value })}
                  placeholder="Ej: MRW-9948210"
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre del Destinatario</label>
                <input
                  type="text"
                  value={packageForm.recipientName}
                  onChange={(e) => setPackageForm({ ...packageForm, recipientName: e.target.value })}
                  placeholder="Nombre impreso en la guía"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observaciones</label>
                <input
                  type="text"
                  value={packageForm.notes}
                  onChange={(e) => setPackageForm({ ...packageForm, notes: e.target.value })}
                  placeholder="Ej: Caja mediana sellada"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPackageModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold"
              >
                {submitting ? 'Registrando...' : 'Generar PIN y Recepcionar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 6: ENTREGAR PAQUETE AL RESIDENTE */}
      {/* ===================================================================== */}
      {deliveringPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleDeliverPackage}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 text-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600">
                  Certificación de Retiro
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  Entregar Paquete · Inmueble {deliveringPackage.unitCode}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeliveringPackage(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">PIN de Retiro (6 dígitos)</label>
                <input
                  type="text"
                  value={deliverForm.pickupPin}
                  onChange={(e) => setDeliverForm({ ...deliverForm, pickupPin: e.target.value })}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Retirado por *</label>
                <input
                  type="text"
                  required
                  value={deliverForm.deliveredToName}
                  onChange={(e) => setDeliverForm({ ...deliverForm, deliveredToName: e.target.value })}
                  placeholder="Nombre y apellido de quien retira"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeliveringPackage(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
              >
                {submitting ? 'Confirmando...' : 'Confirmar Entrega'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
