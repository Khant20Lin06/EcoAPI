import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { SwaggerModule } from '@nestjs/swagger';
import { raw } from 'body-parser';
import { buildSwaggerDocument } from './swagger';
import { AppModule } from './app.module';

function parseCorsOrigins() {
  const rawOrigins = process.env.API_CORS_ORIGIN ?? 'http://localhost:3000';
  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesOrigin(origin: string, rule: string) {
  if (rule === '*') {
    return true;
  }
  if (!rule.includes('*')) {
    return origin === rule;
  }
  const pattern = `^${rule.split('*').map(escapeRegex).join('.*')}$`;
  return new RegExp(pattern).test(origin);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = parseCorsOrigins();

  app.enableCors({
    origin: (origin, callback) => {
      const allowed =
        !origin || allowedOrigins.some((rule) => matchesOrigin(origin, rule));
      if (allowed) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });
  app.setGlobalPrefix('api/v1');
  app.use('/api/v1/payments/stripe/webhook', raw({ type: 'application/json' }));
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false
    })
  );

  const document = buildSwaggerDocument(app);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.clear();
  console.log(`API listening on ${port}`);
}

bootstrap();
