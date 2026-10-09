import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Permite la acción solo al Super Administrador del SaaS. El guard JWT corre
 * antes (req.user trae la fila completa de users → is_superadmin).
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user?.is_superadmin) {
      throw new ForbiddenException('Solo el Super Administrador puede gestionar usuarios y accesos');
    }
    return true;
  }
}