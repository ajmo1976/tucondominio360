import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { CondosModule } from './modules/condos/condos.module';
import { BillingModule } from './modules/billing/billing.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { BcvModule } from './modules/bcv/bcv.module';

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
  ],
  controllers: [AppController],
})
export class AppModule {}
