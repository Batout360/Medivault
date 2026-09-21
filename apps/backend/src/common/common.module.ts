import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_FILTER, APP_INTERCEPTOR, Reflector } from '@nestjs/core';

import { PermissionsGuard } from './guards/permissions.guard';
import { OrganizationGuard } from './guards/organization.guard';
import { PatientAccessGuard } from './guards/patient-access.guard';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { ParseUUIDPipe } from './pipes/parse-uuid.pipe';
import { Patient, PatientSchema } from '../modules/patients/schemas/patient.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Patient.name, schema: PatientSchema }])],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    TransformInterceptor,
    PermissionsGuard,
    OrganizationGuard,
    PatientAccessGuard,
    AuditInterceptor,
    ParseUUIDPipe,
    RequestIdMiddleware,
    Reflector,
  ],
  exports: [
    TransformInterceptor,
    PermissionsGuard,
    OrganizationGuard,
    PatientAccessGuard,
    AuditInterceptor,
    ParseUUIDPipe,
    RequestIdMiddleware,
  ],
})
export class CommonModule {}
