import { IsUUID } from 'class-validator';

export class AddElectorDto {
  @IsUUID()
  propertyUnitId: string;

  @IsUUID()
  userId: string;
}
