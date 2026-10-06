'use client';

import React, { useEffect, useState } from 'react';
import { X, Printer, RefreshCw, AlertTriangle, Users, Zap, Flame, ShieldCheck, Ban } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';
import { useCondoRecord, formatReserveFundRate, formatCondoLocation } from '../lib/useCondoReserveFundRate';

interface BillDetailModalProps {
  bill: any;
  onClose: () => void;
}

const MONTH_NAMES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const ves = (n: number) => `Bs. ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BillDetailModal({ bill, onClose }: BillDetailModalProps) {
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

  const data = billDetail ?? bill;
  const reserveFundRate = condo ? condo.reserve_fund_rate : 10;
  const reserveFundRateLabel = formatReserveFundRate(reserveFundRate);

  const periodMonth = Number(data.period_month);
  const periodLabel = `${MONTH_NAMES[periodMonth] || ''} ${data.period_year ?? ''}`.trim();

  const aliquot = Number(data.aliquot_percentage || 0);
  const rate = Number(data.exchange_rate_emission || 0);
  const issueDate = data.issue_date || data.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];

  // 1. Estatus del Gas
  const hasGas = data.has_gas_service === true;

  // Clasificación de Gastos en 3 Bloques Tradicionales
  const classifyExpense = (item: any) => {
    const code = (item.category_code || '').toUpperCase();
    const sub = (item.expense_subtype || '').toUpperCase();
    const desc = (item.description || '').toLowerCase();
    const name = (item.category_name || '').toLowerCase();

    if (
      code === 'TR' ||
      code === 'NOM-CONS' ||
      desc.includes('trabajador') ||
      desc.includes('conserj') ||
      desc.includes('nomina') ||
      desc.includes('bono') ||
      desc.includes('ivss') ||
      desc.includes('faov') ||
      desc.includes('lph') ||
      name.includes('conserje') ||
      name.includes('trabajador')
    ) {
      return 1;
    }
    if (
      code === 'AICE' ||
      sub === 'EXTRAORDINARY' ||
      item.expense_type === 'EXTRAORDINARY'
    ) {
      return 3;
    }
    return 2;
  };

  const block1Items = expenses.filter((e) => classifyExpense(e) === 1);
  const block2Items = expenses.filter((e) => classifyExpense(e) === 2);
  const block3Items = expenses.filter((e) => classifyExpense(e) === 3);

  const sumAmount = (list: any[]) => list.reduce((acc, e) => acc + Number(e.amount_usd || 0), 0);
  
  const subtotal1Gasto = sumAmount(block1Items);
  const subtotal2Gasto = sumAmount(block2Items);
  const subtotal3Gasto = sumAmount(block3Items);
  const totalGastosGasto = subtotal1Gasto + subtotal2Gasto + subtotal3Gasto;

  // Cálculo individual de cuotas por ítem condicionado al gas
  const getItemShare = (item: any) => {
    const isGas = (item.category_code || '').toUpperCase() === 'GAS' || (item.description || '').toLowerCase().includes('gas');
    if (isGas && !hasGas) {
      return 0; // Si la unidad no tiene gas, la cuota es $0.00
    }

    const matched = billDetail?.items?.find((bi: any) => bi.description === item.description);
    if (matched && matched.unit_share_usd !== undefined) {
      return Number(matched.unit_share_usd);
    }
    const amount = Number(item.amount_usd || 0);
    if (isGas) {
      return hasGas ? amount / 31 : 0;
    }
    return (amount * aliquot) / 100;
  };

  const subtotal1Share = block1Items.reduce((acc, e) => acc + getItemShare(e), 0);
  const subtotal2Share = block2Items.reduce((acc, e) => acc + getItemShare(e), 0);
  const subtotal3Share = block3Items.reduce((acc, e) => acc + getItemShare(e), 0);

  const pick = (v: any, fallback: number) =>
    v !== undefined && v !== null && v !== '' ? Number(v) : fallback;

  const aptoTotalGastosShare = pick(
    data.ordinary_share_usd !== undefined && data.extraordinary_share_usd !== undefined
      ? Number(data.ordinary_share_usd) + Number(data.extraordinary_share_usd)
      : undefined,
    subtotal1Share + subtotal2Share + subtotal3Share,
  );

  // Fondo de reserva (20% excluyendo gas)
  const gasGastoTotal = expenses
    .filter((e) => (e.category_code || '').toUpperCase() === 'GAS' || (e.description || '').toLowerCase().includes('gas') || e.exclude_from_reserve)
    .reduce((acc, e) => acc + Number(e.amount_usd || 0), 0);

  const condoReserveBase = totalGastosGasto - gasGastoTotal;
  const reserveRatePct = (Number(reserveFundRate) || 10) / 100;
  const condoReserveTotal = condoReserveBase * reserveRatePct;

  const aptoReserveUsd = pick(data.reserve_fund_usd, condoReserveTotal * (aliquot / 100));
  const totalAptoUsd = pick(data.total_due_usd, aptoTotalGastosShare + aptoReserveUsd);
  const totalAptoVes = totalAptoUsd * rate;

  const bank = bankAccounts[0] ?? null;

  const ExpenseTable = ({
    rows,
    emptyText,
  }: {
    rows: any[];
    emptyText: string;
  }) => (
    <table className="w-full text-left text-xs">
      <thead className="text-[10px] uppercase text-slate-400 font-semibold bg-slate-50 border-b border-slate-200">
        <tr>
          <th className="py-2 px-3">Descripción del Gasto</th>
          <th className="py-2 px-3 text-right">Total Gasto ($)</th>
          <th className="py-2 px-3 text-right">Cuota Apto ($)</th>
          <th className="py-2 px-3 text-right">Cuota Apto (Bs.)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-slate-700">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={4} className="py-3 px-3 text-slate-400 italic">
              {emptyText}
            </td>
          </tr>
        ) : (
          rows.map((item, idx) => {
            const amount = Number(item.amount_usd || 0);
            const isGas = (item.category_code || '').toUpperCase() === 'GAS' || (item.description || '').toLowerCase().includes('gas');
            const shareUsd = getItemShare(item);
            return (
              <tr key={item.id ?? idx} className="hover:bg-slate-50/50 transition">
                <td className="py-2 px-3 font-medium text-slate-800">
                  {item.description || '—'}
                  {isGas && !hasGas && (
                    <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-semibold">
                      Exento / No aplica
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-right font-mono text-slate-600">${amount.toFixed(2)}</td>
                <td className="py-2 px-3 text-right font-bold text-slate-900 font-mono">
                  {isGas && !hasGas ? '$0.00' : `$${shareUsd.toFixed(2)}`}
                </td>
                <td className="py-2 px-3 text-right font-mono text-slate-500">
                  {isGas && !hasGas ? 'Bs. 0,00' : ves(shareUsd * rate)}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 print:shadow-none print:border-none print:m-0 print:max-w-none print:w-full">
        {/* Cabecera del Aviso */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:bg-slate-900 print:text-print-black">
          <div>
            <h3 className="font-bold text-base tracking-tight flex items-center gap-2">
              <span>AVISO DE COBRO · {periodLabel.toUpperCase()}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${hasGas ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                {hasGas ? 'CON GAS' : 'SIN GAS'}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              N° {data.bill_number} · Emisión: {issueDate}
            </p>
          </div>
          <div className="flex items-center space-x-2 print:hidden">
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
        <div className="p-6 space-y-5 text-xs max-h-[80vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-4">
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
              <p className="font-bold text-slate-900 text-sm flex items-center justify-end gap-1.5">
                <span>{data.unit_code}{data.building_name ? ` · ${data.building_name}` : ''}</span>
              </p>
              <p className="font-bold text-emerald-700 font-mono">Alícuota Legal: {aliquot.toFixed(5)}%</p>
              <div className="mt-1 flex items-center justify-end gap-1.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${hasGas ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                  {hasGas ? <Flame className="w-3 h-3 text-emerald-600" /> : <Ban className="w-3 h-3 text-slate-400" />}
                  Servicio de Gas: {hasGas ? 'ACTIVO / INCLUIDO' : 'NO APLICA / EXCLUIDO'}
                </span>
              </div>
              <p className="text-slate-500 font-mono mt-1">
                Tasa Oficial BCV: Bs. {rate.toFixed(4)} / USD <span className="text-[10px] text-slate-400">(Fecha: {issueDate})</span>
              </p>
            </div>
          </div>

          {/* BLOQUE I: TRABAJADOR RESIDENCIAL */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-slate-100 px-3 py-2 flex items-center justify-between border-b border-slate-200 font-bold text-slate-800">
              <span className="flex items-center gap-1.5 uppercase text-[11px]">
                <Users className="w-4 h-4 text-blue-600" />
                I. Trabajador Residencial
              </span>
              <span className="font-mono text-slate-900">
                Sub-total I: ${subtotal1Gasto.toFixed(2)} USD | Cuota Apto: ${subtotal1Share.toFixed(2)}
              </span>
            </div>
            <ExpenseTable rows={block1Items} emptyText="Sin gastos de trabajador residencial en este período." />
          </div>

          {/* BLOQUE II: SERVICIOS FIJOS */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-slate-100 px-3 py-2 flex items-center justify-between border-b border-slate-200 font-bold text-slate-800">
              <span className="flex items-center gap-1.5 uppercase text-[11px]">
                <Zap className="w-4 h-4 text-emerald-600" />
                II. Servicios Fijos
              </span>
              <span className="font-mono text-slate-900">
                Sub-total II: ${subtotal2Gasto.toFixed(2)} USD | Cuota Apto: ${subtotal2Share.toFixed(2)}
              </span>
            </div>
            <ExpenseTable rows={block2Items} emptyText="Sin servicios fijos registrados en este período." />
          </div>

          {/* BLOQUE III: ADICIONALES, IMPREVISTOS Y CUOTAS EXTRAS */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-slate-100 px-3 py-2 flex items-center justify-between border-b border-slate-200 font-bold text-slate-800">
              <span className="flex items-center gap-1.5 uppercase text-[11px]">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                III. Adicionales, Imprevistos y Cuotas Extras
              </span>
              <span className="font-mono text-slate-900">
                Sub-total III: ${subtotal3Gasto.toFixed(2)} USD | Cuota Apto: ${subtotal3Share.toFixed(2)}
              </span>
            </div>
            <ExpenseTable rows={block3Items} emptyText="Sin gastos adicionales o extraordinarios en este período." />
          </div>

          {/* BLOQUE DE TOTALES Y LIQUIDACIÓN AL PIE */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 shadow-md print:bg-slate-900 print:text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-slate-400 uppercase text-[10px] font-bold tracking-wider">Total Gastos (I + II + III)</span>
                <p className="text-sm font-bold font-mono">${totalGastosGasto.toFixed(2)} USD</p>
              </div>
              <div className="text-right">
                <span className="text-slate-400 uppercase text-[10px] font-bold tracking-wider">Cuota Total Gastos Apto</span>
                <p className="text-sm font-bold font-mono text-emerald-400">${aptoTotalGastosShare.toFixed(2)} USD</p>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                  Aporte al Fondo de Reserva ({reserveFundRateLabel}%)
                </span>
                <p className="text-xs text-slate-300">
                  Calculado sobre la base de gastos comunes excluyendo gas (${condoReserveBase.toFixed(2)} del condominio)
                </p>
              </div>
              <div className="text-right">
                <span className="text-slate-400 uppercase text-[10px] font-bold tracking-wider">Cuota Reserva Apto</span>
                <p className="text-sm font-bold font-mono text-amber-300">${aptoReserveUsd.toFixed(2)} USD</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">TOTAL A PAGAR</p>
                <p className="text-2xl font-black text-emerald-300 font-mono">${totalAptoUsd.toFixed(2)} USD</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Equivalencia en Moneda Nacional</p>
                <p className="text-xl font-black text-white font-mono">{ves(totalAptoVes)}</p>
                <p className="text-[10px] text-slate-300 font-mono mt-0.5">
                  Tasa Oficial BCV ({issueDate}): Bs. {rate.toFixed(4)} / USD
                </p>
              </div>
            </div>
          </div>

          {/* Información Bancaria para Pago */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Cuenta Receptora Autorizada</p>
              {bank ? (
                <div className="mt-1">
                  <p className="font-bold text-slate-900">{bank.bank_name} ({bank.bank_code})</p>
                  <p className="font-mono text-slate-700">{bank.account_number} · {bank.account_type}</p>
                  <p className="text-slate-500">Titular: {bank.account_holder_name} (RIF: {bank.account_holder_rif})</p>
                  {bank.supports_pago_movil && (
                    <p className="text-emerald-700 font-medium mt-0.5">
                      Pago Móvil: {bank.bank_code} · {bank.pago_movil_phone} · RIF {bank.account_holder_rif}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-amber-600 font-medium mt-0.5">No hay cuentas bancarias configuradas para esta residencia.</p>
              )}
            </div>
            <div className="text-right sm:text-right w-full sm:w-auto">
              <span className="inline-block px-3 py-1 bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px]">
                {data.status === 'PAID' ? 'RECIBO PAGADO' : data.status === 'VERIFIED' ? 'VERIFICADO' : 'PENDIENTE DE PAGO'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
