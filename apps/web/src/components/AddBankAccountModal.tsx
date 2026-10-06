'use client';

import React, { useState } from 'react';
import { Landmark, X, Smartphone, CreditCard, CheckCircle2, Edit, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';

interface AddBankAccountModalProps {
  condoId: string;
  condoName: string;
  condoRif: string;
  existingAccount?: any | null;
  onClose: () => void;
  onAccountSaved: () => void;
}

const VENEZUELAN_BANKS_LIST = [
  { code: '0134', name: 'Banesco Banco Universal' },
  { code: '0102', name: 'Banco de Venezuela' },
  { code: '0105', name: 'Banco Mercantil' },
  { code: '0108', name: 'Banco Provincial (BBVA)' },
  { code: '0172', name: 'Bancamiga Banco Universal' },
  { code: '0191', name: 'Banco Nacional de Crédito (BNC)' },
  { code: '0114', name: 'Bancaribe' },
  { code: '0174', name: 'Banplus' },
  { code: '0168', name: 'Bancrecer' },
  { code: '0151', name: 'BFC Banco Fondo Común' },
];

export function AddBankAccountModal({
  condoId,
  condoName,
  condoRif,
  existingAccount,
  onClose,
  onAccountSaved,
}: AddBankAccountModalProps) {
  const [bankCode, setBankCode] = useState(existingAccount?.bank_code || '0134');
  const [accountNumber, setAccountNumber] = useState(existingAccount?.account_number || '0134');
  const [accountType, setAccountType] = useState(existingAccount?.account_type || 'Corriente');
  const [currency, setCurrency] = useState(existingAccount?.currency || 'VES');
  const [accountHolderName, setAccountHolderName] = useState(existingAccount?.account_holder_name || condoName || '');
  const [accountHolderRif, setAccountHolderRif] = useState(existingAccount?.account_holder_rif || condoRif || '');
  const [supportsPagoMovil, setSupportsPagoMovil] = useState(existingAccount?.supports_pago_movil ?? true);
  const [pagoMovilPhone, setPagoMovilPhone] = useState(existingAccount?.pago_movil_phone || '0414');
  const [loading, setLoading] = useState(false);

  const selectedBank = VENEZUELAN_BANKS_LIST.find((b) => b.code === bankCode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        bankCode,
        bankName: selectedBank?.name || 'Banco Nacional',
        accountNumber,
        accountType,
        currency,
        accountHolderName,
        accountHolderRif,
        supportsPagoMovil,
        pagoMovilPhone: supportsPagoMovil ? pagoMovilPhone : null,
        pagoMovilIdType: 'J',
        pagoMovilIdNumber: accountHolderRif.replace(/[^0-9]/g, ''),
      };

      if (existingAccount?.id) {
        await fetchWithAuth(`/condos/bank-accounts/${existingAccount.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchWithAuth(`/condos/${condoId}/bank-accounts`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      onAccountSaved();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Landmark className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-base leading-tight">
                {existingAccount ? 'Editar Cuenta Receptora' : 'Asignar Cuenta Receptora'}
              </h3>
              <p className="text-xs text-slate-400">{condoName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Banco Receptor (Venezuela)</label>
            <select
              value={bankCode}
              onChange={(e) => {
                const code = e.target.value;
                setBankCode(code);
                setAccountNumber(code + accountNumber.slice(4));
              }}
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-semibold"
            >
              {VENEZUELAN_BANKS_LIST.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} - {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tipo de Cuenta</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
              >
                <option value="Corriente">Corriente</option>
                <option value="Ahorro">Ahorro</option>
                <option value="Custodia USD">Custodia USD</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-bold"
              >
                <option value="VES">Bolívares (VES)</option>
                <option value="USD">Divisas (USD)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Número de Cuenta (20 Dígitos)</label>
            <input
              type="text"
              required
              maxLength={20}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Titular de la Cuenta</label>
              <input
                type="text"
                required
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">RIF del Titular</label>
              <input
                type="text"
                required
                value={accountHolderRif}
                onChange={(e) => setAccountHolderRif(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
              />
            </div>
          </div>

          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
            <label className="flex items-center space-x-2 font-semibold text-emerald-900 cursor-pointer">
              <input
                type="checkbox"
                checked={supportsPagoMovil}
                onChange={(e) => setSupportsPagoMovil(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Habilitar Pago Móvil para este conjunto</span>
            </label>

            {supportsPagoMovil && (
              <div>
                <label className="block font-semibold text-emerald-900 mb-1">Teléfono Afiliado a Pago Móvil</label>
                <input
                  type="text"
                  required
                  placeholder="04141234567"
                  value={pagoMovilPhone}
                  onChange={(e) => setPagoMovilPhone(e.target.value)}
                  className="w-full bg-white border border-emerald-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm transition"
            >
              {loading ? 'Guardando...' : existingAccount ? 'Actualizar Cuenta' : 'Asignar Cuenta al Conjunto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
