import { Buffer } from 'buffer';
import { PdfBuilder, pdfDate, pdfDateTime } from '../../common/pdf';
import { TallyResult } from './tally';

/**
 * Documentos PDF oficiales para el módulo de Consultas y Asambleas Digitales.
 *
 * Estructura formal y ejecutiva:
 *  - Encabezado institucional completo (Nombre del Condominio, Código, RIF, N° de Acta oficial).
 *  - Sección 1: Ficha técnica de identificación del expediente y convocatoria.
 *  - Sección 2: Materia sometida a consulta (título y descripción íntegra).
 *  - Sección 3: Dictamen oficial del escrutinio (Callout destacado + resumen de participación del padrón).
 *  - Sección 4: Tabla de escrutinio por opción con fila de totales.
 *  - Sección 5: Padrón público de votos emitidos por inmueble (con código de verificación individual).
 *  - Pie de página con certificación legal y numeración de páginas.
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
  verificationCode?: string | null;
  aliquotApplied?: number | string | null;
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
  closedAt?: string | Date | null;
  closedByName?: string | null;
  cancelReason?: string | null;
  status: 'CLOSED' | 'CANCELLED';
  result: 'APPROVED' | 'TIED' | 'NO_VOTES' | null;
  winnerTitle?: string | null;
  tally: TallyResult | null;
  padrónUnits: number | null;
  votes: ActaVoteRow[];
  minutesDocumentUrl?: string | null;
}

export interface ReceiptData {
  id?: string;
  condoName: string;
  condoRif?: string | null;
  condoCode?: string | null;
  consultationTitle: string;
  consultationType: string;
  unitCode: string;
  voter: string;
  optionTitle: string;
  votedAt: string | Date;
  verificationCode: string;
  aliquotPercentage: number | string | null;
}

function buildActaReference(data: ActaData): string {
  const code = (data.condoCode || 'COND').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const d = data.closedAt
    ? new Date(data.closedAt)
    : data.endDate
    ? new Date(data.endDate)
    : new Date();
  const ym = !Number.isNaN(d.getTime())
    ? `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    : '2026';
  const shortId = data.id ? data.id.replace(/-/g, '').slice(0, 8).toUpperCase() : 'OFICIAL';
  return `ACTA-${code}-${ym}-${shortId}`;
}

/**
 * Acta oficial de escrutinio y certificación de la consulta o asamblea.
 */
export function buildActaPdf(data: ActaData): Buffer {
  const isCancelled = data.status === 'CANCELLED';
  const typeLabel = CONSULTATION_TYPE_LABELS[data.consultationType] ?? data.consultationType;
  const actaRef = buildActaReference(data);

  const doc = new PdfBuilder({
    title: 'ACTA OFICIAL DE CONSULTA / ASAMBLEA',
    subtitle: `${typeLabel} · «${data.title}»`,
    condoName: data.condoName,
    condoRif: data.condoRif ?? undefined,
    condoCode: data.condoCode ?? undefined,
    documentRef: `EXPEDIENTE: ${actaRef}`,
  });

  // 1. Ficha técnica de identificación del expediente
  doc.section('1. Identificación del Proceso y Convocatoria');
  const closedDateStr = data.closedAt
    ? pdfDateTime(new Date(data.closedAt))
    : pdfDate(data.endDate);

  doc.keyValueGrid([
    { label: 'Título de la Consulta / Asamblea', value: data.title, fullWidth: true },
    { label: 'Código de Acta / Expediente', value: actaRef },
    { label: 'Tipo de Proceso', value: typeLabel },
    {
      label: 'Residencia / Conjunto',
      value: `${data.condoName}${data.condoRif ? ` (RIF: ${data.condoRif})` : ''}`,
    },
    {
      label: 'Estado Oficial del Proceso',
      value: isCancelled ? 'CANCELADA POR ADMINISTRACIÓN' : 'CERRADA Y CERTIFICADA',
    },
    {
      label: 'Período de Convocatoria',
      value: `${pdfDate(data.startDate)} al ${pdfDate(data.endDate)}`,
    },
    {
      label: isCancelled ? 'Fecha de Cancelación' : 'Fecha y Hora de Cierre Oficial',
      value: closedDateStr,
    },
  ]);

  // 2. Materia sometida a decisión
  doc.section('2. Materia y Propuesta Sometida a Decisión');
  if (data.description && data.description.trim()) {
    doc.text(data.description.trim(), { size: 9 });
  } else {
    doc.text('Sin descripción adicional registrada en la convocatoria.', { size: 8.5, muted: true });
  }
  doc.spacer(6);

  // 3. Dictamen oficial del escrutinio y participación
  doc.section('3. Dictamen Oficial del Escrutinio');
  if (isCancelled) {
    const reasonText = data.cancelReason
      ? `Motivo registrado: ${data.cancelReason}. El proceso no genera efectos vinculantes.`
      : 'El proceso fue cancelado antes de su protocolización final. No genera efectos vinculantes.';
    doc.callout('CONSULTA CANCELADA POR LA ADMINISTRACIÓN', reasonText, 'rose');
  } else if (data.result === 'APPROVED') {
    const winner = data.winnerTitle || 'Opción Mayoritaria';
    doc.callout(
      `DECISIÓN ADOPTADA — OPCIÓN GANADORA: ${winner.toUpperCase()}`,
      'Aprobada formalmente por mayoría simple de los inmuebles válidamente votantes (1 inmueble = 1 voto).',
      'emerald',
    );
  } else if (data.result === 'TIED') {
    doc.callout(
      'EMPATE TÉCNICO — PROPUESTA NO APROBADA',
      'Dos o más opciones obtuvieron idéntica cantidad máxima de votos por inmueble. Se declara sin decisión aprobatoria.',
      'amber',
    );
  } else if (data.result === 'NO_VOTES') {
    doc.callout(
      'SIN VOTOS EMITIDOS — PROCESO DESIERTO / NO APROBADO',
      'Concluido el período de votación sin registrarse votos de los inmuebles habilitados en el padrón.',
      'slate',
    );
  } else {
    doc.callout('PROCESO CONCLUIDO SIN DECISIÓN DEFINIDA', undefined, 'slate');
  }

  // Resumen de participación del padrón
  const padron = data.padrónUnits ?? 0;
  const votaron = isCancelled ? 0 : data.tally?.totalUnits ?? 0;
  const partPct = padron > 0 ? ((votaron / padron) * 100).toFixed(1) : '0.0';
  const totalAliq = isCancelled ? '0.00' : (data.tally?.totalAliquot ?? 0).toFixed(2);

  doc.keyValueGrid([
    { label: 'Padrón Electoral Habilitado', value: `${padron} inmuebles activos` },
    {
      label: 'Participación Registrada',
      value: isCancelled ? '— (Consulta cancelada)' : `${votaron} de ${padron} inmuebles (${partPct}%)`,
    },
    {
      label: 'Alícuota Total Representada (Inf.)',
      value: isCancelled ? '—' : `${totalAliq}% del condominio`,
    },
    { label: 'Regla de Cómputo y Validez', value: '1 Inmueble = 1 Voto · Mayoría Simple' },
  ]);

  // 4. Escrutinio detallado por opción
  doc.section('4. Escrutinio Detallado por Opción');
  const options = data.tally?.options ?? [];
  if (options.length > 0) {
    doc.table(
      [
        { label: '#', width: 28, align: 'center' },
        { label: 'Opción / Propuesta Sometida a Voto', width: 236, align: 'left' },
        { label: 'Votos (Inmuebles)', width: 85, align: 'right' },
        { label: '% Inmuebles', width: 85, align: 'right' },
        { label: '% Alícuota (Inf.)', width: 90, align: 'right' },
      ],
      options.map((option, idx) => {
        const isWinner = !isCancelled && data.result === 'APPROVED' && data.winnerTitle === option.title;
        const titleText = isWinner ? `[GANADORA] ${option.title}` : option.title;
        return [
          `${idx + 1}`,
          titleText,
          isCancelled ? '—' : `${option.units}`,
          isCancelled ? '—' : `${option.unitPercentage.toFixed(1)}%`,
          isCancelled ? '—' : `${option.aliquotPercentage.toFixed(1)}%`,
        ];
      }),
      {
        footerRow: isCancelled
          ? undefined
          : [
              '—',
              'TOTAL VOTOS VÁLIDOS EMITIDOS',
              `${votaron}`,
              votaron > 0 ? '100.0%' : '0.0%',
              votaron > 0 ? '100.0%' : '0.0%',
            ],
      },
    );
  } else {
    doc.text('No se definieron opciones para esta consulta.', { muted: true, size: 8.5 });
  }

  // 5. Auditoría pública de votos emitidos por inmueble
  doc.section('5. Registro Público de Votos por Inmueble (Verificabilidad)');
  if (data.votes.length > 0 && !isCancelled) {
    doc.table(
      [
        { label: 'Inmueble', width: 62, align: 'left' },
        { label: 'Copropietario / Votante', width: 145, align: 'left' },
        { label: 'Opción Votada', width: 137, align: 'left' },
        { label: 'Cód. Verificación', width: 90, align: 'center' },
        { label: 'Fecha y Hora', width: 90, align: 'right' },
      ],
      data.votes.map((v) => [
        v.unitCode,
        v.voter,
        v.optionTitle,
        v.verificationCode || 'VERIFICADO',
        v.votedAt ? pdfDateTime(new Date(v.votedAt)) : '—',
      ]),
    );
  } else {
    doc.callout(
      isCancelled
        ? 'SIN REGISTRO DE VOTOS APLICABLE (CONSULTA CANCELADA)'
        : 'NO SE REGISTRARON VOTOS DE NINGÚN INMUEBLE EN ESTA CONSULTA',
      isCancelled
        ? 'La consulta fue anulada por la administración antes de su cierre definitivo.'
        : `Durante el período de votación ningún copropietario de las ${padron} unidades del padrón emitió voto.`,
      'slate',
    );
  }

  // 6. Base legal y certificación final
  doc.spacer(4);
  doc.hr(0.5);
  doc.text(
    'CERTIFICACIÓN Y VALIDEZ: Consulta digital sin quórum previo requerido. Se decide por mayoría simple de los votos emitidos (un voto por inmueble). ' +
      'El empate se declara no aprobado. Los votos son públicos, definitivos y auditables por cualquier miembro de la comunidad mediante su código de verificación.',
    { small: true, muted: true },
  );

  if (data.minutesDocumentUrl) {
    doc.spacer(3);
    doc.text(`Enlace al documento físico / anexo de respaldo: ${data.minutesDocumentUrl}`, {
      small: true,
      bold: true,
      color: '0.04 0.45 0.32',
    });
  }

  return doc.build();
}

/**
 * Constancia individual oficial de emisión de voto (para el copropietario).
 */
export function buildVoteReceiptPdf(data: ReceiptData): Buffer {
  const typeLabel = CONSULTATION_TYPE_LABELS[data.consultationType] ?? data.consultationType;
  const code = (data.condoCode || 'COND').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const receiptRef = `VOTO-${code}-${data.unitCode}-${data.verificationCode.slice(0, 8)}`;

  const doc = new PdfBuilder({
    title: 'CONSTANCIA OFICIAL DE VOTACIÓN',
    subtitle: `${typeLabel} · «${data.consultationTitle}»`,
    condoName: data.condoName,
    condoRif: data.condoRif ?? undefined,
    condoCode: data.condoCode ?? undefined,
    documentRef: `COMPROBANTE: ${receiptRef}`,
  });

  doc.section('1. Certificación Electrónica de Voto Emitido');
  doc.callout(
    `VOTO REGISTRADO Y SELLADO · INMUEBLE ${data.unitCode}`,
    `Código único de verificación: ${data.verificationCode} · Comprobante N° ${receiptRef}`,
    'emerald',
  );

  doc.section('2. Ficha de Identificación del Voto');
  const aliquot = Number(data.aliquotPercentage ?? 0);
  doc.keyValueGrid([
    { label: 'Consulta / Asamblea Vinculada', value: data.consultationTitle, fullWidth: true },
    { label: 'Opción Votada por el Inmueble', value: data.optionTitle, fullWidth: true },
    { label: 'Inmueble / Unidad', value: `Unidad ${data.unitCode}` },
    { label: 'Copropietario Votante', value: data.voter },
    { label: 'Código de Verificación', value: data.verificationCode },
    { label: 'Fecha y Hora de Registro', value: data.votedAt ? pdfDateTime(new Date(data.votedAt)) : '—' },
    { label: 'Tipo de Proceso', value: typeLabel },
    {
      label: 'Alícuota de la Unidad (Informativa)',
      value: `${(Number.isFinite(aliquot) ? aliquot : 0).toFixed(5)}%`,
    },
  ]);

  doc.spacer(6);
  doc.hr(0.5);
  doc.text(
    'NOTA DE TRANSPARENCIA: Este comprobante certifica la recepción inmutable del voto de la unidad indicada en TuCondominio360. ' +
      'El voto es público y verificable: al cerrarse la consulta, este código de verificación aparecerá reflejado en el Acta Oficial de la comunidad.',
    { small: true, muted: true },
  );

  return doc.build();
}
