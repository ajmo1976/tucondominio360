import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { CondosModule } from './modules/condos/condos.module';
import { BillingModule } from './modules/billing/billing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { BcvModule } from './modules/bcv/bcv.module';
import { UsersModule } from './modules/users/users.module';
import { CommunityModule } from './modules/community/community.module';
import { ConsultationsModule } from './modules/consultations/consultations.module';
import { AccessModule } from './modules/access/access.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    DatabaseModule,
    AuthModule,
    CondosModule,
    BillingModule,
    PaymentsModule,
    BcvModule,
    UsersModule,
    CommunityModule,
    ConsultationsModule,
    AccessModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
