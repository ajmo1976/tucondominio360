import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const VEHICLE_TYPES = ['CAR', 'SUV', 'MOTO', 'TRUCK', 'OTHER'] as const;
export const VISITOR_CATEGORIES = [
  'VISITOR',
  'FAMILY',
  'PROVIDER',
  'DELIVERY',
  'SERVICE',
  'TAXI',
  'CONTRACTOR',
] as const;
export const ACCESS_ENTRY_MODES = ['PEDESTRIAN', 'VEHICLE'] as const;
export const DOC_TYPES = ['V', 'E', 'J', 'G', 'P'] as const;

export class UpdateAccessConfigDto {
  @IsUUID()
  condoId!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  residentVehicles?: boolean;

  @IsOptional()
  @IsBoolean()
  visitorPasses?: boolean;

  @IsOptional()
  @IsBoolean()
  suppliersAndDelivery?: boolean;

  @IsOptional()
  @IsBoolean()
  packagesAndMail?: boolean;

  @IsOptional()
  @IsBoolean()
  requireDocNumberOnEntry?: boolean;

  @IsOptional()
  @IsBoolean()
  requirePlateForVehicles?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxActivePassesPerUnit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  defaultPassDurationHours?: number;
}

export class CreateVehicleDto {
  @IsUUID()
  condoId!: string;

  @IsUUID()
  propertyUnitId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(15)
  plate!: string;

  @IsOptional()
  @IsIn(VEHICLE_TYPES)
  vehicleType?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  brand!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  model!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(30)
  color!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  parkingSpot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tagCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(15)
  plate?: string;

  @IsOptional()
  @IsIn(VEHICLE_TYPES)
  vehicleType?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  model?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  parkingSpot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tagCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateInvitationDto {
  @IsUUID()
  condoId!: string;

  @IsUUID()
  propertyUnitId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  visitorName!: string;

  @IsOptional()
  @IsIn(DOC_TYPES)
  visitorDocType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  visitorDocNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  visitorPlate?: string;

  @IsOptional()
  @IsIn(VISITOR_CATEGORIES)
  visitorCategory?: string;

  @IsOptional()
  @IsIn(ACCESS_ENTRY_MODES)
  entryMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  companionCount?: number;

  @IsOptional()
  @IsString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxUses?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ValidateAccessCodeDto {
  @IsUUID()
  condoId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  accessCode!: string;
}

export class CheckInLogDto {
  @IsUUID()
  condoId!: string;

  @IsOptional()
  @IsUUID()
  invitationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  accessCode?: string;

  @IsOptional()
  @IsUUID()
  propertyUnitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  visitorName?: string;

  @IsOptional()
  @IsIn(DOC_TYPES)
  visitorDocType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  visitorDocNumber?: string;

  @IsOptional()
  @IsIn(VISITOR_CATEGORIES)
  visitorCategory?: string;

  @IsOptional()
  @IsIn(ACCESS_ENTRY_MODES)
  entryMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  vehiclePlate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  destinationLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorizedByName?: string;

  @IsOptional()
  @IsBoolean()
  incidentAlert?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CheckOutLogDto {
  @IsOptional()
  @IsBoolean()
  incidentAlert?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReceivePackageDto {
  @IsUUID()
  condoId!: string;

  @IsUUID()
  propertyUnitId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  courierCompany!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class DeliverPackageDto {
  @IsOptional()
  @IsString()
  @MaxLength(6)
  pickupPin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deliveredToName?: string;

  @IsOptional()
  @IsIn(['DELIVERED_TO_RESIDENT', 'RETURNED'])
  status?: 'DELIVERED_TO_RESIDENT' | 'RETURNED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
