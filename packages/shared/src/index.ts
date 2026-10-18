// =============================================================================
// @tucondominio360/shared - Tipos Compartidos y Constantes de Dominio
// =============================================================================

export type TenantType = 'COMPANY' | 'SELF_MANAGED';
export type DocumentType = 'V' | 'E' | 'J' | 'G' | 'P';
export type CurrencyCode = 'USD' | 'VES' | 'EUR';
export type UnitType = 'APARTMENT' | 'HOUSE' | 'COMMERCIAL' | 'OFFICE' | 'PARKING' | 'STORAGE';
export type OccupantRole = 'OWNER' | 'CO_OWNER' | 'TENANT' | 'RESIDENT' | 'AUTHORIZED';
export type CondoRole =
  | 'ADMIN'
  | 'BOARD_PRESIDENT'
  | 'BOARD_TREASURER'
  | 'BOARD_MEMBER'
  | 'OWNER'
  | 'TENANT'
  | 'GUARD'
  | 'CONCIERGE'
  | 'AUDITOR';

export type ExpenseType = 'COMMON' | 'NON_COMMON' | 'RESERVE_FUND';
export type BillingPeriodStatus = 'DRAFT' | 'CALCULATED' | 'ISSUED' | 'CLOSED';
export type BillStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export type PaymentMethod =
  | 'PAGO_MOVIL'
  | 'TRANSFER_VES'
  | 'TRANSFER_USD_NACIONAL'
  | 'ZELLE'
  | 'CASH_USD'
  | 'CASH_VES'
  | 'BINANCE_USDT'
  | 'OTHER';

export type PaymentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'DISPUTED';
export type BankTxType = 'CREDIT' | 'DEBIT';

export type VisitorInvitationStatus = 'PENDING' | 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED' | 'CANCELLED';
export type VisitorCategory = 'VISITOR' | 'FAMILY' | 'PROVIDER' | 'DELIVERY' | 'SERVICE' | 'TAXI' | 'CONTRACTOR';
export type AccessEntryMode = 'PEDESTRIAN' | 'VEHICLE';
export type AccessLogStatus = 'INSIDE' | 'COMPLETED' | 'DENIED' | 'INCIDENT';
export type VehicleType = 'CAR' | 'SUV' | 'MOTO' | 'TRUCK' | 'OTHER';
export type ReservationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
export type AmenitySpaceCategory =
  | 'SOCIAL_HALL'
  | 'BBQ_GRILL'
  | 'SPORTS_COURT'
  | 'POOL_AREA'
  | 'COWORKING_ROOM'
  | 'FREIGHT_ELEVATOR'
  | 'SHARED_RESOURCE'
  | 'CUSTOM';
export type AmenityBookingMode = 'HOURLY' | 'FULL_DAY';
export type AmenityApprovalMode = 'AUTO_APPROVE' | 'ADMIN_APPROVAL';
export type AmenityFeeType = 'FREE' | 'FLAT_PER_BOOKING' | 'PER_HOUR';
export type AnnouncementCategory = 'GENERAL' | 'MAINTENANCE' | 'ASSEMBLY' | 'FINANCIAL' | 'SECURITY' | 'URGENT';
export type TicketIncidentType = 'PLUMBING' | 'ELECTRICAL' | 'ELEVATOR' | 'SECURITY' | 'CLEANING' | 'STRUCTURAL' | 'OTHER';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
export type TicketStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type IncidentType =
  | 'PLUMBING'
  | 'PUMP_SYSTEM'
  | 'ELEVATOR'
  | 'ELECTRICAL'
  | 'SECURITY_GATE'
  | 'COMMON_AREA'
  | 'CLEANING'
  | 'OTHER';
export type AnnouncementCategory =
  | 'GENERAL'
  | 'WATER_SERVICE'
  | 'ELEVATOR'
  | 'FUMIGATION'
  | 'SECURITY'
  | 'FINANCIAL'
  | 'LEGAL_NOTICE'
  | 'ASSEMBLY';
export type ConsultationType = 'CARTA_CONSULTA' | 'ASAMBLEA_ORDINARIA' | 'ASAMBLEA_EXTRAORDINARIA';
export type ConsultationStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
export type ConsultationResult = 'APPROVED' | 'REJECTED' | 'TIED' | 'NO_VOTES';
export type ConsultationElectorSource = 'OWNER' | 'MANUAL';
export type PackageStatus = 'RECEIVED_AT_GATE' | 'DELIVERED_TO_RESIDENT' | 'RETURNED';

// -----------------------------------------------------------------------------
// Catálogo de Bancos de Venezuela (Códigos Oficiales SUDEBAN)
// -----------------------------------------------------------------------------
export interface VenezuelanBank {
  code: string;
  name: string;
  shortName: string;
  supportsPagoMovil: boolean;
}

export const VENEZUELAN_BANKS: Record<string, VenezuelanBank> = {
  '0102': { code: '0102', name: 'Banco de Venezuela, S.A. Banco Universal', shortName: 'BDV', supportsPagoMovil: true },
  '0104': { code: '0104', name: 'Venezolano de Crédito, S.A. Banco Universal', shortName: 'Venezolano de Crédito', supportsPagoMovil: true },
  '0105': { code: '0105', name: 'Banco Mercantil, C.A. Banco Universal', shortName: 'Mercantil', supportsPagoMovil: true },
  '0108': { code: '0108', name: 'Banco Provincial, S.A. Banco Universal', shortName: 'BBVA Provincial', supportsPagoMovil: true },
  '0114': { code: '0114', name: 'Bancaribe, C.A. Banco Universal', shortName: 'Bancaribe', supportsPagoMovil: true },
  '0115': { code: '0115', name: 'Banco Exterior, C.A. Banco Universal', shortName: 'Exterior', supportsPagoMovil: true },
  '0128': { code: '0128', name: 'Banco Caroní, C.A. Banco Universal', shortName: 'Caroní', supportsPagoMovil: true },
  '0134': { code: '0134', name: 'Banesco Banco Universal, C.A.', shortName: 'Banesco', supportsPagoMovil: true },
  '0137': { code: '0137', name: 'Banco Sofitasa, Banco Universal C.A.', shortName: 'Sofitasa', supportsPagoMovil: true },
  '0138': { code: '0138', name: 'Banco Plaza, Banco Universal C.A.', shortName: 'Banco Plaza', supportsPagoMovil: true },
  '0151': { code: '0151', name: 'BFC Banco Fondo Común, C.A. Banco Universal', shortName: 'BFC', supportsPagoMovil: true },
  '0156': { code: '0156', name: '100% Banco, Banco Universal C.A.', shortName: '100% Banco', supportsPagoMovil: true },
  '0157': { code: '0157', name: 'Banco del Sur, C.A. Banco Universal', shortName: 'Del Sur', supportsPagoMovil: true },
  '0163': { code: '0163', name: 'Banco del Tesoro, C.A. Banco Universal', shortName: 'Tesoro', supportsPagoMovil: true },
  '0166': { code: '0166', name: 'Banco Agrícola de Venezuela, C.A.', shortName: 'Agrícola', supportsPagoMovil: true },
  '0168': { code: '0168', name: 'Bancrecer, S.A. Banco Universal', shortName: 'Bancrecer', supportsPagoMovil: true },
  '0169': { code: '0169', name: 'Mi Banco, Banco Microfinanciero C.A.', shortName: 'Mi Banco', supportsPagoMovil: true },
  '0171': { code: '0171', name: 'Banco Activo, C.A. Banco Universal', shortName: 'Activo', supportsPagoMovil: true },
  '0172': { code: '0172', name: 'Bancamiga, Banco Universal C.A.', shortName: 'Bancamiga', supportsPagoMovil: true },
  '0174': { code: '0174', name: 'Banplus Banco Universal, C.A.', shortName: 'Banplus', supportsPagoMovil: true },
  '0175': { code: '0175', name: 'Banco Bicentenario del Pueblo, Banco Universal C.A.', shortName: 'Bicentenario', supportsPagoMovil: true },
  '0177': { code: '0177', name: 'Banco de la Fuerza Armada Nacional Bolivariana (BANFANB)', shortName: 'BANFANB', supportsPagoMovil: true },
  '0191': { code: '0191', name: 'Banco Nacional de Crédito, C.A. Banco Universal', shortName: 'BNC', supportsPagoMovil: true },
};

// -----------------------------------------------------------------------------
// Expresiones Regulares de Validación en Venezuela
// -----------------------------------------------------------------------------
export const VENEZUELA_VALIDATION = {
  RIF_REGEX: /^[VJEGP]-[0-9]{8}-[0-9]$/i,
  CEDULA_REGEX: /^[VE]-[0-9]{5,9}$/i,
  PHONE_MOBILE_REGEX: /^(\+?58|0)?(412|414|424|416|426)[0-9]{7}$/,
  ACCOUNT_NUMBER_REGEX: /^[0-9]{20}$/,
};

// -----------------------------------------------------------------------------
// Interfaces Principales del Negocio
// -----------------------------------------------------------------------------
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  tenantType: TenantType;
  rif: string;
  email: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  isActive: boolean;
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  docType: DocumentType;
  docNumber: string;
  phone?: string;
  avatarUrl?: string;
  isActive: boolean;
  isSuperadmin: boolean;
}

export interface Condo {
  id: string;
  tenantId: string;
  name: string;
  rif: string;
  address: string;
  state: string;
  city: string;
  postalCode?: string;
  mainCurrency: CurrencyCode;
  secondaryCurrency: CurrencyCode;
  reserveFundRate: number;
  lateFeeRate: number;
  bcvPolicy: string;
  isActive: boolean;
}

export interface PropertyUnit {
  id: string;
  condoId: string;
  buildingId?: string;
  unitCode: string;
  unitType: UnitType;
  floor?: string;
  aliquotPercentage: number;
  areaSqm?: number;
  currentBalanceUsd: number;
  hasGasService: boolean;
  hasParking: boolean;
  parkingNumber?: string;
  hasStorage: boolean;
  storageNumber?: string;
  isActive: boolean;
}

export interface BankAccount {
  id: string;
  condoId: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountType: string;
  currency: CurrencyCode;
  accountHolderName: string;
  accountHolderRif: string;
  supportsPagoMovil: boolean;
  pagoMovilPhone?: string;
  pagoMovilIdType?: DocumentType;
  pagoMovilIdNumber?: string;
  isActive: boolean;
}

export interface CondoBill {
  id: string;
  condoId: string;
  billingPeriodId: string;
  propertyUnitId: string;
  billNumber: string;
  aliquotPercentage: number;
  commonShareUsd: number;
  nonCommonShareUsd: number;
  reserveFundUsd: number;
  currentPeriodUsd: number;
  previousDebtUsd: number;
  creditBalanceAppliedUsd: number;
  interestMoratoryUsd: number;
  totalDueUsd: number;
  totalDueVes: number;
  exchangeRateEmission: number;
  totalPaidUsd: number;
  remainingBalanceUsd: number;
  status: BillStatus;
  pdfUrl?: string;
  qrVerificationCode?: string;
}

export interface PaymentReport {
  id: string;
  condoId: string;
  propertyUnitId: string;
  reportedByUserId: string;
  bankAccountId?: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  paymentDate: string;
  originBank?: string;
  originPhone?: string;
  originDocNumber?: string;
  currency: CurrencyCode;
  amountPaid: number;
  exchangeRateApplied: number;
  equivalentUsd: number;
  receiptImageUrl?: string;
  notes?: string;
  status: PaymentStatus;
  rejectionReason?: string;
}
