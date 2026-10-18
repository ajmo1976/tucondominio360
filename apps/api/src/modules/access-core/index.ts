// Punto de entrada de la capa de acceso/permisos (Fase B).
export { AccessCoreModule } from './access.module';
export { AccessService } from './access.service';
export { composeAccess } from './access.logic';
export type { CondoAccess, AccessSource, ComposeAccessInput } from './access.logic';
export { CondoPermissionGuard, resolveCondoId } from './condo-permission.guard';
export { RequireCondoPermission, CONDO_PERMISSION_KEY } from './require-condo-permission.decorator';
export { assertPermission, assertAnyPermission } from './condo-permission.logic';
