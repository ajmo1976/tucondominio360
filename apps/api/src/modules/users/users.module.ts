import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [UsersController],
  providers: [UsersService, SuperAdminGuard],
  exports: [UsersService],
})
export class UsersModule {}