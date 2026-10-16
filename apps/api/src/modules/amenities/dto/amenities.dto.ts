import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const SPACE_CATEGORIES = [
  'SOCIAL_HALL',
  'BBQ_GRILL',
  'SPORTS_COURT',
  'POOL_AREA',
  'COWORKING_ROOM',
  'FREIGHT_ELEVATOR',
  'SHARED_RESOURCE',
  'CUSTOM',
] as const;

export const BOOKING_MODES = ['HOURLY', 'FULL_DAY'] as const;
export const APPROVAL_MODES = ['AUTO_APPROVE', 'ADMIN_APPROVAL'] as const;
export const FEE_TYPES = ['FREE', 'FLAT_PER_BOOKING', 'PER_HOUR'] as const;
export const INSPECTION_STATUSES = [
  'PENDING',
  'CLEAN_OK',
  'WITH_OBSERVATIONS',
  'DAMAGE_REPORTED',
] as const;

export class UpdateAmenitiesConfigDto {
  @IsUUID()
  condoId!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  globalBlockDelinquentUnits?: boolean;

  @IsOptional()
  @IsBoolean()
  allowResidentCancellations?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  minHoursBeforeCancel?: number;
}

export class CreateAmenitySpaceDto {
  @IsUUID()
  condoId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  description?: string;

  @IsOptional()
  @IsIn(SPACE_CATEGORIES)
  spaceCategory?: string;

  @IsOptional()
  @IsIn(BOOKING_MODES)
  bookingMode?: 'HOURLY' | 'FULL_DAY';

  @IsOptional()
  @IsIn(APPROVAL_MODES)
  approvalMode?: 'AUTO_APPROVE' | 'ADMIN_APPROVAL';

  @IsOptional()
  @IsIn(FEE_TYPES)
  feeType?: 'FREE' | 'FLAT_PER_BOOKING' | 'PER_HOUR';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  capacity?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  feeUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cleaningFeeUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  depositUsd?: number;

  @IsOptional()
  @IsString()
  openTime?: string;

  @IsOptional()
  @IsString()
  closeTime?: string;

  @IsOptional()
  @IsArray()
  allowedDays?: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  minHoursNotice?: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  minDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  maxHoursPerSlot?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  maxAdvanceDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  bufferMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxConcurrentBookings?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  maxActivePerUnit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  maxPerUnitPerMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  cooldownDays?: number;

  @IsOptional()
  @IsBoolean()
  blockDelinquentUnits?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAllowedDebtUsd?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  rules?: string;
}

export class UpdateAmenitySpaceDto extends CreateAmenitySpaceDto {}

export class CreateBlackoutDto {
  @IsUUID()
  condoId!: string;

  @IsUUID()
  amenityId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(140)
  title!: string;

  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @IsString()
  @IsNotEmpty()
  endDate!: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class EvaluateReservationDto {
  @IsUUID()
  condoId!: string;

  @IsUUID()
  amenityId!: string;

  @IsUUID()
  propertyUnitId!: string;

  @IsString()
  @IsNotEmpty()
  reservationDate!: string;

  @IsString()
  @IsNotEmpty()
  startTime!: string;

  @IsString()
  @IsNotEmpty()
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  guestCount?: number;

  @IsOptional()
  @IsBoolean()
  solvencyOverride?: boolean;
}

export class CreateReservationDto extends EvaluateReservationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  eventTitle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  eventDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  paymentMethod?: string;
}

export class UpdateReservationStatusDto {
  @IsIn(['APPROVED', 'REJECTED', 'COMPLETED'])
  status!: 'APPROVED' | 'REJECTED' | 'COMPLETED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNotes?: string;
}

export class CancelReservationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RegisterReservationPaymentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  paymentReference!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(30)
  paymentMethod!: string;

  @IsOptional()
  @IsBoolean()
  verifyImmediately?: boolean;
}

export class InspectReservationDto {
  @IsIn(INSPECTION_STATUSES)
  inspectionStatus!: 'PENDING' | 'CLEAN_OK' | 'WITH_OBSERVATIONS' | 'DAMAGE_REPORTED';

  @IsOptional()
  @IsNumber()
  @Min(0)
  damageDeductionUsd?: number;

  @IsOptional()
  @IsBoolean()
  depositRefunded?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  inspectionNotes?: string;
}
