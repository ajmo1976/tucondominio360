'use client';

import React, { useEffect, useState } from 'react';
import { X, Printer, Download, Users, Zap, Flame, Ban, Edit3, AlertTriangle } from 'lucide-react';
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

  // Manejo de la Tasa BCV Oficial y Fecha Valor
  const emissionRate = Number(data.exchange_rate_emission || 0);
  const currentLiveRate = bcvRateData?.rate ?? 0;
  const defaultRate = currentLiveRate > 0 ? currentLiveRate : (emissionRate > 0 ? emissionRate : 872.3927);
  const rate = overrideRate !== '' && !isNaN(Number(overrideRate)) && Number(overrideRate) > 0
    ? Number(overrideRate)
    : defaultRate;

  // Fechas formateadas en español DD/MM/AAAA
  const rawIssueDate = data.issue_date || data.created_at || null;
  const issueDateFmt = formatDateEs(rawIssueDate);
  const rateDateFmt = bcvRateData?.date
    ? formatDateEs(bcvRateData.date)
    : formatDateEs(data.issue_date || data.created_at || data.due_date);

  // Estatus del Gas robusto
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
      return 0;
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

  // Descarga Ejecutiva de PDF en 1 sola página perfecta
  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      const element = document.getElementById('printable-bill-receipt');
      if (!element) {
        window.print();
        return;
      }

      // 1. Expandir temporalmente el scroll para capturar el contenido íntegro sin cortes
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
        scale: 2.5, // Ultra alta nitidez
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        ignoreElements: (el: Element) => el.getAttribute('data-html2canvas-ignore') === 'true',
      });

      // Restaurar estilos en pantalla
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
      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;

      const rawHeightMm = (canvas.height * availableWidth) / canvas.width;

      // Escalado inteligente de Emil Kowalski: Si el contenido cabe en 1 página (incluso con leve tolerancia),
      // se ajusta para que el recibo sea un documento ejecutivo de EXACTAMENTE UNA PÁGINA.
      let renderWidth = availableWidth;
      let renderHeight = rawHeightMm;
      let posX = margin;
      let posY = margin;

      if (rawHeightMm > availableHeight && rawHeightMm <= availableHeight * 1.35) {
        const scale = availableHeight / rawHeightMm;
        renderWidth = availableWidth * scale;
        renderHeight = availableHeight;
        posX = margin + (availableWidth - renderWidth) / 2;
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      if (renderHeight <= availableHeight) {
        pdf.addImage(imgData, 'JPEG', posX, posY, renderWidth, renderHeight);
      } else {
        let heightLeft = renderHeight;
        let position = margin;

        pdf.addImage(imgData, 'JPEG', margin, position, renderWidth, renderHeight);
        heightLeft -= availableHeight;

        while (heightLeft > 0) {
          position = heightLeft - renderHeight + margin;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', margin, position, renderWidth, renderHeight);
          heightLeft -= availableHeight;
        }
      }

      const unitCode = String(data.unit_code || 'Unidad').replace(/[^a-zA-Z0-9_-]/g, '_');
      const cleanMonth = String(MONTH_NAMES[periodMonth] || 'Mes').toLowerCase();
      const cleanYear = String(data.period_year || '2026');
      const filename = `Recibo_Apto_${unitCode}_${cleanMonth}_${cleanYear}.pdf`;

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
      console.error('Error generando PDF:', err);
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
    <table className="w-full text-left text-[11px] table-fixed">
      <thead className="text-[9.5px] uppercase text-slate-500 font-semibold bg-slate-50/90 border-b border-slate-200">
        <tr>
          <th className="py-1.5 px-3 text-left w-[46%] whitespace-nowrap">Descripción del Gasto</th>
          <th className="py-1.5 px-2 text-right w-[18%] whitespace-nowrap">Total Gasto ($)</th>
          <th className="py-1.5 px-2 text-right w-[18%] whitespace-nowrap">Cuota Apto ($)</th>
          <th className="py-1.5 px-2 text-right w-[18%] whitespace-nowrap">Cuota Apto (Bs.)</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-slate-700">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={4} className="py-2.5 px-3 text-slate-400 italic text-center">
              {emptyText}
            </td>
          </tr>
        ) : (
          rows.map((item, idx) => {
            const amount = Number(item.amount_usd || 0);
            const isGas = (item.category_code || '').toUpperCase() === 'GAS' || (item.description || '').toLowerCase().includes('gas');
            const shareUsd = getItemShare(item);
            return (
              <tr key={item.id ?? idx} className="hover:bg-slate-50/40 transition">
                <td className="py-1 px-3 font-medium text-slate-800 truncate">
                  {item.description || '—'}
                  {isGas && !hasGas && (
                    <span className="ml-1.5 px-1 py-0.2 bg-slate-100 text-slate-500 rounded text-[8.5px] font-semibold">
                      Exento / No aplica
                    </span>
                  )}
                </td>
                <td className="py-1 px-2 text-right font-sans tabular-nums text-slate-600">
                  ${amount.toFixed(2)}
                </td>
                <td className="py-1 px-2 text-right font-sans tabular-nums font-bold text-slate-900">
                  {isGas && !hasGas ? '$0.00' : `$${shareUsd.toFixed(2)}`}
                </td>
                <td className="py-1 px-2 text-right font-sans tabular-nums text-slate-600">
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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto print:block">
      <div
        id="printable-bill-receipt"
        className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-4 print:shadow-none print:border-none print:m-0 print:max-w-none print:w-full print:rounded-none"
      >
        {/* Cabecera del Aviso */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between print:bg-slate-900 print:text-white print:px-5 print:py-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm tracking-normal">
                AVISO DE COBRO · {periodLabel.toUpperCase()}
              </h3>
              <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold ${hasGas ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'}`}>
                {hasGas ? 'CON GAS' : 'SIN GAS'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
              N° {data.bill_number} · Emisión: {issueDateFmt}
            </p>
          </div>
          <div className="flex items-center space-x-2 print:hidden" data-html2canvas-ignore="true">
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 rounded-lg text-white font-medium text-xs shadow-sm transition disabled:opacity-50"
              title="Descargar archivo PDF de 1 página"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isGeneratingPdf ? 'Generando...' : 'Descargar PDF'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="p-1.5 hover:bg-slate-800 active:scale-95 rounded-lg text-slate-300 hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              title="Imprimir Recibo"
              aria-label="Imprimir recibo"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 active:scale-95 rounded-lg text-slate-300 hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              title="Cerrar Recibo"
              aria-label="Cerrar recibo"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cuerpo del Recibo con densidad ejecutiva */}
        <div className="p-4 sm:p-5 space-y-3.5 text-xs max-h-[82vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-4 print:space-y-3">
          {loadError && (
            <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg print:hidden" data-html2canvas-ignore="true">
              {loadError}
            </div>
          )}

          {/* Identificación Condominio e Inmueble (Equilibrada en 2 Columnas) */}
          <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-200 items-start">
            <div>
              <p className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
                Condominio Administrado
              </p>
              <p className="font-bold text-slate-900 text-[13px] leading-snug">{condo?.name || '—'}</p>
              <p className="text-slate-600 text-[10.5px]">RIF: {condo?.rif || '—'}</p>
              <p className="text-slate-500 text-[10.5px] leading-tight">{formatCondoLocation(condo) || '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
                Unidad Inmobiliaria
              </p>
              <p className="font-bold text-slate-900 text-[13px] leading-snug">
                {data.unit_code}{data.building_name ? ` · ${data.building_name}` : ''}
              </p>
              <p className="font-bold text-emerald-700 text-[11px] tabular-nums font-sans">
                Alícuota Legal: {aliquot.toFixed(5)}%
              </p>
              <div className="mt-0.5 flex items-center justify-end gap-1">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9.5px] font-semibold ${hasGas ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                  {hasGas ? <Flame className="w-2.5 h-2.5 text-emerald-600" /> : <Ban className="w-2.5 h-2.5 text-slate-400" />}
                  Servicio de Gas: {hasGas ? 'ACTIVO / INCLUIDO' : 'NO APLICA / EXCLUIDO'}
                </span>
              </div>

              {/* Tasa Oficial BCV */}
              <div className="mt-0.5 flex flex-col items-end">
                <div className="flex items-center gap-1">
                  <p className="text-slate-600 text-[10.5px]">
                    Tasa Oficial BCV:{' '}
                    <span className="font-bold text-slate-900 font-sans tabular-nums">Bs. {rate.toFixed(4)} / USD</span>{' '}
                    <span className="text-[9.5px] text-slate-400">({rateDateFmt})</span>
                  </p>
                  <button
                    onClick={() => setIsEditingRate(!isEditingRate)}
                    className="text-[9.5px] text-blue-600 hover:text-blue-800 font-semibold underline print:hidden flex items-center gap-0.5 ml-1"
                    data-html2canvas-ignore="true"
                    title="Ajustar o sobreescribir tasa de cambio"
                  >
                    <Edit3 className="w-2.5 h-2.5" />
                    <span>{isEditingRate ? 'Cerrar' : 'Ajustar'}</span>
                  </button>
                </div>

                {isEditingRate && (
                  <div
                    className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-1.5 text-[11px] print:hidden shadow-sm mt-1"
                    data-html2canvas-ignore="true"
                  >
                    <span className="text-slate-600 font-medium text-[10px]">Tasa Bs.:</span>
                    <input
                      type="number"
                      step="0.0001"
                      value={overrideRate !== '' ? overrideRate : rate.toFixed(4)}
                      onChange={(e) => setOverrideRate(e.target.value)}
                      className="w-20 px-1.5 py-0.5 border border-slate-300 rounded font-sans text-right text-[11px]"
                      placeholder="872.39"
                    />
                    {currentLiveRate > 0 && (
                      <button
                        onClick={() => setOverrideRate(String(currentLiveRate))}
                        className="px-1.5 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded text-[9.5px] font-semibold"
                        title="Usar tasa oficial del BCV en vivo"
                      >
                        Oficial ({currentLiveRate.toFixed(2)})
                      </button>
                    )}
                    {emissionRate > 0 && emissionRate !== currentLiveRate && (
                      <button
                        onClick={() => setOverrideRate(String(emissionRate))}
                        className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[9.5px] font-semibold"
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
          <div className="bg-white rounded-lg border border-slate-200/90 overflow-hidden shadow-xs print:shadow-none print:rounded-md">
            <div className="bg-slate-100/90 px-3 py-1 flex items-center justify-between border-b border-slate-200 font-bold text-slate-800">
              <span className="flex items-center gap-1.5 uppercase text-[10px]">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                I. Trabajador Residencial
              </span>
              <span className="font-sans tabular-nums text-slate-900 text-[10.5px]">
                Sub-total I: ${subtotal1Gasto.toFixed(2)} USD | Cuota Apto: ${subtotal1Share.toFixed(2)}
              </span>
            </div>
            <ExpenseTable rows={block1Items} emptyText="Sin gastos de trabajador residencial en este período." />
          </div>

          {/* BLOQUE II: SERVICIOS FIJOS */}
          <div className="bg-white rounded-lg border border-slate-200/90 overflow-hidden shadow-xs print:shadow-none print:rounded-md">
            <div className="bg-slate-100/90 px-3 py-1 flex items-center justify-between border-b border-slate-200 font-bold text-slate-800">
              <span className="flex items-center gap-1.5 uppercase text-[10px]">
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                II. Servicios Fijos
              </span>
              <span className="font-sans tabular-nums text-slate-900 text-[10.5px]">
                Sub-total II: ${subtotal2Gasto.toFixed(2)} USD | Cuota Apto: ${subtotal2Share.toFixed(2)}
              </span>
            </div>
            <ExpenseTable rows={block2Items} emptyText="Sin servicios fijos registrados en este período." />
          </div>

          {/* BLOQUE III: ADICIONALES, IMPREVISTOS Y CUOTAS EXTRAS */}
          <div className="bg-white rounded-lg border border-slate-200/90 overflow-hidden shadow-xs print:shadow-none print:rounded-md">
            <div className="bg-slate-100/90 px-3 py-1 flex items-center justify-between border-b border-slate-200 font-bold text-slate-800">
              <span className="flex items-center gap-1.5 uppercase text-[10px]">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                III. Adicionales, Imprevistos y Cuotas Extras
              </span>
              <span className="font-sans tabular-nums text-slate-900 text-[10.5px]">
                Sub-total III: ${subtotal3Gasto.toFixed(2)} USD | Cuota Apto: ${subtotal3Share.toFixed(2)}
              </span>
            </div>
            <ExpenseTable rows={block3Items} emptyText="Sin gastos adicionales o extraordinarios en este período." />
          </div>

          {/* BLOQUE DE TOTALES Y LIQUIDACIÓN AL PIE (Sin artefactos de canvas) */}
          <div className="bg-slate-900 text-white rounded-xl p-3.5 space-y-2 shadow-sm print:bg-slate-900 print:text-white print:rounded-none print:shadow-none">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div>
                <span className="text-slate-400 uppercase text-[9px] font-bold tracking-normal">Total Gastos (I + II + III)</span>
                <p className="text-xs font-bold font-sans tabular-nums">${totalGastosGasto.toFixed(2)} USD</p>
              </div>
              <div className="text-right">
                <span className="text-slate-400 uppercase text-[9px] font-bold tracking-normal">Cuota Total Gastos Apto</span>
                <p className="text-xs font-bold font-sans tabular-nums text-emerald-400">${aptoTotalGastosShare.toFixed(2)} USD</p>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div>
                <span className="text-slate-400 uppercase text-[9px] font-bold tracking-normal">
                  Aporte al Fondo de Reserva ({reserveFundRateLabel}%)
                </span>
                <p className="text-[10px] text-slate-300">
                  Base común sin gas: ${condoReserveBase.toFixed(2)} del condominio
                </p>
              </div>
              <div className="text-right">
                <span className="text-slate-400 uppercase text-[9px] font-bold tracking-normal">Cuota Reserva Apto</span>
                <p className="text-xs font-bold font-sans tabular-nums text-amber-300">${aptoReserveUsd.toFixed(2)} USD</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <div>
                <p className="text-[9.5px] text-slate-400 uppercase tracking-normal font-bold">TOTAL A PAGAR</p>
                <p className="text-lg font-black text-emerald-300 font-sans tabular-nums leading-tight">${totalAptoUsd.toFixed(2)} USD</p>
              </div>
              <div className="text-right">
                <p className="text-[9.5px] text-slate-400 uppercase tracking-normal font-bold">Equivalencia Moneda Nacional</p>
                <p className="text-base font-black text-white font-sans tabular-nums leading-tight">{ves(totalAptoVes)}</p>
                <p className="text-[9px] text-slate-400 font-sans tabular-nums mt-0.5">
                  Tasa Oficial BCV ({rateDateFmt}): Bs. {rate.toFixed(4)} / USD
                </p>
              </div>
            </div>
          </div>

          {/* Información Bancaria para Pago */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex flex-row items-center justify-between gap-3 text-[10.5px]">
            <div>
              <p className="text-[9px] font-bold uppercase text-slate-500 tracking-wider">Cuenta Receptora Autorizada</p>
              {bank ? (
                <div className="mt-0.5 space-y-0.5">
                  <p className="font-bold text-slate-900 leading-none">
                    {bank.bank_name} ({bank.bank_code}) · <span className="font-sans tabular-nums text-slate-700">{bank.account_number}</span> ({bank.account_type})
                  </p>
                  <p className="text-slate-600 text-[10px] leading-tight">
                    Titular: {bank.account_holder_name} (RIF: {bank.account_holder_rif})
                    {bank.supports_pago_movil && (
                      <span className="text-emerald-700 font-medium ml-2">
                        · Pago Móvil: {bank.bank_code} · {bank.pago_movil_phone} · RIF {bank.account_holder_rif}
                      </span>
                    )}
                  </p>
                </div>
              ) : (
                <p className="text-amber-600 font-medium text-[10.5px]">No hay cuentas bancarias configuradas para esta residencia.</p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <span className="inline-block px-2.5 py-0.5 bg-slate-200 text-slate-700 rounded-md font-bold text-[10px]">
                {data.status === 'PAID' ? 'RECIBO PAGADO' : data.status === 'VERIFIED' ? 'VERIFICADO' : 'PENDIENTE DE PAGO'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
