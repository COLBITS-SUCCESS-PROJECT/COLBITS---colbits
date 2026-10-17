import { NestFactory } from '@nestjs/core';
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

  await app.listen(Number(process.env.PORT) || DEFAULT_PORT);
}
void bootstrap();
