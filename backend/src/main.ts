import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const DEFAULT_PORT = 3000;
const DEFAULT_CORS_ORIGIN = 'http://localhost:47173';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // The frontend runs on another origin: allow only the configured ones (comma-separated).
  const origins = (process.env.CORS_ORIGIN ?? DEFAULT_CORS_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('COLBITS API')
    .setDescription('API for COLBITS network monitoring and device status.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    jsonDocumentUrl: 'api/docs/json',
    customSiteTitle: 'COLBITS API',
  });

  await app.listen(Number(process.env.PORT) || DEFAULT_PORT);
}
void bootstrap();
