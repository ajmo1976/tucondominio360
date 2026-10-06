'use client';

import React, { useState } from 'react';
import { Building, User, Phone, CheckCircle2, ShieldCheck, Edit, Plus, X, Mail, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '../lib/api';
import { toNum } from '../lib/format';

interface UnitsViewProps {
  units: any[];
  condoId: string;
  onRefreshUnits: () => void;
}

export function UnitsView({ units, condoId, onRefreshUnits }: UnitsViewProps) {
  const [editingOwner, setEditingOwner] = useState<any | null>(null);
  const [editingUnit, setEditingUnit] = useState<any | null>(null);
  const [showAddOwnerModal, setShowAddOwnerModal] = useState(false);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [selectedUnitForNewOwner, setSelectedUnitForNewOwner] = useState<any | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Formulario editar propietario
  const [ownerForm, setOwnerForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    docNumber: '',
  });

  // Formulario editar unidad / alícuota
  const [unitForm, setUnitForm] = useState({
    unitCode: '',
    floor: '',
    aliquotPercentage: '',
    currentBalanceUsd: '',
    hasGasService: true,
    hasParking: false,
    parkingNumber: '',
    hasStorage: false,
    storageNumber: '',
  });

  // Formulario registrar nuevo inmueble
  const [newUnitForm, setNewUnitForm] = useState({
    unitCode: '',
    unitType: 'APARTMENT',
    floor: '1',
    // Sin alícuota por defecto: se exige la real de la residencia. Antes venía
    // 12.5 cableado, que es la alícuota de un apartamento de otra residencia.
    aliquotPercentage: '',
    currentBalanceUsd: '0',
    hasGasService: true,
    hasParking: false,
    parkingNumber: '',
    hasStorage: false,
    storageNumber: '',
  });

  // Formulario nuevo propietario
  const [newOwnerForm, setNewOwnerForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    docType: 'V',
    docNumber: '',
    role: 'OWNER',
  });

  // Suma real de alícuotas de los inmuebles de esta residencia. Antes caía a
  // 100 cuando no había lista, lo que hacía creer que el reparto cuadraba.
  const totalAliquot = units.reduce(
    (acc, u) => acc + (toNum(u.aliquot_percentage) ?? 0),
    0,
  );

  const handleOpenEditOwner = (occupant: any, unit: any) => {
    const names = occupant.name ? occupant.name.split(' ') : ['', ''];
    setEditingOwner({ ...occupant, unitCode: unit.unit_code });
    setOwnerForm({
      firstName: names[0] || '',
      lastName: names.slice(1).join(' ') || '',
      phone: occupant.phone || '',
      email: occupant.email || '',
      docNumber: occupant.docNumber ? occupant.docNumber.replace(/^[VE]-/, '') : '',
    });
  };

  const handleSaveOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchWithAuth(`/condos/owners/${editingOwner.userId}`, {
        method: 'PATCH',
        body: JSON.stringify(ownerForm),
      });
      setNotification(`¡Datos del propietario de ${editingOwner.unitCode} actualizados con éxito!`);
      setEditingOwner(null);
      onRefreshUnits();
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenEditUnit = (unit: any) => {
    setEditingUnit(unit);
    setUnitForm({
      unitCode: unit.unit_code,
      floor: unit.floor || '1',
      aliquotPercentage: String(unit.aliquot_percentage),
      currentBalanceUsd: String(unit.current_balance_usd),
      hasGasService: unit.has_gas_service ?? true,
      hasParking: unit.has_parking ?? false,
      parkingNumber: unit.parking_number || '',
      hasStorage: unit.has_storage ?? false,
      storageNumber: unit.storage_number || '',
    });
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchWithAuth(`/condos/units/${editingUnit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          unitCode: unitForm.unitCode,
          floor: unitForm.floor,
          aliquotPercentage: Number(unitForm.aliquotPercentage),
          currentBalanceUsd: Number(unitForm.currentBalanceUsd),
          hasGasService: unitForm.hasGasService,
          hasParking: unitForm.hasParking,
          parkingNumber: unitForm.parkingNumber,
          hasStorage: unitForm.hasStorage,
          storageNumber: unitForm.storageNumber,
        }),
      });
      setNotification(`¡Inmueble ${unitForm.unitCode} y alícuota actualizados con éxito!`);
      setEditingUnit(null);
      onRefreshUnits();
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchWithAuth(`/condos/${condoId}/units`, {
        method: 'POST',
        body: JSON.stringify({
          ...newUnitForm,
          aliquotPercentage: Number(newUnitForm.aliquotPercentage),
          currentBalanceUsd: Number(newUnitForm.currentBalanceUsd),
        }),
      });
      setNotification(`¡Inmueble ${newUnitForm.unitCode} registrado con éxito!`);
      setShowAddUnitModal(false);
      setNewUnitForm({
        unitCode: '',
        unitType: 'APARTMENT',
        floor: '1',
        aliquotPercentage: '',
        currentBalanceUsd: '0',
        hasGasService: true,
        hasParking: false,
        parkingNumber: '',
        hasStorage: false,
        storageNumber: '',
      });
      onRefreshUnits();
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUnit = async (unitId: string, unitCode: string) => {
    if (!confirm(`¿Estás seguro de eliminar el inmueble ${unitCode}?`)) return;
    try {
      await fetchWithAuth(`/condos/units/${unitId}`, {
        method: 'DELETE',
      });
      setNotification(`Inmueble ${unitCode} eliminado con éxito.`);
      onRefreshUnits();
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateNewOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchWithAuth(`/condos/${condoId}/units/${selectedUnitForNewOwner.id}/owners`, {
        method: 'POST',
        body: JSON.stringify(newOwnerForm),
      });
      setNotification(`¡Propietario asignado exitosamente al inmueble ${selectedUnitForNewOwner.unit_code}!`);
      setShowAddOwnerModal(false);
      setSelectedUnitForNewOwner(null);
      onRefreshUnits();
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inmuebles, Propietarios y Alícuotas</h1>
          <p className="text-sm text-slate-500">
            Padrón de copropietarios, asignación de apartamentos y coeficientes porcentuales legales (LPH).
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowAddUnitModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>+ Registrar Nuevo Inmueble</span>
          </button>
          <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-900">
              Suma Total de Alícuotas: <strong>{totalAliquot.toFixed(5)}%</strong>
            </span>
          </div>
        </div>
      </div>

      {notification && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{notification}</span>
        </div>
      )}

      {/* Grid de Apartamentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {units && units.length > 0 ? (
          units.map((unit) => {
            const occupant = unit.occupants && unit.occupants[0];
            return (
              <div
                key={unit.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:border-emerald-300 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-bold text-slate-900 font-mono">{unit.unit_code}</span>
                    <button
                      onClick={() => handleOpenEditUnit(unit)}
                      className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition"
                      title="Editar Alícuota / Unidad"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-400">Piso / Nivel:</span>
                      <span className="font-medium text-slate-800">
                        Piso {unit.floor || '1'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-400">Alícuota Legal:</span>
                      <span className="font-bold text-emerald-700 font-mono">
                        {Number(unit.aliquot_percentage).toFixed(5)}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-400">Servicio de Gas:</span>
                      <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${unit.has_gas_service ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                        {unit.has_gas_service ? 'CON GAS' : 'SIN GAS'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-slate-400">Maletero / Depósito:</span>
                      <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${unit.has_storage ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-500'}`}>
                        {unit.has_storage ? `Maletero #${unit.storage_number || 'S/N'}` : 'SIN MALETERO'}
                      </span>
                    </div>

                    <div className="pt-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-400 text-[11px] uppercase font-semibold">
                          Propietario / Contacto:
                        </span>
                        {occupant ? (
                          <button
                            onClick={() => handleOpenEditOwner(occupant, unit)}
                            className="text-[11px] text-emerald-600 hover:text-emerald-800 font-semibold flex items-center gap-1"
                          >
                            <Edit className="w-3 h-3" />
                            <span>Editar</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedUnitForNewOwner(unit);
                              setShowAddOwnerModal(true);
                            }}
                            className="text-[11px] text-emerald-600 hover:text-emerald-800 font-semibold flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Incluir</span>
                          </button>
                        )}
                      </div>

                      {occupant ? (
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                          <p className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            <span>{occupant.name}</span>
                          </p>
                          <p className="text-[11px] text-slate-600 font-mono mt-0.5">
                            {occupant.docNumber} · {occupant.phone || 'Sin tlf'}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            {occupant.email}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-amber-50/50 p-2 rounded-lg border border-amber-200/50 text-amber-800 text-[11px]">
                          Sin propietario asignado.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Saldo actual:</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 font-mono">
                      ${Number(unit.current_balance_usd).toFixed(2)} USD
                    </span>
                    <button
                      onClick={() => handleDeleteUnit(unit.id, unit.unit_code)}
                      className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition"
                      title="Eliminar Inmueble"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-4 text-center py-12 text-slate-400">
            No hay unidades inmobiliarias registradas en este conjunto. Haz clic en "+ Registrar Nuevo Inmueble".
          </div>
        )}
      </div>

      {/* Modal Registrar Nuevo Inmueble */}
      {showAddUnitModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="font-bold text-slate-900 text-base">Registrar Nuevo Inmueble / Apto</h3>
              <button onClick={() => setShowAddUnitModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUnit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código de Unidad</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: A-31"
                    value={newUnitForm.unitCode}
                    onChange={(e) => setNewUnitForm({ ...newUnitForm, unitCode: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo</label>
                  <select
                    value={newUnitForm.unitType}
                    onChange={(e) => setNewUnitForm({ ...newUnitForm, unitType: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  >
                    <option value="APARTMENT">Apartamento</option>
                    <option value="HOUSE">Casa</option>
                    <option value="COMMERCIAL">Local Comercial</option>
                    <option value="OFFICE">Oficina</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Piso</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 3"
                    value={newUnitForm.floor}
                    onChange={(e) => setNewUnitForm({ ...newUnitForm, floor: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Alícuota Legal (%)</label>
                  <input
                    type="number"
                    step="0.00001"
                    required
                    placeholder="Ej: 1.25"
                    value={newUnitForm.aliquotPercentage}
                    onChange={(e) => setNewUnitForm({ ...newUnitForm, aliquotPercentage: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <label className="flex items-center space-x-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newUnitForm.hasGasService}
                    onChange={(e) => setNewUnitForm({ ...newUnitForm, hasGasService: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span>Inmueble con servicio de gas habilitado</span>
                </label>

                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <label className="flex items-center space-x-2 font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newUnitForm.hasParking}
                      onChange={(e) => setNewUnitForm({ ...newUnitForm, hasParking: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Asignar Puesto de Estacionamiento</span>
                  </label>
                  {newUnitForm.hasParking && (
                    <input
                      type="text"
                      placeholder="N° de Puesto (Ej: P-10)"
                      value={newUnitForm.parkingNumber}
                      onChange={(e) => setNewUnitForm({ ...newUnitForm, parkingNumber: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-mono ml-6 max-w-[90%]"
                    />
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <label className="flex items-center space-x-2 font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newUnitForm.hasStorage}
                      onChange={(e) => setNewUnitForm({ ...newUnitForm, hasStorage: e.target.checked })}
                      className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                    />
                    <span>Asignar Maletero / Depósito</span>
                  </label>
                  {newUnitForm.hasStorage && (
                    <input
                      type="text"
                      placeholder="N° de Maletero (Ej: M-05)"
                      value={newUnitForm.storageNumber}
                      onChange={(e) => setNewUnitForm({ ...newUnitForm, storageNumber: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-mono ml-6 max-w-[90%]"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddUnitModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm"
                >
                  Registrar Inmueble
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Propietario */}
      {editingOwner && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="font-bold text-slate-900 text-base">
                Editar Propietario ({editingOwner.unitCode})
              </h3>
              <button onClick={() => setEditingOwner(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOwner} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    required
                    value={ownerForm.firstName}
                    onChange={(e) => setOwnerForm({ ...ownerForm, firstName: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Apellido</label>
                  <input
                    type="text"
                    required
                    value={ownerForm.lastName}
                    onChange={(e) => setOwnerForm({ ...ownerForm, lastName: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Correo Electrónico (Para envío de recibos)</label>
                <input
                  type="email"
                  required
                  value={ownerForm.email}
                  onChange={(e) => setOwnerForm({ ...ownerForm, email: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cédula</label>
                  <input
                    type="text"
                    required
                    value={ownerForm.docNumber}
                    onChange={(e) => setOwnerForm({ ...ownerForm, docNumber: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Teléfono Móvil / WhatsApp</label>
                  <input
                    type="text"
                    required
                    value={ownerForm.phone}
                    onChange={(e) => setOwnerForm({ ...ownerForm, phone: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingOwner(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm"
                >
                  Guardar Propietario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Unidad / Alícuota */}
      {editingUnit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="font-bold text-slate-900 text-base">
                Editar Inmueble y Alícuota ({editingUnit.unit_code})
              </h3>
              <button onClick={() => setEditingUnit(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUnit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código de Unidad</label>
                  <input
                    type="text"
                    required
                    value={unitForm.unitCode}
                    onChange={(e) => setUnitForm({ ...unitForm, unitCode: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Piso</label>
                  <input
                    type="text"
                    required
                    value={unitForm.floor}
                    onChange={(e) => setUnitForm({ ...unitForm, floor: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Alícuota Porcentual Legal (%)
                </label>
                <input
                  type="number"
                  step="0.00001"
                  required
                  value={unitForm.aliquotPercentage}
                  onChange={(e) => setUnitForm({ ...unitForm, aliquotPercentage: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono font-bold"
                />
                <span className="text-[10px] text-slate-400">
                  Precisión de 5 decimales según documento de condominio (LPH).
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Saldo Actual ($ USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={unitForm.currentBalanceUsd}
                  onChange={(e) => setUnitForm({ ...unitForm, currentBalanceUsd: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                />
                <span className="text-[10px] text-slate-400">
                  Positivo = Deuda pendiente. Negativo = Saldo a favor por abonos.
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <label className="flex items-center space-x-2 font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unitForm.hasGasService}
                    onChange={(e) => setUnitForm({ ...unitForm, hasGasService: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span>Inmueble con servicio de gas habilitado</span>
                </label>

                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <label className="flex items-center space-x-2 font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={unitForm.hasParking}
                      onChange={(e) => setUnitForm({ ...unitForm, hasParking: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span>Asignar Puesto de Estacionamiento</span>
                  </label>
                  {unitForm.hasParking && (
                    <input
                      type="text"
                      placeholder="N° de Puesto (Ej: P-42)"
                      value={unitForm.parkingNumber}
                      onChange={(e) => setUnitForm({ ...unitForm, parkingNumber: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-mono ml-6 max-w-[90%]"
                    />
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <label className="flex items-center space-x-2 font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={unitForm.hasStorage}
                      onChange={(e) => setUnitForm({ ...unitForm, hasStorage: e.target.checked })}
                      className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                    />
                    <span>Asignar Maletero / Depósito</span>
                  </label>
                  {unitForm.hasStorage && (
                    <input
                      type="text"
                      placeholder="N° de Maletero (Ej: M-12)"
                      value={unitForm.storageNumber}
                      onChange={(e) => setUnitForm({ ...unitForm, storageNumber: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900 font-mono ml-6 max-w-[90%]"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingUnit(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm"
                >
                  Guardar Inmueble
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Incluir Nuevo Propietario */}
      {showAddOwnerModal && selectedUnitForNewOwner && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="font-bold text-slate-900 text-base">
                Incluir Propietario a {selectedUnitForNewOwner.unit_code}
              </h3>
              <button onClick={() => setShowAddOwnerModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewOwner} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Carmen"
                    value={newOwnerForm.firstName}
                    onChange={(e) => setNewOwnerForm({ ...newOwnerForm, firstName: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Apellido</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Silva"
                    value={newOwnerForm.lastName}
                    onChange={(e) => setNewOwnerForm({ ...newOwnerForm, lastName: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  placeholder="ejemplo@gmail.com"
                  value={newOwnerForm.email}
                  onChange={(e) => setNewOwnerForm({ ...newOwnerForm, email: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo Doc</label>
                  <select
                    value={newOwnerForm.docType}
                    onChange={(e) => setNewOwnerForm({ ...newOwnerForm, docType: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-bold"
                  >
                    <option value="V">V (Venezolano)</option>
                    <option value="E">E (Extranjero)</option>
                    <option value="J">J (Jurídico)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Número de Cédula / RIF</label>
                  <input
                    type="text"
                    required
                    placeholder="14567890"
                    value={newOwnerForm.docNumber}
                    onChange={(e) => setNewOwnerForm({ ...newOwnerForm, docNumber: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Teléfono Móvil</label>
                  <input
                    type="text"
                    required
                    placeholder="04141234567"
                    value={newOwnerForm.phone}
                    onChange={(e) => setNewOwnerForm({ ...newOwnerForm, phone: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Rol en el Inmueble</label>
                  <select
                    value={newOwnerForm.role}
                    onChange={(e) => setNewOwnerForm({ ...newOwnerForm, role: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900"
                  >
                    <option value="OWNER">Propietario Principal</option>
                    <option value="CO_OWNER">Co-Propietario</option>
                    <option value="TENANT">Inquilino / Arrendatario</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddOwnerModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm"
                >
                  Incluir y Asignar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}