import { Buffer } from 'buffer';
import { PdfBuilder, pdfDate, pdfDateTime } from '../../common/pdf';
import { TallyResult } from './tally';

/**
 * Documentos PDF oficiales para el módulo de Consultas y Asambleas Digitales.
 *
 * Utiliza `PdfBuilder` (`common/pdf.ts`) con:
 *  - Tipografía formal (Helvetica / Helvetica-Bold con WinAnsiEncoding real).
 *  - Encabezado institucional de la residencia sin solapamiento de textos.
 *  - Ficha de datos clave (keyValueGrid).
 *  - Bloques de dictamen destacados (callouts).
 *  - Tablas completas y alineadas para el escrutinio y la auditoría pública de votos.
 *  - Certificación y base legal del proceso.
 */

const CONSULTATION_TYPE_LABELS: Record<string, string> = {
  CARTA_CONSULTA: 'Carta Consulta Digital',
  ASAMBLEA_ORDINARIA: 'Asamblea General Ordinaria',
  ASAMBLEA_EXTRAORDINARIA: 'Asamblea General Extraordinaria',
};

export interface ActaVoteRow {
  unitCode: string;
  voter: string;
  optionTitle: string;
  votedAt: string | Date;
}

export interface ActaData {
  id?: string;
  condoName: string;
  condoRif?: string | null;
  condoCode?: string | null;
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
  condoRif?: string | null;
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
 * Acta oficial de escrutinio y certificación de la consulta o asamblea.
 */
export function buildActaPdf(data: ActaData): Buffer {
  const isCancelled = data.status === 'CANCELLED';
  const typeLabel = CONSULTATION_TYPE_LABELS[data.consultationType] ?? data.consultationType;
  const refCode = data.id ? `REF: ACTA-${data.id.slice(0, 8).toUpperCase()}` : undefined;

  const doc = new PdfBuilder({
    title: 'ACTA OFICIAL DE CONSULTA DIGITAL',
    subtitle: `Documento Definitivo de Escrutinio y Certificación · ${typeLabel}`,
    condoName: data.condoName,
    condoRif: data.condoRif ?? undefined,
    documentRef: refCode,
  });

  // 1. Ficha de identificación general
  doc.section('1. Identificación y Convocatoria');
  doc.keyValueGrid([
    { label: 'Residencia / Condominio', value: data.condoName },
    { label: 'Tipo de Proceso', value: typeLabel },
    { label: 'Período de Votación', value: `${pdfDate(data.startDate)} al ${pdfDate(data.endDate)}` },
    { label: 'Estado del Proceso', value: isCancelled ? 'CANCELADA' : 'CERRADA Y PROTOCOLIZADA' },
  ]);

  // 2. Materia sometida a decisión
  doc.section('2. Materia Sometida a Decisión');
  doc.text(data.title, { bold: true, size: 10 });
  doc.spacer(2);
  if (data.description && data.description.trim()) {
    doc.text(data.description.trim(), { size: 9, muted: true });
  } else {
    doc.text('Sin descripción adicional registrada.', { size: 8.5, muted: true });
  }
  doc.spacer(6);

  // 3. Dictamen oficial del escrutinio
  doc.section('3. Dictamen Oficial del Escrutinio');
  if (isCancelled) {
    doc.callout(
      'CONSULTA CANCELADA POR LA ADMINISTRACIÓN',
      'El proceso fue cancelado antes de su protocolización final. No genera efectos vinculantes.',
      'rose',
    );
  } else if (data.result === 'APPROVED') {
    const winner = data.winnerTitle || 'Opción Mayoritaria';
    doc.callout(
      `DECISIÓN ADOPTADA — GANÓ: ${winner.toUpperCase()}`,
      'Aprobada formalmente por mayoría simple de los inmuebles válidamente votantes.',
      'emerald',
    );
  } else if (data.result === 'TIED') {
    doc.callout(
      'EMPATE TÉCNICO — NO APROBADA',
      'Dos o más opciones obtuvieron igual cantidad de votos. Se declara no aprobada.',
      'amber',
    );
  } else if (data.result === 'NO_VOTES') {
    doc.callout(
      'SIN VOTOS REGISTRADOS — NO APROBADA',
      'Ningún copropietario habilitado emitió voto durante el lapso de convocatoria.',
      'slate',
    );
  } else {
    doc.callout('PROCESO CONCLUIDO SIN DECISIÓN DEFINIDA', undefined, 'slate');
  }

  // 4. Escrutinio detallado por opción
  doc.section('4. Escrutinio Detallado por Opción');
  const options = data.tally?.options ?? [];
  if (options.length > 0) {
    doc.table(
      [
        { label: 'Opción / Propuesta', width: 226, align: 'left' },
        { label: 'Inmuebles', width: 85, align: 'right' },
        { label: '% Inmuebles', width: 95, align: 'right' },
        { label: '% Alícuota', width: 110, align: 'right' },
      ],
      options.map((option) => {
        const isWinner = !isCancelled && data.result === 'APPROVED' && data.winnerTitle === option.title;
        const titleText = isWinner ? `[GANADORA] ${option.title}` : option.title;
        return [
          titleText,
          isCancelled ? '—' : `${option.units}`,
          isCancelled ? '—' : `${option.unitPercentage.toFixed(1)}%`,
          isCancelled ? '—' : `${option.aliquotPercentage.toFixed(1)}%`,
        ];
      }),
    );
  } else {
    doc.text('No se definieron opciones para esta consulta.', { muted: true, size: 8.5 });
  }

  // Resumen de participación del padrón
  const padron = data.padrónUnits ?? 0;
  const votaron = isCancelled ? 0 : data.tally?.totalUnits ?? 0;
  const partPct = padron > 0 ? ((votaron / padron) * 100).toFixed(1) : '0.0';
  const totalAliq = isCancelled ? '0.00' : (data.tally?.totalAliquot ?? 0).toFixed(2);

  doc.spacer(2);
  doc.keyValueGrid([
    { label: 'Inmuebles en Padrón Habilitado', value: `${padron} unidades` },
    { label: 'Inmuebles que Votaron', value: isCancelled ? '—' : `${votaron} votos (${partPct}%)` },
    { label: 'Alícuota Total Votante', value: isCancelled ? '—' : `${totalAliq}%` },
    { label: 'Criterio de Decisión', value: '1 Inmueble = 1 Voto (Mayoría Simple)' },
  ]);
  doc.spacer(4);

  // 5. Auditoría pública de votos emitidos
  doc.section('5. Auditoría Pública de Votos Emitidos');
  if (data.votes.length > 0 && !isCancelled) {
    doc.table(
      [
        { label: 'Inmueble', width: 75, align: 'left' },
        { label: 'Copropietario / Votante', width: 165, align: 'left' },
        { label: 'Opción Elegida', width: 160, align: 'left' },
        { label: 'Fecha y Hora', width: 116, align: 'right' },
      ],
      data.votes.map((v) => [
        v.unitCode,
        v.voter,
        v.optionTitle,
        v.votedAt ? pdfDateTime(new Date(v.votedAt)) : '—',
      ]),
    );
  } else {
    doc.text(
      isCancelled
        ? 'Consulta cancelada: no aplica desglose de votos válidos.'
        : 'No se registraron votos en esta consulta.',
      { muted: true, size: 8.5 },
    );
  }

  // 6. Base legal y certificación final
  doc.spacer(8);
  doc.hr(0.5);
  doc.spacer(3);
  doc.text(
    'Consulta digital sin quórum previo requerido conforme al reglamento del condominio. ' +
      'Se decide por mayoría simple de los votos emitidos (un voto por inmueble). El empate se declara no aprobado. ' +
      'La presente acta es emitida y certificada electrónicamente por TuCondominio360 y tiene carácter público para la comunidad.',
    { small: true, muted: true },
  );

  if (data.minutesDocumentUrl) {
    doc.spacer(3);
    doc.text(`Enlace al acta física complementaria: ${data.minutesDocumentUrl}`, {
      small: true,
      bold: true,
      color: '0.05 0.50 0.38',
    });
  }

  return doc.build();
}

/**
 * Constancia individual oficial de emisión de voto (para el copropietario).
 */
export function buildVoteReceiptPdf(data: ReceiptData): Buffer {
  const typeLabel = CONSULTATION_TYPE_LABELS[data.consultationType] ?? data.consultationType;

  const doc = new PdfBuilder({
    title: 'CONSTANCIA OFICIAL DE VOTACIÓN',
    subtitle: `Comprobante Digital de Voto Emitido · ${data.condoName}`,
    condoName: data.condoName,
    condoRif: data.condoRif ?? undefined,
    documentRef: `CÓDIGO: ${data.verificationCode}`,
  });

  doc.section('1. Certificación de Voto Emitido');
  doc.callout(
    `VOTO REGISTRADO PARA EL INMUEBLE ${data.unitCode}`,
    `Código de verificación oficial: ${data.verificationCode}`,
    'emerald',
  );

  doc.section('2. Detalle del Voto');
  const aliquot = Number(data.aliquotPercentage ?? 0);
  doc.keyValueGrid([
    { label: 'Inmueble / Unidad', value: data.unitCode },
    { label: 'Copropietario Votante', value: data.voter },
    { label: 'Opción Elegida', value: data.optionTitle },
    { label: 'Fecha y Hora Oficial', value: data.votedAt ? pdfDateTime(new Date(data.votedAt)) : '—' },
    { label: 'Tipo de Proceso', value: typeLabel },
    {
      label: 'Alícuota (Informativa)',
      value: `${(Number.isFinite(aliquot) ? aliquot : 0).toFixed(5)}%`,
    },
  ]);

  doc.spacer(4);
  doc.section('3. Consulta Vinculada');
  doc.text(data.consultationTitle, { bold: true, size: 9.5 });
  doc.spacer(8);

  doc.hr(0.5);
  doc.spacer(3);
  doc.text(
    'Este documento certifica la recepción y registro inmutable del voto en la base de datos de TuCondominio360. ' +
      'El voto es público, auditable y cuenta con plena validez para el escrutinio general del condominio.',
    { small: true, muted: true },
  );

  return doc.build();
}
