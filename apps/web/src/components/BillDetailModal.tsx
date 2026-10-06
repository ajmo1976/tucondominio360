'use client';

import React from 'react';
import { X, Printer, QrCode, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useCondoRecord, formatReserveFundRate, formatCondoLocation } from '../lib/useCondoReserveFundRate';

interface BillDetailModalProps {
  bill: any;
  onClose: () => void;
}

export function BillDetailModal({ bill, onClose }: BillDetailModalProps) {
  // Hook antes del return temprano: los datos de la residencia (Fondo de Reserva,
  // RIF, razón social) se leen de SU condominio, nunca de otro (aislamiento).
  const condo = useCondoRecord(bill?.condo_id);
  const reserveFundRate = condo ? condo.reserve_fund_rate : null;
  const reserveFundRateLabel = formatReserveFundRate(reserveFundRate);

  // period_month es 1-based (1 = Enero, 10 = Octubre)
  const MONTH_NAMES = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  const periodLabel = bill
    ? `${MONTH_NAMES[Number(bill.period_month)] || ''} ${bill.period_year}`.trim()
    : '';

  if (!bill) return null;

  const aliquot = Number(bill.aliquot_percentage || 0);
  const rate = Number(bill.exchange_rate_emission || 36.85);

  // Gastos ordinarios recurrentes de muestra si no vienen detallados
  const ordinaryList = [
    { desc: 'Nómina de Conserjería (Sueldo, alimentación y ley - Sr. Marcos)', total: 450.0 },
    { desc: 'Mantenimiento Preventivo de Ascensores (Schindler Torres A y B)', total: 350.0 },
    { desc: 'Servicio de Agua Potable Común (Hidrocapital Sept-Oct)', total: 60.0 },
    { desc: 'Electricidad Áreas Comunes y Bombas (Corpoelec)', total: 40.0 },
    { desc: 'Mantenimiento de Jardinería y Áreas Verdes', total: 100.0 },
  ];
  const subtotalOrdinary = ordinaryList.reduce((acc, i) => acc + i.total, 0);

  // Gastos extraordinarios
  const extraordinaryList = [
    { desc: 'Reparación de portón eléctrico de Estacionamiento (cambio de motor BFT y piñón)', total: 250.0 },
  ];
  const subtotalExtraordinary = extraordinaryList.reduce((acc, i) => acc + i.total, 0);

  // Cálculos de cuota del apartamento
  const aptoOrdinaryUsd = Number(((subtotalOrdinary * aliquot) / 100).toFixed(2));
  const aptoExtraordinaryUsd = Number(((subtotalExtraordinary * aliquot) / 100).toFixed(2));
  // Fondo de Reserva del periodo = Total Relación Mes x % de la residencia.
  // Se prioriza el valor real ya calculado y almacenado en el recibo.
  const reserveRatePct = (reserveFundRate ?? 0) / 100;
  const periodReserveUsd = (subtotalOrdinary + subtotalExtraordinary) * reserveRatePct;
  const aptoReserveUsd = Number(
    (
      bill.reserve_fund_usd !== undefined && bill.reserve_fund_usd !== null
        ? Number(bill.reserve_fund_usd)
        : periodReserveUsd * (aliquot / 100)
    ).toFixed(2),
  );
  const totalAptoUsd = aptoOrdinaryUsd + aptoExtraordinaryUsd + aptoReserveUsd;
  const totalAptoVes = Number((totalAptoUsd * rate).toFixed(2));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Cabecera del Aviso */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base tracking-tight">Aviso de Cobro de Condominio</h3>
            <p className="text-xs text-slate-400">N° {bill.bill_number} · Período Mensual {periodLabel}</p>
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
          {/* Identificación Condominio e Inmueble */}
          <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Condominio Administrado</p>
              <p className="font-bold text-slate-900 text-sm">{condo?.name || '—'}</p>
              <p className="text-slate-600 font-mono">RIF: {condo?.rif || '—'}</p>
              <p className="text-slate-500">{formatCondoLocation(condo) || '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Unidad Inmobiliaria</p>
              <p className="font-bold text-slate-900 text-sm">Apartamento {bill.unit_code} ({bill.building_name || 'Torre A'})</p>
              <p className="font-bold text-emerald-700 font-mono">Alícuota Legal: {aliquot.toFixed(5)}%</p>
              <p className="text-slate-500">Tasa Oficial BCV: Bs. {rate.toFixed(4)} / USD</p>
            </div>
          </div>

          {/* 1. SECCIÓN: GASTOS ORDINARIOS RECURRENTES */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <span className="font-bold text-slate-800 flex items-center gap-1.5 uppercase text-[11px]">
                <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                1. Relación de Gastos Ordinarios Recurrentes (Fijos Mensuales)
              </span>
              <span className="font-bold text-slate-900 font-mono">Subtotal: ${subtotalOrdinary.toFixed(2)} USD</span>
            </div>
            <table className="w-full text-left">
              <thead className="text-[10px] uppercase text-slate-400 font-semibold bg-slate-50">
                <tr>
                  <th className="py-2 px-2">Descripción del Gasto</th>
                  <th className="py-2 px-2 text-right">Total Gasto</th>
                  <th className="py-2 px-2 text-right">Cuota Apto ($)</th>
                  <th className="py-2 px-2 text-right">Cuota Apto (Bs.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {ordinaryList.map((item, idx) => {
                  const shareUsd = (item.total * aliquot) / 100;
                  const shareVes = shareUsd * rate;
                  return (
                    <tr key={idx}>
                      <td className="py-2 px-2">{item.desc}</td>
                      <td className="py-2 px-2 text-right font-mono">${item.total.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-bold text-slate-900 font-mono">${shareUsd.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono text-slate-500">
                        Bs. {shareVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 2. SECCIÓN: GASTOS EXTRAORDINARIOS E IMPREVISTOS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <span className="font-bold text-slate-800 flex items-center gap-1.5 uppercase text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                2. Relación de Gastos Extraordinarios (Reparaciones Mayores / Cuotas Extras)
              </span>
              <span className="font-bold text-slate-900 font-mono">Subtotal: ${subtotalExtraordinary.toFixed(2)} USD</span>
            </div>
            <table className="w-full text-left">
              <thead className="text-[10px] uppercase text-slate-400 font-semibold bg-slate-50">
                <tr>
                  <th className="py-2 px-2">Descripción del Gasto Extraordinario</th>
                  <th className="py-2 px-2 text-right">Total Gasto</th>
                  <th className="py-2 px-2 text-right">Cuota Apto ($)</th>
                  <th className="py-2 px-2 text-right">Cuota Apto (Bs.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {extraordinaryList.map((item, idx) => {
                  const shareUsd = (item.total * aliquot) / 100;
                  const shareVes = shareUsd * rate;
                  return (
                    <tr key={idx} className="bg-amber-50/30">
                      <td className="py-2 px-2 font-medium text-amber-950">{item.desc}</td>
                      <td className="py-2 px-2 text-right font-mono">${item.total.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-bold text-amber-950 font-mono">${shareUsd.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono text-amber-900">
                        Bs. {shareVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 3. FONDO DE RESERVA LEGAL */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-900 block">
                3. Fondo de Reserva Legal ({reserveFundRateLabel}%)
              </span>
              <span className="text-[11px] text-slate-500">
                Calculado sobre el Total Relación Mes (${(subtotalOrdinary + subtotalExtraordinary).toFixed(2)} ×{' '}
                {reserveFundRateLabel}% = ${periodReserveUsd.toFixed(2)} total)
              </span>
            </div>
            <div className="text-right">
              <span className="font-bold text-slate-900 font-mono">${aptoReserveUsd.toFixed(2)} USD</span>
              <span className="text-[11px] text-slate-500 block font-mono">
                Bs. {(aptoReserveUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* 4. TOTAL GENERAL LIQUIDADO */}
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-emerald-800 font-bold uppercase tracking-wider">Total a Pagar del Mes</p>
              <p className="text-2xl font-black text-emerald-950 font-mono">${totalAptoUsd.toFixed(2)} USD</p>
              <p className="text-[11px] text-emerald-700">
                Ordinario: ${aptoOrdinaryUsd} + Extraordinario: ${aptoExtraordinaryUsd} + Reserva: ${aptoReserveUsd}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-emerald-700 font-medium">Equivalente en Moneda Nacional:</p>
              <p className="text-xl font-bold text-emerald-900 font-mono">
                Bs. {totalAptoVes.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 font-mono">Tasa BCV: {rate.toFixed(4)} Bs/USD</p>
            </div>
          </div>

          {/* Datos para el Pago Móvil */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
            <div className="space-y-1">
              <p className="font-bold text-slate-900">Datos para Pago Móvil / Transferencia:</p>
              <p className="text-slate-600">Banco: <strong>Banesco (0134)</strong> · Teléfono: <strong>0414-1234567</strong></p>
              <p className="text-slate-600">RIF: <strong>J-50123456-7</strong></p>
            </div>
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
