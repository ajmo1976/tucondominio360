import { Module } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { ConsultationManageGuard } from './guards/consultation-manage.guard';
import { ConsultationMemberGuard } from './guards/consultation-member.guard';

@Module({
  controllers: [ConsultationsController],
  providers: [ConsultationsService, ConsultationMemberGuard, ConsultationManageGuard],
})
export class ConsultationsModule {}
