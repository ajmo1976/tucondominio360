/**
 * Utilidades para el código corto de una residencia (`condos.code`).
 *
 * El código se usa para numerar los recibos con referencia al conjunto, por
 * ejemplo `REC-MIRA-2026-09-31`. Así una administradora con muchos conjuntos
 * distingue de un vistazo a qué residencia pertenece cada recibo.
 */

// Palabras genéricas que no aportan a la abreviatura del conjunto.
const CONDO_CODE_STOPWORDS = new Set([
  'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E',
  'RES', 'RESIDENCIA', 'RESIDENCIAS', 'CONJUNTO', 'CONDOMINIO',
  'URBANIZACION', 'EDIFICIO', 'TORRE', 'VILLA', 'QUINTA',
  'CIUDAD', 'PARROQUIA', 'SECTOR', 'CALLE', 'AVENIDA', 'AV',
]);

const CONDO_CODE_MAX = 12;

const stripAccents = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Normaliza un código provisto por el usuario: A-Z0-9, en mayúsculas. */
export function sanitizeCondoCode(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = stripAccents(String(raw))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return null;
  return cleaned.slice(0, CONDO_CODE_MAX);
}

/**
 * Deriva una abreviatura legible a partir del nombre del conjunto.
 * Ej: "Res Mirador" → "MIRA", "Residencias Junín" → "JUNI".
 */
export function deriveCondoCode(name: string): string {
  const clean = stripAccents(String(name || '')).toUpperCase();
  const words = clean
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 0 && !CONDO_CODE_STOPWORDS.has(w));
  if (words.length === 0) return 'COND';
  if (words.length === 1) return words[0].slice(0, 4);
  return (words[0].slice(0, 3) + words[words.length - 1].slice(0, 3)).slice(0, 6);
}

/** Código final: el explícito si es válido, si no la abreviatura del nombre. */
export function resolveCondoCode(name: string, explicit?: unknown): string {
  return sanitizeCondoCode(explicit) || deriveCondoCode(name);
}

/**
 * Construye el número de recibo con referencia al conjunto, año, mes y apto.
 * Ej: buildBillNumber('MIRA', 2026, 9, '31') → "REC-MIRA-2026-09-31".
 */
export function buildBillNumber(
  condoCode: string,
  year: number | string,
  month: number | string,
  unitCode: string,
): string {
  const mm = String(month).padStart(2, '0');
  return `REC-${condoCode}-${year}-${mm}-${unitCode}`;
}
