import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CondoPermission } from '@tucondominio360/shared';
import { AccessService } from './access.service';
import { assertPermission } from './condo-permission.logic';
import { CONDO_PERMISSION_KEY } from './require-condo-permission.decorator';

/**
 * Resuelve el `condoId` del request desde las ubicaciones soportadas:
 * `params.condoId`, `params.id`, `query.condoId`, `body.condoId`.
 */
export function resolveCondoId(req: any): string | undefined {
  return (
    req?.params?.condoId ??
    req?.params?.id ??
    req?.query?.condoId ??
    req?.body?.condoId ??
    undefined
  );
}

/**
 * Guard de permisos por residencia. Cuando la ruta declara
 * `@RequireCondoPermission('...')`, resuelve el acceso efectivo del usuario a
 * la residencia y responde 403 si falta la capacidad. Deja el resultado en
 * `req.access` para que el handler/servicio lo reutilice.
 */
@Injectable()
export class CondoPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<CondoPermission | undefined>(
      CONDO_PERMISSION_KEY,
      context.getHandler(),
    );
    if (!required) return true;

    const req = context.switchToHttp().getRequest();
    const condoId = resolveCondoId(req);
    if (!condoId) {
      throw new ForbiddenException('No se pudo determinar la residencia de la operación');
    }

    const userId = req?.user?.id;
    if (!userId) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }

    const access = await this.access.resolveCondoAccess(userId, condoId);
    assertPermission(access.permissions, required);
    req.access = access;
    return true;
  }
}
