import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('TuCondominio360-Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Prefijo global
  app.setGlobalPrefix('api');

  // Habilitar CORS para Web y Mobile
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Validación de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Documentación interactiva Swagger / OpenAPI
  const config = new DocumentBuilder()
    .setTitle('TuCondominio360 API')
    .setDescription(
      'API REST SaaS Multinivel para Gestión y Administración de Condominios en Venezuela (Bimoneda USD/VES, Pago Móvil, Conciliación, Garita y Asambleas)',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);

  logger.log(`====================================================`);
  logger.log(`🚀 TuCondominio360 API corriendo en: http://localhost:${port}/api`);
  logger.log(`📚 Documentación Swagger en: http://localhost:${port}/api/docs`);
  logger.log(`====================================================`);
}

bootstrap();
