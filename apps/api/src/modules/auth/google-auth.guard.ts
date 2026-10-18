import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Envuelve el guard de Google para responder 503 con un mensaje claro cuando el
 * entorno no tiene configurado el OAuth de Google (dev sin credenciales).
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  canActivate(context: ExecutionContext) {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new ServiceUnavailableException(
        'El acceso con Google no está configurado en este entorno',
      );
    }
    return super.canActivate(context);
  }
}
