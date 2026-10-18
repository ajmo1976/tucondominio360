import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { GoogleProfile } from './auth.service';

/**
 * Estrategia OAuth 2.0 de Google. Valida el perfil y lo normaliza; la decisión
 * de aceptar o no el ingreso (invite-first) vive en `AuthService.loginWithGoogle`.
 *
 * Si el entorno no tiene `GOOGLE_CLIENT_ID`, se usa un valor de relleno para no
 * romper el arranque; `GoogleAuthGuard` bloquea el acceso con 503 en ese caso.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'google-not-configured',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'google-not-configured',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const user: GoogleProfile = {
      googleId: profile.id,
      email: profile.emails?.[0]?.value?.toLowerCase() ?? '',
      firstName: profile.name?.givenName ?? '',
      lastName: profile.name?.familyName ?? '',
      avatarUrl: profile.photos?.[0]?.value,
    };
    done(null, user as any);
  }
}
