import { Buffer } from 'buffer';

/**
 * Generador nativo de PDF 1.4 sin dependencias externas.
 *
 * Características clave de diseño:
 *  - Codificación WinAnsi real (/Encoding /WinAnsiEncoding) en Helvetica y Helvetica-Bold:
 *    soporta tildes (á, é, í, ó, ú, ñ, Á, É, Í, Ó, Ú, Ñ, ü), signos (¿, ¡, °, •, —, –) sin pérdida.
 *  - Sistema de coordenadas estricto por borde superior (`this.current.y` = distancia desde el
 *    borde superior de la página hasta el tope del siguiente elemento), eliminando por completo
 *    cualquier solapamiento entre textos, cajas, tablas y encabezados de sección.
 *  - Métrica proporcional real de caracteres Helvetica (`measureTextWidth`) para alineación derecha
 *    y centrada exacta al milímetro.
 *  - Cuadrículas de identificación (`keyValueGrid`) con etiqueta superior y valor inferior por celda,
 *    con bordes vectoriales nítidos y truncado seguro.
 *  - Pie de página institucional automático con numeración `Página X de Y`.
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
  color?: string; // RGB 0..1 ej. '0.08 0.12 0.20'
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

export interface PdfKeyValueItem {
  label: string;
  value: string;
  fullWidth?: boolean;
}

class PageCursor {
  y = 38;
  ops: string[] = [];
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 44;
const USABLE = PAGE_W - MARGIN * 2; // 524pt
const BOTTOM = 52; // espacio reservado para pie de página

const ROOT_STYLES: Record<string, number> = {
  title: 14.5,
  subtitle: 9,
  section: 9.5,
  body: 9,
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

/** Convierte texto UTF-8 a bytes WinAnsi (Windows-1252) para fuentes Type1 de PDF. */
function toWinAnsiBytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) || 32;
    if (cp in UNICODE_TO_WINANSI) {
      out.push(UNICODE_TO_WINANSI[cp]);
    } else if (cp < 32) {
      out.push(32);
    } else if (cp <= 0xff) {
      out.push(cp);
    } else {
      out.push(32);
    }
  }
  return out;
}

function escapePdfString(text: string): string {
  let res = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 92) res += '\\\\';
    else if (code === 40) res += '\\(';
    else if (code === 41) res += '\\)';
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

/**
 * Ancho proporcional real en unidades de 1/1000 em para Helvetica (Type1 estándar).
 * Permite alinear textos a la derecha/centro y envolver líneas sin desbordes.
 */
function charWidthEm(ch: string, bold = false): number {
  let w = 556;
  if (' .,;:!¡\'|ijlIíìîïÍ'.includes(ch)) w = 278;
  else if ('()[]-/frtJ"«»'.includes(ch)) w = 333;
  else if ('°'.includes(ch)) w = 400;
  else if ('ceksvxyzéèêëç'.includes(ch)) w = 500;
  else if ('0123456789abdghnopquáóúñü?¿$–•L'.includes(ch)) w = 556;
  else if ('TZ'.includes(ch)) w = 611;
  else if ('ABEFPSVXYÁÉ+='.includes(ch)) w = 667;
  else if ('CDHKNRUÚÑw'.includes(ch)) w = 722;
  else if ('GOQÓ'.includes(ch)) w = 778;
  else if ('mM'.includes(ch)) w = 833;
  else if ('%W'.includes(ch)) w = 910;
  else if ('—@'.includes(ch)) w = 980;
  return bold ? w * 1.045 : w;
}

export function measureTextWidth(text: string, size: number, bold = false): number {
  let total = 0;
  for (const ch of text) {
    total += charWidthEm(ch, bold);
  }
  return (total / 1000) * size;
}

export function clipTextToWidth(text: string, maxWidth: number, size: number, bold = false): string {
  if (measureTextWidth(text, size, bold) <= maxWidth) return text;
  const ellipsis = '…';
  const ellW = measureTextWidth(ellipsis, size, bold);
  let out = '';
  for (const ch of text) {
    if (measureTextWidth(out + ch, size, bold) + ellW > maxWidth) break;
    out += ch;
  }
  return `${out.trimEnd()}${ellipsis}`;
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
   * Encabezado institucional limpio y sin solapamientos.
   * `this.current.y` representa siempre el tope superior de la fila actual.
   */
  private writeHeader() {
    this.current.y = 36;

    // 1. Cinta superior del sistema y fecha de emisión
    const metaLeft = 'TUCONDOMINIO360 · PLATAFORMA DE GESTIÓN Y PARTICIPACIÓN CONDOMINIAL';
    const metaRight = `Emisión: ${pdfDateTime()}`;
    this.drawLineAtTop(metaLeft, MARGIN, this.current.y, {
      size: 7.2,
      bold: true,
      color: '0.42 0.47 0.55',
    });
    this.drawLineAtTop(metaRight, PAGE_W - MARGIN, this.current.y, {
      size: 7.2,
      color: '0.42 0.47 0.55',
      align: 'right',
    });
    this.current.y += 14;

    // 2. Identificación de la Residencia / Condominio y RIF
    if (this.header.condoName) {
      const codeSuffix = this.header.condoCode ? ` (${this.header.condoCode})` : '';
      const condoTitle = `${this.header.condoName.toUpperCase()}${codeSuffix}`;
      this.drawLineAtTop(condoTitle, MARGIN, this.current.y, {
        size: 11,
        bold: true,
        color: '0.05 0.38 0.28',
      });
      if (this.header.condoRif) {
        this.drawLineAtTop(`RIF: ${this.header.condoRif}`, PAGE_W - MARGIN, this.current.y, {
          size: 8.5,
          bold: true,
          color: '0.25 0.30 0.38',
          align: 'right',
        });
      }
      this.current.y += 16;
    }

    // 3. Título principal del documento y código de referencia oficial
    const refW = this.header.documentRef
      ? measureTextWidth(this.header.documentRef, 8.5, true) + 16
      : 0;
    const maxTitleW = Math.max(200, USABLE - refW);
    let titleSize = ROOT_STYLES.title;
    if (measureTextWidth(this.header.title, titleSize, true) > maxTitleW) {
      titleSize = 12.5;
    }
    const safeTitle = clipTextToWidth(this.header.title, maxTitleW, titleSize, true);
    this.drawLineAtTop(safeTitle, MARGIN, this.current.y, {
      size: titleSize,
      bold: true,
      color: '0.06 0.09 0.16',
    });
    if (this.header.documentRef) {
      this.drawLineAtTop(this.header.documentRef, PAGE_W - MARGIN, this.current.y + 2, {
        size: 8.5,
        bold: true,
        color: '0.05 0.48 0.35',
        align: 'right',
      });
    }
    this.current.y += 19;

    // 4. Subtítulo descriptivo (si aplica)
    if (this.header.subtitle) {
      const cleanSub = clipTextToWidth(this.header.subtitle, USABLE, ROOT_STYLES.subtitle, false);
      this.drawLineAtTop(cleanSub, MARGIN, this.current.y, {
        size: ROOT_STYLES.subtitle,
        color: '0.32 0.37 0.45',
      });
      this.current.y += 14;
    }

    // 5. Doble barra divisoria institucional (acento esmeralda + línea gris)
    const yBarTop = PAGE_H - this.current.y;
    this.current.ops.push(`0.06 0.60 0.44 rg\n${MARGIN} ${yBarTop - 2} ${USABLE} 2 re\nf`);
    this.current.ops.push(`0.82 0.86 0.90 rg\n${MARGIN} ${yBarTop - 4.5} ${USABLE} 0.6 re\nf`);
    this.current.y += 14;
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
    this.current.y = 36;
    const leftText = [this.header.condoName, `${this.header.title} (continuación)`].filter(Boolean).join(' · ');
    this.drawLineAtTop(leftText, MARGIN, this.current.y, {
      size: 8,
      bold: true,
      color: '0.38 0.43 0.50',
    });
    if (this.header.documentRef) {
      this.drawLineAtTop(this.header.documentRef, PAGE_W - MARGIN, this.current.y, {
        size: 8,
        bold: true,
        color: '0.05 0.48 0.35',
        align: 'right',
      });
    }
    this.current.y += 12;
    const yLine = PAGE_H - this.current.y;
    this.current.ops.push(`0.06 0.60 0.44 rg\n${MARGIN} ${yLine - 1.2} ${USABLE} 1.2 re\nf`);
    this.current.y += 10;
  }

  moveY(delta: number) {
    this.current.y += delta;
  }

  spacer(height = 6) {
    this.moveY(height);
  }

  /** Línea separadora horizontal de ancho completo. */
  hr(thickness = 0.5) {
    this.ensureSpace(thickness + 8);
    const y = PAGE_H - this.current.y - thickness;
    this.current.ops.push(`0.84 0.87 0.91 rg\n${MARGIN} ${y} ${USABLE} ${thickness} re\nf`);
    this.current.y += thickness + 6;
  }

  /**
   * Dibuja una línea de texto cuyo BORDE SUPERIOR está en `topOffset` (distancia desde el tope de página).
   * Calcula internamente la línea base (`yBaseline = PAGE_H - topOffset - size * 0.78`).
   */
  private drawLineAtTop(
    text: string,
    x: number,
    topOffset: number,
    opts: {
      size?: number;
      bold?: boolean;
      muted?: boolean;
      color?: string;
      align?: 'left' | 'right' | 'center';
    } = {},
  ) {
    const size = opts.size ?? ROOT_STYLES.body;
    const yBaseline = PAGE_H - topOffset - size * 0.78;
    this.emitTextBaseline(text, x, yBaseline, opts);
  }

  /**
   * Emite texto en una coordenada absoluta de línea base `(x, yBaseline)` en espacio PDF.
   */
  private emitTextBaseline(
    text: string,
    x: number,
    yBaseline: number,
    opts: {
      size?: number;
      bold?: boolean;
      muted?: boolean;
      color?: string;
      align?: 'left' | 'right' | 'center';
    } = {},
  ) {
    const size = opts.size ?? ROOT_STYLES.body;
    const font = opts.bold ? 'F2' : 'F1';
    let color = opts.color;
    if (!color) {
      color = opts.muted ? '0.42 0.47 0.54' : '0.10 0.13 0.18';
    }

    let posX = x;
    if (opts.align === 'right' || opts.align === 'center') {
      const textWidth = measureTextWidth(text, size, Boolean(opts.bold));
      if (opts.align === 'right') {
        posX = x - textWidth;
      } else {
        posX = x - textWidth / 2;
      }
    }

    this.current.ops.push(
      `BT\n/${font} ${size} Tf\n${color} rg\n${Math.round(posX * 10) / 10} ${Math.round(yBaseline * 10) / 10} Td\n${toPdfLiteral(
        text,
      )} Tj\nET`,
    );
  }

  /** Encabezado de sección numerada con acento esmeralda y línea inferior sutil. */
  section(title: string) {
    if (this.current.y > 115) {
      this.current.y += 4;
    }
    this.ensureSpace(34);
    const yTop = PAGE_H - this.current.y;

    // Barra vertical esmeralda (de yTop - 12 a yTop - 1)
    this.current.ops.push(`0.06 0.60 0.44 rg\n${MARGIN} ${yTop - 12} 3.5 11 re\nf`);
    // Título de sección (baseline en yTop - 10)
    this.emitTextBaseline(title.toUpperCase(), MARGIN + 9, yTop - 10, {
      size: ROOT_STYLES.section,
      bold: true,
      color: '0.08 0.13 0.20',
    });
    // Subrayado fino de sección
    this.current.ops.push(`0.86 0.89 0.93 rg\n${MARGIN} ${yTop - 15.5} ${USABLE} 0.5 re\nf`);

    this.current.y += 22;
  }

  /**
   * Bloque destacado tipo Callout (para dictámenes, certificaciones y avisos de estado).
   */
  callout(
    title: string,
    subtitle?: string,
    variant: 'emerald' | 'amber' | 'rose' | 'slate' = 'emerald',
  ) {
    const subLines = subtitle ? this.wrap(subtitle, USABLE - 24, 8.5, false) : [];
    const height = 22 + (subLines.length > 0 ? subLines.length * 12 + 4 : 4);
    this.ensureSpace(height + 8);

    const yTop = PAGE_H - this.current.y;
    const yBottom = yTop - height;

    let bg = '0.94 0.985 0.96';
    let border = '0.06 0.60 0.44';
    let titleColor = '0.04 0.42 0.30';

    if (variant === 'amber') {
      bg = '0.995 0.975 0.92';
      border = '0.85 0.58 0.10';
      titleColor = '0.62 0.38 0.04';
    } else if (variant === 'rose') {
      bg = '0.995 0.94 0.95';
      border = '0.85 0.20 0.26';
      titleColor = '0.65 0.10 0.16';
    } else if (variant === 'slate') {
      bg = '0.955 0.965 0.98';
      border = '0.45 0.50 0.58';
      titleColor = '0.18 0.23 0.30';
    }

    // Fondo y borde perimetral fino
    this.current.ops.push(`${bg} rg\n${MARGIN} ${yBottom} ${USABLE} ${height} re\nf`);
    this.current.ops.push(`${border} RG\n0.5 w\n${MARGIN} ${yBottom} ${USABLE} ${height} re\nS`);
    // Franja lateral izquierda de 4pt
    this.current.ops.push(`${border} rg\n${MARGIN} ${yBottom} 4 ${height} re\nf`);

    // Título del callout
    const clippedTitle = clipTextToWidth(title, USABLE - 24, 10, true);
    this.emitTextBaseline(clippedTitle, MARGIN + 12, yTop - 14.5, {
      size: 10,
      bold: true,
      color: titleColor,
    });

    // Subtítulo (1 o más líneas)
    subLines.forEach((line, idx) => {
      this.emitTextBaseline(line, MARGIN + 12, yTop - 27.5 - idx * 12, {
        size: 8.5,
        color: '0.26 0.31 0.38',
      });
    });

    this.current.y += height + 8;
  }

  /**
   * Ficha estructurada de pares Clave-Valor (2 columnas o ancho completo por fila).
   * En cada celda, la etiqueta va arriba en mayúsculas pequeñas y el valor debajo en negrita,
   * garantizando legibilidad total y cero desborde horizontal.
   */
  keyValueGrid(items: PdfKeyValueItem[]) {
    if (items.length === 0) return;

    // Agrupar en filas (fullWidth ocupa toda la fila; las demás van de 2 en 2)
    const rows: Array<PdfKeyValueItem[]> = [];
    let pendingPair: PdfKeyValueItem[] = [];
    for (const item of items) {
      if (item.fullWidth) {
        if (pendingPair.length > 0) {
          rows.push(pendingPair);
          pendingPair = [];
        }
        rows.push([item]);
      } else {
        pendingPair.push(item);
        if (pendingPair.length === 2) {
          rows.push(pendingPair);
          pendingPair = [];
        }
      }
    }
    if (pendingPair.length > 0) rows.push(pendingPair);

    const rowHeight = 27;
    const totalHeight = rows.length * rowHeight;
    this.ensureSpace(totalHeight + 8);

    const yTop = PAGE_H - this.current.y;
    const yBottom = yTop - totalHeight;
    const halfW = USABLE / 2;

    // Fondo gris muy tenue
    this.current.ops.push(`0.975 0.98 0.99 rg\n${MARGIN} ${yBottom} ${USABLE} ${totalHeight} re\nf`);

    // Líneas divisorias internas y contenido de celdas
    for (let r = 0; r < rows.length; r++) {
      const rowItems = rows[r];
      const cellTop = yTop - r * rowHeight;
      const cellBottom = cellTop - rowHeight;

      if (r > 0) {
        this.current.ops.push(`0.88 0.90 0.94 rg\n${MARGIN} ${cellTop} ${USABLE} 0.5 re\nf`);
      }

      if (rowItems.length === 1 && rowItems[0].fullWidth) {
        const it = rowItems[0];
        this.emitTextBaseline(it.label.toUpperCase(), MARGIN + 10, cellTop - 9.5, {
          size: 6.8,
          bold: true,
          color: '0.42 0.47 0.55',
        });
        const val = clipTextToWidth(it.value || '—', USABLE - 20, 9, true);
        this.emitTextBaseline(val, MARGIN + 10, cellTop - 21, {
          size: 9,
          bold: true,
          color: '0.08 0.12 0.18',
        });
      } else {
        // Divisor vertical central en esta fila
        this.current.ops.push(`0.88 0.90 0.94 rg\n${MARGIN + halfW} ${cellBottom} 0.5 ${rowHeight} re\nf`);

        for (let c = 0; c < rowItems.length; c++) {
          const it = rowItems[c];
          const cellX = MARGIN + c * halfW;
          this.emitTextBaseline(it.label.toUpperCase(), cellX + 10, cellTop - 9.5, {
            size: 6.8,
            bold: true,
            color: '0.42 0.47 0.55',
          });
          const val = clipTextToWidth(it.value || '—', halfW - 20, 9, true);
          this.emitTextBaseline(val, cellX + 10, cellTop - 21, {
            size: 9,
            bold: true,
            color: '0.08 0.12 0.18',
          });
        }
      }
    }

    // Borde perimetral con color de trazo RG explícito (evita borde negro por defecto)
    this.current.ops.push(`0.82 0.86 0.91 RG\n0.6 w\n${MARGIN} ${yBottom} ${USABLE} ${totalHeight} re\nS`);

    this.current.y += totalHeight + 8;
  }

  /** Párrafo de texto multilínea con salto automático por ancho real en puntos. */
  text(text: string, opts: PdfTextOpts = {}) {
    const size = opts.size ?? (opts.small ? ROOT_STYLES.small : ROOT_STYLES.body);
    const lineHeight = size + 4.2;
    const isBold = Boolean(opts.bold);

    const paragraphs = String(text || '').split(/\r?\n/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) {
        this.current.y += lineHeight * 0.5;
        continue;
      }
      for (const line of this.wrap(trimmed, USABLE, size, isBold)) {
        this.ensureSpace(lineHeight);
        this.drawLineAtTop(line, MARGIN, this.current.y, {
          size,
          bold: opts.bold,
          muted: opts.muted,
          color: opts.color,
          align: opts.align,
        });
        this.current.y += lineHeight;
      }
    }
  }

  /**
   * Dibuja una fila de celdas en la banda vertical `[yRowBottom, yRowBottom + rowHeight]`,
   * centrando verticalmente la línea base de cada celda.
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
    yRowBottom: number,
    rowHeight: number,
  ) {
    let x = MARGIN;
    for (const cell of cells) {
      const size = cell.size ?? ROOT_STYLES.small;
      const isBold = Boolean(cell.bold);
      const padX = 6;
      const rawText = cell.text || ' ';
      const clipped = clipTextToWidth(rawText, Math.max(12, cell.width - padX * 2), size, isBold);

      // Centrado vertical real dentro de la fila:
      const yBaseline = yRowBottom + (rowHeight - size * 0.72) / 2;

      let drawX = x + padX;
      if (cell.align === 'right') {
        drawX = x + cell.width - padX;
      } else if (cell.align === 'center') {
        drawX = x + cell.width / 2;
      }

      this.emitTextBaseline(clipped, drawX, yBaseline, {
        size,
        bold: isBold,
        muted: cell.muted,
        color: cell.color,
        align: cell.align ?? 'left',
      });

      x += cell.width;
    }
  }

  /**
   * Tabla estructurada con cabecera sombreada, filas alternadas, centrado vertical exacto
   * y fila opcional de totales (`footerRow`).
   */
  table(
    cols: Array<PdfColumn>,
    rows: Array<Array<string>>,
    opts: { size?: number; footerRow?: Array<string> } = {},
  ) {
    const sumW = cols.reduce((a, c) => a + c.width, 0);
    const scale = sumW > 0 ? USABLE / sumW : 1;
    const widths = cols.map((c) => Math.round(c.width * scale * 10) / 10);
    const size = opts.size ?? ROOT_STYLES.small;
    const headerHeight = size + 10;
    const rowHeight = size + 9;

    // 1. Cabecera de la tabla
    this.ensureSpace(headerHeight + rowHeight);
    const yHeaderTop = PAGE_H - this.current.y;
    const yHeaderBottom = yHeaderTop - headerHeight;

    this.current.ops.push(`0.91 0.93 0.96 rg\n${MARGIN} ${yHeaderBottom} ${USABLE} ${headerHeight} re\nf`);
    this.current.ops.push(`0.74 0.78 0.85 rg\n${MARGIN} ${yHeaderBottom} ${USABLE} 0.8 re\nf`);

    const headerCells = cols.map((c, i) => ({
      text: c.label,
      width: widths[i],
      bold: true,
      color: '0.12 0.16 0.24',
      align: c.align ?? (i > 0 && /%|Unidad|Inmuebles|Monto|Alícuota|Voto|Fecha/i.test(c.label) ? 'right' : 'left'),
      size,
    }));
    this.tableRow(headerCells, yHeaderBottom, headerHeight);
    this.current.y += headerHeight;

    // 2. Filas de datos
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      this.ensureSpace(rowHeight);
      const yRowTop = PAGE_H - this.current.y;
      const yRowBottom = yRowTop - rowHeight;

      if (rIdx % 2 === 1) {
        this.current.ops.push(`0.978 0.984 0.992 rg\n${MARGIN} ${yRowBottom} ${USABLE} ${rowHeight} re\nf`);
      }
      this.current.ops.push(`0.90 0.92 0.95 rg\n${MARGIN} ${yRowBottom} ${USABLE} 0.4 re\nf`);

      const isHighlightRow = row.some((cell) => /\[GANADORA\]/i.test(cell));
      const cells = row.map((text, i) => ({
        text,
        width: widths[i],
        bold: isHighlightRow && i <= 1,
        align: cols[i].align ?? (i > 0 && /%|USD|VES|Bs/i.test(text) ? 'right' : 'left'),
        size,
        color: isHighlightRow ? '0.04 0.42 0.30' : '0.12 0.15 0.20',
      }));

      this.tableRow(cells, yRowBottom, rowHeight);
      this.current.y += rowHeight;
    }

    // 3. Fila de totales / cierre de tabla (opcional)
    if (opts.footerRow && opts.footerRow.length > 0) {
      this.ensureSpace(rowHeight);
      const yFootTop = PAGE_H - this.current.y;
      const yFootBottom = yFootTop - rowHeight;

      this.current.ops.push(`0.93 0.95 0.97 rg\n${MARGIN} ${yFootBottom} ${USABLE} ${rowHeight} re\nf`);
      this.current.ops.push(`0.76 0.80 0.86 rg\n${MARGIN} ${yFootTop - 0.6} ${USABLE} 0.6 re\nf`);

      const footerCells = opts.footerRow.map((text, i) => ({
        text,
        width: widths[i],
        bold: true,
        align: cols[i].align ?? 'left',
        size,
        color: '0.08 0.12 0.20',
      }));
      this.tableRow(footerCells, yFootBottom, rowHeight);
      this.current.y += rowHeight;
    }

    // Borde exterior de toda la tabla
    const yTableEnd = PAGE_H - this.current.y;
    this.current.ops.push(`0.78 0.82 0.88 rg\n${MARGIN} ${yTableEnd} ${USABLE} 0.7 re\nf`);
    this.current.y += 8;
  }

  /** Divide un párrafo en líneas utilizando el ancho real en puntos (`measureTextWidth`). */
  private wrap(text: string, maxWidth: number, size: number, bold = false): string[] {
    if (measureTextWidth(text, size, bold) <= maxWidth) return [text];
    const lines: string[] = [];
    let current = '';
    for (const word of text.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureTextWidth(candidate, size, bold) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /** Dibuja el pie de página institucional y el número de página en cada hoja antes de serializar. */
  private renderPageFooters() {
    const total = this.pages.length;
    const footerLeft =
      this.header.footer ||
      'TuCondominio360 · Documento oficial con validez administrativa y respaldo auditable en base de datos';

    this.pages.forEach((page, idx) => {
      const pageLabel = `Página ${idx + 1} de ${total}`;
      const yLine = 38;
      const yText = 26;

      page.ops.push(`0.85 0.88 0.92 rg\n${MARGIN} ${yLine} ${USABLE} 0.5 re\nf`);

      // Izquierda
      page.ops.push(
        `BT\n/F1 7.2 Tf\n0.45 0.49 0.56 rg\n${MARGIN} ${yText} Td\n${toPdfLiteral(
          clipTextToWidth(footerLeft, USABLE - 80, 7.2, false),
        )} Tj\nET`,
      );

      // Derecha (Página X de Y)
      const rightW = measureTextWidth(pageLabel, 7.2, true);
      const rightX = Math.round((PAGE_W - MARGIN - rightW) * 10) / 10;
      page.ops.push(`BT\n/F2 7.2 Tf\n0.35 0.40 0.48 rg\n${rightX} ${yText} Td\n${toPdfLiteral(pageLabel)} Tj\nET`);
    });
  }

  /**
   * Ensambla el archivo PDF 1.4 final.
   */
  build(): Buffer {
    this.renderPageFooters();

    const objects: Array<{ body: string }> = [];

    // 1: Catalog, 2: Pages
    objects.push({ body: `<< /Type /Catalog /Pages 2 0 R >>` });

    const pageCount = this.pages.length;
    const kids = Array.from({ length: pageCount }, (_, i) => 5 + i * 2)
      .map((n) => `${n} 0 R`)
      .join(' ');
    objects.push({ body: `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>` });

    // 3: Helvetica (WinAnsiEncoding)
    objects.push({
      body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    });
    // 4: Helvetica-Bold (WinAnsiEncoding)
    objects.push({
      body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
    });

    for (let i = 0; i < pageCount; i++) {
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
  const d = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Fecha + hora corta es-VE para el encabezado y marcas de tiempo. */
export function pdfDateTime(iso: Date = new Date()): string {
  const months = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(iso.getDate())} ${months[iso.getMonth()]} ${iso.getFullYear()} · ${pad(iso.getHours())}:${pad(iso.getMinutes())}`;
}
