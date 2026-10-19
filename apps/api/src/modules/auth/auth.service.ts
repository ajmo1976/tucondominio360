import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Optional } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AccessService } from '../access-core';
import { DatabaseService } from '../../database/database.service';
import { TokensService } from './tokens.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { AuthAuditEvent } from './audit-events';

/** Perfil normalizado que entrega la estrategia de Google. */
export interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
    @Optional()
    private readonly access?: AccessService,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  /** URL base pública de la web, para armar los enlaces de los correos. */
  private appBaseUrl(): string {
    return process.env.APP_URL ?? process.env.WEB_APP_URL ?? 'http://localhost:3000';
  }

  /**
   * Registra un evento de autenticación en `audit_logs`. Es best-effort: nunca
   * interrumpe el flujo de auth si la auditoría falla. Sin usuario no hay fila
   * (la tabla exige `entity_id`), solo se deja constancia en el log.
   */
  private async audit(
    action: AuthAuditEvent,
    userId: string | null,
    meta?: Record<string, any>,
  ): Promise<void> {
    if (!userId) {
      this.logger.warn(`Evento de auth sin usuario: ${action}`);
      return;
    }
    try {
      await this.db.query(
        `INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_values)
         VALUES ($1, $2, 'users', $1, $3)`,
        [userId, action, meta ? JSON.stringify(meta) : null],
      );
    } catch (err) {
      this.logger.warn(`No se pudo auditar ${action}: ${(err as Error).message}`);
    }
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const userRes = await this.db.query(
      `SELECT id, email, password_hash, first_name, last_name, doc_type, doc_number, phone,
              is_active, is_superadmin, email_verified_at, token_version
       FROM users WHERE LOWER(email) = LOWER($1)`,
      [email],
    );

    if (userRes.rows.length === 0) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      throw new UnauthorizedException('El usuario se encuentra desactivado');
    }

    // bcrypt compare; bypass de desarrollo para 'secret123' solo fuera de producción.
    const devBypass = process.env.NODE_ENV !== 'production' && password === 'secret123';
    const isPasswordValid =
      devBypass || (await bcrypt.compare(password, user.password_hash).catch(() => false));

    if (!isPasswordValid) {
      await this.audit('LOGIN_FAILED', user.id, { email: user.email });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Gating de correo verificado (obligatorio en producción).
    if (process.env.MAIL_VERIFY_REQUIRED === 'true' && !user.email_verified_at) {
      throw new ForbiddenException({
        message: 'Debes verificar tu correo electrónico antes de iniciar sesión',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const session = await this.findSessionPayload(user);
    await this.audit('LOGIN_OK', user.id, { email: user.email });
    return session;
  }

  /**
   * Login con Google bajo el modelo *invite-first*: solo pueden entrar correos
   * que ya tengan una cuenta creada (por invitación o por la administración).
   * En el primer ingreso se vincula la identidad GOOGLE al usuario existente y
   * se marca el correo como verificado (Google ya lo verificó).
   */
  async loginWithGoogle(profile: GoogleProfile) {
    const email = (profile.email || '').trim().toLowerCase();
    if (!email) {
      throw new UnauthorizedException({
        message: 'Google no devolvió un correo electrónico',
        code: 'GOOGLE_NO_EMAIL',
      });
    }

    const userColumns = `id, email, first_name, last_name, doc_type, doc_number, phone,
                          is_active, is_superadmin, email_verified_at, token_version, avatar_url`;

    // 1) ¿Ya existe una identidad GOOGLE vinculada a este googleId?
    const identRes = await this.db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.doc_type, u.doc_number, u.phone,
              u.is_active, u.is_superadmin, u.email_verified_at, u.token_version, u.avatar_url
         FROM user_identities i
         JOIN users u ON u.id = i.user_id
        WHERE i.provider = 'GOOGLE' AND i.provider_user_id = $1`,
      [profile.googleId],
    );

    let user = identRes.rows[0];

    if (!user) {
      // 2) Invite-first: el correo debe tener ya una cuenta.
      const byEmail = await this.db.query(
        `SELECT ${userColumns} FROM users WHERE LOWER(email) = $1`,
        [email],
      );
      if (byEmail.rows.length === 0) {
        throw new UnauthorizedException({
          message:
            'Este correo no tiene una cuenta en TuCondominio360. Pide una invitación a la administración.',
          code: 'INVITE_REQUIRED',
        });
      }
      user = byEmail.rows[0];
      if (!user.is_active) {
        throw new UnauthorizedException('El usuario se encuentra desactivado');
      }
      await this.linkGoogleIdentity(user.id, profile.googleId, email);
      await this.audit('GOOGLE_LINKED', user.id, { email });
    }

    if (!user.is_active) {
      throw new UnauthorizedException('El usuario se encuentra desactivado');
    }

    await this.db.query(
      `UPDATE users
          SET email_verified_at = COALESCE(email_verified_at, NOW()),
              last_login_at = NOW(),
              avatar_url = COALESCE(avatar_url, $2),
              updated_at = NOW()
        WHERE id = $1`,
      [user.id, profile.avatarUrl ?? null],
    );

    const session = await this.findSessionPayload(user);
    await this.audit('GOOGLE_LOGIN', user.id, { email });
    return session;
  }

  /** Vincula (o refresca) la identidad GOOGLE de un usuario. */
  private async linkGoogleIdentity(userId: string, googleId: string, email: string) {
    await this.db.query(
      `INSERT INTO user_identities (user_id, provider, provider_user_id, email_at_provider, last_used_at)
       VALUES ($1, 'GOOGLE', $2, $3, NOW())
       ON CONFLICT (provider, provider_user_id)
       DO UPDATE SET last_used_at = NOW(), email_at_provider = EXCLUDED.email_at_provider`,
      [userId, googleId, email],
    );
  }

  /** Arma la sesión (JWT + usuario + residencias) para un usuario ya validado. */
  private async findSessionPayload(user: any) {
    let condosRes: any;
    if (user.is_superadmin) {
      // Superadmin: acceso a todos los condominios activos
      condosRes = await this.db.query(
        `SELECT id as condo_id, name as condo_name, NULL as role
         FROM condos WHERE is_active = TRUE ORDER BY name`,
      );
    } else {
      condosRes = await this.db.query(
        `SELECT cua.condo_id, c.name as condo_name, cua.role
         FROM condo_user_access cua
         JOIN condos c ON c.id = cua.condo_id
         WHERE cua.user_id = $1 AND cua.is_active = TRUE`,
        [user.id],
      );
    }

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      isSuperadmin: user.is_superadmin,
      tv: user.token_version ?? 0,
    });

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        docType: user.doc_type,
        docNumber: user.doc_number,
        phone: user.phone,
        isSuperadmin: user.is_superadmin,
      },
      condos: condosRes.rows,
    };
  }

  async getProfile(userId: string) {
    const userRes = await this.db.query(
      `SELECT id, email, first_name, last_name, doc_type, doc_number, phone, is_superadmin,
              email_verified_at, created_at
       FROM users WHERE id = $1`,
      [userId],
    );

    if (userRes.rows.length === 0) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const user = userRes.rows[0];

    // Si AccessService está disponible, usamos resolveUserAccess que ya maneja superadmin
    let condosEnriquecidos: any[];
    if (this.access) {
      const access = await this.access.resolveUserAccess(userId);
      condosEnriquecidos = access.condos;
    } else {
      // Fallback: queries directas (solo condo_user_access, no maneja superadmin)
      const condosRes = await this.db.query(
        `SELECT cua.condo_id, c.name as condo_name, cua.role
         FROM condo_user_access cua
         JOIN condos c ON c.id = cua.condo_id
         WHERE cua.user_id = $1 AND cua.is_active = TRUE`,
        [userId],
      );

      let tenantRole: string | null = null;
      const tuRes = await this.db.query(
        `SELECT role FROM tenant_users WHERE user_id = $1 AND is_active = TRUE`,
        [userId],
      );
      if (tuRes.rows.length > 0) {
        tenantRole = tuRes.rows[0].role;
      }

      const condosPromises = condosRes.rows.map(async (cuaRow: any) => {
        const condoId = cuaRow.condo_id;
        const isStaff = user.is_superadmin || tenantRole !== 'VIEWER';
        return Promise.resolve({
          condoId,
          condoName: cuaRow.condo_name,
          role: cuaRow.role,
          tenantRole,
          isStaff,
          permissions: [],
          source: 'NONE',
        } as any);
      });

      condosEnriquecidos = (await Promise.all(condosPromises)) as any[];
    }

    const identitiesRes = await this.db.query(
      `SELECT DISTINCT provider FROM user_identities WHERE user_id = $1 ORDER BY provider`,
      [userId],
    );

    const { email_verified_at, ...userData } = userRes.rows[0];

    return {
      user: {
        ...userData,
        emailVerified: !!email_verified_at,
        authProviders: identitiesRes.rows.map((r: any) => r.provider),
      },
      condos: condosEnriquecidos,
    };
  }

  /** Consume un token de verificación y marca el correo como verificado. */
  async verifyEmail(token: string) {
    const consumed = await this.tokens.consume(token, 'EMAIL_VERIFICATION');
    if (!consumed) {
      throw new BadRequestException('El enlace de verificación no es válido o expiró');
    }
    await this.db.query(
      `UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [consumed.userId],
    );
    await this.audit('EMAIL_VERIFIED', consumed.userId, { email: consumed.email });
    return { verified: true };
  }

  /**
   * Reenvía el correo de verificación. Responde igual exista o no la cuenta y
   * esté o no verificada, para no filtrar qué correos están registrados.
   */
  async resendVerification(email: string) {
    const res = await this.db.query(
      `SELECT id, email, email_verified_at FROM users WHERE LOWER(email) = LOWER($1)`,
      [email],
    );
    const user = res.rows[0] as { id: string; email: string; email_verified_at: string | null } | undefined;

    if (user && !user.email_verified_at) {
      const token = await this.tokens.issue(user.id, 'EMAIL_VERIFICATION', user.email);
      await this.mail.sendEmailVerification(
        user.email,
        `${this.appBaseUrl()}/verify-email?token=${token}`,
      );
      await this.audit('EMAIL_VERIFICATION_RESENT', user.id, { email: user.email });
    }
    return { sent: true };
  }

  /**
   * Inicia el reseteo de contraseña. Responde siempre igual (no revela si el
   * correo existe) y solo envía el enlace si hay una cuenta activa.
   */
  async forgotPassword(email: string) {
    const res = await this.db.query(
      `SELECT u.id, u.email FROM users u
        WHERE LOWER(u.email) = LOWER($1) AND u.is_active = TRUE`,
      [email],
    );
    const user = res.rows[0] as { id: string; email: string } | undefined;
    if (user) {
      const token = await this.tokens.issue(user.id, 'PASSWORD_RESET', user.email);
      await this.mail.sendPasswordReset(
        user.email,
        `${this.appBaseUrl()}/reset-password?token=${token}`,
      );
      await this.audit('PASSWORD_RESET_REQUESTED', user.id, { email: user.email });
    }
    return { ok: true };
  }

  /** Consume el token, define la nueva contraseña e invalida las sesiones previas. */
  async resetPassword(token: string, newPassword: string) {
    const consumed = await this.tokens.consume(token, 'PASSWORD_RESET');
    if (!consumed) throw new BadRequestException('Token inválido o expirado');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.db.query(
      `UPDATE users
          SET password_hash = $1, token_version = token_version + 1, updated_at = NOW()
        WHERE id = $2`,
      [hash, consumed.userId],
    );
    await this.audit('PASSWORD_RESET_DONE', consumed.userId, { email: consumed.email });
    return { success: true };
  }

  /**
   * Acepta una invitación: define la contraseña, marca el correo verificado,
   * invalida sesiones previas y registra la identidad LOCAL.
   */
  async acceptInvitation(token: string, newPassword: string) {
    const consumed = await this.tokens.consume(token, 'INVITATION');
    if (!consumed) throw new BadRequestException('La invitación no es válida o expiró');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.db.query(
      `UPDATE users
          SET password_hash = $1,
              email_verified_at = NOW(),
              token_version = token_version + 1,
              updated_at = NOW()
        WHERE id = $2`,
      [hash, consumed.userId],
    );

    await this.db.query(
      `INSERT INTO user_identities (user_id, provider, provider_user_id, email_at_provider)
       SELECT $1, 'LOCAL', NULL, $2
        WHERE NOT EXISTS (
          SELECT 1 FROM user_identities WHERE user_id = $1 AND provider = 'LOCAL'
        )`,
      [consumed.userId, consumed.email],
    );

    await this.audit('USER_INVITED_ACCEPTED', consumed.userId, { email: consumed.email });
    return { success: true };
  }

  /** Cierra sesión invalidando los JWT ya emitidos (sube `token_version`). */
  async logout(userId: string) {
    await this.db.query(
      `UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1`,
      [userId],
    );
    await this.audit('LOGOUT', userId);
    return { success: true };
  }

  async updateProfile(userId: string, data: any) {
    if (data.email) {
      const dup = await this.db.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2`,
        [data.email, userId],
      );
      if (dup.rows.length > 0) {
        throw new ConflictException('Ya existe otro usuario con ese correo electrónico');
      }
      data.email = data.email.trim().toLowerCase();
    }

    const res = await this.db.query(
      `UPDATE users SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        updated_at = NOW()
       WHERE id = $5
       RETURNING id, email, first_name, last_name, doc_type, doc_number, phone, is_superadmin`,
      [data.firstName, data.lastName, data.phone, data.email, userId],
    );
    return res.rows[0];
  }

  /** Cambio de contraseña del propio usuario (verifica la contraseña actual). */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const res = await this.db.query(
      `SELECT id, password_hash FROM users WHERE id = $1`,
      [userId],
    );
    if (res.rows.length === 0) throw new UnauthorizedException('Usuario no encontrado');

    const devBypass = process.env.NODE_ENV !== 'production' && currentPassword === 'secret123';
    const isCurrentValid =
      devBypass ||
      (await bcrypt.compare(currentPassword, res.rows[0].password_hash).catch(() => false));
    if (!isCurrentValid) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await this.db.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [hash, userId],
    );
    return { success: true };
  }
}
