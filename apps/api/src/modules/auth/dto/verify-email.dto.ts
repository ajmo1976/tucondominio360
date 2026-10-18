import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'Token de verificación recibido por correo' })
  @IsString()
  @IsNotEmpty({ message: 'El token es requerido' })
  token: string;
}
