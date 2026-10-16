import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';

// Un usuario regular solo ve consultas ya publicadas o cerradas; los borradores
// son visibles únicamente para el Super Administrador.
const VISIBLE_STATUSES = `('PUBLISHED', 'CLOSED', 'CANCELLED')`;

@Injectable()
export class ConsultationsService {
  constructor(private readonly db: DatabaseService) {}

  async create(user: any, dto: CreateConsultationDto): Promise<{ id: string }> {
    const condo = await this.db.query(`SELECT id FROM condos WHERE id = $1`, [dto.condoId]);
    if (condo.rows.length === 0) throw new NotFoundException('Residencia no encontrada');

    if (!(new Date(dto.startDate) < new Date(dto.endDate))) {
      throw new BadRequestException('La fecha de cierre debe ser posterior a la de inicio');
    }
    const titles = dto.options.map((o) => o.title.trim());
    if (new Set(titles).size !== titles.length) {
      throw new BadRequestException('Las opciones deben tener títulos distintos');
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `INSERT INTO consultations (
           condo_id, created_by_user_id, title, description, consultation_type,
           status, start_date, end_date, is_secret_ballot
         ) VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7, FALSE)
         RETURNING id`,
        [
          dto.condoId,
          user.id,
          dto.title,
          dto.description,
          dto.consultationType,
          dto.startDate,
          dto.endDate,
        ],
      );
      const id = res.rows[0].id;

      for (let i = 0; i < dto.options.length; i++) {
        const option = dto.options[i];
        await client.query(
          `INSERT INTO consultation_options (consultation_id, title, description, position)
           VALUES ($1, $2, $3, $4)`,
          [id, option.title, option.description ?? null, i],
        );
      }

      await client.query(
        `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
         VALUES ($1, $2, 'CONSULTATION_CREATED', 'consultations', $3, $4)`,
        [
          dto.condoId,
          user.id,
          id,
          JSON.stringify({
            title: dto.title,
            consultationType: dto.consultationType,
            options: dto.options.length,
          }),
        ],
      );

      await client.query('COMMIT');
      return { id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listForUser(user: any, condoId: string) {
    if (!condoId) throw new BadRequestException('Residencia no especificada');

    if (!user.is_superadmin) {
      await this.assertMember(user, condoId);
    }

    const statusFilter = user.is_superadmin ? '' : `AND c.status IN ${VISIBLE_STATUSES}`;
    const res = await this.db.query(
      `SELECT c.id, c.condo_id, c.title, c.description, c.consultation_type, c.status,
              c.start_date, c.end_date, c.is_secret_ballot, c.created_at,
              (SELECT COUNT(*) FROM consultation_options o WHERE o.consultation_id = c.id)::int AS option_count,
              (SELECT COUNT(*) FROM consultation_votes v WHERE v.consultation_id = c.id)::int AS vote_count
       FROM consultations c
       WHERE c.condo_id = $1 ${statusFilter}
       ORDER BY c.created_at DESC`,
      [condoId],
    );
    return res.rows;
  }

  async getOne(user: any, id: string) {
    const res = await this.db.query(`SELECT * FROM consultations WHERE id = $1`, [id]);
    if (res.rows.length === 0) throw new NotFoundException('Consulta no encontrada');

    const consultation = res.rows[0];
    if (!user.is_superadmin && consultation.status === 'DRAFT') {
      throw new NotFoundException('Consulta no encontrada');
    }

    const options = await this.db.query(
      `SELECT o.id, o.title, o.description, o.position,
              (SELECT COUNT(*) FROM consultation_votes v WHERE v.consultation_option_id = o.id)::int AS vote_count
       FROM consultation_options o
       WHERE o.consultation_id = $1
       ORDER BY o.position ASC`,
      [id],
    );

    const votes = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM consultation_votes WHERE consultation_id = $1`,
      [id],
    );

    const showResult = consultation.status === 'CLOSED' || consultation.status === 'CANCELLED';

    return {
      ...consultation,
      options: options.rows,
      vote_count: votes.rows[0].count,
      result_snapshot: showResult ? consultation.result_snapshot : undefined,
    };
  }

  async update(user: any, id: string, dto: UpdateConsultationDto) {
    const current = await this.db.query(`SELECT * FROM consultations WHERE id = $1`, [id]);
    if (current.rows.length === 0) throw new NotFoundException('Consulta no encontrada');

    const consultation = current.rows[0];
    if (consultation.status !== 'DRAFT') {
      throw new BadRequestException('Solo se puede editar una consulta en borrador');
    }

    const startDate = dto.startDate ?? consultation.start_date;
    const endDate = dto.endDate ?? consultation.end_date;
    if (!(new Date(startDate) < new Date(endDate))) {
      throw new BadRequestException('La fecha de cierre debe ser posterior a la de inicio');
    }

    if (dto.options) {
      const titles = dto.options.map((option) => option.title.trim());
      if (new Set(titles).size !== titles.length) {
        throw new BadRequestException('Las opciones deben tener títulos distintos');
      }
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE consultations SET
           title = COALESCE($1, title),
           description = COALESCE($2, description),
           consultation_type = COALESCE($3, consultation_type),
           start_date = COALESCE($4, start_date),
           end_date = COALESCE($5, end_date)
         WHERE id = $6`,
        [
          dto.title ?? null,
          dto.description ?? null,
          dto.consultationType ?? null,
          dto.startDate ?? null,
          dto.endDate ?? null,
          id,
        ],
      );

      if (dto.options) {
        await client.query(`DELETE FROM consultation_options WHERE consultation_id = $1`, [id]);
        for (let i = 0; i < dto.options.length; i++) {
          const option = dto.options[i];
          await client.query(
            `INSERT INTO consultation_options (consultation_id, title, description, position)
             VALUES ($1, $2, $3, $4)`,
            [id, option.title, option.description ?? null, i],
          );
        }
      }

      await client.query(
        `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
         VALUES ($1, $2, 'CONSULTATION_UPDATED', 'consultations', $3, $4)`,
        [consultation.condo_id, user.id, id, JSON.stringify(dto)],
      );

      await client.query('COMMIT');
      return { id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Debe llamarse solo para usuarios no superadmin: verifica que tenga acceso
   * activo a la residencia (condo_user_access) o que ocupe una unidad de ella.
   */
  private async assertMember(user: any, condoId: string): Promise<void> {
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
  }
}
