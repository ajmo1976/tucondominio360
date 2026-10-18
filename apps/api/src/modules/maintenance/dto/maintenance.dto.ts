import { IsUUID, IsNotEmpty, IsOptional, IsString, IsBoolean, IsIn, IsNumber, Min, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** Los formularios envían '' cuando un campo opcional queda vacío. */
const emptyToUndefined = ({ value }: { value: any }) =>
  value === '' || value === null ? undefined : value;

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  EMERGENCY = 'EMERGENCY',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum TicketCategory {
  PLUMBING = 'PLUMBING',
  ELECTRICAL = 'ELECTRICAL',
  STRUCTURAL = 'STRUCTURAL',
  HVAC = 'HVAC',
  PAINTING = 'PAINTING',
  SECURITY = 'SECURITY',
  OTHER = 'OTHER',
}

export class CreateTicketDto {
  @IsUUID()
  condoId!: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  propertyUnitId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  categoryId?: string;

  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsNotEmpty()
  @IsString()
  description!: string;

  @IsNotEmpty()
  @IsIn(Object.values(TicketPriority))
  priority!: TicketPriority;

  @IsOptional()
  @IsIn(Object.values(TicketStatus))
  status?: TicketStatus;

  @IsOptional()
  @IsIn(Object.values(TicketCategory))
  category?: TicketCategory;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCostUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualCostUsd?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  locationArea?: string;

  @IsOptional()
  @IsBoolean()
  isPublicIssue?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  resolutionNotes?: string;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(Object.values(TicketPriority))
  priority?: TicketPriority;

  @IsOptional()
  @IsIn(Object.values(TicketStatus))
  status?: TicketStatus;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualCostUsd?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  locationArea?: string;

  @IsOptional()
  @IsBoolean()
  isPublicIssue?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNotes?: string;
}

export class CreateTicketCommentDto {
  @IsOptional()
  @IsUUID()
  ticketId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsNotEmpty()
  @IsString()
  comment!: string;

  @IsOptional()
  @IsBoolean()
  isInternalOnly?: boolean;
}

export class TicketKPIs {
  open: number;
  assigned: number;
  inProgress: number;
  resolved: number;
  closed: number;
  byPriority: Record<TicketPriority, number>;
  byCategory: Record<TicketCategory, number>;
}