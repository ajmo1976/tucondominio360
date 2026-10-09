'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Home,
  Loader2,
  Receipt,
  Send,
  X,
} from 'lucide-react';
import { fetchWithAuth } from '../lib/api';
import { usd } from '../lib/format';
import { ROLE_LABELS } from './UserFormModal';

interface UserDashboardModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

const BILL_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'PENDIENTE', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  PAID: { label: 'PAGADO', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PARTIAL: { label: 'PARCIAL', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  OVERDUE: { label: 'MOROSO', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELLED: { label: 'CANCELADO', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const PAY_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'PENDIENTE', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  VERIFIED: { label: 'CONCILIADO', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'RECHAZADO', className: 'bg-rose-50 text-rose-600 border-rose-200' },
};

function dateShort(value: string | null): string {
  if (!value) return '—';
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Dashboard de un usuario para la administración: residencias y roles,
 * unidades asignadas, recibos/deuda y pagos reportados. Da trazabilidad
 * transparente del estado real de cada persona del sistema.
 */
export function UserDashboardModal({ userId, userName, onClose }: UserDashboardModalProps) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetchWithAuth(`/users/${userId}/dashboard`);
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo cargar el dashboard del usuario.');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200">
        {/* Encabezado */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center text-sm font-black">
              {userName
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w.charAt(0).toUpperCase())
                .join('')}
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Dashboard de {userName}</h3>
              <p className="text-xs text-slate-400">
                Resumen de residencias, roles, deuda y pagos — administración transparente.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-slate-400 py-14 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando dashboard…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          ) : data ? (
            <>
              {/* Ficha del usuario */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">
                  {data.user.doc_type}-{data.user.doc_number}
                </span>
                {data.user.phone && (
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">
                    {data.user.phone}
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    data.user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${data.user.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  {data.user.isActive ? 'Activo' : 'Inactivo'}
                </span>
                {data.user.isSuperadmin && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900 text-emerald-400 text-[11px] font-bold">
                    <BadgeCheck className="w-3.5 h-3.5" />
                    Super Administrador
                  </span>
                )}
                <span className="text-slate-400">Creado {dateShort(data.user.createdAt)}</span>
              </div>

              {/* Indicadores */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-rose-400">Deuda total</p>
                  <p className="text-lg font-black text-rose-700 mt-1">{usd(data.summary.totalDebtUsd)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-100/50 p-4">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Recibos abiertos</p>
                  <p className="text-lg font-black text-slate-800 mt-1">{data.summary.openBills}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-amber-500">En validación</p>
                  <p className="text-lg font-black text-amber-700 mt-1">{data.summary.pendingPayments}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-500">Pagos conciliados</p>
                  <p className="text-lg font-black text-emerald-700 mt-1">{usd(data.summary.verifiedPaymentsUsd)}</p>
                </div>
              </div>

              {/* Residencias y roles */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> Residencias y roles ({data.summary.condosCount})
                </h4>
                {data.condos.length === 0 ? (
                  <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-4">Sin residencias asignadas.</p>
                ) : (
                  <div className="space-y-2">
                    {data.condos.map((c: any) => (
                      <div key={c.condoId} className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200/70 rounded-xl px-4 py-3">
                        <span className="font-semibold text-sm text-slate-800">{c.condoName}</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-900 text-emerald-400 text-[10px] font-bold">
                          {ROLE_LABELS[c.role] || c.role}
                        </span>
                        {!c.accessActive && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-bold border border-rose-200">
                            Acceso inactivo
                          </span>
                        )}
                        <span className="flex flex-wrap gap-1.5 ml-auto">
                          {c.units.map((u: any) => (
                            <span key={u.unitId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 text-[11px] font-semibold">
                              <Home className="w-3 h-3 text-emerald-500" />
                              {u.unitCode}
                              {u.buildingName ? ` · ${u.buildingName}` : ''}
                            </span>
                          ))}
                          {c.units.length === 0 && (
                            <span className="text-[11px] text-slate-400">sin unidades asignadas</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {data.units.length > 0 && (
                  <p className="text-[11px] text-amber-600 mt-2">
                    ⚠ Hay {data.units.length} unidad(es) ocupada(s) sin acceso de residencia registrado:{' '}
                    {data.units.map((u: any) => u.unitCode).join(', ')}.
                  </p>
                )}
              </div>

              {/* Recibos / deuda */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5" /> Recibos ({data.bills.length})
                </h4>
                {data.bills.length === 0 ? (
                  <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-4">Sin recibos para sus unidades.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 bg-slate-50/60">
                          <th className="px-3 py-2 font-bold">Período</th>
                          <th className="px-3 py-2 font-bold">Unidad</th>
                          <th className="px-3 py-2 font-bold">Vence</th>
                          <th className="px-3 py-2 font-bold text-right">Total</th>
                          <th className="px-3 py-2 font-bold text-right">Pagado</th>
                          <th className="px-3 py-2 font-bold text-right">Saldo</th>
                          <th className="px-3 py-2 font-bold">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.bills.map((b: any) => {
                          const st = BILL_STATUS[b.status] || { label: b.status, className: 'bg-slate-100 text-slate-500 border-slate-200' };
                          return (
                            <tr key={b.billId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                              <td className="px-3 py-2 font-semibold text-slate-700">{b.periodLabel}</td>
                              <td className="px-3 py-2">
                                <span className="text-slate-600">{b.unitCode}</span>
                                <span className="text-slate-300"> · {b.condoName}</span>
                              </td>
                              <td className="px-3 py-2 text-slate-500">{dateShort(b.dueDate)}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700">{usd(b.totalDueUsd)}</td>
                              <td className="px-3 py-2 text-right font-mono text-emerald-600">{usd(b.totalPaidUsd)}</td>
                              <td className="px-3 py-2 text-right font-mono text-rose-600">{usd(b.remainingUsd)}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${st.className}`}>
                                  {st.label}
                                  {b.pendingReports > 0 && <span className="ml-1">· {b.pendingReports} rep.</span>}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Pagos reportados */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" /> Pagos reportados ({data.summary.paymentsCount})
                </h4>
                {data.paymentReports.length === 0 ? (
                  <p className="text-sm text-slate-400 bg-slate-50 rounded-xl p-4">Este usuario no ha reportado pagos.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-200 bg-slate-50/60">
                          <th className="px-3 py-2 font-bold">Fecha</th>
                          <th className="px-3 py-2 font-bold">Unidad</th>
                          <th className="px-3 py-2 font-bold">Método</th>
                          <th className="px-3 py-2 font-bold">Referencia</th>
                          <th className="px-3 py-2 font-bold text-right">Monto</th>
                          <th className="px-3 py-2 font-bold text-right">USD</th>
                          <th className="px-3 py-2 font-bold">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.paymentReports.map((p: any) => {
                          const st = PAY_STATUS[p.status] || { label: p.status, className: 'bg-slate-100 text-slate-500 border-slate-200' };
                          return (
                            <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{dateShort(p.paymentDate)}</td>
                              <td className="px-3 py-2">
                                <span className="text-slate-600">{p.unitCode}</span>
                                <span className="text-slate-300"> · {p.condoName}</span>
                              </td>
                              <td className="px-3 py-2 text-slate-600">{p.method.replace('_', ' ')}</td>
                              <td className="px-3 py-2 font-mono text-slate-600">{p.referenceNumber}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700">
                                {p.amountPaid.toLocaleString('es-VE', { maximumFractionDigits: 2 })} {p.currency}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-emerald-600">{usd(p.equivalentUsd)}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${st.className}`}>
                                  {st.label}
                                </span>
                                {p.rejectionReason && (
                                  <span className="block mt-1 text-[10px] text-rose-500 max-w-[180px]">{p.rejectionReason}</span>
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
            </>
          ) : null}
        </div>

        {/* Pie */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}