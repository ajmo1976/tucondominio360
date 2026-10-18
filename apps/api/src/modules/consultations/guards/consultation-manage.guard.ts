import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { AccessService } from '../../access-core';

/**
 * Exige la capacidad `CONSULTATIONS_MANAGE` en la residencia de la consulta.
 *
 * La residencia se obtiene de `params.id` (id de la consulta) o, para la
 * creación, de `body.condoId`. Reemplaza a `SuperAdminGuard` para que la
 * administración y la junta (`BOARD_MEMBER`, etc.) puedan gestionar consultas.
 * El superadmin pasa siempre (tiene todas las capacidades).
 */
@Injectable()
export class ConsultationManageGuard implements CanActivate {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.id) throw new UnauthorizedException('Sesión inválida');

    const consultationId = req.params?.id;
    let condoId: string | undefined = req.body?.condoId;
    if (consultationId) {
      const c = await this.db.query('SELECT condo_id FROM consultations WHERE id = $1', [
        consultationId,
      ]);
      if (c.rows.length === 0) throw new NotFoundException('Consulta no encontrada');
      condoId = c.rows[0].condo_id;
    }
    if (!condoId) {
      throw new ForbiddenException('No se pudo determinar la residencia de la consulta');
    }

    await this.access.assertCondoPermission(user.id, condoId, 'CONSULTATIONS_MANAGE');
    return true;
  }
}
