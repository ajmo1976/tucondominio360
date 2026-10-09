import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { DOC_TYPES, CondoAssignmentDto } from './create-user.dto';

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
    type: [CondoAssignmentDto],
    description: 'Reemplaza por completo las asignaciones actuales de residencias y unidades',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CondoAssignmentDto)
  assignments?: CondoAssignmentDto[];
}