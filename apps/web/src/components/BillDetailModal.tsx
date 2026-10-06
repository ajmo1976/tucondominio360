'use client';

import React, { useEffect, useState } from 'react';
import { X, Printer, QrCode, RefreshCw, AlertTriangle, Building2, Landmark } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';
import { useCondoRecord, formatReserveFundRate, formatCondoLocation } from '../lib/useCondoReserveFundRate';

interface BillDetailModalProps {
  bill: any;
  onClose: () => void;
}

// period_month es 1-based (1 = Enero, 9 = Septiembre)
const MONTH_NAMES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const ves = (n: number) => `Bs. ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BillDetailModal({ bill, onClose }: BillDetailModalProps) {
  // Hooks antes del return temprano.
  // Todos los datos se piden scoped al condo_id y al billing_period_id del propio
  // recibo: nunca se muestran gastos, banco ni datos de otra residencia.
  const condo = useCondoRecord(bill?.condo_id);
  const [billDetail, setBillDetail] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [loadError, setLoadError] = useState('');

  const billId = bill?.id ?? null;
  const condoId = bill?.condo_id ?? null;
  const periodId = bill?.billing_period_id ?? null;

  useEffect(() => {
    if (!billId || !condoId || !periodId) return;
    let cancelled = false;

    (async () => {
      try {
        const [detail, exp, banks] = await Promise.all([
          fetchWithAuth(`/billing/bills/${billId}`),
          fetchWithAuth(`/billing/condos/${condoId}/expenses?periodId=${periodId}`),
          fetchWithAuth(`/condos/${condoId}/bank-accounts`),
        ]);
        if (cancelled) return;
        setBillDetail(detail?.bill ?? null);
        setExpenses(Array.isArray(exp) ? exp : []);
        setBankAccounts(Array.isArray(banks) ? banks : []);
        setLoadError('');
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || 'No se pudieron cargar los datos del recibo');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [billId, condoId, periodId]);

  if (!bill) return null;

  // El detalle del endpoint es la fuente autoritativa; la lista es solo un respaldo.
  const data = billDetail ?? bill;
  const reserveFundRate = condo ? condo.reserve_fund_rate : null;
  const reserveFundRateLabel = formatReserveFundRate(reserveFundRate);

  const periodMonth = Number(data.period_month);
  const periodLabel = `${MONTH_NAMES[periodMonth] || ''} ${data.period_year ?? ''}`.trim();

  const aliquot = Number(data.aliquot_percentage || 0);
  const rate = Number(data.exchange_rate_emission || 0);

  const ordinaryExpenses = expenses.filter(
    (e) => (e.expense_subtype || 'ORDINARY_RECURRENT') === 'ORDINARY_RECURRENT',
  );
  const extraordinaryExpenses = expenses.filter((e) => e.expense_subtype === 'EXTRAORDINARY');

  const sumAmount = (list: any[]) => list.reduce((acc, e) => acc + Number(e.amount_usd || 0), 0);
  const subtotalOrdinary = sumAmount(ordinaryExpenses);
  const subtotalExtraordinary = sumAmount(extraordinaryExpenses);
  const totalRelation = subtotalOrdinary + subtotalExtraordinary;

  const reserveRatePct = (reserveFundRate ?? 0) / 100;
  const periodReserveUsd = totalRelation * reserveRatePct;

  // Cuotas del apartamento: se prioriza el valor ya calculado y persistido en el recibo.
  const pick = (v: any, fallback: number) =>
    v !== undefined && v !== null && v !== '' ? Number(v) : fallback;
  const aptoOrdinaryUsd = pick(data.ordinary_share_usd, (subtotalOrdinary * aliquot) / 100);
  const aptoExtraordinaryUsd = pick(data.extraordinary_share_usd, (subtotalExtraordinary * aliquot) / 100);
  const aptoReserveUsd = pick(data.reserve_fund_usd, periodReserveUsd * (aliquot / 100));
  const totalAptoUsd = pick(
    data.total_due_usd,
    aptoOrdinaryUsd + aptoExtraordinaryUsd + aptoReserveUsd,
  );
  const totalAptoVes = totalAptoUsd * rate;

  const bank = bankAccounts[0] ?? null;

  const ExpenseTable = ({
    rows,
    amountLabel,
    rowClass,
    textClass,
    emptyText,
  }: {
    rows: any[];
    amountLabel: string;
    rowClass: string;
    textClass: string;
    emptyText: string;
  }) => (
    <table className="w-full text-left">
      <thead className="text-[10px] uppercase text-slate-400 font-semibold bg-slate-50">
        <tr>
          <th className="py-2 px-2">Descripción del Gasto</th>
          <th className="py-2 px-2 text-right">{amountLabel}</th>
          <th className="py-2 px-2 text-right">Cuota Apto ($)</th>
          <th className="py-2 px-2 text-right">Cuota Apto (Bs.)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-slate-700">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={4} className="py-3 px-2 text-slate-400 italic">
              {emptyText}
            </td>
          </tr>
        ) : (
          rows.map((item, idx) => {
            const amount = Number(item.amount_usd || 0);
            const shareUsd = (amount * aliquot) / 100;
            return (
              <tr key={item.id ?? idx} className={rowClass}>
                <td className={`py-2 px-2 ${textClass}`}>{item.description || '—'}</td>
                <td className="py-2 px-2 text-right font-mono">${amount.toFixed(2)}</td>
                <td className="py-2 px-2 text-right font-bold text-slate-900 font-mono">
                  ${shareUsd.toFixed(2)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-slate-500">{ves(shareUsd * rate)}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Cabecera del Aviso */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base tracking-tight">Aviso de Cobro de Condominio</h3>
            <p className="text-xs text-slate-400">
              N° {data.bill_number} · Período Mensual {periodLabel}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => window.print()}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition"
              title="Imprimir Recibo"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cuerpo del Recibo */}
        <div className="p-6 space-y-6 text-xs max-h-[80vh] overflow-y-auto">
          {loadError && (
            <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {loadError}
            </div>
          )}

          {/* Identificación Condominio e Inmueble */}
          <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Condominio Administrado
              </p>
              <p className="font-bold text-slate-900 text-sm">{condo?.name || '—'}</p>
              <p className="text-slate-600 font-mono">RIF: {condo?.rif || '—'}</p>
              <p className="text-slate-500">{formatCondoLocation(condo) || '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Unidad Inmobiliaria
              </p>
              <p className="font-bold text-slate-900 text-sm">
                {data.unit_type === 'APARTMENT' ? 'Apartamento' : 'Inmueble'} {data.unit_code}
                {data.building_name ? ` (${data.building_name})` : ''}
              </p>
              <p className="font-bold text-emerald-700 font-mono">Alícuota Legal: {aliquot.toFixed(5)}%</p>
              <p className="text-slate-500">Tasa Oficial BCV: Bs. {rate.toFixed(4)} / USD</p>
            </div>
          </div>

          {/* 1. GASTOS ORDINARIOS RECURRENTES */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <span className="font-bold text-slate-800 flex items-center gap-1.5 uppercase text-[11px]">
                <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                1. Relación de Gastos Ordinarios Recurrentes (Fijos Mensuales)
              </span>
              <span className="font-bold text-slate-900 font-mono">
                Subtotal: ${subtotalOrdinary.toFixed(2)} USD
              </span>
            </div>
            <ExpenseTable
              rows={ordinaryExpenses}
              amountLabel="Total Gasto"
              rowClass=""
              textClass=""
              emptyText="Sin gastos ordinarios registrados en este período."
            />
          </div>

          {/* 2. GASTOS EXTRAORDINARIOS E IMPREVISTOS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <span className="font-bold text-slate-800 flex items-center gap-1.5 uppercase text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                2. Relación de Gastos Extraordinarios (Reparaciones Mayores / Cuotas Extras)
              </span>
              <span className="font-bold text-slate-900 font-mono">
                Subtotal: ${subtotalExtraordinary.toFixed(2)} USD
              </span>
            </div>
            <ExpenseTable
              rows={extraordinaryExpenses}
              amountLabel="Total Gasto"
              rowClass="bg-amber-50/30"
              textClass="font-medium text-amber-950"
              emptyText="Sin gastos extraordinarios registrados en este período."
            />
          </div>

          {/* 3. FONDO DE RESERVA */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-900 block">
                3. Fondo de Reserva ({reserveFundRateLabel}%)
              </span>
              <span className="text-[11px] text-slate-500">
                Calculado sobre el Total Relación Mes (${totalRelation.toFixed(2)} ×{' '}
                {reserveFundRateLabel}% = ${periodReserveUsd.toFixed(2)} del período)
              </span>
            </div>
            <div className="text-right">
              <span className="font-bold text-slate-900 font-mono">${aptoReserveUsd.toFixed(2)} USD</span>
              <span className="text-[11px] text-slate-500 block font-mono">{ves(aptoReserveUsd * rate)}</span>
            </div>
          </div>

          {/* 4. TOTAL GENERAL LIQUIDADO */}
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-emerald-800 font-bold uppercase tracking-wider">Total a Pagar del Mes</p>
              <p className="text-2xl font-black text-emerald-950 font-mono">${totalAptoUsd.toFixed(2)} USD</p>
              <p className="text-[11px] text-emerald-700">
                Ordinario: ${aptoOrdinaryUsd.toFixed(2)} + Extraordinario: ${aptoExtraordinaryUsd.toFixed(2)} +
                Reserva: ${aptoReserveUsd.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-emerald-700 font-medium">Equivalente en Moneda Nacional:</p>
              <p className="text-xl font-bold text-emerald-900 font-mono">{ves(totalAptoVes)}</p>
              <p className="text-[10px] text-slate-500 font-mono">Tasa BCV: {rate.toFixed(4)} Bs/USD</p>
            </div>
          </div>

          {/* Datos bancarios de ESTA residencia */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
            {bank ? (
              <div className="space-y-1">
                <p className="font-bold text-slate-900">Datos para Pago Móvil / Transferencia:</p>
                <p className="text-slate-600">
                  Banco: <strong>{bank.bank_name} ({bank.bank_code})</strong> · Cuenta:{' '}
                  <strong className="font-mono">{bank.account_number}</strong>
                </p>
                <p className="text-slate-600">
                  Titular: <strong>{bank.account_holder_name || condo?.name || '—'}</strong> · RIF:{' '}
                  <strong>{bank.account_holder_rif || condo?.rif || '—'}</strong>
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-slate-400" />
                  Datos de pago no registrados
                </p>
                <p className="text-slate-500">
                  Esta residencia aún no tiene una cuenta bancaria asociada para recibir los pagos.
                </p>
              </div>
            )}
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 bg-white border border-slate-300 rounded-lg flex items-center justify-center text-slate-800">
                <QrCode className="w-8 h-8 text-emerald-600" />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 font-mono">QR Pago Móvil</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition"
          >
            Cerrar Recibo
          </button>
        </div>
      </div>
    </div>
  );
}