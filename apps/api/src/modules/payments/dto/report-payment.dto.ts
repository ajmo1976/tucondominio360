import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class ReportPaymentDto {
  @ApiProperty({ description: 'ID del condominio' })
  @IsString()
  @IsNotEmpty()
  condoId: string;

  @ApiProperty({ description: 'ID de la unidad inmobiliaria (apartamento/casa)' })
  @IsString()
  @IsNotEmpty()
  propertyUnitId: string;

  @ApiProperty({ description: 'ID de la cuenta bancaria destino del condominio' })
  @IsString()
  @IsNotEmpty()
  bankAccountId: string;

  @ApiProperty({ example: 'PAGO_MOVIL', enum: ['PAGO_MOVIL', 'TRANSFER_VES', 'TRANSFER_USD_NACIONAL', 'ZELLE', 'CASH_USD'] })
  @IsNotEmpty()
  paymentMethod: string;

  @ApiProperty({ example: '00123456', description: 'Número de referencia bancaria o Pago Móvil' })
  @IsString()
  @IsNotEmpty()
  referenceNumber: string;

  @ApiProperty({ example: '2026-10-04', description: 'Fecha del pago (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  paymentDate: string;

  @ApiProperty({ example: '0134', description: 'Banco emisor (ej: 0134 Banesco)' })
  @IsString()
  @IsOptional()
  originBank?: string;

  @ApiProperty({ example: '04141234567', description: 'Teléfono emisor del Pago Móvil' })
  @IsString()
  @IsOptional()
  originPhone?: string;

  @ApiProperty({ example: 'correo.pagador@gmail.com', description: 'Email asociado (Zelle)', required: false })
  @IsString()
  @IsOptional()
  originEmail?: string;

  @ApiProperty({
    required: false,
    description: 'Recibo (billing_period_id) que el propietario está pagando. Se guarda como vínculo para la conciliación; los fondos se aplican a la deuda más antigua (FIFO).',
  })
  @IsUUID()
  @IsOptional()
  billingPeriodId?: string;

  @ApiProperty({ example: '18456123', description: 'Cédula o RIF del pagador' })
  @IsString()
  @IsOptional()
  originDocNumber?: string;

  @ApiProperty({ example: 'VES', enum: ['VES', 'USD', 'EUR'] })
  @IsEnum(['VES', 'USD', 'EUR'])
  currency: 'VES' | 'USD' | 'EUR';

  @ApiProperty({ example: 4053.50, description: 'Monto total pagado' })
  @IsNumber()
  @IsPositive()
  amountPaid: number;

  @ApiProperty({ example: 'Comprobante de Pago Móvil mes de Octubre', required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ example: 'https://storage.../receipt.jpg', required: false })
  @IsString()
  @IsOptional()
  receiptImageUrl?: string;
}
