import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync } from 'node:fs';
import { AppModule } from './app.module';
import { ENV, Env } from './config/env';

async function bootstrap(): Promise<void> {
  // Node >= 20.12 đọc được .env sẵn, không cần thư viện dotenv.
  // Chạy TRƯỚC NestFactory.create vì EnvModule validate process.env lúc khởi tạo provider.
  if (existsSync('.env')) process.loadEnvFile('.env');

  const app = await NestFactory.create(AppModule);
  const env = app.get<Env>(ENV);

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: env.CORS_ORIGIN.split(','), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // bỏ field không khai báo trong DTO
      forbidNonWhitelisted: true, // ...và báo lỗi 400 nếu có field lạ
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ProcureX API')
    .setDescription('B2B MRO Procurement Platform')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(env.PORT);
  console.log(`🚀 API:     http://localhost:${env.PORT}/api/v1`);
  console.log(`📚 Swagger: http://localhost:${env.PORT}/docs`);
}

void bootstrap();
