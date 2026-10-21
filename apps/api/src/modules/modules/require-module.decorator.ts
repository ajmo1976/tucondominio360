import { SetMetadata } from '@nestjs/common';
import type { ModuleCode } from '@tucondominio360/shared';

/** Clave de metadata donde el guard lee el módulo exigido por la ruta. */
export const MODULE_ENABLED_KEY = 'module_enabled';

/**
 * Exige que un módulo esté habilitado en la residencia del request.
 * El `condoId` se resuelve con `extractCondoId` (ver el guard).
 *
 * @example @RequireModule('MAINTENANCE')
 */
export const RequireModule = (moduleCode: ModuleCode) =>
  SetMetadata(MODULE_ENABLED_KEY, moduleCode);