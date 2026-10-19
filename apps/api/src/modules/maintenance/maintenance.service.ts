import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AccessService } from '../access-core';
import { randomUUID } from 'crypto';

import { CreateTicketDto, UpdateTicketDto, CreateTicketCommentDto } from './dto/maintenance.dto';
import { TicketPriority, TicketStatus, TicketCategory } from './dto/maintenance.dto';

const TICKET_CODE_PREFIX = 'TICK';
const ANNOUNCEMENT_CODE_PREFIX = 'ANUNC';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: AccessService,
  ) {}

  /** Validar que el usuario tenga acceso al condominio. */
  private async assertCondoAccess(user: any, condoId: string) {
    const condoRes = await this.db.query(`SELECT id, name FROM condos WHERE id = $1`, [condoId]);
    if (condoRes.rows.length === 0) throw new NotFoundException('Residencia no encontrada');

    // Superadmin tiene acceso a todos; para otros, validar condo_user_access
    if (user.is_superadmin) return;

    const roleRes = await this.db.query(
      `SELECT 1 FROM condo_user_access WHERE condo_id = $1 AND user_id = $2 AND is_active = TRUE`,
      [condoId, user.id],
    );
    if (roleRes.rows.length === 0) {
      throw new ForbiddenException('No tienes acceso a esta residencia');
    }
  }

  /** Generar código de ticket automático: TICK-{condoCode}-{AAAA}{HEX6} */
  private generateTicketCode(condoCode: string): string {
    const hex = randomUUID().replace(/-/g, '').toUpperCase().slice(0, 6);
    return `${TICKET_CODE_PREFIX}-${condoCode.slice(0, 4).toUpperCase()}-${new Date().getFullYear()}${hex}`;
  }

  /** Reportar nueva incidencia */
  async createTicket(user: any, dto: CreateTicketDto) {
    await this.access.assertCondoPermission(user.id, dto.condoId, 'MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT');

    const ticketCode = this.generateTicketCode(dto.condoId);

    const res = await this.db.query(
      `INSERT INTO maintenance_tickets (
         condo_id, reported_by_user_id, property_unit_id, building_id,
         category_id, ticket_code, incident_type, location_area,
         is_public_issue, title, description, priority, status,
         assigned_to_user_id, supplier_id, estimated_cost_usd
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        dto.condoId,
        user.id,
        dto.propertyUnitId,
        dto.buildingId,
        dto.categoryId,
        ticketCode,
        dto.category ?? TicketCategory.PLUMBING,
        dto.locationArea ?? null,
        dto.isPublicIssue ?? true,
        dto.title,
        dto.description,
        dto.priority,
        dto.status ?? TicketStatus.OPEN,
        dto.assignedToUserId,
        dto.supplierId,
        dto.estimatedCostUsd ?? 0,
      ],
    );

    // Audit log
    await this.db.query(
      `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
       VALUES ($1, $2, 'MAINTENANCE_TICKET_CREATED', 'maintenance_tickets', $3, $4::jsonb)`,
      [dto.condoId, user.id, res.rows[0].id, JSON.stringify({ ticketCode, title: dto.title })],
    );

    return res.rows[0];
  }

  /** Listar tickets con filtros */
  async listTickets(
    user: any,
    condoId: string,
    filters: {
      status?: TicketStatus;
      priority?: TicketPriority;
      category?: TicketCategory;
      q?: string;
    } = {},
  ) {
    await this.access.assertCondoPermission(user.id, condoId, 'MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT');

    const params: any[] = [condoId];
    const where: string[] = [`mt.condo_id = $1`];

    if (filters.status) {
      params.push(filters.status);
      where.push(`mt.status = $${params.length}`);
    }
    if (filters.priority) {
      params.push(filters.priority);
      where.push(`mt.priority = $${params.length}`);
    }
    if (filters.category && filters.category !== TicketCategory.OTHER) {
      params.push(filters.category);
      where.push(`mt.incident_type = $${params.length}`);
    }
    if (filters.q && filters.q.trim()) {
      params.push(`%${filters.q.trim()}%`);
      const idx = params.length;
      where.push(`(mt.title ILIKE $${idx} OR mt.description ILIKE $${idx})`);
    }

    const orderBy = filters.status !== undefined ? 'mt.status' : 'mt.created_at';

    const res = await this.db.query(
      `SELECT mt.id, mt.ticket_code, mt.title, mt.description, mt.priority,
              mt.status, mt.incident_type,
              mt.assigned_to_user_id, mt.supplier_id,
       mt.estimated_cost_usd, mt.actual_cost_usd,
       mt.created_at, mt.resolved_at,
       u1.unit_code AS "propertyUnitCode",
       u2.first_name || ' ' || u2.last_name AS "reportedByName",
       u3.first_name || ' ' || u3.last_name AS "assignedToName",
       c.name AS "categoryName"
       FROM maintenance_tickets mt
       LEFT JOIN property_units u1 ON u1.id = mt.property_unit_id
       LEFT JOIN users u2 ON u2.id = mt.reported_by_user_id
       LEFT JOIN users u3 ON u3.id = mt.assigned_to_user_id
       LEFT JOIN expense_categories c ON c.id = mt.category_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy} DESC`,
      params,
    );

    return res.rows.map((r) => ({
      id: r.id,
      ticketCode: r.ticket_code,
      title: r.title,
      description: r.description,
      priority: r.priority,
      status: r.status,
      category: r.incident_type || TicketCategory.PLUMBING,
      propertyUnitCode: r.propertyUnitCode,
      reportedByName: r.reportedByName,
      assignedToName: r.assignedToName || 'Sin asignar',
      estimatedCostUsd: Number(r.estimated_cost_usd || 0),
      actualCostUsd: Number(r.actual_cost_usd || 0),
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
    }));
  }

  /** Obtener un ticket por ID */
  async getTicket(user: any, condoId: string, ticketId: string) {
    await this.access.assertCondoPermission(user.id, condoId, 'MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT');

    const res = await this.db.query(
      `SELECT mt.*,
              pu.unit_code AS unit_code,
              CONCAT(u.first_name, ' ', u.last_name) AS reported_by_name,
              CONCAT(ua.first_name, ' ', ua.last_name) AS assigned_to_name
       FROM maintenance_tickets mt
       LEFT JOIN property_units pu ON pu.id = mt.property_unit_id
       LEFT JOIN users u ON u.id = mt.reported_by_user_id
       LEFT JOIN users ua ON ua.id = mt.assigned_to_user_id
       WHERE mt.id = $1 AND mt.condo_id = $2`,
      [ticketId, condoId],
    );

    if (res.rows.length === 0) throw new NotFoundException('Ticket no encontrado');

    const r = res.rows[0];
    return {
      id: r.id,
      ticketCode: r.ticket_code,
      title: r.title,
      description: r.description,
      priority: r.priority,
      status: r.status,
      category: r.incident_type || TicketCategory.PLUMBING,
      propertyUnitId: r.property_unit_id,
      propertyUnitCode: r.unit_code,
      buildingId: r.building_id,
      locationArea: r.location_area,
      isPublicIssue: r.is_public_issue,
      reportedByName: r.reported_by_name,
      assignedToUserId: r.assigned_to_user_id,
      assignedToName: r.assigned_to_user_id ? (r.assigned_to_name || 'Asignado') : 'Sin asignar',
      supplierId: r.supplier_id,
      estimatedCostUsd: Number(r.estimated_cost_usd || 0),
      actualCostUsd: Number(r.actual_cost_usd || 0),
      resolvedAt: r.resolved_at,
      resolutionNotes: r.resolution_notes,
      createdAt: r.created_at,
      comments: await this.listComments(user, condoId, ticketId),
    };
  }

  /** Actualizar estado y datos del ticket */
  async updateTicket(user: any, condoId: string, ticketId: string, dto: UpdateTicketDto) {
    await this.access.assertCondoPermission(user.id, condoId, 'MAINTENANCE_MANAGE');

    // Verificar que el ticket existe y pertenece al condo
    const ticketCheck = await this.db.query(`SELECT id, status, assigned_to_user_id FROM maintenance_tickets WHERE id = $1 AND condo_id = $2`, [ticketId, condoId]);
    if (ticketCheck.rows.length === 0) throw new NotFoundException('Ticket no encontrado');

    // Permisos: solo quien puede GESTIONAR mantenimiento cambia el estado; el
    // residente con MAINTENANCE_REPORT solo puede crear el ticket y comentar.
    await this.access.assertCondoPermission(user.id, condoId, 'MAINTENANCE_MANAGE');

    // Construir query dinámico de actualización
    const updates: string[] = [];
    const values: any[] = [];
    let valIdx = 1;

    if (dto.status !== undefined) {
      updates.push(`status = $${valIdx}`);
      values.push(dto.status);
      valIdx++;
      if (dto.status === TicketStatus.RESOLVED || dto.status === TicketStatus.CLOSED) {
        updates.push(`resolved_at = COALESCE(resolved_at, NOW())`);
      }
    }
    if (dto.priority !== undefined) {
      updates.push(`priority = $${valIdx}`);
      values.push(dto.priority);
      valIdx++;
    }
    if (dto.assignedToUserId !== undefined) {
      updates.push(`assigned_to_user_id = $${valIdx}`);
      values.push(dto.assignedToUserId);
      valIdx++;
    }
    if (dto.supplierId !== undefined) {
      updates.push(`supplier_id = $${valIdx}`);
      values.push(dto.supplierId);
      valIdx++;
    }
    if (dto.actualCostUsd !== undefined) {
      updates.push(`actual_cost_usd = $${valIdx}`);
      values.push(dto.actualCostUsd);
      valIdx++;
    }
    if (dto.resolutionNotes !== undefined) {
      updates.push(`resolution_notes = $${valIdx}`);
      values.push(dto.resolutionNotes);
      valIdx++;
    }

    if (updates.length === 0) {
      // Nada que actualizar, solo retornamos el actual
      return this.getTicket(user, condoId, ticketId);
    }

    values.push(ticketId);
    updates.push(`updated_at = NOW()`);

    const setClause = updates.join(', ');
    const res = await this.db.query(
      `UPDATE maintenance_tickets SET ${setClause} WHERE id = $${valIdx} RETURNING *`,
      values,
    );

    // Audit log
    await this.db.query(
      `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
       VALUES ($1, $2, 'MAINTENANCE_TICKET_UPDATED', 'maintenance_tickets', $3, $4::jsonb)`,
      [condoId, user.id, ticketId, JSON.stringify({ status: dto.status, priority: dto.priority })],
    );

    return res.rows[0];
  }

  /** Eliminar un ticket (solo quien puede gestionar mantenimiento) */
  async deleteTicket(user: any, condoId: string, ticketId: string) {
    await this.access.assertCondoPermission(user.id, condoId, 'MAINTENANCE_MANAGE');

    const res = await this.db.query(
      `DELETE FROM maintenance_tickets WHERE id = $1 AND condo_id = $2 RETURNING id`,
      [ticketId, condoId],
    );
    if (res.rows.length === 0) throw new NotFoundException('Ticket no encontrado');

    await this.db.query(
      `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
       VALUES ($1, $2, 'MAINTENANCE_TICKET_DELETED', 'maintenance_tickets', $3, $4::jsonb)`,
      [condoId, user.id, ticketId, JSON.stringify({ deleted: true })],
    );

    return { deleted: true, id: ticketId };
  }

  /** Agregar comentario a un ticket */
  async addComment(user: any, condoId: string, dto: CreateTicketCommentDto) {
    await this.access.assertCondoPermission(user.id, condoId, 'MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT');

    // Verificar que el ticket existe
    const ticketCheck = await this.db.query(`SELECT id, condo_id FROM maintenance_tickets WHERE id = $1`, [dto.ticketId]);
    if (ticketCheck.rows.length === 0) throw new NotFoundException('Ticket no encontrado');

    // Los comentarios internos son solo para quien gestiona mantenimiento.
    if (dto.isInternalOnly) {
      await this.access.assertCondoPermission(user.id, condoId, 'MAINTENANCE_MANAGE');
    }

    const res = await this.db.query(
      `INSERT INTO ticket_comments (ticket_id, user_id, comment, is_internal_only)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [dto.ticketId, user.id, dto.comment, dto.isInternalOnly ?? false],
    );

    // Audit log
    await this.db.query(
      `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
       VALUES ($1, $2, 'TICKET_COMMENT_CREATED', 'ticket_comments', $3, $4::jsonb)`,
      [condoId, user.id, res.rows[0].id, JSON.stringify({ comment: dto.comment.slice(0, 50) + '...', isInternal: dto.isInternalOnly })],
    );

    return res.rows[0];
  }

  /** Listar comentarios de un ticket */
  async listComments(user: any, condoId: string, ticketId: string) {
    await this.access.assertCondoPermission(user.id, condoId, 'MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT');

    const res = await this.db.query(
      `SELECT tc.id, tc.comment, tc.is_internal_only, tc.created_at,
              CONCAT(u.first_name, ' ', u.last_name) AS author_name
       FROM ticket_comments tc
       JOIN users u ON u.id = tc.user_id
       WHERE tc.ticket_id = $1
       ORDER BY tc.created_at ASC`,
      [ticketId],
    );

    return res.rows.map((r) => ({
      id: r.id,
      comment: r.comment,
      isInternalOnly: r.is_internal_only,
      authorName: r.author_name,
      createdAt: r.created_at,
    }));
  }

  /** KPIs por condominio */
  async getKpis(user: any, condoId: string) {
    await this.access.assertCondoPermission(user.id, condoId, 'MAINTENANCE_MANAGE', 'MAINTENANCE_REPORT');

    const res = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'OPEN') AS open,
         COUNT(*) FILTER (WHERE status = 'ASSIGNED') AS assigned,
         COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress,
         COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved,
         COUNT(*) FILTER (WHERE status = 'CLOSED') AS closed
       FROM maintenance_tickets WHERE condo_id = $1`,
      [condoId],
    );

    const kpiRow = res.rows[0];
    const byPriorityRes = await this.db.query(
      `SELECT priority, COUNT(*) AS count FROM maintenance_tickets WHERE condo_id = $1 GROUP BY priority`,
      [condoId],
    );
    const byCategoryRes = await this.db.query(
      `SELECT category_id, COUNT(*) AS count FROM maintenance_tickets WHERE condo_id = $1 AND category_id IS NOT NULL GROUP BY category_id`,
      [condoId],
    );

    const byPriority: Record<TicketPriority, number> = { [TicketPriority.LOW]: 0, [TicketPriority.MEDIUM]: 0, [TicketPriority.HIGH]: 0, [TicketPriority.EMERGENCY]: 0 };
    for (const r of byPriorityRes.rows) {
      byPriority[r.priority as TicketPriority] = Number(r.count);
    }

    const byCategory: Record<TicketCategory, number> = { [TicketCategory.PLUMBING]: 0, [TicketCategory.ELECTRICAL]: 0, [TicketCategory.STRUCTURAL]: 0, [TicketCategory.HVAC]: 0, [TicketCategory.PAINTING]: 0, [TicketCategory.SECURITY]: 0, [TicketCategory.OTHER]: 0 };
    for (const r of byCategoryRes.rows) {
      // Mapeamos el category_id UUID a la categoría... por simplicidad usamos el nombre si viene o lo dejamos en 0
      // TODO: hacer join con expense_categories si es necesario
    }

    return {
      open: Number(kpiRow.open),
      assigned: Number(kpiRow.assigned),
      inProgress: Number(kpiRow.in_progress),
      resolved: Number(kpiRow.resolved),
      closed: Number(kpiRow.closed),
      byPriority,
      byCategory,
    };
  }
}