import { Buffer } from 'buffer';

/**
 * Minigenerador de PDF 1.4 sin dependencias externas.
 *
 * Diseñado para generar documentos ejecutivos y actas formales:
 *  - Soporta Helvetica y Helvetica-Bold con codificación WinAnsi real (/Encoding /WinAnsiEncoding),
 *    permitiendo tildes (á, é, í, ó, ú, ñ), mayúsculas acentuadas, signos (¿, ¡, °),
 *    guiones largos (—) y caracteres especiales en cualquier visor de PDF.
 *  - Encabezado institucional prolijo con separación vertical calculada (sin solapamiento de textos).
 *  - Tablas con columnas absolutas (sin desviación en Td), cabeceras sombreadas y filas alternadas.
 *  - Bloques destacados (callouts) para dictámenes y resultados.
 *  - Parrilla de atributos clave (keyValueGrid) para identificación prolija de expedientes.
 */

export interface PdfColumn {
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

export interface PdfTextOpts {
  size?: number;
  bold?: boolean;
  muted?: boolean;
  small?: boolean;
  color?: string; // e.g. '0.1 0.6 0.4'
  align?: 'left' | 'right' | 'center';
}

export interface PdfHeaderConfig {
  title: string;
  subtitle?: string;
  footer?: string;
  condoName?: string;
  condoRif?: string;
  condoCode?: string;
  documentRef?: string;
}

class PageCursor {
  y = 44;
  ops: string[] = [];
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 46;
const USABLE = PAGE_W - MARGIN * 2;
const BOTTOM = 44;

const ROOT_STYLES: Record<string, number> = {
  title: 15,
  subtitle: 9.5,
  section: 10.5,
  body: 9.5,
  small: 8,
};

const UNICODE_TO_WINANSI: Record<number, number> = {
  0x2014: 151, // em-dash —
  0x2013: 150, // en-dash –
  0x2022: 149, // bullet •
  0x2018: 145, // ‘
  0x2019: 146, // ’
  0x201c: 147, // “
  0x201d: 148, // ”
  0x20ac: 128, // €
  0x2026: 133, // …
};

/** Convierte texto UTF-8 a bytes WinAnsi (Windows-1252) para PDF Type 1. */
function toWinAnsiBytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) || 32;
    if (cp in UNICODE_TO_WINANSI) {
      out.push(UNICODE_TO_WINANSI[cp]);
    } else if (cp < 32) {
      out.push(32);
    } else if (cp <= 0xff) {
      // Caracteres Latin-1/WinAnsi directos (á é í ó ú ñ Á É Í Ó Ú Ñ ü ¿ ¡ ° etc.)
      out.push(cp);
    } else {
      out.push(32); // fuera de rango: espacio limpio
    }
  }
  return out;
}

function escapePdfString(text: string): string {
  let res = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 92) res += '\\\\'; // \
    else if (code === 40) res += '\\('; // (
    else if (code === 41) res += '\\)'; // )
    else if (code === 13) res += '\\r';
    else if (code === 10) res += '\\n';
    else res += text[i];
  }
  return res;
}

function toPdfLiteral(text: string): string {
  const bytes = toWinAnsiBytes(text);
  const latin = bytes.map((b) => String.fromCharCode(b)).join('');
  return `(${escapePdfString(latin)})`;
}

export class PdfBuilder {
  private pages: PageCursor[] = [];
  private current: PageCursor;

  constructor(private readonly header: PdfHeaderConfig) {
    this.current = new PageCursor();
    this.pages.push(this.current);
    this.writeHeader();
  }

  /**
   * Encabezado institucional estructurado.
   * Reserva el espacio vertical exacto para cada fila, evitando cualquier solapamiento.
   */
  private writeHeader() {
    // 1. Fila de metadatos del SaaS y fecha de emisión
    const metaLeft = 'TuCondominio360 · Plataforma de Gestión Condominial';
    const metaRight = `Emisión: ${pdfDateTime()}`;
    this.emitTextAbsolute(metaLeft, MARGIN, PAGE_H - this.current.y, { size: 7.5, bold: true, muted: true });
    this.emitTextAbsolute(metaRight, PAGE_W - MARGIN, PAGE_H - this.current.y, {
      size: 7.5,
      muted: true,
      align: 'right',
    });
    this.moveY(12);

    // 2. Bloque de identificación del Condominio (si fue provisto)
    if (this.header.condoName) {
      const condoTitle = this.header.condoName.toUpperCase();
      this.emitTextAbsolute(condoTitle, MARGIN, PAGE_H - this.current.y, {
        size: 11,
        bold: true,
        color: '0.08 0.12 0.20',
      });
      if (this.header.condoRif) {
        this.emitTextAbsolute(`RIF: ${this.header.condoRif}`, PAGE_W - MARGIN, PAGE_H - this.current.y, {
          size: 8.5,
          bold: true,
          muted: true,
          align: 'right',
        });
      }
      this.moveY(15);
    }

    // 3. Título principal del documento y referencia
    this.emitTextAbsolute(this.header.title, MARGIN, PAGE_H - this.current.y, {
      size: ROOT_STYLES.title,
      bold: true,
      color: '0.06 0.10 0.18',
    });
    if (this.header.documentRef) {
      this.emitTextAbsolute(this.header.documentRef, PAGE_W - MARGIN, PAGE_H - this.current.y, {
        size: 8.5,
        bold: true,
        color: '0.05 0.55 0.40',
        align: 'right',
      });
    }
    this.moveY(18);

    // 4. Subtítulo (si fue provisto)
    if (this.header.subtitle) {
      this.emitTextAbsolute(this.header.subtitle, MARGIN, PAGE_H - this.current.y, {
        size: ROOT_STYLES.subtitle,
        color: '0.35 0.40 0.48',
      });
      this.moveY(13);
    }

    // 5. Barra decorativa institucional (accent bar esmeralda + línea gris sutil)
    const yBar = PAGE_H - this.current.y;
    // Barra verde esmeralda (altura 2pt)
    this.current.ops.push(`0.08 0.65 0.48 rg\n${MARGIN} ${yBar - 1} ${USABLE} 2 re\nf`);
    // Línea divisoria gris tenue
    this.current.ops.push(`0.85 0.88 0.92 rg\n${MARGIN} ${yBar - 3} ${USABLE} 0.5 re\nf`);
    this.moveY(14);
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
    const yPos = PAGE_H - this.current.y;
    this.emitTextAbsolute(`${this.header.title} (continuación)`, MARGIN, yPos, {
      size: 8,
      bold: true,
      muted: true,
    });
    this.emitTextAbsolute(pdfDateTime(), PAGE_W - MARGIN, yPos, {
      size: 8,
      muted: true,
      align: 'right',
    });
    this.moveY(8);
    const yLine = PAGE_H - this.current.y;
    this.current.ops.push(`0.85 0.88 0.92 rg\n${MARGIN} ${yLine} ${USABLE} 0.5 re\nf`);
    this.moveY(10);
  }

  moveY(delta: number) {
    this.current.y += delta;
  }

  spacer(height = 6) {
    this.moveY(height);
  }

  /** Línea separadora horizontal de ancho completo. */
  hr(thickness = 0.5) {
    const y = PAGE_H - this.current.y - thickness / 2;
    this.current.ops.push(`0.86 0.88 0.92 rg\n${MARGIN} ${y} ${USABLE} ${thickness} re\nf`);
    this.current.y += thickness + 4;
  }

  /** Emite texto en una coordenada absoluta (x, y) de la página con su propio bloque BT...ET. */
  private emitTextAbsolute(
    text: string,
    x: number,
    y: number,
    opts: {
      size?: number;
      bold?: boolean;
      muted?: boolean;
      color?: string;
      align?: 'left' | 'right' | 'center';
      width?: number;
    } = {},
  ) {
    const size = opts.size ?? ROOT_STYLES.body;
    const font = opts.bold ? 'F2' : 'F1';
    let color = opts.color;
    if (!color) {
      color = opts.muted ? '0.45 0.48 0.54' : '0.10 0.12 0.16';
    }

    let posX = x;
    if (opts.align === 'right' || opts.align === 'center') {
      const approxCharWidth = size * 0.52;
      const textWidth = text.length * approxCharWidth;
      if (opts.align === 'right') {
        posX = x - textWidth;
      } else {
        posX = x - textWidth / 2;
      }
    }

    this.current.ops.push(
      `BT\n/${font} ${size} Tf\n${color} rg\n${Math.round(posX * 10) / 10} ${Math.round(y * 10) / 10} Td\n${toPdfLiteral(
        text,
      )} Tj\nET`,
    );
  }

  /** Encabezado de sección visual con acento lateral. */
  section(title: string) {
    this.ensureSpace(22);
    const y = PAGE_H - this.current.y;
    // Pildora de acento esmeralda
    this.current.ops.push(`0.08 0.65 0.48 rg\n${MARGIN} ${y - 2} 3.5 11 re\nf`);
    // Texto de la sección
    this.emitTextAbsolute(title.toUpperCase(), MARGIN + 8, y, {
      size: ROOT_STYLES.section,
      bold: true,
      color: '0.12 0.16 0.22',
    });
    this.current.y += 16;
  }

  /**
   * Tarjeta destacada tipo Callout (ideal para dictamen, resultados, acuerdos aprobados).
   */
  callout(
    title: string,
    subtitle?: string,
    variant: 'emerald' | 'amber' | 'rose' | 'slate' = 'emerald',
  ) {
    const height = subtitle ? 42 : 32;
    this.ensureSpace(height + 6);

    const yBottom = PAGE_H - this.current.y - height;

    let bg = '0.94 0.98 0.95'; // emerald bg
    let border = '0.08 0.65 0.48'; // emerald border
    let titleColor = '0.05 0.45 0.32';

    if (variant === 'amber') {
      bg = '0.99 0.97 0.92';
      border = '0.85 0.60 0.12';
      titleColor = '0.65 0.42 0.05';
    } else if (variant === 'rose') {
      bg = '0.99 0.93 0.94';
      border = '0.88 0.22 0.28';
      titleColor = '0.68 0.12 0.18';
    } else if (variant === 'slate') {
      bg = '0.95 0.96 0.98';
      border = '0.45 0.50 0.58';
      titleColor = '0.20 0.25 0.32';
    }

    // Fondo del callout
    this.current.ops.push(`${bg} rg\n${MARGIN} ${yBottom} ${USABLE} ${height} re\nf`);
    // Borde izquierdo grueso
    this.current.ops.push(`${border} rg\n${MARGIN} ${yBottom} 4 ${height} re\nf`);

    // Texto interior
    const textY = subtitle ? yBottom + height - 15 : yBottom + height - 19;
    this.emitTextAbsolute(title, MARGIN + 12, textY, {
      size: 10.5,
      bold: true,
      color: titleColor,
    });

    if (subtitle) {
      this.emitTextAbsolute(subtitle, MARGIN + 12, textY - 14, {
        size: 8.5,
        color: '0.30 0.35 0.42',
      });
    }

    this.current.y += height + 8;
  }

  /**
   * Cuadrícula prolija de clave-valor (2 columnas) con fondo claro.
   */
  keyValueGrid(items: Array<{ label: string; value: string }>) {
    const rowHeight = 16;
    const totalHeight = Math.ceil(items.length / 2) * rowHeight + 8;
    this.ensureSpace(totalHeight);

    const yBottom = PAGE_H - this.current.y - totalHeight;
    // Fondo sutil
    this.current.ops.push(`0.97 0.98 0.99 rg\n${MARGIN} ${yBottom} ${USABLE} ${totalHeight} re\nf`);
    // Borde sutil
    this.current.ops.push(`0.88 0.90 0.94 rg\n${MARGIN} ${yBottom} ${USABLE} ${totalHeight} re\ns`);

    const colWidth = USABLE / 2;
    for (let i = 0; i < items.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + col * colWidth + 10;
      const y = PAGE_H - this.current.y - 14 - row * rowHeight;

      const item = items[i];
      // Etiqueta
      this.emitTextAbsolute(`${item.label}:`, x, y, {
        size: 8,
        bold: true,
        muted: true,
      });
      // Valor
      const labelW = item.label.length * 4.8 + 8;
      this.emitTextAbsolute(item.value, x + labelW, y, {
        size: 8.5,
        bold: true,
        color: '0.10 0.14 0.20',
      });
    }

    this.current.y += totalHeight + 8;
  }

  /** Texto libre multilínea con salto automático por ancho. */
  text(text: string, opts: PdfTextOpts = {}) {
    const size = opts.size ?? (opts.small ? ROOT_STYLES.small : ROOT_STYLES.body);
    const lineHeight = size + 4.5;
    const bold = opts.bold ? 'F2' : 'F1';
    let color = opts.color;
    if (!color) {
      color = opts.muted ? '0.45 0.48 0.54' : '0.12 0.14 0.18';
    }

    for (const line of this.wrap(text, USABLE, size)) {
      this.ensureSpace(lineHeight);
      const yPos = PAGE_H - this.current.y;
      this.current.ops.push(`BT\n/${bold} ${size} Tf\n${color} rg\n${MARGIN} ${yPos} Td\n${toPdfLiteral(line)} Tj\nET`);
      this.current.y += lineHeight;
    }
  }

  /**
   * Fila individual de una tabla con posicionamiento absoluto por celda.
   * Evita 100% el error de Td relativo que sacaba columnas fuera de página.
   */
  private tableRow(
    cells: Array<{
      text: string;
      width: number;
      bold?: boolean;
      muted?: boolean;
      align?: 'left' | 'right' | 'center';
      size?: number;
      color?: string;
    }>,
    y: number,
  ) {
    let x = MARGIN;
    for (const cell of cells) {
      const size = cell.size ?? ROOT_STYLES.small;
      const text = cell.text || ' ';
      const maxChars = Math.max(3, Math.floor(cell.width / (size * 0.48)));
      const clipped = text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;

      let drawX = x + 4; // padding left
      if (cell.align === 'right') {
        const textW = clipped.length * (size * 0.50);
        drawX = x + cell.width - textW - 4;
      } else if (cell.align === 'center') {
        const textW = clipped.length * (size * 0.50);
        drawX = x + (cell.width - textW) / 2;
      }

      this.emitTextAbsolute(clipped, drawX, y, {
        size,
        bold: cell.bold,
        muted: cell.muted,
        color: cell.color,
      });

      x += cell.width;
    }
  }

  /**
   * Tabla estructurada con encabezado sombreado, celdas alineadas y filas alternadas.
   */
  table(
    cols: Array<PdfColumn>,
    rows: Array<Array<string>>,
    opts: { size?: number } = {},
  ) {
    const sumW = cols.reduce((a, c) => a + c.width, 0);
    const scale = sumW > USABLE ? USABLE / sumW : 1;
    const widths = cols.map((c) => Math.round(c.width * scale * 10) / 10);
    const size = opts.size ?? ROOT_STYLES.small;
    const rowHeight = size + 7;

    // 1. Cabecera de la tabla
    this.ensureSpace(rowHeight + 4);
    const yHeaderBox = PAGE_H - this.current.y - rowHeight + 2;
    // Fondo sombreado de la cabecera
    this.current.ops.push(`0.92 0.94 0.97 rg\n${MARGIN} ${yHeaderBox} ${USABLE} ${rowHeight} re\nf`);
    // Línea inferior de la cabecera
    this.current.ops.push(`0.75 0.78 0.85 rg\n${MARGIN} ${yHeaderBox} ${USABLE} 0.8 re\nf`);

    const headerCells = cols.map((c, i) => ({
      text: c.label,
      width: widths[i],
      bold: true,
      color: '0.14 0.18 0.25',
      align: c.align ?? (i > 0 && /%|Unidad|Monto|Alícuota|Voto|Fecha/i.test(c.label) ? 'right' : 'left'),
      size: size,
    }));
    this.tableRow(headerCells, PAGE_H - this.current.y - 3);
    this.current.y += rowHeight + 2;

    // 2. Filas de datos
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      this.ensureSpace(rowHeight);
      const yRowBox = PAGE_H - this.current.y - rowHeight + 2;

      // Filas alternadas (zebra striping muy sutil)
      if (rIdx % 2 === 1) {
        this.current.ops.push(`0.98 0.985 0.995 rg\n${MARGIN} ${yRowBox} ${USABLE} ${rowHeight} re\nf`);
      }
      // Línea divisoria muy suave entre filas
      this.current.ops.push(`0.91 0.92 0.95 rg\n${MARGIN} ${yRowBox} ${USABLE} 0.3 re\nf`);

      const cells = row.map((text, i) => ({
        text,
        width: widths[i],
        align: cols[i].align ?? (i > 0 && /%|USD|VES|Bs/i.test(text) ? 'right' : 'left'),
        size,
        color: '0.12 0.15 0.20',
      }));

      this.tableRow(cells, PAGE_H - this.current.y - 3);
      this.current.y += rowHeight;
    }

    // Línea de cierre inferior de la tabla
    const yBottom = PAGE_H - this.current.y + 2;
    this.current.ops.push(`0.82 0.85 0.90 rg\n${MARGIN} ${yBottom} ${USABLE} 0.6 re\nf`);
    this.current.y += 6;
  }

  /** Divide texto en líneas por ancho disponible. */
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

  /**
   * Ensambla el PDF final (catálogo, páginas, fuentes WinAnsi, streams y xref).
   */
  build(): Buffer {
    const objects: Array<{ body: string }> = [];

    // 1: Catalog, 2: Pages /Kids
    objects.push({ body: `<< /Type /Catalog /Pages 2 0 R >>` });

    const pageCount = this.pages.length;
    const kids = Array.from({ length: pageCount }, (_, i) => 5 + i * 2).map((n) => `${n} 0 R`).join(' ');
    objects.push({ body: `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>` });

    // 3: Helvetica con codificación WinAnsi explícita
    objects.push({
      body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    });
    // 4: Helvetica-Bold con codificación WinAnsi explícita
    objects.push({
      body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
    });

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

/** Fecha corta es-VE — acepta string ISO o Date de pg. */
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
