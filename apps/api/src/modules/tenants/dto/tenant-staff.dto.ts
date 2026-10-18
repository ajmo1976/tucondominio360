import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
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
}
