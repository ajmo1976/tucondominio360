'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle,
  Home,
  Loader2,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import { fetchWithAuth } from '../lib/api';

/**
 * Vista consolidada del propietario/inquilino: lista todas las unidades que
 * ocupa en todas sus residencias, con la alícuota, el rol de ocupante y el
 * saldo consolidado. Es la fuente de verdad de "quién dónde vive y cuánto
 * debe" para el portal de transparencia (Fase D).
 */

const OCCUPANT_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propietario',
  CO_OWNER: 'Copropietario',
  TENANT: 'Arrendatario',
  RESIDENT: 'Residente',
  AUTHORIZED: 'Autorizado',
};

interface MyUnit {
  id: string;
  unitCode: string;
  unitType: string | null;
  floor: string | null;
  buildingName: string | null;
  aliquotPercentage: number | null;
  currentBalanceUsd: number;
  occupantRole: string;
  isPrimaryContact: boolean;
  isBillingRecipient: boolean;
}

interface MyCondo {
  id: string;
  name: string;
  rif: string | null;
  units: MyUnit[];
}

const usd = (n: number) =>
  new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(n || 0);

export function MyUnitsView({ onGoToBills }: { onGoToBills?: () => void }) {
  const [condos, setCondos] = useState<MyCondo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/me/units');
      setCondos(res?.condos || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar tus unidades.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const totalUnits = condos.reduce((acc, c) => acc + c.units.length, 0);
  const totalDebt = condos.reduce(
    (acc, c) => acc + c.units.reduce((a, u) => a + (u.currentBalanceUsd || 0), 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-emerald-600" />
            Mis Unidades
          </h1>
          <p className="text-sm text-slate-500">
            Todas las unidades que ocupas en tus residencias: alícuota, rol y saldo consolidado.
          </p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-slate-400 py-16 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Cargando tus unidades…
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      ) : condos.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <Home className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">No tienes unidades asignadas</p>
          <p className="text-sm text-slate-400 mt-1">
            Cuando la administración te asigne a una unidad, aparecerá aquí.
          </p>
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">
                Residencias
              </p>
              <p className="text-2xl font-black text-slate-900 mt-1">{condos.length}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">
                Unidades
              </p>
              <p className="text-2xl font-black text-slate-900 mt-1">{totalUnits}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 col-span-2 sm:col-span-1">
              <p className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">
                Saldo total
              </p>
              <p
                className={`text-2xl font-black mt-1 ${
                  totalDebt > 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {usd(totalDebt)}
              </p>
            </div>
          </div>

          {/* Por residencia */}
          {condos.map((condo) => (
            <div key={condo.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">{condo.name}</h2>
                  <p className="text-xs text-slate-500">
                    {condo.rif ? `RIF ${condo.rif} · ` : ''}
                    {condo.units.length} unidad(es)
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {condo.units.map((unit) => (
                  <div key={unit.id} className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-3 min-w-[140px]">
                      <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                        <Home className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 font-mono">
                          {unit.buildingName ? `${unit.buildingName} · ` : ''}
                          {unit.unitCode}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {unit.unitType || 'Unidad'}
                          {unit.floor ? ` · Piso ${unit.floor}` : ''}
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                      {OCCUPANT_ROLE_LABELS[unit.occupantRole] || unit.occupantRole}
                    </span>

                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                      Alícuota {unit.aliquotPercentage != null ? `${Number(unit.aliquotPercentage).toFixed(2)}%` : '—'}
                    </span>

                    {unit.isPrimaryContact && (
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium">
                        Contacto principal
                      </span>
                    )}
                    {unit.isBillingRecipient && (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium">
                        Destinatario de boletas
                      </span>
                    )}

                    <div className="ml-auto flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[11px] text-slate-400">Saldo</p>
                        <p
                          className={`font-bold ${
                            unit.currentBalanceUsd > 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {usd(unit.currentBalanceUsd)}
                        </p>
                      </div>
                      {unit.currentBalanceUsd > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[11px] font-semibold">
                          <AlertCircle className="w-3 h-3" />
                          Debe
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                          <CheckCircle className="w-3 h-3" />
                          Al día
                        </span>
                      )}
                      {onGoToBills && (
                        <button
                          onClick={onGoToBills}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          Ver recibos
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
