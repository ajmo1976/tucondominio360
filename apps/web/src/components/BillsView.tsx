'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Eye,
  Calendar,
  ArrowLeft,
  ChevronRight,
  Zap,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Building,
  DollarSign,
  X,
} from 'lucide-react';
import { BillDetailModal } from './BillDetailModal';
import { fetchWithAuth } from '../lib/api';
import { usd, bcvRate as fmtBcv } from '../lib/format';
import { useCondoReserveFundRate, formatReserveFundRate } from '../lib/useCondoReserveFundRate';

interface BillsViewProps {
  bcvRate: string;
  condoId: string;
}

export function BillsView({ bcvRate, condoId }: BillsViewProps) {
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<any | null>(null);
  const [periodBills, setPeriodBills] = useState<any[]>([]);
  const [selectedBillForModal, setSelectedBillForModal] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showNewPeriodModal, setShowNewPeriodModal] = useState(false);

  // % del Fondo de Reserva tomado de la definición de la residencia (nunca cableado)
  const reserveFundRate = useCondoReserveFundRate(condoId);
  const reserveFundRateLabel = formatReserveFundRate(reserveFundRate);

  // Formulario nuevo periodo mensual.
  // Las fechas por defecto se derivan del mes siguiente al actual, no de un
  // mes fijo cableado: el próximo período siempre es el que corresponde.
  const defaultPeriod = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 2; // mes actual + 1
    const year = m > 12 ? y + 1 : y;
    const month = m > 12 ? m - 12 : m;
    const lastDay = new Date(year, month, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      periodYear: year,
      periodMonth: month,
      startDate: `${year}-${pad(month)}-01`,
      endDate: `${year}-${pad(month)}-${pad(lastDay)}`,
      issueDate: `${year}-${pad(month)}-05`,
      dueDate: `${year}-${pad(month)}-${pad(Math.min(15, lastDay))}`,
    };
  })();

  const [newPeriodForm, setNewPeriodForm] = useState({
    ...defaultPeriod,
    // Sin tasa cableada: se toma la BCV vigente, y si aún no está disponible
    // el backend la resuelve al crear el período.
    bcvExchangeRate: Number(bcvRate) || 0,
  });

  const loadPeriods = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/billing/condos/${condoId}/periods`);
      if (Array.isArray(res)) setPeriods(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Al cambiar de residencia se limpia el período Y los recibos del período:
    // sin esto los recibos de la residencia anterior quedan en memoria y
    // pueden mostrarse bajo el encabezado de la nueva (mezcla de datos).
    setSelectedPeriod(null);
    setPeriodBills([]);
    loadPeriods();
  }, [condoId]);

  // Al hacer clic en un recibo mensual, cargamos el detalle de todos sus inmuebles
  const handleSelectPeriod = async (period: any) => {
    setSelectedPeriod(period);
    setLoading(true);
    try {
      const billsRes = await fetchWithAuth(`/billing/condos/${condoId}/bills?periodId=${period.id}`);
      if (Array.isArray(billsRes)) setPeriodBills(billsRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Recalcular y gestar alícuotas para el período seleccionado
  const handleCalculatePeriod = async () => {
    if (!selectedPeriod) return;
    setCalculating(true);
    setNotification(null);
    try {
      const res = await fetchWithAuth(`/billing/periods/${selectedPeriod.id}/calculate`, {
        method: 'POST',
      });
      setNotification({
        message: `¡Recibo recalculado con éxito! Total: $${res.grandTotalUsd} USD distribuidos en ${res.unitsCount} inmuebles.`,
        type: 'success',
      });
      // Recargar períodos y facturas del período
      loadPeriods();
      const updatedBills = await fetchWithAuth(`/billing/condos/${condoId}/bills?periodId=${selectedPeriod.id}`);
      if (Array.isArray(updatedBills)) setPeriodBills(updatedBills);
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error al recalcular recibos',
        type: 'error',
      });
    } finally {
      setCalculating(false);
    }
  };

  const handleCreateNewPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchWithAuth(`/billing/condos/${condoId}/periods`, {
        method: 'POST',
        body: JSON.stringify(newPeriodForm),
      });
      setShowNewPeriodModal(false);
      loadPeriods();
      setNotification({
        message: `¡Nuevo período mensual aperturado con éxito!`,
        type: 'success',
      });
    } catch (err: any) {
      setNotification({
        message: err.message || 'Error al aperturar período',
        type: 'error',
      });
    }
  };

  const getMonthName = (m: number) => {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return months[m - 1] || `Mes ${m}`;
  };

  return (
    <div className="space-y-6">
      {/* --------------------------------------------------------------------- */}
      {/* VISTA 1: LISTADO DE RECIBOS MENSUALES (Al pinchar Gestación de Recibos) */}
      {/* --------------------------------------------------------------------- */}
      {!selectedPeriod ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Gestación de Recibos</h1>
              <p className="text-sm text-slate-500">
                Selecciona el recibo del mes para ver el detalle de todos los inmuebles y sus cuotas.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={loadPeriods}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                title="Actualizar recibos"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowNewPeriodModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Aperturar Nuevo Mes</span>
              </button>
            </div>
          </div>

          {notification && (
            <div
              className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                notification.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
              <span>{notification.message}</span>
            </div>
          )}

          {/* Listado de Recibos del Mes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {periods.map((p) => {
              const monthName = getMonthName(p.period_month);
              const isClosed = p.status === 'CLOSED';
              const grandTotal = Number(p.grand_total_usd || 0);
              const grandTotalVes = Number(p.grand_total_ves || 0);

              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectPeriod(p)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectPeriod(p); }}
                  className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm hover:border-emerald-500 hover:shadow-md transition cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-sm group-hover:bg-emerald-600 group-hover:text-white transition">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-400 block">
                            Recibo N° {p.period_year}-{String(p.period_month).padStart(2, '0')}
                          </span>
                          <h3 className="font-bold text-slate-900 text-lg group-hover:text-emerald-700 transition">
                            Mes de {monthName} {p.period_year}
                          </h3>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                          isClosed
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isClosed ? 'CERRADO' : 'ACTIVO / EMITIDO'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 text-xs text-slate-600">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Gastos Ordinarios:</span>
                        <span className="font-semibold text-slate-800 font-mono">
                          {usd(p.total_ordinary_usd)} USD
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Gastos Extraordinarios:</span>
                        <span className="font-semibold text-amber-800 font-mono">
                          {usd(p.total_extraordinary_usd)} USD
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">
                          Fondo de Reserva ({reserveFundRateLabel}%):
                        </span>
                        <span className="font-semibold text-slate-800 font-mono">
                          {usd(p.reserve_fund_usd)} USD
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Tasa Oficial BCV:</span>
                        <span className="font-semibold text-emerald-800 font-mono">
                          Bs. {fmtBcv(p.bcv_exchange_rate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Gran Total del Mes</span>
                      <p className="text-xl font-black text-slate-900 font-mono">${grandTotal.toFixed(2)} USD</p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        ≈ Bs. {grandTotalVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    <div className="flex items-center text-xs font-bold text-emerald-600 group-hover:translate-x-1 transition gap-1">
                      <span>
                        Ver Detalle de Inmuebles ({Number(p.total_bills_count || 0)} Aptos)
                      </span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* --------------------------------------------------------------------- */
        /* VISTA 2: DETALLE DE TODOS LOS INMUEBLES DEL RECIBO DEL MES              */
        /* --------------------------------------------------------------------- */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Barra Superior con Botón Volver */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setSelectedPeriod(null)}
                className="p-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 shadow-sm transition flex items-center gap-1.5 text-xs font-semibold"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver a Recibos Mensuales</span>
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Detalle de Inmuebles · Recibo N° {selectedPeriod.period_year}-{String(selectedPeriod.period_month).padStart(2, '0')}
                </h1>
                <p className="text-xs text-slate-500">
                  Mes de {getMonthName(selectedPeriod.period_month)} {selectedPeriod.period_year} · Tasa BCV: Bs. {Number(selectedPeriod.bcv_exchange_rate).toFixed(4)} / USD
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleCalculatePeriod}
                disabled={calculating}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-2"
              >
                <Zap className={`w-4 h-4 ${calculating ? 'animate-spin' : ''}`} />
                <span>{calculating ? 'Recalculando...' : '⚡ Recalcular Alícuotas de este Mes'}</span>
              </button>
            </div>
          </div>

          {notification && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{notification.message}</span>
            </div>
          )}

          {/* Resumen del Recibo del Mes */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px] uppercase font-semibold">1. Gastos Ordinarios</span>
              <span className="text-base font-bold text-white font-mono">
                {usd(selectedPeriod.total_ordinary_usd)} USD
              </span>
            </div>
            <div>
              <span className="text-amber-400 block text-[11px] uppercase font-semibold">2. Gastos Extraordinarios</span>
              <span className="text-base font-bold text-amber-300 font-mono">
                {usd(selectedPeriod.total_extraordinary_usd)} USD
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px] uppercase font-semibold">
                3. Fondo de Reserva ({reserveFundRateLabel}%)
              </span>
              <span className="text-base font-bold text-white font-mono">
                {usd(selectedPeriod.reserve_fund_usd)} USD
              </span>
            </div>
            <div>
              <span className="text-emerald-400 block text-[11px] uppercase font-semibold">Total a Repartir</span>
              <span className="text-base font-black text-emerald-300 font-mono">
                {usd(selectedPeriod.grand_total_usd)} USD
              </span>
            </div>
          </div>

          {/* Tabla de Todos los Inmuebles para este Recibo */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">N° Recibo Individual</th>
                    <th className="py-3 px-4">Inmueble / Torre</th>
                    <th className="py-3 px-4 text-center">Alícuota Legal</th>
                    <th className="py-3 px-4 text-right">Cuota Ordinaria</th>
                    <th className="py-3 px-4 text-right">Cuota Extraord.</th>
                    <th className="py-3 px-4 text-right">Fondo Reserva</th>
                    <th className="py-3 px-4 text-right">Total ($ USD)</th>
                    <th className="py-3 px-4 text-right">Total (Bs.)</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-center">Aviso Digital</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periodBills.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {b.bill_number}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{b.unit_code}</div>
                        <div className="text-[11px] text-slate-400">
                          {[
                            b.building_name || null,
                            b.floor !== null && b.floor !== undefined && b.floor !== ''
                              ? `Piso ${b.floor}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-emerald-800">
                        {Number(b.aliquot_percentage).toFixed(5)}%
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-800">
                        {usd(b.ordinary_share_usd)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-amber-800">
                        {usd(b.extraordinary_share_usd)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                        {usd(b.reserve_fund_usd)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 font-mono">
                        ${Number(b.total_due_usd).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700 font-medium">
                        Bs. {Number(b.total_due_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {b.status === 'PAID' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            PAGADO
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            POR COBRAR
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => setSelectedBillForModal(b)}
                          className="inline-flex items-center px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                          <span>Ver Aviso</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Aviso Individual */}
      {selectedBillForModal && (
        <BillDetailModal bill={selectedBillForModal} onClose={() => setSelectedBillForModal(null)} />
      )}

      {/* Modal Aperturar Nuevo Mes */}
      {showNewPeriodModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="font-bold text-slate-900 text-base">Aperturar Nuevo Mes de Cobro</h3>
              <button onClick={() => setShowNewPeriodModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewPeriod} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Año</label>
                  <input
                    type="number"
                    required
                    value={newPeriodForm.periodYear}
                    onChange={(e) => setNewPeriodForm({ ...newPeriodForm, periodYear: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mes</label>
                  <select
                    value={newPeriodForm.periodMonth}
                    onChange={(e) => setNewPeriodForm({ ...newPeriodForm, periodMonth: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-bold"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>{getMonthName(m)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tasa Oficial BCV de Cierre (Bs./USD)</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={newPeriodForm.bcvExchangeRate}
                  onChange={(e) => setNewPeriodForm({ ...newPeriodForm, bcvExchangeRate: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha Emisión</label>
                  <input
                    type="date"
                    required
                    value={newPeriodForm.issueDate}
                    onChange={(e) => setNewPeriodForm({ ...newPeriodForm, issueDate: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha Vencimiento</label>
                  <input
                    type="date"
                    required
                    value={newPeriodForm.dueDate}
                    onChange={(e) => setNewPeriodForm({ ...newPeriodForm, dueDate: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewPeriodModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm"
                >
                  Aperturar Período
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
