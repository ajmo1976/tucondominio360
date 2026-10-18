import { IsUUID, IsNotEmpty, IsOptional, IsString, IsBoolean, IsIn, IsNumber, Min, MaxLength, MinLength } from 'class-validator';

export enum AnnouncementCategory {
  GENERAL = 'GENERAL',
  URGENT = 'URGENT',
  MAINTENANCE = 'MAINTENANCE',
  FINANCIAL = 'FINANCIAL',
  ASSEMBLY = 'ASSEMBLY',
  SECURITY = 'SECURITY',
}

export enum AnnouncementStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  EXPIRED = 'EXPIRED',
}

export class CreateAnnouncementDto {
  @IsUUID()
  condoId!: string;

  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsNotEmpty()
  @IsString()
  content!: string;

  @IsOptional()
  @IsIn(Object.values(AnnouncementCategory))
  category?: AnnouncementCategory;

  @IsOptional()
  @IsBoolean()
  isUrgent?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresAcknowledgement?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentUrls?: string;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsIn(Object.values(AnnouncementCategory))
  category?: AnnouncementCategory;

  @IsOptional()
  @IsBoolean()
  isUrgent?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresAcknowledgement?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentUrls?: string;
}

export class AcknowledgeAnnouncementDto {
  @IsOptional()
  @IsUUID()
  announcementId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  signatureCode?: string;

  @IsOptional()
  @IsUUID()
  propertyUnitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  acknowledgementNote?: string;
}

export class AnnouncementsKPIs {
  totalPublished: number;
  totalUrgent: number;
  totalAcknowledged: number;
  acknowledgmentPct: number;
  pendingAcknowledgments: number;
}