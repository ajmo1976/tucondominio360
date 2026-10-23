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
import { OCCUPANT_ROLES } from '../occupant-role.logic';

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

/**
 * Tipo de usuario que define el superadmin:
 *  - PROPIETARIO:    dueño/ocupante de unidades (portal del propietario).
 *  - JUNTA:          miembro de junta de condominio (UNA sola residencia).
 *  - ADMINISTRADORA: personal de empresa administradora (cartera de N
 *                    residencias, con el límite del plan en tenants.max_condos).
 * Es combinable con los accesos existentes: cambiar el tipo no borra accesos.
 */
export const ACCOUNT_TYPES = ['PROPIETARIO', 'JUNTA', 'ADMINISTRADORA'] as const;

/** Datos de la empresa administradora que se crea automáticamente al definir un usuario como ADMINISTRADORA. */
export class CompanySetupDto {
  @ApiProperty({ example: 'Administradora Inmobiliaria Capital C.A.' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre comercial de la empresa es requerido' })
  name: string;

  @ApiPropertyOptional({ example: 'J-31456789-0', description: 'RIF de la empresa (obligatorio si la empresa es nueva)' })
  @IsOptional()
  @IsString()
  rif?: string;

  @ApiPropertyOptional({ example: 'contacto@admincapital.com.ve' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo de la empresa no es válido' })
  email?: string;

  @ApiPropertyOptional({ example: '+582129991122' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class UnitAssignmentDto {
  @ApiProperty({ description: 'ID de la unidad inmobiliaria (en BD mapea a property_unit_id)' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ enum: OCCUPANT_ROLES, description: 'Rol de ocupante por unidad' })
  @IsIn(OCCUPANT_ROLES)
  occupantRole: string = 'OWNER';

  @ApiPropertyOptional({ description: 'Es el contacto principal para cobs/utilidades' })
  @IsOptional()
  isPrimaryContact?: boolean;

  @ApiPropertyOptional({ description: 'Es el destinatario de las boletas' })
  @IsOptional()
  isBillingRecipient?: boolean;
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

  @ApiPropertyOptional({
    example: 'clave123',
    description:
      'Contraseña inicial. Si se omite, se crea la cuenta y se envía una invitación por correo para que el usuario la defina.',
  })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password?: string;

  @ApiProperty({ enum: DOC_TYPES, default: 'V' })
  @IsIn(DOC_TYPES)
  docType: string = 'V';

  @ApiPropertyOptional({ example: '18456123', description: 'Opcional si se invita solo por correo' })
  @IsOptional()
  @IsString()
  docNumber?: string;

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

  @ApiPropertyOptional({
    enum: ACCOUNT_TYPES,
    default: 'PROPIETARIO',
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

  @ApiPropertyOptional({ type: [CondoAssignmentDto], description: 'Residencias y unidades que se le asignan' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CondoAssignmentDto)
  assignments?: CondoAssignmentDto[];
}