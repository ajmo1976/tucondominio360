import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { AddElectorDto } from './dto/add-elector.dto';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { VoteDto } from './dto/vote.dto';
import { computeConsultationTally, TallyResult } from './tally';

// Semántica de `result` (Ruling R3): APPROVED = decisión tomada (existe opción
// mayoritaria por unidades), no "el sí ganó"; TIED = empate (sin decisión);
// NO_VOTES = sin votos; REJECTED queda reservado/no se produce.
type ConsultationResult = 'APPROVED' | 'REJECTED' | 'TIED' | 'NO_VOTES';

interface VoteMeta {
  ip?: string;
  userAgent?: string;
}

export interface VoteReceipt {
  voteId: string;
  verificationCode: string;
  optionId: string;
  unitCode: string;
  votedAt: string;
}

export interface EligibilityUnit {
  propertyUnitId: string;
  unitCode: string;
  alreadyVoted: boolean;
  votedOptionId: string | null;
}

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
   * Publica una consulta en borrador y congela el padrón: crea un elector por
   * cada propietario/copropietario vigente de las unidades activas. A partir de
   * aquí la consulta es visible para los residentes.
   */
  async publish(user: any, id: string): Promise<{ electorsCreated: number; unitsWithoutElector: string[] }> {
    const res = await this.db.query(`SELECT * FROM consultations WHERE id = $1`, [id]);
    if (res.rows.length === 0) throw new NotFoundException('Consulta no encontrada');

    const consultation = res.rows[0];
    if (consultation.status !== 'DRAFT') {
      throw new BadRequestException('Solo se publican consultas en borrador');
    }

    const options = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM consultation_options WHERE consultation_id = $1`,
      [id],
    );
    if (options.rows[0].count < 2) {
      throw new BadRequestException('La consulta debe tener al menos dos opciones');
    }

    if (!(new Date(consultation.end_date) > new Date())) {
      throw new BadRequestException('La fecha de cierre debe ser futura');
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      await client.query(`UPDATE consultations SET status = 'PUBLISHED' WHERE id = $1`, [id]);

      const inserted = await client.query(
        `INSERT INTO consultation_electors (consultation_id, property_unit_id, user_id, source, added_by_user_id)
         SELECT $1, pu.id, uo.user_id, 'OWNER', $3
         FROM property_units pu
         JOIN unit_occupants uo ON uo.property_unit_id = pu.id
         WHERE pu.condo_id = $2 AND pu.is_active = TRUE
           AND uo.role IN ('OWNER','CO_OWNER')
           AND (uo.valid_to IS NULL OR uo.valid_to >= CURRENT_DATE)
         ON CONFLICT ON CONSTRAINT uq_consultation_elector DO NOTHING`,
        [id, consultation.condo_id, user.id],
      );

      const withoutElector = await client.query(
        `SELECT pu.unit_code
         FROM property_units pu
         WHERE pu.condo_id = $1 AND pu.is_active = TRUE
           AND NOT EXISTS (
             SELECT 1 FROM consultation_electors ce
             WHERE ce.consultation_id = $2 AND ce.property_unit_id = pu.id
           )
         ORDER BY pu.unit_code ASC`,
        [consultation.condo_id, id],
      );

      const electorsCreated = inserted.rowCount ?? 0;
      const unitsWithoutElector = withoutElector.rows.map((r) => r.unit_code);

      await client.query(
        `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
         VALUES ($1, $2, 'CONSULTATION_PUBLISHED', 'consultations', $3, $4)`,
        [
          consultation.condo_id,
          user.id,
          id,
          JSON.stringify({ electorsCreated, unitsWithoutElector }),
        ],
      );

      await client.query('COMMIT');
      return { electorsCreated, unitsWithoutElector };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cierra una consulta publicada y congela su resultado en `result_snapshot`
   * (JSONB) dentro de una transacción con la fila bloqueada (FOR UPDATE). El
   * recuento se decide por unidades, no por alícuota. Cerrar antes de `end_date`
   * es válido (cierre anticipado por el administrador).
   */
  async close(user: any, id: string): Promise<{ result: ConsultationResult; snapshot: TallyResult }> {
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      const res = await client.query(`SELECT condo_id, status FROM consultations WHERE id = $1 FOR UPDATE`, [
        id,
      ]);
      if (res.rows.length === 0) throw new NotFoundException('Consulta no encontrada');

      const consultation = res.rows[0];
      if (consultation.status !== 'PUBLISHED') {
        throw new BadRequestException('Solo se cierran consultas publicadas');
      }

      const optionsRes = await client.query(
        `SELECT id, title, position FROM consultation_options
         WHERE consultation_id = $1
         ORDER BY position ASC`,
        [id],
      );
      const votesRes = await client.query(
        `SELECT consultation_option_id, aliquot_applied FROM consultation_votes
         WHERE consultation_id = $1`,
        [id],
      );

      const tally = computeConsultationTally(
        optionsRes.rows.map((o) => ({ id: o.id, title: o.title, position: o.position })),
        votesRes.rows.map((v) => ({
          optionId: v.consultation_option_id,
          aliquot: Number(v.aliquot_applied),
        })),
      );

      await client.query(
        `UPDATE consultations SET
           status = 'CLOSED',
           closed_at = NOW(),
           closed_by_user_id = $2,
           result = $3,
           winning_option_id = $4,
           result_snapshot = $5
         WHERE id = $1`,
        [id, user.id, tally.result, tally.winnerOptionId, JSON.stringify(tally)],
      );

      await client.query(
        `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
         VALUES ($1, $2, 'CONSULTATION_CLOSED', 'consultations', $3, $4)`,
        [
          consultation.condo_id,
          user.id,
          id,
          JSON.stringify({
            result: tally.result,
            winnerOptionId: tally.winnerOptionId,
            totalUnits: tally.totalUnits,
            totalAliquot: tally.totalAliquot,
          }),
        ],
      );

      await client.query('COMMIT');
      return { result: tally.result, snapshot: tally };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Resultados de la consulta: recuento en vivo mientras está `PUBLISHED`, o el
   * `result_snapshot` congelado al cerrar. Los votos se exponen públicamente
   * (unidad, votante, opción y fecha) — no hay voto secreto. Un no-superadmin no
   * puede ver los resultados de un borrador.
   */
  async getResults(
    user: any,
    id: string,
  ): Promise<{
    tally: TallyResult;
    votes: Array<{ unitCode: string; voter: string; optionId: string; votedAt: string }>;
    closed: boolean;
    result: ConsultationResult | null;
  }> {
    const res = await this.db.query(
      `SELECT status, result, result_snapshot FROM consultations WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) throw new NotFoundException('Consulta no encontrada');

    const consultation = res.rows[0];
    if (!user.is_superadmin && consultation.status === 'DRAFT') {
      throw new NotFoundException('Consulta no encontrada');
    }

    let tally: TallyResult;
    if (consultation.result_snapshot) {
      tally = consultation.result_snapshot as TallyResult;
    } else {
      const optionsRes = await this.db.query(
        `SELECT id, title, position FROM consultation_options
         WHERE consultation_id = $1
         ORDER BY position ASC`,
        [id],
      );
      const votesRes = await this.db.query(
        `SELECT consultation_option_id, aliquot_applied FROM consultation_votes
         WHERE consultation_id = $1`,
        [id],
      );
      tally = computeConsultationTally(
        optionsRes.rows.map((o) => ({ id: o.id, title: o.title, position: o.position })),
        votesRes.rows.map((v) => ({
          optionId: v.consultation_option_id,
          aliquot: Number(v.aliquot_applied),
        })),
      );
    }

    const votesRes = await this.db.query(
      `SELECT pu.unit_code AS "unitCode",
              CONCAT(u.first_name, ' ', u.last_name) AS voter,
              v.consultation_option_id AS "optionId",
              v.voted_at AS "votedAt"
       FROM consultation_votes v
       JOIN property_units pu ON pu.id = v.property_unit_id
       JOIN users u ON u.id = v.user_id
       WHERE v.consultation_id = $1
       ORDER BY v.voted_at ASC`,
      [id],
    );

    return {
      tally,
      votes: votesRes.rows.map((v) => ({
        unitCode: v.unitCode,
        voter: v.voter,
        optionId: v.optionId,
        votedAt: v.votedAt instanceof Date ? v.votedAt.toISOString() : v.votedAt,
      })),
      closed: consultation.status === 'CLOSED' || consultation.status === 'CANCELLED',
      result: consultation.result ?? null,
    };
  }

  /**
   * Emite el voto de una unidad del padrón de forma transaccional. Bloquea la
   * consulta (FOR UPDATE) para que la validación de estado/fechas y la
   * inserción sean atómicas; la unicidad por unidad la garantiza la BD.
   */
  async vote(user: any, id: string, dto: VoteDto, meta: VoteMeta): Promise<VoteReceipt> {
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `SELECT status, condo_id, start_date, end_date
         FROM consultations WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (res.rows.length === 0) throw new NotFoundException('Consulta no encontrada');

      const consultation = res.rows[0];
      if (consultation.status !== 'PUBLISHED') {
        throw new ForbiddenException('La consulta no está abierta para votación');
      }

      const now = new Date();
      if (now < new Date(consultation.start_date)) {
        throw new ForbiddenException('La votación aún no ha comenzado');
      }
      if (now > new Date(consultation.end_date)) {
        throw new ForbiddenException('La votación ha finalizado');
      }

      const option = await client.query(
        `SELECT 1 FROM consultation_options WHERE id = $1 AND consultation_id = $2`,
        [dto.optionId, id],
      );
      if (option.rows.length === 0) throw new BadRequestException('Opción inválida');

      const elector = await client.query(
        `SELECT 1 FROM consultation_electors
         WHERE consultation_id = $1 AND property_unit_id = $2 AND user_id = $3`,
        [id, dto.propertyUnitId, user.id],
      );
      if (elector.rows.length === 0) {
        throw new ForbiddenException('No estás habilitado para votar por esta unidad');
      }

      const previous = await client.query(
        `SELECT 1 FROM consultation_votes WHERE consultation_id = $1 AND property_unit_id = $2`,
        [id, dto.propertyUnitId],
      );
      if (previous.rows.length > 0) {
        throw new ConflictException('Esta unidad ya emitió su voto');
      }

      const unit = await client.query(
        `SELECT unit_code, aliquot_percentage FROM property_units WHERE id = $1`,
        [dto.propertyUnitId],
      );
      if (unit.rows.length === 0) throw new BadRequestException('Unidad inválida');

      const verificationCode = randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();

      const inserted = await client.query(
        `INSERT INTO consultation_votes (
           consultation_id, consultation_option_id, property_unit_id, user_id,
           aliquot_applied, ip_address, user_agent, verification_code
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, voted_at`,
        [
          id,
          dto.optionId,
          dto.propertyUnitId,
          user.id,
          unit.rows[0].aliquot_percentage,
          meta.ip ?? null,
          meta.userAgent ?? null,
          verificationCode,
        ],
      );
      const vote = inserted.rows[0];

      await client.query(
        `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
         VALUES ($1, $2, 'CONSULTATION_VOTED', 'consultation_votes', $3, $4)`,
        [
          consultation.condo_id,
          user.id,
          vote.id,
          JSON.stringify({
            consultationId: id,
            propertyUnitId: dto.propertyUnitId,
            optionId: dto.optionId,
          }),
        ],
      );

      await client.query('COMMIT');
      return {
        voteId: vote.id,
        verificationCode,
        optionId: dto.optionId,
        unitCode: unit.rows[0].unit_code,
        votedAt: vote.voted_at,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      // Carrera entre la verificación previa y el INSERT: la BD gana con la
      // restricción única por unidad.
      if ((error as any)?.code === '23505') {
        throw new ConflictException('Esta unidad ya emitió su voto');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Unidades del padrón asignadas al usuario en esta consulta, con su estado de
   * votación, para que la interfaz muestre qué puede votar y qué ya votó.
   */
  async getEligibility(user: any, id: string): Promise<{ units: EligibilityUnit[] }> {
    const consultation = await this.db.query(`SELECT id FROM consultations WHERE id = $1`, [id]);
    if (consultation.rows.length === 0) throw new NotFoundException('Consulta no encontrada');

    const res = await this.db.query(
      `SELECT ce.property_unit_id AS "propertyUnitId",
              pu.unit_code AS "unitCode",
              v.consultation_option_id AS "votedOptionId"
       FROM consultation_electors ce
       JOIN property_units pu ON pu.id = ce.property_unit_id
       LEFT JOIN consultation_votes v
         ON v.consultation_id = ce.consultation_id
        AND v.property_unit_id = ce.property_unit_id
       WHERE ce.consultation_id = $1 AND ce.user_id = $2
       ORDER BY pu.unit_code ASC`,
      [id, user.id],
    );

    return {
      units: res.rows.map((r) => ({
        propertyUnitId: r.propertyUnitId,
        unitCode: r.unitCode,
        alreadyVoted: r.votedOptionId !== null,
        votedOptionId: r.votedOptionId,
      })),
    };
  }

  async listElectors(
    user: any,
    id: string,
  ): Promise<Array<{ id: string; unitCode: string; userId: string; name: string; source: string }>> {
    const consultation = await this.db.query(`SELECT id FROM consultations WHERE id = $1`, [id]);
    if (consultation.rows.length === 0) throw new NotFoundException('Consulta no encontrada');

    const res = await this.db.query(
      `SELECT ce.id, pu.unit_code AS "unitCode", ce.user_id AS "userId",
              CONCAT(u.first_name, ' ', u.last_name) AS name, ce.source
       FROM consultation_electors ce
       JOIN property_units pu ON pu.id = ce.property_unit_id
       JOIN users u ON u.id = ce.user_id
       WHERE ce.consultation_id = $1
       ORDER BY pu.unit_code ASC, name ASC`,
      [id],
    );
    return res.rows;
  }

  /**
   * Habilita manualmente a un usuario para emitir el voto de una unidad. Permite
   * apoderados o unidades sin usuario propietario registrado.
   */
  async addElector(user: any, id: string, dto: AddElectorDto): Promise<{ id: string }> {
    const consultation = await this.db.query(`SELECT condo_id FROM consultations WHERE id = $1`, [id]);
    if (consultation.rows.length === 0) throw new NotFoundException('Consulta no encontrada');
    const condoId = consultation.rows[0].condo_id;

    const unit = await this.db.query(`SELECT id FROM property_units WHERE id = $1 AND condo_id = $2`, [
      dto.propertyUnitId,
      condoId,
    ]);
    if (unit.rows.length === 0) {
      throw new BadRequestException('La unidad no pertenece a la residencia de la consulta');
    }

    const target = await this.db.query(`SELECT id FROM users WHERE id = $1`, [dto.userId]);
    if (target.rows.length === 0) throw new NotFoundException('Usuario no encontrado');

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      const inserted = await client.query(
        `INSERT INTO consultation_electors (consultation_id, property_unit_id, user_id, source, added_by_user_id)
         VALUES ($1, $2, $3, 'MANUAL', $4)
         ON CONFLICT ON CONSTRAINT uq_consultation_elector DO NOTHING
         RETURNING id`,
        [id, dto.propertyUnitId, dto.userId, user.id],
      );

      let electorId = inserted.rows[0]?.id;
      if (electorId) {
        await client.query(
          `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
           VALUES ($1, $2, 'CONSULTATION_ELECTOR_ADDED', 'consultation_electors', $3, $4)`,
          [
            condoId,
            user.id,
            electorId,
            JSON.stringify({ propertyUnitId: dto.propertyUnitId, userId: dto.userId }),
          ],
        );
      } else {
        // Ya existía en el padrón: se devuelve la fila existente sin duplicar.
        const existing = await client.query(
          `SELECT id FROM consultation_electors
           WHERE consultation_id = $1 AND property_unit_id = $2 AND user_id = $3`,
          [id, dto.propertyUnitId, dto.userId],
        );
        electorId = existing.rows[0].id;
      }

      await client.query('COMMIT');
      return { id: electorId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async removeElector(user: any, id: string, electorId: string): Promise<{ ok: true }> {
    const consultation = await this.db.query(`SELECT condo_id FROM consultations WHERE id = $1`, [id]);
    if (consultation.rows.length === 0) throw new NotFoundException('Consulta no encontrada');
    const condoId = consultation.rows[0].condo_id;

    let removed = false;
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      const del = await client.query(
        `DELETE FROM consultation_electors
         WHERE id = $1 AND consultation_id = $2
         RETURNING property_unit_id, user_id, source`,
        [electorId, id],
      );
      removed = del.rows.length > 0;

      if (removed) {
        await client.query(
          `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
           VALUES ($1, $2, 'CONSULTATION_ELECTOR_REMOVED', 'consultation_electors', $3, $4)`,
          [
            condoId,
            user.id,
            electorId,
            JSON.stringify({
              propertyUnitId: del.rows[0].property_unit_id,
              userId: del.rows[0].user_id,
              source: del.rows[0].source,
            }),
          ],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (!removed) throw new NotFoundException('Habilitado no encontrado');
    return { ok: true };
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
