import { IsArray, IsBoolean, IsIn, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ModuleCode } from '@tucondominio360/shared';

/** Toggle individual de un módulo. */
export class ModuleToggleDto {
  @IsIn([
    'DASHBOARD', 'COMMUNITY', 'BILLING', 'UNITS', 'USERS',
    'EXPENSES', 'PAYMENTS', 'ACCESS', 'AMENITIES',
    'MAINTENANCE', 'ANNOUNCEMENTS', 'CONSULTATIONS'
  ])
  code!: ModuleCode;

  @IsBoolean()
  enabled!: boolean;
}

/** Body para PATCH /api/tenants/:id/modules o /api/condos/:id/modules. */
export class UpdateModulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModuleToggleDto)
  modules!: ModuleToggleDto[];
}

/** Body para PATCH /api/modules/:code (solo superadmin). */
export class UpdateGlobalModuleDto {
  @IsBoolean()
  defaultEnabled!: boolean;
}