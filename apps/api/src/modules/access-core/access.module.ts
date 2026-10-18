import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { CondoPermissionGuard } from './condo-permission.guard';

/**
 * Capa de acceso/permisos. Es global para que cualquier módulo de dominio pueda
 * inyectar `AccessService` sin importar este módulo explícitamente.
 */
@Global()
@Module({
  providers: [AccessService, CondoPermissionGuard],
  exports: [AccessService, CondoPermissionGuard],
})
export class AccessCoreModule {}
