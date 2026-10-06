'use client';

import React, { useEffect, useState } from 'react';
import { X, Printer, Download, RefreshCw, AlertTriangle, Users, Zap, Flame, Ban, Edit3, Check } from 'lucide-react';
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

export const formatDateEs = (d?: string | null) => {
  if (!d) return '—';
  const str = String(d);
  const iso = str.split('T')[0];
  const parts = iso.split('-');
  if (parts.length === 3) {
    const [y, m, day] = parts;
    return `${day.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  return str;
};

export function BillDetailModal({ bill, onClose }: BillDetailModalProps) {
  const condo = useCondoRecord(bill?.condo_id);
  const [billDetail, setBillDetail] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [bcvRateData, setBcvRateData] = useState<{ rate: number; date: string } | null>(null);
  const [overrideRate, setOverrideRate] = useState<string>('');
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [loadError, setLoadError] = useState('');

  const billId = bill?.id ?? null;
  const condoId = bill?.condo_id ?? null;
  const periodId = bill?.billing_period_id ?? null;

  useEffect(() => {
    if (!billId || !condoId || !periodId) return;
    let cancelled = false;

    (async () => {
      try {
        const [detail, exp, banks, bcv] = await Promise.all([
          fetchWithAuth(`/billing/bills/${billId}`),
          fetchWithAuth(`/billing/condos/${condoId}/expenses?periodId=${periodId}`),
          fetchWithAuth(`/condos/${condoId}/bank-accounts`),
          fetchWithAuth('/bcv/current').catch(() => null),
        ]);
        if (cancelled) return;
        setBillDetail(detail?.bill ?? null);
        setExpenses(Array.isArray(exp) ? exp : []);
        setBankAccounts(Array.isArray(banks) ? banks : []);
        if (bcv?.rate && Number(bcv.rate) > 0) {
          setBcvRateData({ rate: Number(bcv.rate), date: bcv.rate_date });
        }
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

  // Manejo de la Tasa BCV Actualizada y Fecha Valor
  const emissionRate = Number(data.exchange_rate_emission || 0);
  const currentLiveRate = bcvRateData?.rate ?? 0;
  // Prioridad: 1. Sobreescritura manual, 2. Tasa oficial BCV vigente en vivo (ej. 872.3927), 3. Tasa de emisión del recibo (ej. 36.8500)
  const defaultRate = currentLiveRate > 0 ? currentLiveRate : (emissionRate > 0 ? emissionRate : 872.3927);
  const rate = overrideRate !== '' && !isNaN(Number(overrideRate)) && Number(overrideRate) > 0
    ? Number(overrideRate)
    : defaultRate;

  // Fechas formateadas en español limpio DD/MM/AAAA
  const rawIssueDate = data.issue_date || data.created_at || null;
  const issueDateFmt = formatDateEs(rawIssueDate);
  const rateDateFmt = bcvRateData?.date
    ? formatDateEs(bcvRateData.date)
    : formatDateEs(data.issue_date || data.created_at || data.due_date);

  // 1. Estatus del Gas robusto (revisando en billDetail, data y bill)
  const hasGas = Boolean(
    billDetail?.has_gas_service === true ||
    data?.has_gas_service === true ||
    bill?.has_gas_service === true
  );

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
    if (matched && matched.unit_share_usd !== undefined && matched.unit_share_usd !== null) {
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

  // Fondo de reserva (excluyendo gas)
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

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      const element = document.getElementById('printable-bill-receipt');
      if (!element) {
        window.print();
        return;
      }

      // Expandir contenedor scrollable para que capture la totalidad del recibo
      const scrollableDiv = element.querySelector('.overflow-y-auto') as HTMLElement | null;
      const prevMaxHeight = scrollableDiv?.style.maxHeight || '';
      const prevOverflow = scrollableDiv?.style.overflow || '';
      if (scrollableDiv) {
        scrollableDiv.style.maxHeight = 'none';
        scrollableDiv.style.overflow = 'visible';
      }

      const html2canvasModule = await import('html2canvas');
      const html2canvas = (html2canvasModule as any).default || html2canvasModule;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        ignoreElements: (el: Element) => el.getAttribute('data-html2canvas-ignore') === 'true',
      });

      // Restaurar estilos del contenedor
      if (scrollableDiv) {
        scrollableDiv.style.maxHeight = prevMaxHeight;
        scrollableDiv.style.overflow = prevOverflow;
      }

      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'letter',
      });

      const pageWidth = 215.9; // Carta ancho (mm)
      const pageHeight = 279.4; // Carta alto (mm)
      const margin = 8;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = (canvas.height * contentWidth) / canvas.width;

      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      if (contentHeight <= pageHeight - margin * 2) {
        // Cabe perfectamente en una sola página
        pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, contentHeight);
      } else {
        // Soporte multipágina si el contenido es largo
        let heightLeft = contentHeight;
        let position = margin;

        pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight);
        heightLeft -= (pageHeight - margin * 2);

        while (heightLeft > 0) {
          position = heightLeft - contentHeight + margin;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, contentHeight);
          heightLeft -= (pageHeight - margin * 2);
        }
      }

      const unitCode = String(data.unit_code || 'Unidad').replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanMonth = String(MONTH_NAMES[periodMonth] || 'Mes').toLowerCase();
      const cleanYear = String(data.period_year || '2026');
      const filename = `Recibo_Apto_${unitCode}_${cleanMonth}_${cleanYear}.pdf`;

      // Descarga directa a través de Blob URL
      const blob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();

      setTimeout(() => {
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (err) {
      console.error('Error generando PDF con jsPDF, recurriendo a impresión del sistema:', err);
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto print:block">
      <div
        id="printable-bill-receipt"
        className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 print:shadow-none print:border-none print:m-0 print:max-w-none print:w-full print:rounded-none"
      >
        {/* Cabecera del Aviso */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:bg-slate-900 print:text-white print:px-6 print:py-4">
          <div>
            <h3 className="font-bold text-base tracking-tight flex items-center gap-2">
              <span>AVISO DE COBRO · {periodLabel.toUpperCase()}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${hasGas ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                {hasGas ? 'CON GAS' : 'SIN GAS'}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              N° {data.bill_number} · Emisión: {issueDateFmt}
            </p>
          </div>
          <div className="flex items-center space-x-2 print:hidden" data-html2canvas-ignore="true">
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium text-xs shadow-sm transition disabled:opacity-50"
              title="Descargar archivo PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isGeneratingPdf ? 'Generando...' : 'Descargar PDF'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition"
              title="Imprimir Recibo"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition"
              title="Cerrar Recibo"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cuerpo del Recibo */}
        <div className="p-6 space-y-5 text-xs max-h-[80vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-6 print:space-y-4">
          {loadError && (
            <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg print:hidden" data-html2canvas-ignore="true">
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

              {/* Tasa Oficial BCV con selector/ajuste administrativo */}
              <div className="mt-1 flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-slate-600 font-mono">
                    Tasa Oficial BCV:{' '}
                    <span className="font-bold text-slate-900">Bs. {rate.toFixed(4)} / USD</span>{' '}
                    <span className="text-[10px] text-slate-400">({rateDateFmt})</span>
                  </p>
                  <button
                    onClick={() => setIsEditingRate(!isEditingRate)}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold underline print:hidden flex items-center gap-0.5"
                    data-html2canvas-ignore="true"
                    title="Ajustar o sobreescribir tasa de cambio"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{isEditingRate ? 'Cerrar' : 'Ajustar'}</span>
                  </button>
                </div>

                {isEditingRate && (
                  <div
                    className="p-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2 text-xs print:hidden shadow-sm mt-1"
                    data-html2canvas-ignore="true"
                  >
                    <span className="text-slate-600 font-medium text-[11px]">Tasa Bs.:</span>
                    <input
                      type="number"
                      step="0.0001"
                      value={overrideRate !== '' ? overrideRate : rate.toFixed(4)}
                      onChange={(e) => setOverrideRate(e.target.value)}
                      className="w-24 px-2 py-0.5 border border-slate-300 rounded font-mono text-right text-xs"
                      placeholder="872.39"
                    />
                    {currentLiveRate > 0 && (
                      <button
                        onClick={() => setOverrideRate(String(currentLiveRate))}
                        className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded text-[10px] font-semibold"
                        title="Usar tasa oficial del BCV en vivo"
                      >
                        Oficial ({currentLiveRate.toFixed(2)})
                      </button>
                    )}
                    {emissionRate > 0 && emissionRate !== currentLiveRate && (
                      <button
                        onClick={() => setOverrideRate(String(emissionRate))}
                        className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-semibold"
                        title="Usar tasa registrada al emitir el recibo"
                      >
                        Cierre ({emissionRate.toFixed(2)})
                      </button>
                    )}
                  </div>
                )}
              </div>
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
          <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 shadow-md print:bg-slate-900 print:text-white print:rounded-xl">
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
                  Tasa Oficial BCV ({rateDateFmt}): Bs. {rate.toFixed(4)} / USD
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
