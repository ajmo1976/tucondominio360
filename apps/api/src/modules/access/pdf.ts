import { Buffer } from 'buffer';
import { PdfBuilder, pdfDate, pdfDateTime } from '../../common/pdf';

const CATEGORY_LABELS: Record<string, string> = {
  VISITOR: 'Visita Personal',
  FAMILY: 'Familiar',
  PROVIDER: 'Proveedor',
  DELIVERY: 'Delivery / Encomienda',
  SERVICE: 'Servicio Técnico',
  TAXI: 'Taxi / Transporte',
  CONTRACTOR: 'Contratista / Obra',
};

const ENTRY_MODE_LABELS: Record<string, string> = {
  PEDESTRIAN: 'Peatonal',
  VEHICLE: 'Vehicular',
};

const LOG_STATUS_LABELS: Record<string, string> = {
  INSIDE: 'EN RECINTO',
  COMPLETED: 'SALIDA REG.',
  INCIDENT: 'INCIDENCIA',
  DENIED: 'DENEGADO',
};

export interface VisitorPassPdfData {
  id: string;
  condoName: string;
  condoRif?: string | null;
  condoCode?: string | null;
  unitCode: string;
  createdByName: string;
  visitorName: string;
  visitorDocType?: string | null;
  visitorDocNumber?: string | null;
  visitorPlate?: string | null;
  visitorCategory: string;
  entryMode: string;
  companyName?: string | null;
  companionCount: number;
  accessCode: string;
  validFrom: string | Date;
  validUntil: string | Date;
  maxUses: number;
  usesCount: number;
  status: string;
  notes?: string | null;
}

export interface AccessLogRowPdf {
  visitorName: string;
  visitorDoc: string;
  category: string;
  entryMode: string;
  vehiclePlate?: string | null;
  companyName?: string | null;
  unitCode?: string | null;
  entryTime: string | Date;
  exitTime?: string | Date | null;
  status: string;
  incidentAlert?: boolean;
}

export interface AccessLogbookPdfData {
  condoName: string;
  condoRif?: string | null;
  condoCode?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  filterCategory?: string | null;
  totalEntries: number;
  currentlyInside: number;
  vehiclesCount: number;
  deliveriesAndServicesCount: number;
  incidentsCount: number;
  logs: AccessLogRowPdf[];
}

/**
 * Pase Oficial de Acceso Digital (PDF) para compartir con el visitante o presentar en garita.
 */
export function buildVisitorPassPdf(data: VisitorPassPdfData): Buffer {
  const code = (data.condoCode || 'COND').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const categoryLabel = CATEGORY_LABELS[data.visitorCategory] ?? data.visitorCategory;
  const modeLabel = ENTRY_MODE_LABELS[data.entryMode] ?? data.entryMode;
  const docStr = data.visitorDocNumber
    ? `${data.visitorDocType || 'V'}-${data.visitorDocNumber}`
    : 'No especificado';

  const doc = new PdfBuilder({
    title: 'PASE OFICIAL DE ACCESO Y GARITA',
    subtitle: `${categoryLabel} · Autorizado por Inmueble ${data.unitCode}`,
    condoName: data.condoName,
    condoRif: data.condoRif ?? undefined,
    condoCode: data.condoCode ?? undefined,
    documentRef: `PASE: ${data.accessCode}`,
  });

  doc.section('1. Código Oficial de Verificación en Garita');
  doc.callout(
    `CÓDIGO DE ACCESO: ${data.accessCode}`,
    `Presente este código al personal de vigilancia al ingresar · Estado: ${data.status} · Usos: ${data.usesCount} de ${data.maxUses}`,
    data.status === 'ACTIVE' ? 'emerald' : 'slate',
  );

  doc.section('2. Datos del Visitante / Proveedor Autorizado');
  doc.keyValueGrid([
    { label: 'Nombre Completo del Visitante', value: data.visitorName, fullWidth: true },
    { label: 'Documento de Identidad', value: docStr },
    { label: 'Categoría de Ingreso', value: categoryLabel },
    { label: 'Modalidad de Acceso', value: modeLabel },
    { label: 'Placa de Vehículo Autorizado', value: data.visitorPlate || 'Ingreso Peatonal (Sin vehículo)' },
    { label: 'Empresa / Servicio', value: data.companyName || 'Particular / Visita Personal' },
    { label: 'Acompañantes Autorizados', value: `${data.companionCount} persona(s)` },
  ]);

  doc.section('3. Inmueble Autorizante y Vigencia del Pase');
  doc.keyValueGrid([
    { label: 'Residencia / Conjunto', value: `${data.condoName} (${code})` },
    { label: 'Inmueble / Unidad Destino', value: `Unidad ${data.unitCode}` },
    { label: 'Autorizado por', value: data.createdByName },
    { label: 'Límite de Ingresos Permitidos', value: `${data.maxUses} ingreso(s)` },
    { label: 'Válido Desde', value: pdfDateTime(new Date(data.validFrom)) },
    { label: 'Válido Hasta', value: pdfDateTime(new Date(data.validUntil)) },
  ]);

  if (data.notes && data.notes.trim()) {
    doc.section('4. Instrucciones / Observaciones para Garita');
    doc.text(data.notes.trim(), { size: 9 });
    doc.spacer(4);
  }

  doc.spacer(6);
  doc.hr(0.5);
  doc.text(
    'NORMAS DE SEGURIDAD: El personal de garita verificará el código de acceso y el documento de identidad antes de permitir el ingreso. ' +
      'Este pase es personal, auditable y válido únicamente dentro del rango de fechas e inmueble indicados.',
    { small: true, muted: true },
  );

  return doc.build();
}

/**
 * Reporte Oficial de Bitácora Digital de Garita y Control de Acceso (PDF).
 */
export function buildAccessLogbookPdf(data: AccessLogbookPdfData): Buffer {
  const code = (data.condoCode || 'COND').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const now = new Date();
  const ref = `BITACORA-${code}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}`;

  const periodStr =
    data.fromDate || data.toDate
      ? `${data.fromDate ? pdfDate(data.fromDate) : 'Inicio'} al ${data.toDate ? pdfDate(data.toDate) : 'Hoy'}`
      : 'Histórico General Reciente';

  const doc = new PdfBuilder({
    title: 'REPORTE OFICIAL DE BITÁCORA DE GARITA',
    subtitle: `Control de Acceso Peatonal, Vehicular, Proveedores y Servicios · Período: ${periodStr}`,
    condoName: data.condoName,
    condoRif: data.condoRif ?? undefined,
    condoCode: data.condoCode ?? undefined,
    documentRef: `REPORTE: ${ref}`,
  });

  doc.section('1. Resumen Ejecutivo de Movimientos y Seguridad');
  doc.keyValueGrid([
    { label: 'Residencia / Condominio', value: data.condoName },
    { label: 'Período Consultado', value: periodStr },
    { label: 'Total Movimientos Registrados', value: `${data.totalEntries} ingreso(s)` },
    { label: 'Actualmente en Recinto', value: `${data.currentlyInside} persona(s) / unidad(es)` },
    { label: 'Ingresos con Vehículo', value: `${data.vehiclesCount} vehículo(s)` },
    { label: 'Proveedores, Servicios y Delivery', value: `${data.deliveriesAndServicesCount} ingreso(s)` },
  ]);

  if (data.incidentsCount > 0) {
    doc.callout(
      `ATENCIÓN: ${data.incidentsCount} NOVEDAD(ES) / INCIDENCIA(S) DE SEGURIDAD REGISTRADAS`,
      'Verifique el detalle de los registros marcados con alerta en la bitácora inferior.',
      'amber',
    );
  } else {
    doc.callout(
      'OPERACIÓN DE GARITA SIN INCIDENCIAS DE SEGURIDAD REPORTADAS',
      'Todos los movimientos del período se registraron conforme a los protocolos de acceso del condominio.',
      'emerald',
    );
  }

  doc.section('2. Detalle Cronológico de Entradas y Salidas');
  if (data.logs.length > 0) {
    doc.table(
      [
        { label: 'Visitante / Empresa', width: 138, align: 'left' },
        { label: 'Doc. / Placa', width: 78, align: 'left' },
        { label: 'Categoría', width: 76, align: 'left' },
        { label: 'Destino', width: 54, align: 'left' },
        { label: 'Entrada', width: 89, align: 'right' },
        { label: 'Salida / Estado', width: 89, align: 'right' },
      ],
      data.logs.map((row) => {
        const nameAndCompany = row.companyName
          ? `${row.visitorName} (${row.companyName})`
          : row.visitorName;
        const docAndPlate = row.vehiclePlate
          ? `${row.visitorDoc} · [${row.vehiclePlate}]`
          : row.visitorDoc;
        const cat = CATEGORY_LABELS[row.category] ?? row.category;
        const dest = row.unitCode ? `Apto ${row.unitCode}` : 'Áreas Com.';
        const entryStr = pdfDateTime(new Date(row.entryTime));
        const exitStr = row.exitTime
          ? pdfDateTime(new Date(row.exitTime))
          : LOG_STATUS_LABELS[row.status] ?? row.status;
        return [nameAndCompany, docAndPlate, cat, dest, entryStr, exitStr];
      }),
      {
        footerRow: [
          'TOTAL MOVIMIENTOS EN BITÁCORA',
          `${data.vehiclesCount} veh.`,
          `${data.deliveriesAndServicesCount} prov/deliv.`,
          '—',
          `${data.totalEntries} ent.`,
          `${data.currentlyInside} dentro`,
        ],
      },
    );
  } else {
    doc.callout(
      'SIN MOVIMIENTOS REGISTRADOS EN EL PERÍODO SELECCIONADO',
      'No existen registros de entrada o salida para los filtros consultados.',
      'slate',
    );
  }

  doc.spacer(4);
  doc.hr(0.5);
  doc.text(
    'AUDITORÍA Y PROTECCIÓN DE DATOS: La información contenida en esta bitácora es confidencial de la administración y junta de condominio ' +
      'para fines exclusivos de seguridad física del inmueble. Todos los registros cuentan con trazabilidad del operador de garita.',
    { small: true, muted: true },
  );

  return doc.build();
}
