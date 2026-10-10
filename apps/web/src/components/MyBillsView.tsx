'use client';

import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Building2,
  RefreshCw,
  Smartphone,
  ArrowDownRight,
  Globe,
  CheckCircle2,
  X,
  Landmark,
  AlertTriangle,
  Clock,
  Wallet,
  Home,
  Eye,
} from 'lucide-react';
import { fetchWithAuth } from '../lib/api';
import { usd, ves, toNum, bcvRateNum } from '../lib/format';
import { BillDetailModal } from './BillDetailModal';

interface MyBillsViewProps {
  bcvRate: string;
}

/**
 * Portal del propietario (Fase 1): lista los recibos del usuario en todas sus
 * residencias, con su estado (PAGADO / PARCIAL / PENDIENTE / MOROSO) y un
 * botón para reportar el pago (Pago Móvil / Transferencia / Zelle). El
 * backend valida que solo se reporten pagos de los propios inmuebles.
 */

const STATUS_META: Record<string, { label: string; className: string }> = {
  PAID: { label: 'PAGADO', className: 'bg-emerald-100 text-emerald-800' },
  PARTIAL: { label: 'PARCIAL', className: 'bg-amber-100 text-amber-800' },
  PENDING: { label: 'POR PAGAR', className: 'bg-sky-100 text-sky-800' },
  OVERDUE: { label: 'MOROSO', className: 'bg-rose-100 text-rose-800' },
  CANCELLED: { label: 'ANULADO', className: 'bg-slate-100 text-slate-500' },
};

const METHODS = [
  { id: 'PAGO_MOVIL', label: 'Pago Móvil', icon: Smartphone, currency: 'VES' },
  { id: 'TRANSFER_VES', label: 'Transferencia', icon: ArrowDownRight, currency: 'VES' },
  { id: 'ZELLE', label: 'Zelle', icon: Globe, currency: 'USD' },
] as const;

type MethodId = (typeof METHODS)[number]['id'];

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] || { label: status, className: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

interface ReportTarget {
  condo: any;
  unit: any;
  bill: any;
}

/** Modal de doble propósito: reportar el pago o mostrar el resultado. */
function ReportPaymentModal({
  target,
  bcvRate,
  onClose,
  onReported,
}: {
  target: ReportTarget;
  bcvRate: string;
  onClose: () => void;
  onReported: () => void;
}) {
  const { condo, unit, bill } = target;
  const accounts: any[] = condo.bankAccounts || [];

  const [method, setMethod] = useState<MethodId>('PAGO_MOVIL');
  const [bankAccountId, setBankAccountId] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayStr());
  const [amount, setAmount] = useState<string>(String(bill.remainingUsd ?? ''));
  const [originBank, setOriginBank] = useState('');
  const [originPhone, setOriginPhone] = useState('');
  const [originDocNumber, setOriginDocNumber] = useState('');
  const [originEmail, setOriginEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (accounts.length === 1) setBankAccountId(accounts[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const methodMeta = METHODS.find((m) => m.id === method)!;
  const currency = methodMeta.currency;
  const isVes = currency === 'VES';

  const rate = bcvRateNum(bcvRate);
  const amt = toNum(amount);
  const equivalentUsd =
    method === 'ZELLE' ? amt : rate !== null && amt !== null ? amt / rate : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankAccountId) {
      setError('Selecciona la cuenta receptora de la residencia.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: any = {
        condoId: condo.id,
        propertyUnitId: unit.id,
        bankAccountId,
        paymentMethod: method === 'ZELLE' ? 'ZELLE' : method === 'TRANSFER_VES' ? 'TRANSFER_VES' : 'PAGO_MOVIL',
        referenceNumber: referenceNumber.trim(),
        paymentDate,
        amountPaid: Number(amount),
        currency,
        billingPeriodId: bill.periodId,
      };
      if (originBank.trim()) payload.originBank = originBank.trim();
      if (originPhone.trim()) payload.originPhone = originPhone.trim();
      if (originDocNumber.trim()) payload.originDocNumber = originDocNumber.trim();
      if (originEmail.trim()) payload.originEmail = originEmail.trim();

      const res = await fetchWithAuth('/payments/report', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'No se pudo reportar el pago. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  // Resultado: pantalla de confirmación con el mensaje del backend.
  if (result) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-slate-900 text-lg">¡Pago reportado!</h3>
            <p className="text-sm text-slate-600 mt-2">
              {result.message ||
                (result.isAutoReconciled
                  ? 'Conciliado automáticamente con el extracto bancario.'
                  : 'Pendiente de validación por la administración.')}
            </p>
            <button
              onClick={onReported}
              className="mt-5 px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div>
            <h3 className="font-bold text-slate-900">Reportar pago</h3>
            <p className="text-[11px] text-slate-500">
              {unit.unitCode}
              {unit.buildingName ? ` · ${unit.buildingName}` : ''} · {bill.periodLabel} · {condo.name}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Saldo a cubrir */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <span className="text-slate-600 font-medium flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              Saldo del recibo
            </span>
            <span className="font-bold text-slate-900 text-base">{usd(bill.remainingUsd)}</span>
          </div>

          {/* Método de pago */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">¿Cómo realizaste el pago?</label>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => {
                const Icon = m.icon;
                const active = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 transition ${
                      active
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-semibold text-[11px]">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Campos dinámicos según el método */}
          {method === 'PAGO_MOVIL' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Banco Emisor (Pago Móvil)</label>
                <input
                  type="text"
                  placeholder="Ej: Banesco, BBVA, Mercantil…"
                  value={originBank}
                  onChange={(e) => setOriginBank(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Teléfono Emisor</label>
                <input
                  type="text"
                  required
                  placeholder="0414-1234567"
                  value={originPhone}
                  onChange={(e) => setOriginPhone(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cédula o RIF</label>
                <input
                  type="text"
                  required
                  placeholder="V-12345678"
                  value={originDocNumber}
                  onChange={(e) => setOriginDocNumber(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                />
              </div>
            </div>
          )}

          {method === 'TRANSFER_VES' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Banco Origen</label>
                <input
                  type="text"
                  placeholder="Ej: Provincial"
                  value={originBank}
                  onChange={(e) => setOriginBank(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cuenta o Cédula Origen</label>
                <input
                  type="text"
                  required
                  placeholder="0134-…"
                  value={originDocNumber}
                  onChange={(e) => setOriginDocNumber(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                />
              </div>
            </div>
          )}

          {method === 'ZELLE' && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email asociado a Zelle (emisor)</label>
              <input
                type="email"
                required
                placeholder="correo.pagador@gmail.com"
                value={originEmail}
                onChange={(e) => setOriginEmail(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
              />
              <span className="text-[10px] text-slate-400">
                Zelle se paga en USD; no se convierte con la tasa BCV.
              </span>
            </div>
          )}

          {/* Cuenta receptora de la residencia */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Cuenta que recibe el pago</label>
            <select
              required
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
            >
              <option value="">Selecciona la cuenta…</option>
              {accounts.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.bank_name} · ***{String(a.account_number).slice(-4)} ({a.currency})
                </option>
              ))}
            </select>
            {accounts.length === 0 && (
              <span className="flex items-center gap-1 text-[10px] text-amber-600 mt-1">
                <AlertTriangle className="w-3 h-3" />
                Esta residencia aún no tiene cuenta receptora registrada.
              </span>
            )}
          </div>

          {/* Referencia y fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Número de Referencia</label>
              <input
                type="text"
                required
                placeholder="Ej: 99482103"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Fecha del pago</label>
              <input
                type="date"
                required
                value={paymentDate}
                max={todayStr()}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
              />
            </div>
          </div>

          {/* Monto + equivalente */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Monto {isVes ? 'en Bolívares (Bs.)' : 'en USD ($)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Equivalente en USD</label>
              <div className="w-full bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-emerald-900 font-bold font-mono">
                {equivalentUsd === null ? (
                  <span className="text-slate-500 font-normal">
                    {isVes && rate === null ? 'Tasa BCV no disponible' : 'Indica el monto'}
                  </span>
                ) : (
                  usd(equivalentUsd)
                )}
              </div>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            El sistema valida la referencia contra duplicados y aplica el pago a tu deuda pendiente
            más antigua. El recibo seleccionado ({bill.periodLabel}) queda vinculado para la
            conciliación de la administración.
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium flex items-start gap-2">
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || (isVes && rate === null)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Reportando…' : 'Reportar pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function MyBillsView({ bcvRate }: MyBillsViewProps) {
  const [data, setData] = useState<{ summary: any; condos: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const [detailTarget, setDetailTarget] = useState<ReportTarget | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/payments/my-bills');
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar tus recibos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Home className="w-6 h-6 text-emerald-600" />
            Mis Recibos
          </h1>
          <p className="text-sm text-slate-500">
            Tu historial de cuotas en todas tus residencias: montos, estados y reporte de pago.
          </p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Resumen del propietario */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Deuda total</p>
            <p className="text-xl font-bold text-rose-600 mt-1">{usd(summary.totalDebtUsd)}</p>
            <p className="text-[11px] text-slate-400">cuotas por {usd(summary.totalDueUsd)} emitidas</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Recibos abiertos</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{summary.openBills}</p>
            <p className="text-[11px] text-slate-400">{summary.unitsCount} inmueble(s) asignado(s)</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Residencias</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{summary.condosCount}</p>
            <p className="text-[11px] text-slate-400">conectadas a tu cuenta</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Pagos en validación</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{summary.pendingPayments}</p>
            <p className="text-[11px] text-slate-400">pendientes de conciliar</p>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-10 text-center text-sm text-slate-400">
          Cargando tus recibos…
        </div>
      )}

      {!loading && data && data.condos.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-10 text-center">
          <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="font-bold text-slate-800">No tienes inmuebles asignados</h2>
          <p className="text-sm text-slate-500 mt-1">
            Cuando la administración te asigne una unidad, aquí verás tus recibos y podrás reportar tus pagos.
          </p>
        </div>
      )}

      {/* Por residencia */}
      {data?.condos.map((condo: any) => (
        <div key={condo.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          {/* Encabezado de la residencia */}
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black">
                {String(condo.name || 'RC').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  {condo.name}
                </h3>
                <p className="text-[11px] text-slate-400">
                  RIF {condo.rif || '—'} · {condo.units.length} inmueble(s)
                </p>
              </div>
            </div>
            {condo.bankAccounts.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                <AlertTriangle className="w-3 h-3" />
                Sin cuenta receptora
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                <Landmark className="w-3 h-3" />
                {condo.bankAccounts.length} cuenta(s) receptora(s)
              </span>
            )}
          </div>

          {/* Unidades y recibos */}
          {condo.units.map((unit: any) => (
            <div key={unit.id} className="border-b border-slate-50 last:border-0">
              <div className="px-5 pt-3 pb-1 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-700">
                  Unidad {unit.unitCode}
                  {unit.buildingName ? ` · ${unit.buildingName}` : ''}
                  {unit.floor !== null && unit.floor !== undefined ? ` · Piso ${unit.floor}` : ''}
                </p>
                <p className="text-[11px] text-slate-400">
                  Saldo pendiente: <span className="font-bold text-rose-600">{usd(unit.balanceUsd)}</span>
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50/70 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2 px-5">Período</th>
                      <th className="py-2 px-3">Vence</th>
                      <th className="py-2 px-3 text-right">Total recibo</th>
                      <th className="py-2 px-3 text-right">Pagado</th>
                      <th className="py-2 px-3 text-right">Saldo</th>
                      <th className="py-2 px-3 text-center">Estado</th>
                      <th className="py-2 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {unit.bills.map((bill: any) => {
                      const canPay = bill.remainingUsd > 0.004 && bill.status !== 'CANCELLED';
                      return (
                        <tr key={bill.billId} className="hover:bg-slate-50/60 transition">
                          <td className="py-3 px-5">
                            <div className="font-semibold text-slate-900">{bill.periodLabel || '—'}</div>
                            {bill.pendingPayments > 0 && (
                              <div className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3" />
                                {bill.pendingPayments} pago(s) en validación
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {bill.dueDate ? new Date(bill.dueDate).toLocaleDateString('es-VE') : '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">{usd(bill.totalDueUsd)}</td>
                          <td className="py-3 px-3 text-right font-mono text-emerald-700">{usd(bill.totalPaidUsd)}</td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">{usd(bill.remainingUsd)}</td>
                          <td className="py-3 px-3 text-center">
                            <StatusBadge status={bill.status} />
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setDetailTarget({ condo, unit, bill })}
                                title="Ver el detalle completo del recibo"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-500 hover:text-emerald-700 hover:border-emerald-300 rounded-lg text-[11px] font-semibold transition"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Ver recibo
                              </button>
                              {canPay && (
                                <button
                                  onClick={() => setTarget({ condo, unit, bill })}
                                  disabled={condo.bankAccounts.length === 0}
                                  title={
                                    condo.bankAccounts.length === 0
                                      ? 'Esta residencia no tiene cuenta receptora'
                                      : 'Reportar el pago de este recibo'
                                  }
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold transition disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                                >
                                  Reportar pago
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
            </div>
          ))}
        </div>
      ))}

      {target && (
        <ReportPaymentModal
          target={target}
          bcvRate={bcvRate}
          onClose={() => setTarget(null)}
          onReported={() => {
            setTarget(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {detailTarget && (
        <BillDetailModal
          bill={{
            id: detailTarget.bill.billId,
            condo_id: detailTarget.condo.id,
            billing_period_id: detailTarget.bill.periodId,
            // Mapeo (camelCase → snake_case) para el render inmediato;
            // al llegar el detalle del backend se sobrescriben los campos.
            period_month: detailTarget.bill.periodMonth,
            period_year: detailTarget.bill.periodYear,
            unit_code: detailTarget.unit.unitCode,
            total_due_usd: detailTarget.bill.totalDueUsd,
            total_paid_usd: detailTarget.bill.totalPaidUsd,
            remaining_balance_usd: detailTarget.bill.remainingUsd,
            status: detailTarget.bill.status,
            condo_name: detailTarget.condo.name,
          }}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}
