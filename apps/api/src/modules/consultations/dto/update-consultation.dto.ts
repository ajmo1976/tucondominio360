import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

export class ConsultationOptionDto {
  @IsString()
  @Length(1, 150)
  title: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;
}

export class UpdateConsultationDto {
  @IsOptional()
  @IsString()
  @Length(3, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(3, 5000)
  description?: string;

  @IsOptional()
  @IsEnum(['CARTA_CONSULTA', 'ASAMBLEA_ORDINARIA', 'ASAMBLEA_EXTRAORDINARIA'] as const)
  consultationType?: 'CARTA_CONSULTA' | 'ASAMBLEA_ORDINARIA' | 'ASAMBLEA_EXTRAORDINARIA';

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ConsultationOptionDto)
  options?: ConsultationOptionDto[];
}
