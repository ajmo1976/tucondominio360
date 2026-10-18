import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { invitationEmail, passwordResetEmail, emailVerificationEmail } from './templates';

export interface SendResult {
  mode: 'smtp' | 'log';
  preview?: string;
}

/**
 * Servicio de correo. Con `MAIL_MODE=smtp` y SMTP configurado envía por SMTP
 * (nodemailer); en cualquier otro caso (o si el SMTP falla) deja el contenido
 * en el log del API y devuelve `preview`, para no bloquear los flujos de
 * invitación/reseteo cuando no hay servidor de correo.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transportClient: any = null;

  private get mode(): 'smtp' | 'log' {
    const mode = (process.env.MAIL_MODE ?? 'log').toLowerCase();
    return mode === 'smtp' && !!process.env.SMTP_HOST ? 'smtp' : 'log';
  }

  private transport(): any {
    if (!this.transportClient) {
      this.transportClient = (nodemailer as any).createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    }
    return this.transportClient;
  }

  /**
   * Envía un correo. Nunca lanza: si el transporte SMTP falla, degrada a modo
   * `log` y devuelve el HTML para que el flujo llamante no se interrumpa.
   */
  async send(to: string, subject: string, html: string): Promise<{ mode: 'smtp' | 'log'; preview?: string }> {
    const from = process.env.SMTP_FROM ?? 'TuCondominio360 <no-reply@tucondominio360.local>';

    if (this.mode === 'smtp') {
      try {
        await this.transport().sendMail({ from, to, subject, html });
        return { mode: 'smtp' };
      } catch (err) {
        this.logger.error(
          `Fallo el envío SMTP a ${to}: ${(err as Error).message}. Se conserva el enlace en el log.`,
        );
      }
    }

    this.logger.log(`[MAIL:log] Para: ${to} | Asunto: ${subject} | ${html}`);
    return { mode: 'log', preview: html };
  }

  /** Envía el correo de invitación con el enlace para activar la cuenta. */
  async sendInvitation(to: string, link: string) {
    const { subject, html } = invitationEmail(link);
    return this.send(to, subject, html);
  }

  async sendPasswordReset(to: string, link: string) {
    const { subject, html } = passwordResetEmail(link);
    return this.send(to, subject, html);
  }

  async sendEmailVerification(to: string, link: string) {
    const { subject, html } = emailVerificationEmail(link);
    return this.send(to, subject, html);
  }
}
