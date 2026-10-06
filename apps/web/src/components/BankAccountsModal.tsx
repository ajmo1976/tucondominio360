'use client';

import React, { useState } from 'react';
import { Building2, X, Plus, Smartphone, CreditCard, CheckCircle2, Edit, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';

interface BankAccountsModalProps {
  condoId: string;
  condoName: string;
  condoRif: string;
  bankAccounts: any[];
  onClose: () => void;
  onAccountAdded: () => void;
}

export function BankAccountsModal({
  condoId,
  condoName,
  condoRif,
  bankAccounts,
  onClose,
  onAccountAdded,
}: BankAccountsModalProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // El titular de la cuenta es esta residencia: nombre y RIF vienen de ella.
  // Antes se escribía el RIF de El Ávila, con lo que una cuenta nueva de
  // cualquier otra residencia quedaba a nombre de otra.
  const [form, setForm] = useState({
    bankCode: '0102',
    bankName: '',
    accountNumber: '',
    accountType: 'Corriente',
    currency: 'VES',
    accountHolderName: condoName,
    accountHolderRif: condoRif,
    supportsPagoMovil: true,
    pagoMovilPhone: '',
  });

  const handleOpenCreate = () => {
    setEditingAccount(null);
    setForm({
      bankCode: '0102',
      bankName: '',
      accountNumber: '',
      accountType: 'Corriente',
      currency: 'VES',
      accountHolderName: condoName,
      accountHolderRif: condoRif,
      supportsPagoMovil: true,
      pagoMovilPhone: '',
    });
    setShowForm(true);
  };

  const handleOpenEdit = (acc: any) => {
    setEditingAccount(acc);
    setForm({
      bankCode: acc.bank_code || '',
      bankName: acc.bank_name || '',
      accountNumber: acc.account_number || '',
      accountType: acc.account_type || 'Corriente',
      currency: acc.currency || 'VES',
      accountHolderName: acc.account_holder_name || condoName,
      accountHolderRif: acc.account_holder_rif || condoRif,
      supportsPagoMovil: acc.supports_pago_movil ?? true,
      pagoMovilPhone: acc.pago_movil_phone || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingAccount) {
        await fetchWithAuth(`/condos/bank-accounts/${editingAccount.id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
        setSuccessMsg('¡Cuenta bancaria actualizada con éxito!');
      } else {
        await fetchWithAuth(`/condos/${condoId}/bank-accounts`, {
          method: 'POST',
          body: JSON.stringify(form),
        });
        setSuccessMsg('¡Cuenta bancaria agregada con éxito!');
      }

      setShowForm(false);
      onAccountAdded();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (accountId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta cuenta receptora?')) return;
    try {
      await fetchWithAuth(`/condos/bank-accounts/${accountId}`, {
        method: 'DELETE',
      });
      setSuccessMsg('Cuenta eliminada exitosamente.');
      onAccountAdded();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <CreditCard className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-base leading-tight">Cuentas Receptoras de Cobro</h3>
              <p className="text-xs text-slate-400">Asignadas exclusivamente a {condoName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {!showForm ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Cuentas Bancarias Registradas ({bankAccounts.length})</span>
                <button
                  onClick={handleOpenCreate}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Agregar Cuenta / Pago Móvil</span>
                </button>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {bankAccounts && bankAccounts.length > 0 ? (
                  bankAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-sm">{acc.bank_name}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 font-mono">
                            {acc.currency}
                          </span>
                          {acc.supports_pago_movil && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Pago Móvil Activo
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600 font-mono">N° {acc.account_number}</p>
                        <p className="text-slate-500">
                          Titular: {acc.account_holder_name} · RIF: {acc.account_holder_rif}
                        </p>
                        {acc.supports_pago_movil && acc.pago_movil_phone && (
                          <p className="text-emerald-700 font-mono font-semibold">
                            📱 Teléfono Pago Móvil: {acc.pago_movil_phone}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          onClick={() => handleOpenEdit(acc)}
                          className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg transition shadow-sm"
                          title="Editar Cuenta"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(acc.id)}
                          className="p-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg transition shadow-sm"
                          title="Eliminar Cuenta"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    No hay cuentas receptoras configuradas para este condominio.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <h4 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-200">
                {editingAccount ? 'Editar Cuenta / Pago Móvil' : 'Registrar Nueva Cuenta / Pago Móvil'}
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Banco</label>
                  <select
                    value={form.bankCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const names: Record<string, string> = {
                        '0134': 'Banesco Banco Universal',
                        '0102': 'Banco de Venezuela',
                        '0105': 'Banco Mercantil',
                        '0108': 'BBVA Provincial',
                        '0191': 'Banco Nacional de Crédito (BNC)',
                        '0172': 'Bancamiga',
                      };
                      // Nombre del banco según el código elegido. Sin código
                      // no se inventa un banco por defecto.
                      setForm({ ...form, bankCode: code, bankName: names[code] || '' });
                    }}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-semibold"
                  >
                    <option value="">Selecciona el banco…</option>
                    <option value="0134">0134 - Banesco</option>
                    <option value="0102">0102 - Banco de Venezuela</option>
                    <option value="0105">0105 - Mercantil</option>
                    <option value="0108">0108 - Provincial</option>
                    <option value="0191">0191 - BNC</option>
                    <option value="0172">0172 - Bancamiga</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Moneda de la Cuenta</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-bold"
                  >
                    <option value="VES">Bolívares (VES)</option>
                    <option value="USD">Divisas / Custodia (USD)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Número de Cuenta (20 Dígitos)</label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  placeholder="01340000000000000000"
                  value={form.accountNumber}
                  onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Titular de la Cuenta</label>
                  <input
                    type="text"
                    required
                    value={form.accountHolderName}
                    onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">RIF del Titular</label>
                  <input
                    type="text"
                    required
                    value={form.accountHolderRif}
                    onChange={(e) => setForm({ ...form, accountHolderRif: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                <label className="flex items-center space-x-2 font-semibold text-emerald-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.supportsPagoMovil}
                    onChange={(e) => setForm({ ...form, supportsPagoMovil: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Habilitar Pago Móvil para esta cuenta</span>
                </label>

                {form.supportsPagoMovil && (
                  <div>
                    <label className="block font-semibold text-emerald-900 mb-1">Teléfono Afiliado a Pago Móvil</label>
                    <input
                      type="text"
                      placeholder="04141234567"
                      value={form.pagoMovilPhone}
                      onChange={(e) => setForm({ ...form, pagoMovilPhone: e.target.value })}
                      className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm"
                >
                  {loading ? 'Guardando...' : editingAccount ? 'Actualizar Cuenta' : 'Guardar Cuenta'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
