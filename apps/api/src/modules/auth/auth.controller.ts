import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  UseGuards,
  Request,
  Query,
  Res,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { EmailOnlyDto } from './dto/email-only.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordTokenDto } from './dto/reset-password-token.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { GoogleAuthGuard } from './google-auth.guard';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Iniciar sesión (JWT)' })
  @ApiResponse({ status: 200, description: 'Sesión iniciada con éxito y retorna token JWT' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('email/verify')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verificar el correo electrónico con el token recibido' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Get('email/verify')
  @ApiOperation({ summary: 'Verificar el correo desde el enlace del correo (redirige a la web)' })
  async verifyEmailRedirect(@Query('token') token: string, @Res() res: Response) {
    const base = process.env.APP_URL ?? process.env.WEB_APP_URL ?? 'http://localhost:3000';
    try {
      await this.authService.verifyEmail(token);
      return res.redirect(`${base}/verify-email?status=ok`);
    } catch {
      return res.redirect(`${base}/verify-email?status=error`);
    }
  }

  @Post('email/resend')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  @HttpCode(202)
  @ApiOperation({ summary: 'Reenviar el correo de verificación (respuesta uniforme, no revela si existe)' })
  async resendVerification(@Body() dto: EmailOnlyDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Iniciar sesión con Google (solo correos ya registrados)' })
  async googleAuth() {
    // El guard de Passport redirige a Google; el handler no se ejecuta.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Callback de Google: emite el JWT y redirige a la web' })
  async googleCallback(@Request() req: any, @Res() res: Response) {
    const base = process.env.APP_URL ?? process.env.WEB_APP_URL ?? 'http://localhost:3000';
    try {
      const session = await this.authService.loginWithGoogle(req.user);
      return res.redirect(
        `${base}/auth/callback?token=${encodeURIComponent(session.accessToken)}`,
      );
    } catch (err: any) {
      const response = err?.getResponse?.();
      const code =
        (typeof response === 'object' && response?.code) || err?.getStatus?.() || 'google_error';
      return res.redirect(`${base}/login?error=${encodeURIComponent(String(code))}`);
    }
  }

  @Post('password/forgot')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  @HttpCode(202)
  @ApiOperation({ summary: 'Solicitar enlace de reseteo (respuesta uniforme, no revela si existe)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('password/reset')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Definir nueva contraseña con el token recibido por correo' })
  async resetPassword(@Body() dto: ResetPasswordTokenDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('invitation/accept')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Aceptar una invitación: define la contraseña y verifica el correo' })
  async acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.authService.acceptInvitation(dto.token, dto.newPassword);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'), ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar sesión (invalida los tokens emitidos)' })
  async logout(@Request() req: any) {
    return this.authService.logout(req.user.id);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener información del usuario autenticado' })
  async getProfile(@Request() req: any) {
    return this.authService.getProfile(req.user.id);
  }

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editar datos del usuario autenticado' })
  async updateProfile(@Request() req: any, @Body() body: any) {
    return this.authService.updateProfile(req.user.id, body);
  }

  @Post('profile/password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar la contraseña del usuario autenticado' })
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }
}
