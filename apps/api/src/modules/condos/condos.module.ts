import { Module } from '@nestjs/common';
import { CondosController } from './condos.controller';
import { CondosService } from './condos.service';

@Module({
  controllers: [CondosController],
  providers: [CondosService],
  exports: [CondosService],
})
export class CondosModule {}
