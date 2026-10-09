import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

/**
 * Permite el acceso al dashboard comunitario únicamente a:
 *  - superadministradores (gestión), o
 *  - usuarios con acceso activo a la residencia (condo_user_access) o que
 *    ocupen una unidad de ella (unit_occupants).
 *
 * Es la frontera de privacidad del "Dashboard de Transparencia": un
 * propietario jamás lee datos de otra residencia a la que no pertenece.
 */
@Injectable()
export class CondoMemberGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.id) throw new UnauthorizedException('Sesión inválida');

    const condoId = req.params?.condoId;
    if (!condoId) throw new ForbiddenException('Residencia no especificada');

    if (user.is_superadmin) return true;

    const res = await this.db.query(
      `SELECT 1
       FROM condo_user_access
       WHERE condo_id = $1 AND user_id = $2 AND is_active = TRUE
       UNION
       SELECT 1
       FROM unit_occupants uo
       JOIN property_units pu ON pu.id = uo.property_unit_id
       WHERE pu.condo_id = $1 AND uo.user_id = $2
       LIMIT 1`,
      [condoId, user.id],
    );
    if (res.rows.length === 0) {
      throw new ForbiddenException('No tienes acceso a esta residencia');
    }
    return true;
  }
}