import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';

  // ─── Security Headers (Helmet) ───────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              scriptSrc: ["'self'"],
              fontSrc: ["'self'"],
              connectSrc: ["'self'"],
              frameSrc: ["'none'"],
              objectSrc: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: isProduction,
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
      noSniff: true,
      frameguard: { action: 'deny' },
    }),
  );

  // ─── CORS ────────────────────────────────────────────────────────────────
  const allowedOrigins = configService
    .get<string>('CORS_ALLOWED_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        // Allow non-browser clients (server-to-server, curl during dev)
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Authorization',
      'Content-Type',
      'X-Requested-With',
      'X-Request-ID',
      'X-Organization-ID',
      'X-Facility-ID',
    ],
    exposedHeaders: ['X-Request-ID', 'X-Rate-Limit-Remaining'],
    credentials: true,
    maxAge: 86400, // 24 hours preflight cache
  });

  // ─── Cookie Parser ───────────────────────────────────────────────────────
  const cookieSecret = configService.get<string>('COOKIE_SECRET', 'change-me-in-production');
  app.use(cookieParser(cookieSecret));

  // ─── Compression ─────────────────────────────────────────────────────────
  app.use(
    compression({
      threshold: 1024, // Only compress responses > 1KB
      level: 6, // Balance between speed and compression ratio
    }),
  );

  // ─── Request Size Limits ─────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ─── Global API Prefix & Versioning ──────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ─── Global Validation Pipe ──────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw on extra properties
      transform: true, // Auto-transform primitives to declared types
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: isProduction, // Hide field details in production
      validationError: {
        target: false, // Don't expose the target object on error
        value: false, // Don't expose the value on error
      },
    }),
  );

  // ─── Swagger / OpenAPI ───────────────────────────────────────────────────
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Medivault API')
      .setDescription(
        'Medical Records Management System - REST API documentation.\n\n' +
          '**Security Notice**: This API handles sensitive PHI (Protected Health Information). ' +
          'All requests require authentication via Bearer JWT.',
      )
      .setVersion('1.0.0')
      .setContact('Medivault Support', 'https://medivault.internal', 'support@medivault.internal')
      .setLicense('Proprietary', '')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter your JWT access token',
          in: 'header',
        },
        'access-token',
      )
      .addCookieAuth('refresh_token', {
        type: 'apiKey',
        in: 'cookie',
        name: 'refresh_token',
        description: 'HttpOnly refresh token cookie',
      })
      .addTag('Auth', 'Authentication and session management')
      .addTag('Users', 'User account management')
      .addTag('Patients', 'Patient registration and management')
      .addTag('Medical Records', 'Clinical records, diagnoses, prescriptions')
      .addTag('Biometrics', 'Fingerprint enrollment and identification')
      .addTag('Audit Logs', 'System audit trail')
      .addTag('Documents', 'Document upload and management')
      .addTag('Medical Profile', 'Medical profile card and QR code')
      .addServer(`http://localhost:${port}`, 'Local Development')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        tryItOutEnabled: false, // Disable in shared environments
      },
      customSiteTitle: 'Medivault API Docs',
    });
  }

  // ─── Graceful Shutdown ───────────────────────────────────────────────────
  app.enableShutdownHooks();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} received — starting graceful shutdown...`);
    await app.close();
    console.log('Application closed gracefully.');
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  // ─── Start Server ────────────────────────────────────────────────────────
  await app.listen(port, '0.0.0.0');

  console.log(`\n🏥 Medivault API is running`);
  console.log(`   Environment : ${nodeEnv}`);
  console.log(`   URL         : http://localhost:${port}/api/v1`);
  if (!isProduction) {
    console.log(`   Swagger     : http://localhost:${port}/api/docs`);
  }
  console.log('');
}

void bootstrap();
