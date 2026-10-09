import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SuperAdminGuard } from './guards/super-admin.guard';

@Module({
  controllers: [UsersController],
  providers: [UsersService, SuperAdminGuard],
})
export class UsersModule {}