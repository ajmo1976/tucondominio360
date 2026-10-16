import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Length, ValidateNested } from 'class-validator';

export class ConsultationOptionDto {
  @IsString()
  @Length(1, 150)
  title: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;
}

export class CreateConsultationDto {
  @IsUUID()
  condoId: string;

  @IsString()
  @Length(3, 200)
  title: string;

  @IsString()
  @Length(3, 5000)
  description: string;

  @IsEnum(['CARTA_CONSULTA', 'ASAMBLEA_ORDINARIA', 'ASAMBLEA_EXTRAORDINARIA'] as const)
  consultationType: 'CARTA_CONSULTA' | 'ASAMBLEA_ORDINARIA' | 'ASAMBLEA_EXTRAORDINARIA';

  @IsISO8601()
  startDate: string;

  @IsISO8601()
  endDate: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ConsultationOptionDto)
  options: ConsultationOptionDto[];
}
