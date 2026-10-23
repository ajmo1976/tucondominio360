import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { DOC_TYPES, CondoAssignmentDto, ACCOUNT_TYPES, CompanySetupDto } from './create-user.dto';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  email?: string;

  @ApiPropertyOptional({ enum: DOC_TYPES })
  @IsOptional()
  @IsIn(DOC_TYPES)
  docType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  docNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Otorga control total del SaaS' })
  @IsOptional()
  @IsBoolean()
  isSuperadmin?: boolean;

  @ApiPropertyOptional({ description: 'Activo/inactivo (inactivo no puede iniciar sesión)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: ACCOUNT_TYPES,
    description: 'Tipo principal que define el superadmin (PROPIETARIO | JUNTA | ADMINISTRADORA)',
  })
  @IsOptional()
  @IsIn(ACCOUNT_TYPES)
  accountType?: (typeof ACCOUNT_TYPES)[number];

  @ApiPropertyOptional({
    type: CompanySetupDto,
    description: 'Datos de la empresa a crear automáticamente si accountType = ADMINISTRADORA y el usuario no tiene empresa',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompanySetupDto)
  company?: CompanySetupDto;

  @ApiPropertyOptional({
    type: [String],
    description:
      'ADMINISTRADORA: residencias a incorporar a la cartera de su empresa (se valida contra el plan max_condos)',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'portfolioCondoIds: cada residencia debe ser un UUID válido' })
  portfolioCondoIds?: string[];

  @ApiPropertyOptional({
    type: [CondoAssignmentDto],
    description: 'Reemplaza por completo las asignaciones actuales de residencias y unidades',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CondoAssignmentDto)
  assignments?: CondoAssignmentDto[];
}