import { SetMetadata } from '@nestjs/common';
import type { CondoPermission } from '@tucondominio360/shared';

/** Clave de metadata donde el guard lee la capacidad exigida por la ruta. */
export const CONDO_PERMISSION_KEY = 'condo_permission';

/**
 * Exige una capacidad (`CondoPermission`) en la residencia del request. El
 * `condoId` se resuelve desde `params.condoId`, `params.id`, `query.condoId` o
 * `body.condoId` (en ese orden) — ver `CondoPermissionGuard`.
 */
export const RequireCondoPermission = (permission: CondoPermission) =>
  SetMetadata(CONDO_PERMISSION_KEY, permission);
