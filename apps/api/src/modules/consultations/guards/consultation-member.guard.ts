import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

@Injectable()
export class ConsultationMemberGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.id) throw new UnauthorizedException('Sesión inválida');

    const id = req.params?.id;
    if (!id) throw new ForbiddenException('Consulta no especificada');

    const c = await this.db.query('SELECT condo_id FROM consultations WHERE id = $1', [id]);
    if (c.rows.length === 0) throw new NotFoundException('Consulta no encontrada');

    if (user.is_superadmin) return true;

    const condoId = c.rows[0].condo_id;
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
      throw new ForbiddenException('No tienes acceso a esta consulta');
    }
    return true;
  }
}
