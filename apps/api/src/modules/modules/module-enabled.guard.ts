import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ModulesService } from './modules.service';
import { MODULE_ENABLED_KEY } from './require-module.decorator';

/**
 * Extrae el `condoId` del request.
 * Prefiere: params.condoId > query.condoId > body.condoId > params.id
 */
export function extractCondoId(req: any): string | undefined {
  return (
    req?.params?.condoId ??
    req?.query?.condoId ??
    req?.body?.condoId ??
    req?.params?.id ??
    undefined
  );
}

/**
 * Guard que verifica si el módulo requerido está habilitado para la residencia.
 * Uso: @UseGuards(ModuleEnabledGuard) + @RequireModule('MAINTENANCE')
 * Si no hay condoId en el request, no bloquea (deja que el controlador lo resuelva).
 */
@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly modules: ModulesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Leer el módulo requerido del handler o de la clase
    const requiredModule = this.reflector.get<string | undefined>(
      MODULE_ENABLED_KEY,
      context.getHandler(),
    ) ?? this.reflector.get<string | undefined>(
      MODULE_ENABLED_KEY,
      context.getClass(),
    );
    if (!requiredModule) return true;

    const req = context.switchToHttp().getRequest();
    const condoId = extractCondoId(req);
    if (!condoId) return true; // sin condoId, no bloqueamos (el controlador lo valida)

    const userId = req?.user?.id;
    if (!userId) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }

    await this.modules.assertEnabled(condoId, requiredModule as any);
    return true;
  }
}