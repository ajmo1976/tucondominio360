import { BadRequestException } from '@nestjs/common';

/** Roles válidos de ocupante por unidad (enum `occupant_role`). */
export const OCCUPANT_ROLES: readonly string[] = [
  'OWNER',
  'CO_OWNER',
  'TENANT',
  'RESIDENT',
  'AUTHORIZED',
];

/** Valida que un rol sea un rol de ocupante por unidad (no un condo_role). */
export function assertOccupantRole(role: string): string {
  if (!OCCUPANT_ROLES.includes(role)) {
    throw new BadRequestException(
      `Rol de ocupante inválido: ${role} (válidos: ${OCCUPANT_ROLES.join(', ')})`,
    );
  }
  return role;
}

/** Verifica que el rol NO sea un rol de condominio (condo_role). */
export function isValidOccupantRole(role: string): boolean {
  return OCCUPANT_ROLES.includes(role);
}