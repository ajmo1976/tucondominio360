import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { TENANT_ROLES } from '../tenants.logic';

/** Asigna (o cambia) el rol de un usuario dentro de la empresa administradora. */
export class AddTenantStaffDto {
  @IsUUID()
  userId!: string;

  @IsIn(TENANT_ROLES as unknown as string[])
  role!: string;
}

/** Cambia solo el rol de un miembro existente del tenant. */
export class UpdateTenantStaffDto {
  @IsIn(TENANT_ROLES as unknown as string[])
  role!: string;
}

/** Datos editables de la empresa administradora. */
export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /**
   * Plan comercial: máximo de residencias en la cartera de la empresa.
   * `null` = sin límite. Solo el superadmin puede cambiarlo; no puede quedar
   * por debajo de las residencias actuales.
   */
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'El plan debe ser de al menos 1 residencia' })
  maxCondos?: number | null;
}
