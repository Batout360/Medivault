import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as Joi from 'joi';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PatientsModule } from './modules/patients/patients.module';
import { BiometricModule } from './modules/biometric/biometric.module';
import { MedicalRecordsModule } from './modules/medical-records/medical-records.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { MedicalProfileModule } from './modules/medical-profile/medical-profile.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdminModule } from './modules/admin/admin.module';

const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),
  DATABASE_URL: Joi.string()
    .pattern(/^mongodb(\+srv)?:\/\/.+/)
    .required(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_DB: Joi.number().default(0),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  COOKIE_SECRET: Joi.string().min(32).required(),
  BCRYPT_ROUNDS: Joi.number().default(12),
  CORS_ALLOWED_ORIGINS: Joi.string().default('http://localhost:3000'),
  STORAGE_PROVIDER: Joi.string().valid('local', 'gridfs', 's3', 'azure', 'minio').default('local'),
  STORAGE_LOCAL_PATH: Joi.string().default('./uploads'),
  STORAGE_GRIDFS_BUCKET: Joi.string().default('uploads'),
  STORAGE_SIGNING_SECRET: Joi.string().min(32).optional(),
  AWS_S3_BUCKET: Joi.string().optional(),
  AWS_S3_REGION: Joi.string().optional(),
  AWS_ACCESS_KEY_ID: Joi.string().optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().optional(),
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASSWORD: Joi.string().optional(),
  SMTP_FROM: Joi.string().optional(),
  BIOMETRIC_SERVICE_URL: Joi.string().uri().optional(),
  BIOMETRIC_SERVICE_API_KEY: Joi.string().optional(),
  BIOMETRIC_PROVIDER: Joi.string().valid('mfs100').default('mfs100'),
  BIOMETRIC_MATCH_THRESHOLD: Joi.number().min(0).max(100).default(85),
  BIOMETRIC_ENCRYPTION_KEY: Joi.string().min(32).optional(),
  BIOMETRIC_BRIDGE_SECRET: Joi.string().optional(),
  BIOMETRIC_ALLOWED_DEVICES: Joi.string().optional().allow(''),
  MFS100_MATCH_THRESHOLD: Joi.number().min(0).max(100000).optional(),
  MFS100_LICENSE_KEY: Joi.string().optional(),
  MFA_ENCRYPTION_KEY: Joi.string().min(32).optional(),
  QR_ENCRYPTION_KEY: Joi.string().min(32).optional(),
  FRONTEND_URL: Joi.string().uri().optional(),
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(200),
});

@Module({
  imports: [
    // ─── Configuration ───────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),

    // ─── Rate Limiting (in-memory; swap to Redis storage for production) ────
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: configService.get<number>('THROTTLE_TTL', 60) * 1000,
            limit: configService.get<number>('THROTTLE_LIMIT', 200),
          },
          // 'auth' throttler must stay registered so @Throttle({ auth: ... })
          // overrides on auth endpoints keep working. Its global default mirrors
          // the permissive 'default' limit; strict limits (login/register/
          // forgot-password) are applied per-endpoint via the decorator.
          {
            name: 'auth',
            ttl: configService.get<number>('THROTTLE_TTL', 60) * 1000,
            limit: configService.get<number>('THROTTLE_LIMIT', 200),
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // ─── Feature Modules ─────────────────────────────────────────────────────
    // DatabaseModule is @Global() — register first so Mongoose connection is
    // available to all other modules.
    DatabaseModule,
    // AuditLogsModule is @Global() — register before CommonModule so
    // AuditLogsService is available to AuditInterceptor.
    AuditLogsModule,
    CommonModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    BiometricModule,
    MedicalRecordsModule,
    DocumentsModule,
    MedicalProfileModule,
    DashboardModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply rate limiting globally via APP_GUARD
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
