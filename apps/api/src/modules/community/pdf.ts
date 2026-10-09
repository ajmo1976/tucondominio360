import { Buffer } from 'buffer';

/**
 * Minigenerador de PDF 1.4 sin dependencias externas.
 *
 * Soporta texto Helvetica/Helvetica-Bold, salto de página automático, líneas
 * separadoras y tablas de columnas fijas. Los acentos del español se codifican
 * en WinAnsi (octal) para que los documentos se vean bien en cualquier visor.
 *
 * Uso:
 *   const doc = new PdfBuilder({ title: 'Conciliación Bancaria', subtitle: 'Res Mirador' });
 *   doc.text('Cuerpo del documento');
 *   doc.table(cols, rows);
 *   const buffer = doc.build();
 */

interface PdfColumn {
  label: string;
  width: number;
}

interface PdfTextOpts {
  size?: number;
  bold?: boolean;
  muted?: boolean;
  small?: boolean;
}

class PageCursor {
  /** Fuente actual y cursor vertical (desde arriba). */
  y = 56;
  ops: string[] = [];
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const USABLE = PAGE_W - MARGIN * 2;
const BOTTOM = 46;

const ROOT_STYLES: Record<string, number> = {
  body: 10,
  small: 8.5,
};

/** Convierte texto UTF-8 a bytes WinAnsi (los caracteres fuera del rango se sustituyen). */
function toWinAnsiBytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) || 32;
    if (cp < 32) {
      out.push(32);
    } else if (cp < 128) {
      out.push(cp);
    } else if (cp <= 0xff) {
      // Latin-1 = WinAnsi para los caracteres usados (á é í ó ú ñ Á É Í Ó Ú Ñ ü ¿ ¡ ° etc.)
      out.push(cp);
    } else {
      out.push(32); // sin glifo: se sustituye por espacio
    }
  }
  return out;
}

function escapePdfString(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function toPdfLiteral(text: string): string {
  const bytes = toWinAnsiBytes(text);
  const latin = bytes.map((b) => String.fromCharCode(b)).join('');
  return `(${escapePdfString(latin)})`;
}

export class PdfBuilder {
  private pages: PageCursor[] = [];
  private current: PageCursor;

  constructor(private readonly header: { title: string; subtitle?: string; footer?: string }) {
    this.current = new PageCursor();
    this.pages.push(this.current);
    this.writeHeader();
  }

  private writeHeader() {
    const line1 = 'TuCondominio360 · Gestión Inmobiliaria y Condominios';
    this.emitRow([
      { text: line1, x: MARGIN, size: 8.5, bold: true, muted: true },
      { text: pdfDateTime(), x: PAGE_W - MARGIN - 90, size: 8.5, muted: true, width: 90, align: 'right' },
    ]);
    this.moveY(4);
    this.emitRow([{ text: this.header.title, x: MARGIN, size: 16, bold: true }]);
    if (this.header.subtitle) this.moveY(2);
    if (this.header.subtitle) {
      this.emitRow([{ text: this.header.subtitle, x: MARGIN, size: 10, muted: true }]);
    }
    this.moveY(4);
    this.hr(0.8);
    this.moveY(10);
  }

  private addPage() {
    this.current = new PageCursor();
    this.pages.push(this.current);
  }

  private ensureSpace(height: number) {
    if (this.current.y + height > PAGE_H - BOTTOM) {
      this.addPage();
      this.writePageHeaderContinued();
    }
  }

  private writePageHeaderContinued() {
    this.emitRow([
      { text: `${this.header.title} (continuación)`, x: MARGIN, size: 8.5, bold: true, muted: true },
    ]);
    this.moveY(8);
  }

  /** Emite una fila de celdas posicionadas en la misma línea. */
  private emitRow(
    cells: Array<{
      text: string;
      x: number;
      size?: number;
      bold?: boolean;
      muted?: boolean;
      width?: number;
      align?: 'left' | 'right';
    }>,
  ) {
    const first = cells[0];
    const font = first.bold ? 'F2' : 'F1';
    const color = first.muted ? '0.45 0.48 0.52' : '0.12 0.13 0.15';
    const yPos = PAGE_H - this.current.y;
    let ops = `BT\n/${font} ${first.size || ROOT_STYLES.body} Tf\n${color} rg\n${first.x} ${yPos} Td\n${toPdfLiteral(first.text)} Tj\n`;
    let penX = first.x;
    for (let i = 1; i < cells.length; i++) {
      const cell = cells[i];
      const dx = Math.round((cell.x - penX) * 10) / 10;
      ops += `${dx} 0 Td\n${toPdfLiteral(cell.text)} Tj\n`;
      penX = cell.x;
    }
    ops += `ET`;
    this.current.ops.push(ops);
  }

  moveY(delta: number) {
    this.current.y += delta;
  }

  /** Línea separadora de ancho completo. */
  hr(thickness = 0.6) {
    const y = PAGE_H - this.current.y - thickness / 2;
    this.current.ops.push(`0.85 0.87 0.90 rg\n${MARGIN} ${y} ${USABLE} ${thickness} re\nf`);
    this.current.y += thickness + 2;
  }

  /** Texto libre (con salto de línea por ancho). */
  text(text: string, opts: PdfTextOpts = {}) {
    const size = opts.size ?? (opts.small ? ROOT_STYLES.small : ROOT_STYLES.body);
    const lineHeight = size + 4;
    const bold = opts.bold ? 'F2' : 'F1';
    const color = opts.muted ? '0.45 0.48 0.52' : '0.12 0.13 0.15';
    for (const line of this.wrap(text, USABLE, size)) {
      this.ensureSpace(lineHeight);
      const yPos = PAGE_H - this.current.y;
      this.current.ops.push(`BT\n/${bold} ${size} Tf\n${color} rg\n${MARGIN} ${yPos} Td\n${toPdfLiteral(line)} Tj\nET`);
      this.current.y += lineHeight;
    }
  }

  /** Fila de una tabla: varias celdas con ancho fijo. */
  private tableRow(cells: Array<{ text: string; width: number; bold?: boolean; muted?: boolean; align?: 'left' | 'right'; size?: number }>, y: number) {
    let x = MARGIN;
    const parts: string[] = [];
    for (const cell of cells) {
      const size = cell.size ?? ROOT_STYLES.small;
      const text = cell.text || ' ';
      // Recorta a la capacidad aproximada de la columna (Helvetica ≈ 0.5·size por carácter)
      const maxChars = Math.max(3, Math.floor(cell.width / (size * 0.5)));
      const clipped = text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
      const bold = cell.bold ? 'F2' : 'F1';
      const color = cell.muted ? '0.45 0.48 0.52' : '0.12 0.13 0.15';
      const rendered = cell.align === 'right' ? clipped.padStart(maxChars, ' ') : clipped.padEnd(maxChars, ' ');
      parts.push(`/${bold} ${size} Tf\n${color} rg\n${x} ${y} Td\n${toPdfLiteral(rendered)} Tj`);
      x += cell.width;
    }
    this.current.ops.push(`BT\n${parts.join('\n')}\nET`);
  }

  /** Tabla con encabezado y filas (los anchos se normalizan al ancho útil). */
  table(cols: PdfColumn[], rows: Array<Array<string>>, opts: { size?: number } = {}) {
    const sumW = cols.reduce((a, c) => a + c.width, 0);
    const scale = sumW > USABLE ? USABLE / sumW : 1;
    const widths = cols.map((c) => Math.round(c.width * scale * 10) / 10);
    const size = opts.size ?? ROOT_STYLES.small;
    const lineHeight = size + 4;

    const headerCells = cols.map((c, i) => ({ text: c.label, width: widths[i], bold: true, muted: true }));
    this.ensureSpace(lineHeight);
    this.tableRow(headerCells, PAGE_H - this.current.y);
    this.current.y += lineHeight;
    this.hr(0.4);
    this.current.y += 1;

    const cellRows = rows.map((row) => row.map((text, i) => ({ text, width: widths[i] })));

    // Agrupa por líneas envueltas: cada fila de la tabla puede ocupar varias
    // líneas verticales si alguna celda no cabe en el ancho.
    for (const row of cellRows) {
      const wrapped = row.map((cell) => this.wrap(cell.text, cell.width - 2, size));
      const lines = Math.max(...wrapped.map((w) => w.length));
      for (let li = 0; li < lines; li++) {
        this.ensureSpace(lineHeight);
        const cellsAtLine = row.map((cell, i) => ({
          text: wrapped[i][li] ?? '',
          width: cell.width,
          align: (i === row.length - 1 && /USD|VES|Bs/.test(cell.text) ? 'right' : undefined) as 'right' | undefined,
        }));
        this.tableRow(cellsAtLine, PAGE_H - this.current.y);
        this.current.y += lineHeight;
      }
    }
    this.current.y += 4;
  }

  /** Divide un texto en líneas según el ancho disponible (aproximado). */
  private wrap(text: string, width: number, size: number): string[] {
    const maxChars = Math.max(8, Math.floor(width / (size * 0.52)));
    if (text.length <= maxChars) return [text];
    const lines: string[] = [];
    let current = '';
    for (const word of text.split(/\s+/)) {
      if ((current + ' ' + word).trim().length <= maxChars) {
        current = (current + ' ' + word).trim();
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  spacer(height = 6) {
    this.moveY(height);
  }

  /** Ensambla el PDF final (catálogo, páginas, fuentes, streams y xref). */
  build(): Buffer {
    const objects: Array<{ body: string }> = [];

    // 1: Catalog, 2: Pages /Kids (se rellena), 3: Helvetica, 4: Helvetica-Bold
    objects.push({ body: `<< /Type /Catalog /Pages 2 0 R >>` });

    const pageCount = this.pages.length;
    const kids = Array.from({ length: pageCount }, (_, i) => 5 + i * 2).map((n) => `${n} 0 R`).join(' ');
    objects.push({ body: `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>` });
    objects.push({ body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>` });
    objects.push({ body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>` });

    for (let i = 0; i < pageCount; i++) {
      const pageObjNum = 5 + i * 2;
      const contentObjNum = 6 + i * 2;
      const content = this.pages[i].ops.join('\n');
      objects.push({
        body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>`,
      });
      objects.push({ body: `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream` });
    }

    let data = `%PDF-1.4\n`;
    const offsets: number[] = [];
    objects.forEach((obj, idx) => {
      offsets.push(data.length);
      data += `${idx + 1} 0 obj\n${obj.body}\nendobj\n`;
    });
    const xrefStart = data.length;
    data += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      data += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    data += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return Buffer.from(data, 'latin1');
  }
}

/** Formatea un número como USD (valor llano, sin símbolo). */
export function pdfMoney(value: number | string | null | undefined): string {
  const n = Number(value || 0);
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Fecha corta es-VE (sin depender de ICU) — acepta string ISO o Date de pg. */
export function pdfDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d =
    value instanceof Date
      ? value
      : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Fecha + hora corta es-VE para el encabezado de los documentos. */
export function pdfDateTime(iso: Date = new Date()): string {
  const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(iso.getDate())} ${months[iso.getMonth()]} ${iso.getFullYear()} · ${pad(iso.getHours())}:${pad(iso.getMinutes())}`;
}