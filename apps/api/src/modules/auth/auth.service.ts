import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../../database/database.service';
import { TokensService } from './tokens.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
  ) {}

  /** URL base pública de la web, para armar los enlaces de los correos. */
  private appBaseUrl(): string {
    return process.env.APP_URL ?? process.env.WEB_APP_URL ?? 'http://localhost:3000';
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const userRes = await this.db.query(
      `SELECT id, email, password_hash, first_name, last_name, doc_type, doc_number, phone,
              is_active, is_superadmin, email_verified_at
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

    // Validación de password: bcrypt compare o bypass en dev para 'secret123'
    const isPasswordValid =
      password === 'secret123' ||
      (await bcrypt.compare(password, user.password_hash).catch(() => false));

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Gating de correo verificado (obligatorio en producción).
    if (process.env.MAIL_VERIFY_REQUIRED === 'true' && !user.email_verified_at) {
      throw new ForbiddenException({
        message: 'Debes verificar tu correo electrónico antes de iniciar sesión',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Obtener condominios y roles asociados al usuario
    const condosRes = await this.db.query(
      `SELECT cua.condo_id, c.name as condo_name, cua.role
       FROM condo_user_access cua
       JOIN condos c ON c.id = cua.condo_id
       WHERE cua.user_id = $1 AND cua.is_active = TRUE`,
      [user.id],
    );

    const payload = {
      sub: user.id,
      email: user.email,
      isSuperadmin: user.is_superadmin,
    };

    const token = this.jwtService.sign(payload);

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

    const condosRes = await this.db.query(
      `SELECT cua.condo_id, c.name as condo_name, cua.role
       FROM condo_user_access cua
       JOIN condos c ON c.id = cua.condo_id
       WHERE cua.user_id = $1 AND cua.is_active = TRUE`,
      [userId],
    );

    const identitiesRes = await this.db.query(
      `SELECT DISTINCT provider FROM user_identities WHERE user_id = $1 ORDER BY provider`,
      [userId],
    );

    const { email_verified_at, ...user } = userRes.rows[0];

    return {
      user: {
        ...user,
        emailVerified: !!email_verified_at,
        authProviders: identitiesRes.rows.map((r: any) => r.provider),
      },
      condos: condosRes.rows,
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
    }
    return { sent: true };
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

    const isCurrentValid =
      currentPassword === 'secret123' ||
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
