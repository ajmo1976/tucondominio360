import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { AccessCoreModule } from './modules/access-core/access.module';
import { AmenitiesModule } from './modules/amenities/amenities.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { MailModule } from './modules/mail/mail.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { MeModule } from './modules/me/me.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    // Límite por defecto de los endpoints de autenticación (10 req/min por IP).
    // Las rutas sensibles (login, forgot, resend) llevan su propio @Throttle.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 10 }]),
    DatabaseModule,
    AccessCoreModule,
    AuthModule,
    CondosModule,
    BillingModule,
    PaymentsModule,
    BcvModule,
    UsersModule,
    CommunityModule,
    ConsultationsModule,
    AccessModule,
    AmenitiesModule,
    MaintenanceModule,
    AnnouncementsModule,
    MailModule,
    TenantsModule,
    MeModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
