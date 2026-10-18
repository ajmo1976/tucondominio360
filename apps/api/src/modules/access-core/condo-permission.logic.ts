import { ForbiddenException } from '@nestjs/common';
import type { CondoPermission } from '@tucondominio360/shared';

/**
 * Verifica que la lista de permisos efectivos incluya la capacidad requerida.
 * Lanza 403 con el formato acordado en la spec (`No tienes permiso para ...`).
 */
export function assertPermission(
  permissions: CondoPermission[],
  required: CondoPermission,
): void {
  if (!permissions.includes(required)) {
    throw new ForbiddenException(`No tienes permiso para esta acción (${required})`);
  }
}
