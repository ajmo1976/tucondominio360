'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  BadgeDollarSign,
  Building2,
  Download,
  FileBarChart,
  FileText,
  Info,
  Landmark,
  Loader2,
  PiggyBank,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { downloadWithAuth, fetchWithAuth } from '../lib/api';
import { usd } from '../lib/format';

interface DashboardData {
  condo: any;
  period: { id: string; label: string; status: string; dueDate: string } | null;
  kpis: {
    billing: { billedUsd: number; collectedUsd: number; collectionPct: number };
    reserveFund: { availableUsd: number; monthlyRate: number; deltaUsd: number; deltaPct: number };
    delinquency: { totalDebtUsd: number; monthlyBudgetUsd: number; indexPct: number };
    arrearsUnits: { count: number; totalUnits: number; pct: number };
  };
  spending: Array<{ bucket: string; amountUsd: number; pct: number }>;
  cashflow: Array<{ periodLabel: string; incomeUsd: number; expenseUsd: number }>;
  accounts: Array<{
    id: string;
    typeLabel: string;
    bankName: string;
    accountNumber: string;
    currency: string;
    supportsPagoMovil: boolean;
    balanceUsd: number | null;
    hasBalance: boolean;
  }>;
  documents: {
    hasReconciliation: boolean;
    hasExpensesReport: boolean;
    latestStatement: {
      fileName: string;
      statementFrom: string;
      statementTo: string;
      totalRecords: number;
      reconciledRecords: number;
      bankName: string;
    } | null;
  };
}

/* ------------------------------------------------------------------ UI */

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200/70 rounded-2xl ${className || 'h-28'}`} />;
}

/** Tooltip explicativo de métricas financieras. */
function Tip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group/tip ml-1.5 align-middle cursor-help text-slate-300 hover:text-emerald-600 transition">
      <Info className="w-3.5 h-3.5" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-normal leading-snug p-3 text-left shadow-xl opacity-0 group-hover/tip:opacity-100 transition-opacity z-20 hidden sm:block">
        {text}
      </span>
    </span>
  );
}

function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  const safe = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${className || 'bg-emerald-500'}`} style={{ width: `${safe}%` }} />
    </div>
  );
}

function maskAccount(accountNumber: string): string {
  if (accountNumber.length <= 6) return accountNumber;
  return `••••••${accountNumber.slice(-4)}`;
}

/** Falta de conexión o error del API: banner con reintento. */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="text-sm text-rose-700">
        <p className="font-semibold">No se pudo cargar el dashboard comunitario</p>
        <p className="text-rose-500 mt-0.5">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition shrink-0"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Reintentar
      </button>
    </div>
  );
}

const DONUT_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16', '#f97316'];

/* ------------------------------------------------------- Gráficos (SVG/CSS puro) */

function DonutChart({ data }: { data: DashboardData['spending'] }) {
  const total = data.reduce((a, b) => a + b.amountUsd, 0);
  const C = 2 * Math.PI * 58;
  let acc = 0;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0">
        <svg viewBox="0 0 160 160" className="w-40 h-40 -rotate-90">
          <circle cx="80" cy="80" r="58" fill="none" stroke="#f1f5f9" strokeWidth="26" />
          {data.map((slice) => {
            const len = (slice.amountUsd / total) * C;
            const offset = -acc;
            acc += len;
            return (
              <circle
                key={slice.bucket}
                cx="80"
                cy="80"
                r="58"
                fill="none"
                stroke={DONUT_COLORS[data.indexOf(slice) % DONUT_COLORS.length]}
                strokeWidth="26"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              >
                <title>{`${slice.bucket}: ${usd(slice.amountUsd)} (${slice.pct}%)`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Del mes</span>
          <span className="text-lg font-black text-slate-900">{usd(total)}</span>
        </div>
      </div>
      <ul className="w-full space-y-2 min-w-0">
        {data.map((slice, i) => (
          <li key={slice.bucket} className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="text-slate-600 truncate font-medium">{slice.bucket}</span>
            <span className="ml-auto font-mono font-semibold text-slate-800">{usd(slice.amountUsd)}</span>
            <span className="w-12 text-right text-slate-400 font-mono">{slice.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarChart({ data }: { data: DashboardData['cashflow'] }) {
  const max = Math.max(1, ...data.map((m) => Math.max(m.incomeUsd, m.expenseUsd)));
  const monthShort = (label: string) => label.slice(0, 3).replace(/\.$/, '');
  return (
    <div className="flex items-end justify-between gap-2 sm:gap-4 h-44">
      {data.map((m) => (
        <div key={m.periodLabel} className="flex flex-col items-center gap-1 flex-1 min-w-0 group/bar">
          <div className="flex items-end gap-1 w-full h-36 justify-center">
            <div
              className="w-4 sm:w-6 rounded-t-md bg-emerald-500 group-hover/bar:bg-emerald-400 transition-colors"
              style={{ height: `${(m.incomeUsd / max) * 100}%` }}
              title={`Ingresos ${m.periodLabel}: ${usd(m.incomeUsd)}`}
            />
            <div
              className="w-4 sm:w-6 rounded-t-md bg-slate-300 group-hover/bar:bg-slate-400 transition-colors"
              style={{ height: `${(m.expenseUsd / max) * 100}%` }}
              title={`Gastos ${m.periodLabel}: ${usd(m.expenseUsd)}`}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-medium">{monthShort(m.periodLabel)}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- Componente */

export function CommunityDashboard({ condo }: { condo: { id: string; name: string; rif: string } }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<'recon' | 'expenses' | ''>('');

  const load = useCallback(async () => {
    if (!condo?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`/community/dashboard/${condo.id}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  }, [condo?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const download = async (kind: 'recon' | 'expenses') => {
    const slug = condo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'residencia';
    setDownloading(kind);
    try {
      const endpoint =
        kind === 'recon'
          ? `/community/documents/${condo.id}/bank-reconciliation`
          : `/community/documents/${condo.id}/expenses-report`;
      const filename = `${kind === 'recon' ? 'conciliacion-bancaria' : 'relacion-de-gastos'}-${slug}.pdf`;
      await downloadWithAuth(endpoint, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar el documento.');
    } finally {
      setDownloading('');
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-44" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            Dashboard de la Comunidad
          </h1>
          <p className="text-sm text-slate-500 mt-1">{condo?.name || 'Residencia'} · transparencia financiera para copropietarios.</p>
        </header>
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  if (!data) return null;

  const k = data.kpis;
  const collectionPct = Math.round(k.billing.collectionPct * 10) / 10;
  const isSurplus =
    data.cashflow.length > 0
      ? data.cashflow[data.cashflow.length - 1].incomeUsd >= data.cashflow[data.cashflow.length - 1].expenseUsd
      : null;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            Dashboard de la Comunidad
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Salud financiera de <span className="font-bold text-slate-800">{data.condo.name}</span> (RIF:{' '}
            {data.condo.rif}) con total transparencia para sus copropietarios.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.period && (
            <span className="text-xs font-semibold px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-full inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Período {data.period.label}
            </span>
          )}
          <button
            onClick={load}
            className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 transition"
            title="Actualizar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* A. KPIs financieros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Facturación del mes */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center">
              Facturación del Mes
              <Tip text="Total facturado a toda la comunidad en el período (gastos ordinarios + extraordinarios + aporte al fondo de reserva) frente a lo recaudado hasta la fecha." />
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{usd(k.billing.billedUsd)}</div>
          <p className="text-xs text-slate-500 mt-1">
            <span className="font-semibold text-emerald-600">{usd(k.billing.collectedUsd)}</span> recaudado
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
              <span className="text-slate-400">Cobranza</span>
              <span className="text-emerald-600">{collectionPct}%</span>
            </div>
            <ProgressBar pct={collectionPct} className="bg-emerald-500" />
          </div>
        </div>

        {/* 2. Fondo de reserva */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center">
              Fondo de Reserva
              <Tip text={`Aportes al fondo de reserva (${k.reserveFund.monthlyRate}% del presupuesto) efectivamente recaudados: cada período aporta su cuota × el índice de cobranza de ese período.`} />
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <PiggyBank className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{usd(k.reserveFund.availableUsd)}</div>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <span className="font-semibold text-slate-400">Aporte: {k.reserveFund.monthlyRate}%</span>
            <span className="text-slate-300">·</span>
            {k.reserveFund.deltaUsd >= 0 ? (
              <span className="inline-flex items-center gap-0.5 text-emerald-600 font-semibold text-[11px]">
                <TrendingUp className="w-3.5 h-3.5" /> +{usd(k.reserveFund.deltaUsd)} vs mes anterior
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-rose-500 font-semibold text-[11px]">
                <TrendingDown className="w-3.5 h-3.5" /> {usd(k.reserveFund.deltaUsd)} vs mes anterior
              </span>
            )}
          </p>
        </div>

        {/* 3. Índice de morosidad global */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center">
              Morosidad Global
              <Tip text="Total por cobrar de toda la comunidad sobre el presupuesto facturado del mes. Es un indicador 100% agregado: nunca se muestran apartamentos o propietarios específicos." />
            </span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <BadgeDollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{k.delinquency.indexPct.toFixed(1)}%</div>
          <p className="text-xs text-slate-500 mt-1">
            <span className="font-semibold text-rose-600">{usd(k.delinquency.totalDebtUsd)}</span> por cobrar
          </p>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
              <span className="text-slate-400">sobre {usd(k.delinquency.monthlyBudgetUsd)} del mes</span>
            </div>
            <ProgressBar pct={k.delinquency.indexPct} className="bg-rose-500" />
          </div>
        </div>

        {/* 4. Apartamentos en mora */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider flex items-center">
              Apartamentos en Mora
              <Tip text="Contador agregado de unidades con saldo pendiente. Por privacidad y convivencia, NUNCA se muestran los números de apartamento ni la identidad de los vecinos en mora." />
            </span>
            <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
              <Landmark className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {k.arrearsUnits.count} <span className="text-base font-semibold text-slate-400">de {k.arrearsUnits.totalUnits} apartamentos</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            <span className="font-semibold text-sky-600">{k.arrearsUnits.pct.toFixed(1)}%</span> del parque inmobiliario
          </p>
          <p className="text-[10px] text-slate-400 mt-2 flex items-start gap-1">
            <Info className="w-3 h-3 shrink-0 mt-0.5" />
            Datos agregados · privacidad protegida
          </p>
        </div>
      </div>

      {/* B. Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Distribución del Gasto del Mes</h3>
              <p className="text-xs text-slate-500">Ejecución presupuestaria del período {data.period?.label || ''}</p>
            </div>
            <FileBarChart className="w-5 h-5 text-slate-300" />
          </div>
          {data.spending.length === 0 ? (
            <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-6 text-center">
              Sin gastos registrados en este período.
            </p>
          ) : (
            <DonutChart data={data.spending} />
          )}
        </div>

        {/* Barras */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Ingresos vs. Gastos</h3>
              <p className="text-xs text-slate-500">Últimos 6 meses — superávit operativo</p>
            </div>
            <FileBarChart className="w-5 h-5 text-slate-300" />
          </div>
          {data.cashflow.length === 0 ? (
            <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-6 text-center">
              Sin períodos facturados todavía.
            </p>
          ) : (
            <>
              <BarChart data={data.cashflow} />
              <div className="flex items-center justify-center gap-4 mt-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Ingresos
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-slate-300 inline-block" /> Gastos
                </span>
                <span className="hidden sm:inline-flex items-center gap-1">
                  {isSurplus === null ? (
                    <span className="text-slate-400">—</span>
                  ) : isSurplus ? (
                    <span className="text-emerald-600 font-semibold">Superávit ✓</span>
                  ) : (
                    <span className="text-rose-500 font-semibold">Déficit</span>
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* C. Cuentas y fondos */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
        <div className="mb-3">
          <h3 className="font-bold text-slate-900 text-sm">Cuentas y Fondos</h3>
          <p className="text-xs text-slate-500">Saldos disponibles por cuenta de la residencia (del último movimiento bancario cargado).</p>
        </div>
        {data.accounts.length === 0 ? (
          <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-6 text-center">
            La administración aún no registra cuentas bancarias para esta residencia.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200/70">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 bg-slate-50/60">
                  <th className="px-4 py-2.5 font-bold">Fondo / Cuenta</th>
                  <th className="px-4 py-2.5 font-bold">Banco</th>
                  <th className="px-4 py-2.5 font-bold">Nº de cuenta</th>
                  <th className="px-4 py-2.5 font-bold">Moneda</th>
                  <th className="px-4 py-2.5 font-bold text-right">Saldo disponible</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((acc) => (
                  <tr key={acc.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                        <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                          <Wallet className="w-3.5 h-3.5" />
                        </span>
                        {acc.typeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{acc.bankName}</td>
                    <td className="px-4 py-3 font-mono text-slate-500">{maskAccount(acc.accountNumber)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold text-[10px]">{acc.currency}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">
                      {acc.hasBalance ? usd(acc.balanceUsd) : <span className="text-slate-300 font-normal">Sin movimientos cargados</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* D. Soporte documental */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-sm">Conciliación Bancaria Oficial</h3>
              <p className="text-xs text-slate-500 mt-1">
                {data.documents.hasReconciliation && data.documents.latestStatement ? (
                  <>
                    {data.documents.latestStatement.bankName} · período del{' '}
                    {String(data.documents.latestStatement.statementFrom).slice(0, 10)} al{' '}
                    {String(data.documents.latestStatement.statementTo).slice(0, 10)} ·{' '}
                    {data.documents.latestStatement.reconciledRecords} de {data.documents.latestStatement.totalRecords} movimientos.
                  </>
                ) : (
                  'El administrador aún no ha cargado el estado de cuenta del banco para este período.'
                )}
              </p>
              <button
                onClick={() => download('recon')}
                disabled={!data.documents.hasReconciliation || downloading === 'recon'}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed bg-rose-600 hover:bg-rose-700 text-white"
              >
                {downloading === 'recon' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Descargar PDF
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
              <FileBarChart className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-sm">Facturas y Soportes de Gastos</h3>
              <p className="text-xs text-slate-500 mt-1">
                {data.documents.hasExpensesReport
                  ? `Relación detallada de las facturas y gastos ejecutados del período ${data.period?.label || ''}.`
                  : 'Este período aún no tiene gastos registrados para listar.'}
              </p>
              <button
                onClick={() => download('expenses')}
                disabled={!data.documents.hasExpensesReport || downloading === 'expenses'}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {downloading === 'expenses' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Descargar PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Nota de transparencia */}
      <div className="flex items-start gap-2 text-[11px] text-slate-400 bg-slate-50 rounded-xl p-3">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          Este dashboard es de solo lectura para los copropietarios. Los indicadores de morosidad son agregados y protegen la
          privacidad de cada vecino; tus propios recibos y reportes de pago están en <strong>Mis Recibos</strong>.
        </p>
      </div>
    </div>
  );
}