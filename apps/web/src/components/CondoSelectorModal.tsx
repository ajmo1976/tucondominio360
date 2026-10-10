'use client';

import React, { useState } from 'react';
import { X, Building2, MapPin, Shield, Check, Plus, Edit, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';
import { toNum } from '../lib/format';
import { suggestCondoCode, sanitizeCondoCode } from '../lib/condo-code';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

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
  // Confirmación de borrado estilo AWS: el usuario debe leer los riesgos y
  // teclear el nombre exacto de la residencia para habilitar el botón.
  const [condoToDelete, setCondoToDelete] = useState<any | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Marca si el usuario editó el código corto a mano; si no, se mantiene la
  // sugerencia automática derivada del nombre del conjunto.
  const [codeTouched, setCodeTouched] = useState(false);

  const [form, setForm] = useState({
    name: '',
    code: '',
    rif: '',
    address: '',
    city: 'Caracas',
    state: 'Miranda',
    reserveFundRate: 10,
  });

  const handleOpenCreate = () => {
    setEditingCondo(null);
    setCodeTouched(false);
    setForm({
      name: '',
      code: '',
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
    // Si la residencia aún no tiene código, se deja la sugerencia lista para
    // guardar; si ya lo tiene, se muestra tal cual y se respeta.
    setCodeTouched(!!c.code);
    setForm({
      name: c.name || '',
      code: c.code || suggestCondoCode(c.name || ''),
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

  // Al escribir el nombre se sugiere la abreviatura; se detiene cuando el
  // usuario toca el campo de código para no pisar su elección.
  const handleNameChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      name: value,
      code: codeTouched ? prev.code : suggestCondoCode(value),
    }));
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
  // irreversible: primero se abre el modal de doble confirmación (riesgos +
  // teclear el nombre exacto) y solo ahí se llama al backend.
  const handleDeleteCondo = async () => {
    if (!condoToDelete) return;
    if (deletingId) return;
    setDeletingId(condoToDelete.id);
    setDeleteError(null);
    try {
      await fetchWithAuth(`/condos/${condoToDelete.id}`, { method: 'DELETE' });
      setSuccessMsg(`Residencia "${condoToDelete.name}" eliminada.`);
      onCondoDeleted(condoToDelete);
      setCondoToDelete(null);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setDeleteError(err.message || 'No se pudo eliminar la residencia');
    } finally {
      setDeletingId(null);
    }
  };

  // Vista previa del número de recibo para dar contexto al código corto.
  const now = new Date();
  const previewYear = now.getFullYear();
  const previewMonth = String(now.getMonth() + 1).padStart(2, '0');
  const previewCode = form.code || suggestCondoCode(form.name) || 'CODIGO';

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
                            {c.code && (
                              <span
                                className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200"
                                title="Código que identifica a esta residencia en los recibos"
                              >
                                {c.code}
                              </span>
                            )}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!deletingId) {
                                setDeleteError(null);
                                setCondoToDelete(c);
                              }
                            }}
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
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Código corto para los recibos
                </label>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="Ej: MIRA"
                  value={form.code}
                  onChange={(e) => {
                    setCodeTouched(true);
                    setForm({ ...form, code: sanitizeCondoCode(e.target.value) });
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono uppercase tracking-wider"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Abreviatura del conjunto para numerar los recibos, así distingues los de cada residencia.
                  Vista previa:{' '}
                  <span className="font-mono font-semibold text-slate-700">
                    REC-{previewCode}-{previewYear}-{previewMonth}-31
                  </span>
                </p>
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

      {/* Modal de doble confirmación de borrado (estilo AWS) */}
      {condoToDelete && (
        <ConfirmDeleteModal
          title="Eliminar residencia"
          resourceName={condoToDelete.name}
          typePhrase={condoToDelete.name}
          busy={deletingId === condoToDelete.id}
          error={deleteError}
          risks={[
            'Se borrarán todos los períodos y recibos emitidos.',
            'Se borrarán gastos, pagos y conciliaciones.',
            'Se borrarán propietarios, unidades e inmuebles.',
            'Se borrarán cuentas bancarias, amenities, avisos, consultas y accesos.',
            'Esta acción no se puede deshacer ni recuperar.',
          ]}
          onConfirm={handleDeleteCondo}
          onClose={() => setCondoToDelete(null)}
        />
      )}
    </div>
  );
}
