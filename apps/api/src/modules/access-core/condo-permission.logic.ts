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

/**
 * Como `assertPermission` pero basta con tener CUALQUIERA de las capacidades.
 * Útil para endpoints que sirven tanto a gestión como a reporte de residentes.
 */
export function assertAnyPermission(
  permissions: CondoPermission[],
  required: CondoPermission[],
): void {
  if (!required.some((p) => permissions.includes(p))) {
    throw new ForbiddenException(
      `No tienes permiso para esta acción (${required.join(' | ')})`,
    );
  }
}
