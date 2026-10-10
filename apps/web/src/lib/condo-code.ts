/**
 * Código corto de una residencia (`condos.code`), usado para numerar los
 * recibos con referencia al conjunto: `REC-MIRA-2026-09-31`.
 *
 * La lógica es espejo de `apps/api/src/common/condo-code.ts` para que el valor
 * sugerido en el formulario coincida con el que genera el backend.
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

/** Normaliza un código: A-Z0-9, en mayúsculas, máx. 12 caracteres. */
export function sanitizeCondoCode(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return stripAccents(String(raw))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CONDO_CODE_MAX);
}

/**
 * Deriva una abreviatura legible a partir del nombre del conjunto.
 * Ej: "Res Mirador" → "MIRA", "Residencias Junín" → "JUNI".
 */
export function suggestCondoCode(name: string): string {
  const clean = stripAccents(String(name || '')).toUpperCase();
  const words = clean
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length > 0 && !CONDO_CODE_STOPWORDS.has(w));
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 4);
  return (words[0].slice(0, 3) + words[words.length - 1].slice(0, 3)).slice(0, 6);
}
