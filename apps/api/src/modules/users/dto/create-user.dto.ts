import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Roles del enum condo_role que puede tener un usuario dentro de una residencia. */
export const CONDO_ROLES = [
  'ADMIN',
  'BOARD_PRESIDENT',
  'BOARD_TREASURER',
  'BOARD_MEMBER',
  'OWNER',
  'TENANT',
  'GUARD',
  'CONCIERGE',
  'AUDITOR',
] as const;

/** Tipos de documento de identidad venezolano soportados. */
export const DOC_TYPES = ['V', 'E', 'J', 'G', 'P'] as const;

export class UnitAssignmentDto {
  @ApiProperty({ description: 'ID de la unidad inmobiliaria' })
  @IsUUID()
  unitId: string;
}

export class CondoAssignmentDto {
  @ApiProperty({ description: 'ID de la residencia/condominio' })
  @IsUUID()
  condoId: string;

  @ApiProperty({ enum: CONDO_ROLES, default: 'OWNER' })
  @IsIn(CONDO_ROLES)
  role: string = 'OWNER';

  @ApiPropertyOptional({ type: [UnitAssignmentDto], description: 'Unidades que ocupa dentro de esta residencia' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnitAssignmentDto)
  units?: UnitAssignmentDto[];
}

export class CreateUserDto {
  @ApiProperty({ example: 'María' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido' })
  firstName: string;

  @ApiProperty({ example: 'Gómez' })
  @IsString()
  @IsNotEmpty({ message: 'El apellido es requerido' })
  lastName: string;

  @ApiProperty({ example: 'maria.gomez@gmail.com' })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  email: string;

  @ApiProperty({ example: 'clave123', description: 'Contraseña inicial que el usuario podrá cambiar luego' })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;

  @ApiProperty({ enum: DOC_TYPES, default: 'V' })
  @IsIn(DOC_TYPES)
  docType: string = 'V';

  @ApiProperty({ example: '18456123' })
  @IsString()
  @IsNotEmpty({ message: 'El documento de identidad es requerido' })
  docNumber: string;

  @ApiPropertyOptional({ example: '+584120000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ default: false, description: 'Otorga control total del SaaS' })
  @IsOptional()
  @IsBoolean()
  isSuperadmin?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [CondoAssignmentDto], description: 'Residencias y unidades que se le asignan' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CondoAssignmentDto)
  assignments?: CondoAssignmentDto[];
}