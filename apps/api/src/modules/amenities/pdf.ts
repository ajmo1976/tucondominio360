import { Buffer } from 'buffer';
import { PdfBuilder, pdfDate, pdfDateTime, pdfMoney } from '../../common/pdf';

const SPACE_CATEGORY_LABELS: Record<string, string> = {
  SOCIAL_HALL: 'Salón de Fiestas y Eventos',
  BBQ_GRILL: 'Parrillera / Terraza Gourmet',
  SPORTS_COURT: 'Cancha Deportiva',
  POOL_AREA: 'Piscina / Solárium',
  COWORKING_ROOM: 'Sala de Reuniones / Coworking',
  FREIGHT_ELEVATOR: 'Ascensor de Carga / Mudanzas',
  SHARED_RESOURCE: 'Recurso / Equipo Comunitario',
  CUSTOM: 'Espacio Común Parametrizable',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'PENDIENTE DE APROBACIÓN',
  APPROVED: 'APROBADA Y RESERVADA',
  COMPLETED: 'CONCLUIDA / EJECUTADA',
  REJECTED: 'RECHAZADA',
  CANCELLED: 'CANCELADA',
};

const INSPECTION_LABELS: Record<string, string> = {
  PENDING: 'Pendiente de revisión post-evento',
  CLEAN_OK: 'Entregado en perfecto estado (Sin daños)',
  WITH_OBSERVATIONS: 'Entregado con observaciones menores',
  DAMAGE_REPORTED: 'Daños o incumplimiento reportado (Retención de garantía)',
};

export interface ReservationVoucherPdfData {
  reservationCode: string;
  condoName: string;
  condoRif?: string | null;
  condoCode?: string | null;
  amenityName: string;
  spaceCategory: string;
  unitCode: string;
  requestedByName: string;
  eventTitle: string;
  eventDescription?: string | null;
  reservationDate: string | Date;
  startTime: string;
  endTime: string;
  bufferMinutes: number;
  guestCount?: number | null;
  capacity?: number | null;
  status: string;
  feeAmountUsd: number;
  cleaningFeeUsd: number;
  depositAmountUsd: number;
  totalAmountUsd: number;
  paymentStatus: string;
  paymentReference?: string | null;
  paymentMethod?: string | null;
  inspectionStatus: string;
  inspectionNotes?: string | null;
  damageDeductionUsd: number;
  depositRefundedUsd: number;
  depositRefunded: boolean;
  rules?: string | null;
  adminNotes?: string | null;
}

export interface ReservationsReportRowPdf {
  reservationCode: string;
  amenityName: string;
  unitCode: string;
  requestedByName: string;
  reservationDate: string | Date;
  timeSlot: string;
  status: string;
  totalAmountUsd: number;
  depositAmountUsd: number;
  inspectionStatus: string;
}

export interface ReservationsReportPdfData {
  condoName: string;
  condoRif?: string | null;
  condoCode?: string | null;
  totalReservations: number;
  approvedCount: number;
  totalRevenueUsd: number;
  totalDepositsHeldUsd: number;
  rows: ReservationsReportRowPdf[];
}

/**
 * Constancia y Acuerdo Oficial de Reserva de Área Común (PDF).
 */
export function buildReservationVoucherPdf(data: ReservationVoucherPdfData): Buffer {
  const categoryLabel = SPACE_CATEGORY_LABELS[data.spaceCategory] ?? data.spaceCategory;
  const statusLabel = STATUS_LABELS[data.status] ?? data.status;

  const doc = new PdfBuilder({
    title: 'ACUERDO Y CONSTANCIA DE RESERVA DE ÁREA COMÚN',
    subtitle: `${data.amenityName} (${categoryLabel}) · Inmueble ${data.unitCode}`,
    condoName: data.condoName,
    condoRif: data.condoRif ?? undefined,
    condoCode: data.condoCode ?? undefined,
    documentRef: `RESERVA: ${data.reservationCode}`,
  });

  doc.section('1. Estado Oficial de la Reserva');
  const variant =
    data.status === 'APPROVED' || data.status === 'COMPLETED'
      ? 'emerald'
      : data.status === 'PENDING'
      ? 'amber'
      : 'rose';

  doc.callout(
    `${statusLabel} · CÓDIGO: ${data.reservationCode}`,
    `Espacio: ${data.amenityName} · Fecha: ${pdfDate(data.reservationDate)} · Horario: ${data.startTime.slice(
      0,
      5,
    )} a ${data.endTime.slice(0, 5)} (+${data.bufferMinutes} min de entrega/limpieza)`,
    variant,
  );

  doc.section('2. Ficha Técnica del Espacio y Evento');
  doc.keyValueGrid([
    { label: 'Motivo / Evento Declarado', value: data.eventTitle, fullWidth: true },
    { label: 'Espacio / Recurso Reservado', value: `${data.amenityName} (${categoryLabel})` },
    { label: 'Código de Expediente', value: data.reservationCode },
    { label: 'Inmueble Responsable', value: `Unidad ${data.unitCode}` },
    { label: 'Copropietario / Solicitante', value: data.requestedByName },
    { label: 'Fecha Reservada', value: pdfDate(data.reservationDate) },
    {
      label: 'Horario Autorizado',
      value: `${data.startTime.slice(0, 5)} a ${data.endTime.slice(0, 5)} (Buffer: ${data.bufferMinutes} min)`,
    },
    {
      label: 'Aforo Declarado / Capacidad Máx.',
      value: `${data.guestCount || 1} asistente(s) / Máx. ${data.capacity || 'S/L'} pers.`,
    },
    {
      label: 'Estado de Pago / Solvencia',
      value:
        data.paymentStatus === 'NOT_REQUIRED'
          ? 'SIN COSTO (GRATUITO)'
          : `${data.paymentStatus}${data.paymentReference ? ` · Ref: ${data.paymentReference}` : ''}`,
    },
  ]);

  doc.section('3. Liquidación Financiera y Depósito en Garantía');
  doc.table(
    [
      { label: 'Concepto Financiero', width: 280, align: 'left' },
      { label: 'Naturaleza', width: 130, align: 'left' },
      { label: 'Monto (USD)', width: 114, align: 'right' },
    ],
    [
      ['Canon de Alquiler / Uso de Instalación', 'Ingreso al Condominio', `$${pdfMoney(data.feeAmountUsd)}`],
      ['Cargo de Limpieza y Acondicionamiento', 'Servicio Operativo', `$${pdfMoney(data.cleaningFeeUsd)}`],
      ['Depósito en Garantía por Daños / Normas', 'Reembolsable tras inspección', `$${pdfMoney(data.depositAmountUsd)}`],
    ],
    {
      footerRow: ['TOTAL COMPROMISO DE LA RESERVA', 'Canon + Limpieza + Garantía', `$${pdfMoney(data.totalAmountUsd)}`],
    },
  );

  doc.section('4. Inspección Post-Uso y Liquidación de Garantía');
  doc.keyValueGrid([
    {
      label: 'Resultado de Inspección de Entrega',
      value: INSPECTION_LABELS[data.inspectionStatus] ?? data.inspectionStatus,
      fullWidth: true,
    },
    { label: 'Deducción por Daños / Incumplimiento', value: `$${pdfMoney(data.damageDeductionUsd)} USD` },
    {
      label: 'Monto de Garantía Reintegrado',
      value: `$${pdfMoney(data.depositRefundedUsd)} USD (${data.depositRefunded ? 'REINTEGRADO' : 'EN CUSTODIA'})`,
    },
  ]);

  if (data.rules && data.rules.trim()) {
    doc.section('5. Reglamento Específico de Convivencia del Espacio');
    doc.text(data.rules.trim(), { size: 8.5 });
    doc.spacer(4);
  }

  doc.spacer(4);
  doc.hr(0.5);
  doc.text(
    'COMPROMISO DE CONVIVENCIA: El propietario/residente titular del inmueble asume plena responsabilidad civil y económica por el uso adecuado ' +
      'de las instalaciones, el cumplimiento del horario, el respeto de los niveles de ruido y la conducta de sus invitados.',
    { small: true, muted: true },
  );

  return doc.build();
}

/**
 * Reporte Administrativo de Reservas, Alquileres y Garantías de Áreas Comunes (PDF).
 */
export function buildReservationsReportPdf(data: ReservationsReportPdfData): Buffer {
  const code = (data.condoCode || 'COND').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const now = new Date();
  const ref = `AREAS-${code}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const doc = new PdfBuilder({
    title: 'REPORTE OFICIAL DE RESERVAS Y ÁREAS COMUNES',
    subtitle: 'Control de Uso, Ingresos por Alquiler y Custodia de Depósitos en Garantía',
    condoName: data.condoName,
    condoRif: data.condoRif ?? undefined,
    condoCode: data.condoCode ?? undefined,
    documentRef: `REPORTE: ${ref}`,
  });

  doc.section('1. Resumen Ejecutivo de Gestión de Espacios Comunes');
  doc.keyValueGrid([
    { label: 'Residencia / Condominio', value: data.condoName },
    { label: 'Total Solicitudes Registradas', value: `${data.totalReservations} reserva(s)` },
    { label: 'Reservas Aprobadas / Ejecutadas', value: `${data.approvedCount} reserva(s)` },
    { label: 'Ingresos por Alquiler y Limpieza', value: `$${pdfMoney(data.totalRevenueUsd)} USD` },
    { label: 'Depósitos en Garantía en Custodia', value: `$${pdfMoney(data.totalDepositsHeldUsd)} USD` },
    { label: 'Fecha de Emisión', value: pdfDateTime(now) },
  ]);

  doc.section('2. Detalle de Reservas y Estado de Garantías');
  if (data.rows.length > 0) {
    doc.table(
      [
        { label: 'Código', width: 78, align: 'left' },
        { label: 'Espacio Común', width: 120, align: 'left' },
        { label: 'Unidad', width: 52, align: 'left' },
        { label: 'Fecha y Horario', width: 108, align: 'left' },
        { label: 'Estado', width: 82, align: 'left' },
        { label: 'Total (USD)', width: 84, align: 'right' },
      ],
      data.rows.map((r) => [
        r.reservationCode,
        r.amenityName,
        `Apto ${r.unitCode}`,
        `${pdfDate(r.reservationDate)} · ${r.timeSlot}`,
        r.status,
        `$${pdfMoney(r.totalAmountUsd)}`,
      ]),
      {
        footerRow: [
          'TOTALES',
          `${data.totalReservations} reservas`,
          `${data.approvedCount} aprob.`,
          '—',
          'INGRESOS NETOS:',
          `$${pdfMoney(data.totalRevenueUsd)}`,
        ],
      },
    );
  } else {
    doc.callout('SIN RESERVAS REGISTRADAS EN EL PERÍODO', undefined, 'slate');
  }

  return doc.build();
}
