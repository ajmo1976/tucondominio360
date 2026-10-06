'use client';

import React, { useState } from 'react';
import {
  TrendingUp,
  CheckCircle2,
  Building,
  PiggyBank,
  Smartphone,
  CreditCard,
  Plus,
  Landmark,
  Edit,
  Trash2,
} from 'lucide-react';
import { AddBankAccountModal } from './AddBankAccountModal';
import { fetchWithAuth } from '../lib/api';
import { toNum, usd, bcvRateNum } from '../lib/format';
import { useCondoReserveFundRate, formatReserveFundRate } from '../lib/useCondoReserveFundRate';

interface DashboardViewProps {
  condo: any;
  summary: any;
  bcvRate: string;
  bankAccounts: any[];
  onRefreshCondoData: () => void;
}

export function DashboardView({
  condo,
  summary,
  bcvRate,
  bankAccounts,
  onRefreshCondoData,
}: DashboardViewProps) {
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [selectedAccountForEdit, setSelectedAccountForEdit] = useState<any | null>(null);
  const [accounts, setAccounts] = useState<any[]>(bankAccounts || []);

  // % del Fondo de Reserva tomado de la definición de la residencia (nunca cableado)
  const reserveFundRate = useCondoReserveFundRate(condo?.id);

  const loadAccounts = React.useCallback(async () => {
    if (condo?.id) {
      try {
        const res = await fetchWithAuth(`/condos/${condo.id}/bank-accounts`);
        if (Array.isArray(res)) setAccounts(res);
      } catch (err) {
        console.error(err);
      }
    }
  }, [condo?.id]);

  React.useEffect(() => {
    loadAccounts();
  }, [loadAccounts, bankAccounts]);

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta cuenta receptora?')) return;
    try {
      await fetchWithAuth(`/condos/bank-accounts/${accountId}`, {
        method: 'DELETE',
      });
      loadAccounts();
      onRefreshCondoData();
    } catch (err) {
      console.error(err);
    }
  };

  // Tasa BCV vigente; si no hay, el equivalente en Bs. no se inventa.
  const rateNum = bcvRateNum(bcvRate);
  const grandTotalUsd = toNum(summary?.latestBillingPeriod?.grand_total_usd);
  const grandTotalVes =
    rateNum !== null && grandTotalUsd !== null
      ? (grandTotalUsd * rateNum).toLocaleString('es-VE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;

  const totalOrdinaryUsd = Number(
    summary?.latestBillingPeriod?.total_ordinary_usd ?? (summary?.latestBillingPeriod?.total_common_usd || 0),
  );
  const totalExtraordinaryUsd = Number(summary?.latestBillingPeriod?.total_extraordinary_usd || 0);
  const reserveFundUsd = Number(summary?.latestBillingPeriod?.reserve_fund_usd || 0);
  const totalUnits = summary?.overview?.total_units || 0;
  // Suma de alícuotas: se muestra la real. Antes caía a '100.00000' fijo,
  // que ocultaba un reparto de alícuotas que no cuadraba.
  const totalAliquots = summary?.overview?.total_aliquots ?? '—';
  const totalDebtUsd = Number(summary?.overview?.total_debt_usd || 0);

  return (
    <div className="space-y-6">
      {/* Título y Subtítulo Dinámicos del Condominio Seleccionado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard General</h1>
          <p className="text-sm text-slate-500">
            Resumen financiero y operativo de{' '}
            <span className="font-bold text-slate-800">{condo?.name || 'Residencias'}</span>{' '}
            (RIF: {condo?.rif || '—'} · {[condo?.city, condo?.state].filter(Boolean).join(', ') || '—'}).
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-full flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Período Activo: {summary?.latestBillingPeriod ? `Mes ${summary.latestBillingPeriod.period_month} / ${summary.latestBillingPeriod.period_year}` : 'Octubre 2026'}
          </span>
        </div>
      </div>

      {/* Tarjetas KPI propias de este Condominio */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Recaudación Total Proyectada */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Facturación Mensual</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{usd(grandTotalUsd)}</div>
          <div className="text-xs font-medium text-emerald-600 mt-1 flex items-center">
            {grandTotalVes !== null ? (
              <>
                <span>≈ Bs. {grandTotalVes}</span>
                <span className="text-slate-400 ml-1 text-[11px]">(Tasa BCV)</span>
              </>
            ) : (
              <span className="text-slate-400 text-[11px]">Tasa BCV no disponible</span>
            )}
          </div>
        </div>

        {/* Morosidad */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Morosidad Total</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">${totalDebtUsd.toFixed(2)}</div>
          <div className="text-xs font-medium text-blue-600 mt-1 flex items-center">
            <span>{totalDebtUsd === 0 ? '0% de mora (100% al día)' : `Deuda pendiente`}</span>
          </div>
        </div>

        {/* Alícuotas Registradas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Catastro Inmuebles</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Building className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalUnits} Inmuebles</div>
          <div className="text-xs font-medium text-indigo-600 mt-1">
            <span>Alícuotas: {totalAliquots}%</span>
          </div>
        </div>

        {/* Fondo de Reserva */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Fondo de Reserva ({formatReserveFundRate(reserveFundRate)}%)
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <PiggyBank className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">${reserveFundUsd.toFixed(2)}</div>
          <div className="text-xs font-medium text-amber-600 mt-1">
            <span>Mínimo legal cumplido (LPH)</span>
          </div>
        </div>
      </div>

      {/* Grid de 2 Columnas: Gastos y Canales de Pago Propios del Conjunto */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda: Egresos del Mes (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Egresos Comunes del Período</h3>
              <p className="text-xs text-slate-500">Distribución de gastos de {condo?.name || 'este conjunto'}</p>
            </div>
            <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg font-mono">
              Total: {usd(grandTotalUsd)} USD
            </span>
          </div>

          <div className="space-y-3">
            {/* Ordinario */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                  ORD
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Gastos Ordinarios Recurrentes (Fijos)</h4>
                  <p className="text-xs text-slate-500">Nómina conserje, agua, electricidad común, ascensores, jardinería</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-900 text-sm">${totalOrdinaryUsd.toFixed(2)} USD</p>
                <p className="text-xs text-slate-500 font-mono">
                  {rateNum === null ? (
                    <span className="text-slate-400">Tasa BCV no disponible</span>
                  ) : (
                    `≈ Bs. ${(totalOrdinaryUsd * rateNum).toLocaleString('es-VE', {
                      minimumFractionDigits: 2,
                    })}`
                  )}
                </p>
              </div>
            </div>

            {/* Extraordinario */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm">
                  EXT
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Gastos Extraordinarios e Imprevistos</h4>
                  <p className="text-xs text-slate-500">Reparaciones mayores, portón eléctrico, bombas y cuotas extras</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-amber-900 text-sm">${totalExtraordinaryUsd.toFixed(2)} USD</p>
                <p className="text-xs text-slate-500 font-mono">
                  {rateNum === null ? (
                    <span className="text-slate-400">Tasa BCV no disponible</span>
                  ) : (
                    `≈ Bs. ${(totalExtraordinaryUsd * rateNum).toLocaleString('es-VE', {
                      minimumFractionDigits: 2,
                    })}`
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Cuentas Receptoras Propias de este Conjunto (1 col) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-slate-900 text-base">Cuentas Receptoras</h3>
              <button
                onClick={() => setShowAddBankModal(true)}
                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                title="Asignar o agregar una cuenta bancaria a este conjunto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Asignar Cuenta</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4 truncate">
              Cuentas autorizadas para pagos de {condo?.name || 'este conjunto'}
            </p>

            <div className="space-y-3">
              {accounts && accounts.length > 0 ? (
                accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className={`p-3.5 rounded-xl border ${
                      acc.supports_pago_movil
                        ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-200/70'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        {acc.supports_pago_movil ? (
                          <Smartphone className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <CreditCard className="w-4 h-4 text-blue-600" />
                        )}
                        <span>{acc.bank_name}</span>
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          acc.supports_pago_movil
                            ? 'bg-emerald-200 text-emerald-900'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {acc.supports_pago_movil ? 'Pago Móvil Activo' : acc.currency}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 font-mono tracking-wider truncate font-semibold">
                      {acc.account_number}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Titular: {acc.account_holder_name} · RIF: {acc.account_holder_rif}
                    </p>

                    {acc.supports_pago_movil && acc.pago_movil_phone && (
                      <p className="text-xs text-emerald-800 font-mono font-bold mt-1">
                        Tel: {acc.pago_movil_phone} · RIF: {acc.account_holder_rif}
                      </p>
                    )}

                    <div className="flex items-center justify-end space-x-1.5 pt-2 mt-2 border-t border-slate-200/60">
                      <button
                        onClick={() => setSelectedAccountForEdit(acc)}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 shadow-sm"
                      >
                        <Edit className="w-3 h-3 text-slate-500" />
                        <span>Modificar</span>
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(acc.id)}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 shadow-sm"
                      >
                        <Trash2 className="w-3 h-3 text-rose-500" />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
                  <Landmark className="w-8 h-8 mx-auto text-slate-300 mb-1" />
                  <p>Este conjunto no tiene cuentas receptoras asignadas aún.</p>
                  <button
                    onClick={() => setShowAddBankModal(true)}
                    className="mt-2 text-emerald-600 font-semibold hover:underline"
                  >
                    + Asignar primera cuenta
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <span className="text-[11px] text-slate-400">
              Cada conjunto posee sus propias cuentas bancarias aisladas
            </span>
          </div>
        </div>
      </div>

      {/* Modal Asignar o Editar Cuenta Receptora */}
      {(showAddBankModal || selectedAccountForEdit) && condo && (
        <AddBankAccountModal
          condoId={condo.id}
          condoName={condo.name}
          condoRif={condo.rif}
          existingAccount={selectedAccountForEdit}
          onClose={() => {
            setShowAddBankModal(false);
            setSelectedAccountForEdit(null);
          }}
          onAccountSaved={() => {
            loadAccounts();
            onRefreshCondoData();
          }}
        />
      )}
    </div>
  );
}
