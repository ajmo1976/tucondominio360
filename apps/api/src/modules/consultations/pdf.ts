import { Buffer } from 'buffer';
import { PdfBuilder, pdfDate, pdfDateTime } from '../../common/pdf';
import { TallyResult } from './tally';

/**
 * Documentos PDF del módulo de consultas/asambleas, construidos sobre el
 * `PdfBuilder` compartido (`common/pdf.ts`). Todo el texto sale en español
 * (es-VE) y los acentos se codifican en WinAnsi por el propio builder.
 */

const CONSULTATION_TYPE_LABELS: Record<string, string> = {
  CARTA_CONSULTA: 'Carta Consulta',
  ASAMBLEA_ORDINARIA: 'Asamblea Ordinaria',
  ASAMBLEA_EXTRAORDINARIA: 'Asamblea Extraordinaria',
};

export interface ActaVoteRow {
  unitCode: string;
  voter: string;
  optionTitle: string;
  votedAt: string | Date;
}

export interface ActaData {
  condoName: string;
  consultationType: string;
  title: string;
  description: string;
  startDate: string | Date;
  endDate: string | Date;
  status: 'CLOSED' | 'CANCELLED';
  result: 'APPROVED' | 'TIED' | 'NO_VOTES' | null;
  winnerTitle?: string | null;
  tally: TallyResult | null;
  padrónUnits: number | null;
  votes: ActaVoteRow[];
  minutesDocumentUrl?: string | null;
}

export interface ReceiptData {
  condoName: string;
  consultationTitle: string;
  consultationType: string;
  unitCode: string;
  voter: string;
  optionTitle: string;
  votedAt: string | Date;
  verificationCode: string;
  aliquotPercentage: number | string | null;
}

/**
 * Etiqueta del resultado según la decisión del controlador (R3): `APPROVED`
 * significa "decisión tomada" (existe opción mayoritaria por unidades), NO que
 * haya ganado el "sí". Por eso se muestra el estado + la opción ganadora.
 * Una consulta cancelada (R4) se rotula `CANCELADA` sin recuento.
 */
function resultLabel(data: ActaData): string {
  if (data.status === 'CANCELLED') return 'CANCELADA';
  switch (data.result) {
    case 'APPROVED':
      return data.winnerTitle
        ? `DECISIÓN TOMADA · Opción mayoritaria: ${data.winnerTitle}`
        : 'DECISIÓN TOMADA';
    case 'TIED':
      return 'EMPATE · SIN DECISIÓN';
    case 'NO_VOTES':
      return 'SIN VOTOS';
    default:
      return 'SIN DECISIÓN';
  }
}

/** Acta de consulta/asamblea: datos, resultado, recuento, votos y nota legal. */
export function buildActaPdf(data: ActaData): Buffer {
  const cancelled = data.status === 'CANCELLED';
  const doc = new PdfBuilder({ title: 'Acta de Consulta / Asamblea', subtitle: data.condoName });

  doc.text(`Tipo de consulta: ${CONSULTATION_TYPE_LABELS[data.consultationType] ?? data.consultationType}`);
  doc.text(`Título: ${data.title}`);
  doc.spacer(2);
  doc.text('Descripción', { bold: true, small: true });
  doc.text(data.description?.trim() ? data.description : '—', { muted: !data.description });
  doc.spacer(4);
  doc.text(`Fecha de publicación: ${pdfDate(data.startDate)}`);
  doc.text(`Fecha de cierre: ${pdfDate(data.endDate)}`);
  doc.spacer(6);

  doc.text('Resultado', { bold: true });
  doc.text(resultLabel(data), { bold: true });
  doc.spacer(6);

  doc.text('Recuento por opción', { bold: true, small: true });
  doc.spacer(2);
  const options = data.tally?.options ?? [];
  if (options.length > 0) {
    doc.table(
      [
        { label: 'Opción', width: 240 },
        { label: 'Unidades', width: 80 },
        { label: '% Unidades', width: 80 },
        { label: '% Alícuota', width: 104 },
      ],
      // La cancelada no computa resultado: el recuento se muestra como «—» (R4).
      options.map((option) => [
        option.title,
        data.status === 'CANCELLED' ? '—' : `${option.units}`,
        data.status === 'CANCELLED' ? '—' : `${option.unitPercentage}%`,
        data.status === 'CANCELLED' ? '—' : `${option.aliquotPercentage}%`,
      ]),
    );
  } else {
    doc.text('—', { muted: true });
  }

  if (data.status === 'CANCELLED') {
    doc.text('Unidades que votaron: — de — del padrón', { muted: true });
  } else if (data.padrónUnits !== null) {
    doc.text(`Unidades que votaron: ${data.tally?.totalUnits ?? 0} de ${data.padrónUnits} del padrón`);
  }
  doc.spacer(6);

  doc.text('Votos por unidad (verificabilidad)', { bold: true, small: true });
  doc.spacer(2);
  if (data.votes.length > 0) {
    doc.table(
      [
        { label: 'Unidad', width: 100 },
        { label: 'Votante', width: 150 },
        { label: 'Opción', width: 160 },
        { label: 'Fecha/hora', width: 124 },
      ],
      data.votes.map((vote) => [
        vote.unitCode,
        vote.voter,
        vote.optionTitle,
        vote.votedAt ? pdfDateTime(new Date(vote.votedAt)) : '—',
      ]),
    );
  } else {
    doc.text('No se registraron votos.', { muted: true });
  }

  doc.spacer(8);
  doc.hr(0.4);
  doc.spacer(4);
  doc.text(
    'Consulta sin quórum requerido. Se decide por mayoría simple de los votos emitidos (un voto por inmueble). El empate se declara no aprobado.',
    { small: true, muted: true },
  );
  if (data.minutesDocumentUrl) {
    doc.spacer(2);
    doc.text(`Acta firmada: ${data.minutesDocumentUrl}`, { small: true, muted: true });
  }

  return doc.build();
}

/** Constancia individual del voto de una unidad (público y verificable). */
export function buildVoteReceiptPdf(data: ReceiptData): Buffer {
  const doc = new PdfBuilder({ title: 'Constancia de Votación', subtitle: data.condoName });

  doc.text(`Título: ${data.consultationTitle}`);
  doc.text(
    `Tipo de consulta: ${CONSULTATION_TYPE_LABELS[data.consultationType] ?? data.consultationType}`,
    { muted: true },
  );
  doc.spacer(6);

  const aliquot = Number(data.aliquotPercentage ?? 0);
  doc.table(
    [
      { label: 'Concepto', width: 190 },
      { label: 'Detalle', width: 314 },
    ],
    [
      ['Unidad', data.unitCode],
      ['Votante', data.voter],
      ['Opción elegida', data.optionTitle],
      ['Fecha y hora del voto', data.votedAt ? pdfDateTime(new Date(data.votedAt)) : '—'],
      ['Código de verificación', data.verificationCode],
      ['Alícuota aplicada (informativa)', `${(Number.isFinite(aliquot) ? aliquot : 0).toFixed(5)} %`],
    ],
  );

  doc.spacer(8);
  doc.hr(0.4);
  doc.spacer(4);
  doc.text('Voto público y verificable. Cada inmueble emite un único voto.', {
    small: true,
    muted: true,
  });

  return doc.build();
}
