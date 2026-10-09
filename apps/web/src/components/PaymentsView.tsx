'use client';

import React, { useState, useEffect } from 'react';
import { Check, X, Smartphone, ArrowDownRight, Plus, RefreshCw, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';
import { toNum, usd, bcvRateNum } from '../lib/format';

interface PaymentsViewProps {
  payments: any[];
  condoId: string;
  onRefresh: () => void;
  bcvRate: string;
}

export function PaymentsView({ payments, condoId, onRefresh, bcvRate }: PaymentsViewProps) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Inmuebles y cuentas de ESTA residencia. El formulario de pago usaba un
  // id de inmueble de El Ávila fijo, así que al reportar desde otra
  // residencia el pago quedaba apuntando a un inmueble ajeno.
  const [units, setUnits] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);

  useEffect(() => {
    if (!condoId) return;
    let cancelled = false;
    (async () => {
      try {
        const [u, a] = await Promise.all([
          fetchWithAuth(`/condos/${condoId}/units`).catch(() => []),
          fetchWithAuth(`/condos/${condoId}/bank-accounts`).catch(() => []),
        ]);
        if (cancelled) return;
        const unitList = Array.isArray(u) ? u : [];
        const accountList = Array.isArray(a) ? a : [];
        setUnits(unitList);
        setAccounts(accountList);
        setFormData((prev) => ({
          ...prev,
          propertyUnitId: prev.propertyUnitId || unitList[0]?.id || '',
          bankAccountId: prev.bankAccountId || accountList[0]?.id || '',
        }));
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [condoId]);

  // Formulario de Pago Móvil
  const [formData, setFormData] = useState({
    propertyUnitId: '',
    bankAccountId: '',
    paymentMethod: 'PAGO_MOVIL',
    referenceNumber: '',
    paymentDate: new Date().toISOString().split('T')[0],
    originBank: '',
    originPhone: '',
    originDocNumber: '',
    currency: 'VES',
    amountPaid: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const payload = {
        condoId: condoId,
        ...formData,
        amountPaid: Number(formData.amountPaid),
      };

      const res = await fetchWithAuth('/payments/report', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setMessage({ text: res.message || 'Pago registrado exitosamente', type: 'success' });
      setShowModal(false);
      onRefresh();
    } catch (err: any) {
      setMessage({ text: err.message || 'Error al reportar pago', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (paymentId: string, approved: boolean) => {
    try {
      await fetchWithAuth(`/payments/${paymentId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ approved }),
      });
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Conciliación de Pagos</h1>
          <p className="text-sm text-slate-500">
            Validación de pagos reportados por residentes contra extractos bancarios (Pago Móvil / Transferencias).
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onRefresh()}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
            title="Recargar pagos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Simular Reporte de Pago Móvil</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-xs font-medium flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Tabla de Pagos Reportados */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Inmueble / Reportado por</th>
                <th className="py-3 px-4">Recibo</th>
                <th className="py-3 px-4">Método / Referencia</th>
                <th className="py-3 px-4">Banco Destino</th>
                <th className="py-3 px-4 text-right">Monto Pagado</th>
                <th className="py-3 px-4 text-right">Equivalente ($ USD)</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments && payments.length > 0 ? (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-mono text-slate-700">
                      {new Date(p.payment_date).toLocaleDateString('es-VE')}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">Apto. {p.unit_code}</div>
                      <div className="text-[11px] text-slate-400">{p.reported_by_name}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      {p.linked_period ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                          {p.linked_period}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{p.payment_method}</span>
                      </div>
                      <div className="font-mono text-slate-500 text-[11px]">Ref: #{p.reference_number}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800">{p.bank_name || '—'}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {p.account_number ? `···${String(p.account_number).slice(-4)}` : ''}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                      {p.currency === 'USD'
                        ? `US$ ${Number(p.amount_paid).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                        : `Bs. ${Number(p.amount_paid).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                      ${Number(p.equivalent_usd).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {p.status === 'VERIFIED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          CONCILIADO
                        </span>
                      ) : p.status === 'REJECTED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                          RECHAZADO
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          PENDIENTE
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {p.status === 'PENDING' ? (
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleVerify(p.id, true)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition"
                            title="Aprobar y Conciliar"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleVerify(p.id, false)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition"
                            title="Rechazar Pago"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Procesado</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400">
                    No hay reportes de pago registrados aún.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal para Reportar Pago */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="font-bold text-slate-900">Reportar Pago Móvil (Simulador)</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Inmueble</label>
                <select
                  required
                  value={formData.propertyUnitId}
                  onChange={(e) => setFormData({ ...formData, propertyUnitId: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                >
                  <option value="">Selecciona el inmueble…</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_code}
                      {u.building_name ? ` · ${u.building_name}` : ''}
                      {u.floor !== null && u.floor !== undefined ? ` · Piso ${u.floor}` : ''}
                    </option>
                  ))}
                </select>
                {units.length === 0 && (
                  <span className="text-[10px] text-amber-600">
                    Esta residencia no tiene inmuebles registrados.
                  </span>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cuenta que recibe el pago</label>
                <select
                  required
                  value={formData.bankAccountId}
                  onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                >
                  <option value="">Selecciona la cuenta…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bank_name} ({a.bank_code}) · {a.account_number}
                    </option>
                  ))}
                </select>
                {accounts.length === 0 && (
                  <span className="text-[10px] text-amber-600">
                    Esta residencia no tiene cuenta bancaria registrada.
                  </span>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Número de Referencia Bancaria</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: 99482103"
                  value={formData.referenceNumber}
                  onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                />
                <span className="text-[10px] text-slate-400">El sistema validará que no esté duplicada</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monto en Bolívares (VES)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.amountPaid}
                    onChange={(e) => setFormData({ ...formData, amountPaid: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Equivalente ($)</label>
                  <div className="w-full bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-emerald-900 font-bold font-mono">
                    {(() => {
                      // La conversión usa la tasa vigente; sin tasa no se
                      // muestra un equivalente calculado con una tasa vieja.
                      const rate = bcvRateNum(bcvRate);
                      const paid = toNum(formData.amountPaid);
                      if (rate === null || paid === null) {
                        return (
                          <span className="text-slate-500 font-normal">
                            {rate === null ? 'Tasa BCV no disponible' : 'Ingresa el monto en Bs.'}
                          </span>
                        );
                      }
                      return `≈ ${usd(paid / rate)} USD`;
                    })()}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Teléfono Emisor Pago Móvil</label>
                <input
                  type="text"
                  value={formData.originPhone}
                  onChange={(e) => setFormData({ ...formData, originPhone: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm"
                >
                  {loading ? 'Enviando...' : 'Reportar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
