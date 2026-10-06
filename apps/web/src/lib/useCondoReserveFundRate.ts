'use client';

import { useEffect, useState } from 'react';
import { fetchWithAuth } from './api';

export interface CondoRecord {
  id: string;
  name: string;
  rif: string;
  city: string;
  state: string;
  address: string;
  reserve_fund_rate: number | null;
}

/**
 * Carga la definición de una residencia (`GET /api/condos`) filtrada por su id.
 *
 * Es la única fuente de verdad para los datos que dependen de la residencia
 * (Fondo de Reserva, RIF, razón social). Nunca se cablean en el frontend, para
 * garantizar el aislamiento de datos entre condominios y que un cambio en el
 * formulario de la residencia se refleje en la siguiente carga.
 *
 * Se usa el valor vivo de `condos.reserve_fund_rate` y NO el snapshot de
 * `billing_periods.reserve_fund_rate`, porque ese snapshot queda desactualizado
 * cuando se cambia el % de la residencia.
 */
export function useCondoRecord(condoId?: string | null): CondoRecord | null {
  const [condo, setCondo] = useState<CondoRecord | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!condoId) {
      setCondo(null);
      return;
    }

    (async () => {
      try {
        const condoList = await fetchWithAuth('/condos');
        if (!Array.isArray(condoList) || cancelled) return;
        const found = condoList.find((c: any) => c.id === condoId);
        if (cancelled) return;
        if (!found) {
          setCondo(null);
          return;
        }
        const rate = Number(found.reserve_fund_rate);
        setCondo({
          id: found.id,
          name: found.name ?? '',
          rif: found.rif ?? '',
          city: found.city ?? '',
          state: found.state ?? '',
          address: found.address ?? '',
          reserve_fund_rate: Number.isFinite(rate) ? rate : null,
        });
      } catch (err) {
        console.error('Error al cargar la definición de la residencia:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [condoId]);

  return condo;
}

/** % del Fondo de Reserva de la residencia. `null` mientras carga o si falla. */
export function useCondoReserveFundRate(condoId?: string | null): number | null {
  const condo = useCondoRecord(condoId);
  return condo ? condo.reserve_fund_rate : null;
}

/** Formatea el % del Fondo de Reserva para mostrarlo en la UI. */
export function formatReserveFundRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(2);
}

/** "Caracas, Miranda" a partir de la residencia, sin inventar datos. */
export function formatCondoLocation(condo: CondoRecord | null): string {
  if (!condo) return '';
  return [condo.city, condo.state].filter(Boolean).join(', ');
}