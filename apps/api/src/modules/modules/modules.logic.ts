import { CORE_MODULES, ModuleCode } from '@tucondominio360/shared';

/** Valida si un módulo puede cambiar su estado (activar/desactivar). */
export function canToggleModule(code: ModuleCode, enabled: boolean): boolean {
  if (CORE_MODULES.includes(code) && !enabled) return false;
  return true;
}