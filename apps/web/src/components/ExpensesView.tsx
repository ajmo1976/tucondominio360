'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Tag, DollarSign, Receipt, FileText, CheckCircle2, AlertTriangle, RefreshCw, Edit, Trash2, X } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';
import { toNum, usd, bcvRateNum } from '../lib/format';

interface ExpensesViewProps {
  bcvRate: string;
  condoId: string;
  onExpenseAdded: () => void;
}

export function ExpensesView({ bcvRate, condoId, onExpenseAdded }: ExpensesViewProps) {
  // Tasa BCV vigente. Antes se caía a 36.85 cuando no había tasa, lo que
  // guardaba un monto convertido con una tasa vieja. Si no hay tasa, queda en
  // null y el backend la resuelve al registrar el gasto.
  const rateNum = bcvRateNum(bcvRate);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [billingPeriods, setBillingPeriods] = useState<any[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [reserveFundRate, setReserveFundRate] = useState<number | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'ORDINARY_RECURRENT' | 'EXTRAORDINARY'>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Formulario nuevo gasto
  const [formData, setFormData] = useState({
    billingPeriodId: '',
    categoryId: '',
    description: '',
    invoiceNumber: '',
    controlNumber: '',
    expenseDate: new Date().toISOString().split('T')[0],
    expenseType: 'COMMON',
    expenseSubtype: 'ORDINARY_RECURRENT',
    currency: 'USD',
    amountOriginal: '',
    installmentTotal: 1,
    exchangeRate: rateNum ?? 0,
  });

  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    description: '',
    amountOriginal: '',
    expenseSubtype: 'ORDINARY_RECURRENT',
  });

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryCode, setNewCategoryCode] = useState('');

  const loadExpenses = async (periodIdToFetch?: string) => {
    try {
      // El % del Fondo de Reserva se lee SIEMPRE de la residencia seleccionada.
      // Nunca se cablea en el frontend: si cambia en el formulario de la
      // residencia, esta tarjeta refleja el valor nuevo de inmediato.
      const condoList = await fetchWithAuth('/condos');
      if (Array.isArray(condoList)) {
        const currentCondo = condoList.find((c: any) => c.id === condoId);
        const rate = Number(currentCondo?.reserve_fund_rate);
        if (Number.isFinite(rate)) setReserveFundRate(rate);
      }

      const periods = await fetchWithAuth(`/billing/condos/${condoId}/periods`);
      if (Array.isArray(periods)) {
        setBillingPeriods(periods);
        const targetPeriodId = periodIdToFetch || selectedPeriodId || (periods.length > 0 ? periods[0].id : null);
        if (targetPeriodId) {
          setSelectedPeriodId(targetPeriodId);
          setFormData((prev) => ({ ...prev, billingPeriodId: targetPeriodId }));
          const exp = await fetchWithAuth(`/billing/condos/${condoId}/expenses?periodId=${targetPeriodId}`);
          if (Array.isArray(exp)) setExpenses(exp);
        } else {
          setExpenses([]);
        }
      }

      const cats = await fetchWithAuth(`/billing/condos/${condoId}/categories`);
      if (Array.isArray(cats)) {
        setCategories(cats);
        if (cats.length > 0 && !formData.categoryId) {
          setFormData((prev) => ({ ...prev, categoryId: cats[0].id }));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // Se vacían todos los datos de la residencia anterior antes de pedir los
    // nuevos: evita que los gastos, categorías y períodos de una residencia
    // queden visibles bajo el encabezado de otra (mezcla de datos).
    setSelectedPeriodId('');
    setExpenses([]);
    setCategories([]);
    setBillingPeriods([]);
    loadExpenses();
  }, [condoId]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetchWithAuth(`/billing/condos/${condoId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          amountOriginal: Number(formData.amountOriginal),
          // Tasa vigente; si no hay, el backend la toma de la BCV.
          exchangeRate: rateNum ?? undefined,
        }),
      });
      setSuccessMsg('¡Gasto registrado con éxito en la relación del mes!');
      setShowAddModal(false);
      setFormData((prev) => ({
        ...prev,
        description: '',
        invoiceNumber: '',
        controlNumber: '',
        amountOriginal: '',
      }));
      loadExpenses();
      onExpenseAdded();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (exp: any) => {
    setEditingExpense(exp);
    setEditForm({
      description: exp.description || '',
      amountOriginal: String(exp.amount_original || exp.amount_usd || ''),
      expenseSubtype: exp.expense_subtype || 'ORDINARY_RECURRENT',
    });
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetchWithAuth(`/billing/expenses/${editingExpense.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...editForm,
          amountOriginal: Number(editForm.amountOriginal),
          exchangeRate: rateNum ?? undefined,
          currency: 'USD',
        }),
      });
      setSuccessMsg('¡Gasto actualizado con éxito!');
      setEditingExpense(null);
      loadExpenses();
      onExpenseAdded();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchWithAuth(`/billing/condos/${condoId}/categories`, {
        method: 'POST',
        body: JSON.stringify({ name: newCategoryName, code: newCategoryCode }),
      });
      setShowCategoryModal(false);
      setNewCategoryName('');
      setNewCategoryCode('');
      loadExpenses();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm('¿Estás seguro de eliminar este gasto de la relación?')) return;
    try {
      await fetchWithAuth(`/billing/expenses/${expenseId}`, {
        method: 'DELETE',
      });
      setSuccessMsg('Gasto eliminado exitosamente.');
      loadExpenses();
      onExpenseAdded();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error(err);
    }
  };
  const ordinaryExpenses = expenses.filter(
    (e) => (e.expense_subtype || 'ORDINARY_RECURRENT') === 'ORDINARY_RECURRENT',
  );
  const extraordinaryExpenses = expenses.filter(
    (e) => e.expense_subtype === 'EXTRAORDINARY',
  );

  const subtotalOrdinary = ordinaryExpenses.reduce((acc, e) => acc + Number(e.amount_usd || 0), 0);
  const subtotalExtraordinary = extraordinaryExpenses.reduce((acc, e) => acc + Number(e.amount_usd || 0), 0);
  const grandTotalUsd = subtotalOrdinary + subtotalExtraordinary;
  // Fondo de Reserva = Total Relación Mes x % configurado en la residencia.
  // Mientras el % no llega desde la API se muestra "—" en vez de un 0 engañoso.
  const reserveFundUsd = reserveFundRate === null ? null : grandTotalUsd * (reserveFundRate / 100);
  const reserveFundRateLabel =
    reserveFundRate === null
      ? '—'
      : Number.isInteger(reserveFundRate)
      ? String(reserveFundRate)
      : reserveFundRate.toFixed(2);

  const filteredExpenses =
    filterType === 'ORDINARY_RECURRENT'
      ? ordinaryExpenses
      : filterType === 'EXTRAORDINARY'
      ? extraordinaryExpenses
      : expenses;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Relación de Gastos Comunes</h1>
          <p className="text-sm text-slate-500">
            Clasificación mensual entre <span className="font-semibold text-blue-700">Gastos Ordinarios Recurrentes</span> y <span className="font-semibold text-amber-700">Gastos Extraordinarios / Imprevistos</span>.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-white border border-slate-300 rounded-xl px-3 py-1.5 shadow-sm">
            <span className="text-xs font-semibold text-slate-600">Período / Mes:</span>
            <select
              value={selectedPeriodId}
              onChange={(e) => {
                setSelectedPeriodId(e.target.value);
                loadExpenses(e.target.value);
              }}
              className="bg-transparent font-bold text-xs text-slate-900 focus:outline-none cursor-pointer"
            >
              {billingPeriods.map((p) => {
                const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                return (
                  <option key={p.id} value={p.id}>
                    {monthNames[p.period_month]} {p.period_year}
                  </option>
                );
              })}
            </select>
          </div>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
          >
            <Tag className="w-3.5 h-3.5 text-slate-600" />
            <span>Categorías</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Cargar Nueva Factura / Gasto</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Resumen Discriminado: Ordinario vs Extraordinario */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Ordinarios */}
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm">
          <div className="flex items-center justify-between text-blue-600 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">1. Gastos Ordinarios</span>
            <RefreshCw className="w-4 h-4" />
          </div>
          <p className="text-xl font-bold text-slate-900">${subtotalOrdinary.toFixed(2)} USD</p>
          <p className="text-[11px] text-slate-500">Nómina, Agua, Luz, Ascensor, Jardín</p>
        </div>

        {/* Extraordinarios */}
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm">
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">2. Gastos Extraordinarios</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <p className="text-xl font-bold text-amber-900">${subtotalExtraordinary.toFixed(2)} USD</p>
          <p className="text-[11px] text-slate-500">Portón eléctrico, bombas, imprevistos</p>
        </div>

        {/* Fondo Reserva */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            3. Fondo de Reserva ({reserveFundRateLabel}%)
          </span>
          <p className="text-xl font-bold text-slate-800 mt-1">
            {reserveFundUsd === null ? '— USD' : `$${reserveFundUsd.toFixed(2)} USD`}
          </p>
          <p className="text-[11px] text-slate-500">
            {reserveFundRateLabel}% sobre el Total Relación Mes (Ordinarios + Extraordinarios)
          </p>
        </div>

        {/* Gran Total */}
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-300 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Total Relación Mes</span>
          <p className="text-xl font-black text-emerald-950 mt-1">{usd(grandTotalUsd)} USD</p>
          <p className="text-[11px] text-emerald-700 font-mono">
            {rateNum === null ? (
              'Tasa BCV no disponible'
            ) : (
              <>
                ≈ Bs.{' '}
                {(grandTotalUsd * rateNum).toLocaleString('es-VE', {
                  minimumFractionDigits: 2,
                })}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Filtros de la Tabla */}
      <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl w-fit text-xs font-semibold">
        <button
          onClick={() => setFilterType('ALL')}
          className={`px-3 py-1.5 rounded-lg transition ${
            filterType === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Todos los Gastos ({expenses.length})
        </button>
        <button
          onClick={() => setFilterType('ORDINARY_RECURRENT')}
          className={`px-3 py-1.5 rounded-lg transition ${
            filterType === 'ORDINARY_RECURRENT' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          🔄 Ordinarios Recurrentes ({ordinaryExpenses.length})
        </button>
        <button
          onClick={() => setFilterType('EXTRAORDINARY')}
          className={`px-3 py-1.5 rounded-lg transition ${
            filterType === 'EXTRAORDINARY' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          ⚠️ Extraordinarios e Imprevistos ({extraordinaryExpenses.length})
        </button>
      </div>

      {/* Tabla de Facturas y Gastos */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Descripción del Gasto</th>
                <th className="py-3 px-4">Categoría</th>
                <th className="py-3 px-4">Tipo de Gasto</th>
                <th className="py-3 px-4 text-right">Monto ($ USD)</th>
                <th className="py-3 px-4 text-right">Equivalente (Bs.)</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-4 font-mono text-slate-600">
                    {new Date(exp.expense_date).toLocaleDateString('es-VE')}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {exp.description}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">
                      {exp.category_name || 'General'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {exp.expense_subtype === 'EXTRAORDINARY' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        EXTRAORDINARIO / IMPREVISTO
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                        ORDINARIO RECURRENTE
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900">
                    ${Number(exp.amount_usd).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600">
                    Bs. {Number(exp.amount_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <button
                        onClick={() => handleOpenEdit(exp)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                        title="Editar Gasto"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition"
                        title="Eliminar Gasto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Cargar Gasto */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-slate-900 text-base mb-4 pb-3 border-b border-slate-200">
              Cargar Nueva Factura o Gasto de Condominio
            </h3>
            <form onSubmit={handleCreateExpense} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">📅 Mes / Período de Cobro Asociado (Recibo)</label>
                <select
                  value={formData.billingPeriodId}
                  onChange={(e) => setFormData({ ...formData, billingPeriodId: e.target.value })}
                  className="w-full bg-white border border-emerald-500 rounded-lg p-2.5 text-slate-900 font-bold"
                  required
                >
                  {billingPeriods.map((p) => {
                    const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                    return (
                      <option key={p.id} value={p.id}>
                        {monthNames[p.period_month]} {p.period_year} (Vence: {new Date(p.due_date).toLocaleDateString()})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descripción del Concepto</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Reparación de portón eléctrico de estacionamiento"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Clasificación del Gasto</label>
                  <select
                    value={formData.expenseSubtype}
                    onChange={(e) => setFormData({ ...formData, expenseSubtype: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-semibold"
                  >
                    <option value="ORDINARY_RECURRENT">🔄 Ordinario Recurrente (Fijo mensual)</option>
                    <option value="EXTRAORDINARY">⚠️ Extraordinario / Imprevisto / Reparación</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoría</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monto en Divisas ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Ej: 250.00"
                    value={formData.amountOriginal}
                    onChange={(e) => setFormData({ ...formData, amountOriginal: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fraccionar en Cuotas (Partes)</label>
                  <select
                    value={formData.installmentTotal}
                    onChange={(e) => setFormData({ ...formData, installmentTotal: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-bold"
                  >
                    <option value={1}>Pago Único (1 parte)</option>
                    <option value={2}>Fraccionar en 2 Partes (Cuotas)</option>
                    <option value={3}>Fraccionar en 3 Partes (Cuotas)</option>
                    <option value={4}>Fraccionar en 4 Partes (Cuotas)</option>
                    <option value={6}>Fraccionar en 6 Partes (Cuotas)</option>
                    <option value={12}>Fraccionar en 12 Partes (Cuotas)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">N° de Factura</label>
                  <input
                    type="text"
                    placeholder="Ej: FACT-00912"
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">N° Control Fiscal SENIAT</label>
                  <input
                    type="text"
                    placeholder="Ej: 00-123456"
                    value={formData.controlNumber}
                    onChange={(e) => setFormData({ ...formData, controlNumber: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm transition"
                >
                  {loading ? 'Guardando...' : 'Cargar Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear Categoría */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-slate-900 text-base mb-3 pb-2 border-b border-slate-200">
              Nueva Categoría de Gasto
            </h3>
            <form onSubmit={handleCreateCategory} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre de la Categoría</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Fumigación y Desinfección"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Código Abreviado</label>
                <input
                  type="text"
                  placeholder="Ej: FUMIG"
                  value={newCategoryCode}
                  onChange={(e) => setNewCategoryCode(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono uppercase"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold"
                >
                  Crear Categoría
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Editar Gasto */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-slate-900 text-base mb-4 pb-3 border-b border-slate-200">
              Modificar Gasto o Factura
            </h3>
            <form onSubmit={handleUpdateExpense} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descripción del Concepto</label>
                <input
                  type="text"
                  required
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Clasificación del Gasto</label>
                <select
                  value={editForm.expenseSubtype}
                  onChange={(e) => setEditForm({ ...editForm, expenseSubtype: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-semibold"
                >
                  <option value="ORDINARY_RECURRENT">🔄 Ordinario Recurrente (Fijo mensual)</option>
                  <option value="EXTRAORDINARY">⚠️ Extraordinario / Imprevisto / Reparación</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Monto en Divisas ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editForm.amountOriginal}
                  onChange={(e) => setEditForm({ ...editForm, amountOriginal: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm transition"
                >
                  {loading ? 'Guardando...' : 'Actualizar Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
