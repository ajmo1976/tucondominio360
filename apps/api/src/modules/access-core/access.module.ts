import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';

/**
 * Capa de acceso/permisos. Es global para que cualquier módulo de dominio pueda
 * inyectar `AccessService` sin importar este módulo explícitamente.
 */
@Global()
@Module({
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessCoreModule {}
