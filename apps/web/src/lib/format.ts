/**
 * Formateo de montos para la interfaz.
 *
 * Regla de la casa: un valor ausente se muestra como "—", nunca como un
 * número inventado. Antes estas pantallas usaban fallbacks como
 * `Number(x || 1000)`, que pintaban $1.000 en un período sin gastos y
 * `$125` en una cuota que no existía. El backend ya calcula los
 * importes reales, así que aquí solo se formatea lo que llega.
 */

/** Devuelve el número si es un valor numérico utilizable; si no, null. */
export function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Monto en USD con signo, o "—" si no hay dato.
 * Un 0 real se muestra como $0.00, que es información válida.
 */
export function usd(value: unknown): string {
  const n = toNum(value);
  if (n === null) return '—';
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Monto en bolivares con el separador de miles local, o "—" si no hay dato.
 */
export function ves(value: unknown): string {
  const n = toNum(value);
  if (n === null) return '—';
  return `Bs. ${n.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Tasa BCV con 4 decimales, o "—" si no hay dato. */
export function bcvRate(value: unknown): string {
  const n = toNum(value);
  if (n === null) return '—';
  return n.toFixed(4);
}

/**
 * Tasa BCV numérica para cálculos. Devuelve null si no hay tasa disponible,
 * de modo que quien calcule pueda decidir qué hacer en vez de usar una tasa
 * fija que no corresponde a la fecha real.
 */
export function bcvRateNum(value: unknown): number | null {
  return toNum(value);
}
