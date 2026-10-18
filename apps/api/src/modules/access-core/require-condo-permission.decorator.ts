import { SetMetadata } from '@nestjs/common';
import type { CondoPermission } from '@tucondominio360/shared';

/** Clave de metadata donde el guard lee las capacidades exigidas por la ruta. */
export const CONDO_PERMISSION_KEY = 'condo_permission';

/**
 * Exige al menos UNA de las capacidades (`CondoPermission`) en la residencia del
 * request. El `condoId` se resuelve con `resolveCondoId` (ver el guard).
 *
 * @example @RequireCondoPermission('MAINTENANCE_MANAGE')
 * @example @RequireCondoPermission('MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT')
 */
export const RequireCondoPermission = (...permissions: CondoPermission[]) =>
  SetMetadata(CONDO_PERMISSION_KEY, permissions);
