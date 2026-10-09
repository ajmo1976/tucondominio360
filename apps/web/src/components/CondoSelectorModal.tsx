'use client';

import React, { useState } from 'react';
import { X, Building2, MapPin, Shield, Check, Plus, Edit, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';
import { toNum } from '../lib/format';

interface CondoSelectorModalProps {
  condos: any[];
  selectedCondo: any;
  onSelectCondo: (condo: any) => void;
  onClose: () => void;
  onCondoUpdated: () => void;
  onCondoDeleted: (condo: any) => void;
}

export function CondoSelectorModal({
  condos,
  selectedCondo,
  onSelectCondo,
  onClose,
  onCondoUpdated,
  onCondoDeleted,
}: CondoSelectorModalProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingCondo, setEditingCondo] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({
    name: '',
    rif: '',
    address: '',
    city: 'Caracas',
    state: 'Miranda',
    reserveFundRate: 10,
  });

  const handleOpenCreate = () => {
    setEditingCondo(null);
    setForm({
      name: '',
      rif: '',
      address: '',
      city: 'Caracas',
      state: 'Miranda',
      reserveFundRate: 10,
    });
    setShowForm(true);
  };

  const handleOpenEdit = (c: any) => {
    setEditingCondo(c);
    setForm({
      name: c.name || '',
      rif: c.rif || '',
      address: c.address || '',
      city: c.city || 'Caracas',
      state: c.state || 'Miranda',
      // El % se precarga con el valor real de la residencia. Solo si la
      // residencia no tiene ninguno se usa el 10% legal del esquema.
      reserveFundRate: toNum(c.reserve_fund_rate) ?? 10,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingCondo) {
        await fetchWithAuth(`/condos/${editingCondo.id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
        setSuccessMsg('¡Residencia actualizada con éxito!');
      } else {
        await fetchWithAuth('/condos', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        setSuccessMsg('¡Nueva residencia registrada con éxito!');
      }

      setShowForm(false);
      onCondoUpdated();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Elimina la residencia y TODOS sus datos. El borrado es definitivo e
  // irreversible: se confirma dos veces el alcance antes de llamar al backend.
  const handleDeleteCondo = async (c: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId) return;
    const confirmed = window.confirm(
      `¿Eliminar "${c.name}" (${c.rif || 'sin RIF'}) de forma definitiva?\n\n` +
        'Se borrarán TODOS sus datos: períodos, recibos, gastos, propietarios, unidades, pagos y cuentas bancarias.\n' +
        'Esta acción NO se puede deshacer.',
    );
    if (!confirmed) return;
    setDeletingId(c.id);
    try {
      await fetchWithAuth(`/condos/${c.id}`, { method: 'DELETE' });
      setSuccessMsg(`Residencia "${c.name}" eliminada.`);
      onCondoDeleted(c);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      window.alert(err.message || 'No se pudo eliminar la residencia');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Building2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-base leading-tight">Gestión de Residencias y Condominios</h3>
              <p className="text-xs text-slate-400">Selecciona o administra la cartera de inmuebles</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {!showForm ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Residencias en Cartera ({condos.length})</span>
                <button
                  onClick={handleOpenCreate}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Registrar Nueva Residencia</span>
                </button>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {condos && condos.length > 0 ? (
                  condos.map((c) => {
                    const isSelected = c.id === selectedCondo?.id;
                    return (
                      <div
                        key={c.id}
                        className={`p-4 rounded-xl border flex items-center justify-between transition ${
                          isSelected ? 'bg-emerald-50/70 border-emerald-300' : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div
                          onClick={() => {
                            onSelectCondo(c);
                            onClose();
                          }}
                          className="space-y-1 cursor-pointer flex-1 pr-4"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-900 text-sm">{c.name}</span>
                            {isSelected && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 text-emerald-900">
                                Activo
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{c.city}, {c.state} · RIF: {c.rif}</span>
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Dirección: {c.address || 'No especificada'}
                          </p>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            onClick={() => handleOpenEdit(c)}
                            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg transition shadow-sm"
                            title="Modificar Residencia"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteCondo(c, e)}
                            disabled={deletingId === c.id}
                            className="p-2 bg-white hover:bg-rose-50 border border-slate-200 text-rose-500 hover:text-rose-600 rounded-lg transition shadow-sm disabled:opacity-50 disabled:cursor-wait"
                            title="Eliminar Residencia (borra todos sus datos)"
                          >
                            <Trash2 className={`w-4 h-4 ${deletingId === c.id ? 'animate-pulse' : ''}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-slate-400">No hay residencias registradas.</div>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <h4 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-200">
                {editingCondo ? 'Modificar Datos de la Residencia' : 'Registrar Nueva Residencia'}
              </h4>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre del Conjunto Residencial</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Residencias Monte Mayor"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">RIF</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: J-40112233-4"
                    value={form.rif}
                    onChange={(e) => setForm({ ...form, rif: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fondo de Reserva (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={form.reserveFundRate}
                    onChange={(e) => setForm({ ...form, reserveFundRate: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ciudad</label>
                  <input
                    type="text"
                    required
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estado</label>
                  <input
                    type="text"
                    required
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dirección Completa</label>
                <textarea
                  rows={2}
                  required
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
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
                  {loading ? 'Guardando...' : editingCondo ? 'Actualizar Residencia' : 'Guardar Residencia'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
