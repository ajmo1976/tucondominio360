import { Module } from '@nestjs/common';
import { SuperAdminGuard } from '../users/guards/super-admin.guard';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { ConsultationMemberGuard } from './guards/consultation-member.guard';

@Module({
  controllers: [ConsultationsController],
  providers: [ConsultationsService, ConsultationMemberGuard, SuperAdminGuard],
})
export class ConsultationsModule {}
