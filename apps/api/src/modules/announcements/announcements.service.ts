import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AccessService } from '../access-core';

import { CreateAnnouncementDto, UpdateAnnouncementDto, AcknowledgeAnnouncementDto } from './dto/announcements.dto';
import { AnnouncementCategory, AnnouncementStatus, AnnouncementsKPIs } from './dto/announcements.dto';

const ANNOUNCEMENT_CODE_PREFIX = 'ANUNC';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: AccessService,
  ) {}

  /** Validar que el usuario tenga acceso al condominio. */
  private async assertCondoAccess(user: any, condoId: string) {
    const condoRes = await this.db.query(`SELECT id, name FROM condos WHERE id = $1`, [condoId]);
    if (condoRes.rows.length === 0) throw new NotFoundException('Residencia no encontrada');

    if (user.is_superadmin) return;

    const roleRes = await this.db.query(
      `SELECT 1 FROM condo_user_access WHERE condo_id = $1 AND user_id = $2 AND is_active = TRUE`,
      [condoId, user.id],
    );
    if (roleRes.rows.length === 0) {
      throw new ForbiddenException('No tienes acceso a esta residencia');
    }
  }

  /** Generar código de anuncio automático: ANUNC-{condoCode}-{AAAA}{HEX6} */
  private generateAnnouncementCode(condoCode: string): string {
    const hex = Math.random().toString(36).replace('[^a-z0-9]', '').slice(0, 6).toUpperCase();
    return `${ANNOUNCEMENT_CODE_PREFIX}-${condoCode.slice(0, 4).toUpperCase()}-${new Date().getFullYear()}${hex}`;
  }

  /** Listar comunicados con filtros */
  async listAnnouncements(
    user: any,
    condoId: string,
    filters: {
      category?: string;
      isUrgent?: boolean;
      status?: string;
      q?: string;
    } = {},
  ) {
    await this.assertCondoAccess(user, condoId);

    const params: any[] = [condoId];
    const where: string[] = [`ac.condo_id = $1`];

    if (filters.category && filters.category !== AnnouncementCategory.GENERAL) {
      params.push(filters.category);
      where.push(`ac.category = $${params.length}`);
    }
    if (filters.isUrgent !== undefined) {
      params.push(filters.isUrgent);
      where.push(`ac.is_urgent = $${params.length}`);
    }
    if (filters.status && filters.status !== AnnouncementStatus.DRAFT) {
      params.push(filters.status);
      where.push(`ac.status = $${params.length}`);
    }
    if (filters.q && filters.q.trim()) {
      params.push(`%${filters.q.trim()}%`);
      const idx = params.length;
      where.push(`(ac.title ILIKE $${idx} OR ac.content ILIKE $${idx})`);
    }

    const orderBy = filters.isUrgent !== undefined && filters.isUrgent
      ? 'ac.published_at DESC, ac.is_urgent DESC'
      : 'ac.pinned DESC, ac.published_at DESC';

    const res = await this.db.query(
      `SELECT ac.id, ac.announcement_code, ac.title, ac.content, ac.category, ac.is_urgent,
              ac.status, ac.requires_acknowledgement, ac.published_at,
              CONCAT(u.first_name, ' ', u.last_name) AS author_name
       FROM announcements ac
       JOIN users u ON u.id = ac.author_user_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy}`,
      params,
    );

    return res.rows.map((r) => ({
      id: r.id,
      announcementCode: r.announcement_code,
      title: r.title,
      content: r.content,
      category: r.category,
      isUrgent: r.is_urgent,
      status: r.status,
      requiresAcknowledgement: r.requires_acknowledgement,
      publishedAt: r.published_at,
      authorName: r.author_name,
    }));
  }

  /** Crear nuevo comunicado */
  async createAnnouncement(user: any, dto: CreateAnnouncementDto) {
    await this.assertCondoAccess(user, dto.condoId);

    const code = this.generateAnnouncementCode(dto.condoId);

    const res = await this.db.query(
      `INSERT INTO announcements (
         condo_id, author_user_id, title, content, category, is_urgent,
         requires_acknowledgement, attachment_urls, announcement_code
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        dto.condoId,
        user.id,
        dto.title,
        dto.content,
        dto.category ?? AnnouncementCategory.GENERAL,
        dto.isUrgent ?? false,
        dto.requiresAcknowledgement ?? false,
        dto.attachmentUrls ? JSON.stringify([dto.attachmentUrls]) : '[]',
        code,
      ],
    );

    // Audit log
    await this.db.query(
      `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
       VALUES ($1, $2, 'ANNOUNCEMENT_CREATED', 'announcements', $3, $4::jsonb)`,
      [dto.condoId, user.id, res.rows[0].id, JSON.stringify({ announcementCode: code, title: dto.title })],
    );

    return res.rows[0];
  }

  /** Obtener un comunicado por ID */
  async getAnnouncement(user: any, condoId: string, announcementId: string) {
    await this.assertCondoAccess(user, condoId);

    const res = await this.db.query(
      `SELECT ac.*, CONCAT(u.first_name, ' ', u.last_name) AS author_name
       FROM announcements ac
       JOIN users u ON u.id = ac.author_user_id
       WHERE ac.id = $1 AND ac.condo_id = $2`,
      [announcementId, condoId],
    );

    if (res.rows.length === 0) throw new NotFoundException('Comunicado no encontrado');

    const r = res.rows[0];
    return {
      id: r.id,
      announcementCode: r.announcement_code,
      title: r.title,
      content: r.content,
      category: r.category,
      isUrgent: r.is_urgent,
      status: r.status,
      requiresAcknowledgement: r.requires_acknowledgement,
      attachmentUrls: r.attachment_urls,
      publishedAt: r.published_at,
      authorName: r.author_name,
    };
  }

  /** Actualizar comunicado */
  async updateAnnouncement(user: any, condoId: string, announcementId: string, dto: UpdateAnnouncementDto) {
    await this.assertCondoAccess(user, condoId);

    // Verificar que el comunicado existe y pertenece al condo
    const checkRes = await this.db.query(`SELECT id, author_user_id FROM announcements WHERE id = $1 AND condo_id = $2`, [announcementId, condoId]);
    if (checkRes.rows.length === 0) throw new NotFoundException('Comunicado no encontrado');

    // Verificar permisos: el autor puede editar lo suyo; el resto necesita
    // ANNOUNCEMENTS_MANAGE (la administración/junta).
    const isAuthor = checkRes.rows[0].author_user_id === user.id;
    if (!isAuthor) {
      await this.access.assertCondoPermission(user.id, condoId, 'ANNOUNCEMENTS_MANAGE');
    }

    // Construir query dinámico de actualización
    const updates: string[] = [];
    const values: any[] = [];
    let valIdx = 1;

    if (dto.title !== undefined) {
      updates.push(`title = $${valIdx}`);
      values.push(dto.title);
      valIdx++;
    }
    if (dto.content !== undefined) {
      updates.push(`content = $${valIdx}`);
      values.push(dto.content);
      valIdx++;
    }
    if (dto.category !== undefined) {
      updates.push(`category = $${valIdx}`);
      values.push(dto.category);
      valIdx++;
    }
    if (dto.isUrgent !== undefined) {
      updates.push(`is_urgent = $${valIdx}`);
      values.push(dto.isUrgent);
      valIdx++;
    }
    if (dto.requiresAcknowledgement !== undefined) {
      updates.push(`requires_acknowledgement = $${valIdx}`);
      values.push(dto.requiresAcknowledgement);
      valIdx++;
    }
    if (dto.attachmentUrls !== undefined) {
      updates.push(`attachment_urls = $${valIdx}`);
      values.push(dto.attachmentUrls ? JSON.stringify([dto.attachmentUrls]) : '[]');
      valIdx++;
    }

    if (updates.length === 0) return this.getAnnouncement(user, condoId, announcementId);

    values.push(announcementId);
    updates.push(`updated_at = NOW()`);

    const setClause = updates.join(', ');
    const res = await this.db.query(
      `UPDATE announcements SET ${setClause} WHERE id = $${valIdx} RETURNING *`,
      values,
    );

    // Audit log
    await this.db.query(
      `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
       VALUES ($1, $2, 'ANNOUNCEMENT_UPDATED', 'announcements', $3, $4::jsonb)`,
      [condoId, user.id, announcementId, JSON.stringify({ title: dto.title })],
    );

    return res.rows[0];
  }

  /** Firmar acuse de recibo legal */
  async acknowledgeAnnouncement(user: any, condoId: string, dto: AcknowledgeAnnouncementDto) {
    await this.assertCondoAccess(user, condoId);

    // Verificar que el comunicado existe
    const annRes = await this.db.query(`SELECT id, title, requires_acknowledgement FROM announcements WHERE id = $1 AND condo_id = $2`, [dto.announcementId, condoId]);
    if (annRes.rows.length === 0) throw new NotFoundException('Comunicado no encontrado');

    const announcement = annRes.rows[0];

    // Si el comunicado no requiere acuse, no hacer nada
    if (!announcement.requires_acknowledgement) {
      return { acknowledged: false, message: 'Este comunicado no requiere acuse de recibo' };
    }

    // Verificar si ya fue firmado por este usuario
    const existingRead = await this.db.query(
      `SELECT id FROM announcement_reads WHERE announcement_id = $1 AND user_id = $2`,
      [dto.announcementId, user.id],
    );
    if (existingRead.rows.length > 0) {
      return { acknowledged: true, message: 'Ya has firmado el acuse de recibo para este comunicado' };
    }

    // Generar código de firma único (alfanumérico) si el cliente no envía uno
    const signatureCode =
      (dto.signatureCode && dto.signatureCode.trim()) ||
      `FR-${new Date().getFullYear()}-${Math.random().toString(36).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8).padEnd(8, '0')}`;

    const res = await this.db.query(
      `INSERT INTO announcement_reads (announcement_id, user_id, property_unit_id, signature_code, acknowledgement_note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        dto.announcementId,
        user.id,
        dto.propertyUnitId || null,
        signatureCode,
        dto.acknowledgementNote || 'Aprobado y recibido',
      ],
    );

    // Audit log
    await this.db.query(
      `INSERT INTO audit_logs (condo_id, user_id, action, entity_name, entity_id, new_values)
       VALUES ($1, $2, 'ANNOUNCEMENT_ACKNOWLEDGED', 'announcement_reads', $3, $4::jsonb)`,
      [condoId, user.id, res.rows[0].id, JSON.stringify({ signatureCode, acknowledgementNote: dto.acknowledgementNote })],
    );

    return { acknowledged: true, signatureCode, message: 'Acuse de recibo firmado correctamente' };
  }

  /** Listar acuses de recibo por usuario */
  async getUserAcks(user: any, condoId: string) {
    await this.assertCondoAccess(user, condoId);

    const res = await this.db.query(
      `SELECT ar.id, ar.announcement_id, ac.title, ac.announcement_code, ar.signature_code, ar.acknowledgement_note, ar.read_at
       FROM announcement_reads ar
       JOIN announcements ac ON ac.id = ar.announcement_id
       WHERE ar.user_id = $1 AND ac.condo_id = $2
       ORDER BY ar.read_at DESC`,
      [user.id, condoId],
    );

    return res.rows.map((r) => ({
      id: r.id,
      announcementId: r.announcement_id,
      announcementCode: r.announcement_code,
      title: r.title,
      signatureCode: r.signature_code,
      acknowledgementNote: r.acknowledgement_note,
      readAt: r.read_at,
    }));
  }

  /** KPIs de cumplimiento de acuses por condominio */
  async getKpis(user: any, condoId: string): Promise<AnnouncementsKPIs> {
    await this.assertCondoAccess(user, condoId);

    // Total de comunicados publicados (no borradores)
    const totalRes = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM announcements WHERE condo_id = $1 AND status != 'DRAFT'`,
      [condoId],
    );
    const total = Number(totalRes.rows[0].total);

    // Comunicaciones urgentes
    const urgentRes = await this.db.query(
      `SELECT COUNT(*)::int AS urgent FROM announcements WHERE condo_id = $1 AND is_urgent = TRUE AND status != 'DRAFT'`,
      [condoId],
    );
    const totalUrgent = Number(urgentRes.rows[0].urgent);

    // Acuses firmados
    const ackedRes = await this.db.query(
      `SELECT COUNT(DISTINCT ar.user_id)::int AS acknowledged_users FROM announcement_reads ar JOIN announcements ac ON ac.id = ar.announcement_id WHERE ac.condo_id = $1 AND ac.status != 'DRAFT'`,
      [condoId],
    );
    const acknowledgedUsers = Number(ackedRes.rows[0].acknowledged_users);

    const totalAcknowledged = acknowledgedUsers; // usuarios que firmaron al menos 1
    const acknowledgmentPct = total > 0 ? Math.round((totalAcknowledged / total) * 100) : 0;
    const pendingAcknowledgments = total > 0 ? total - totalAcknowledged : 0;

    return {
      totalPublished: total,
      totalUrgent: totalUrgent,
      totalAcknowledged: totalAcknowledged,
      acknowledgmentPct,
      pendingAcknowledgments,
    };
  }
}