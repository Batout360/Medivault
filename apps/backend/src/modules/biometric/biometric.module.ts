import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BiometricController } from './biometric.controller';
import { BiometricService } from './biometric.service';
import { BiometricSecurityService } from './services/biometric-security.service';
import { MFS100BiometricProvider } from './providers/mfs100-biometric.provider';
import { BIOMETRIC_PROVIDER } from './providers/biometric-provider.interface';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { BiometricTemplate, BiometricTemplateSchema } from './schemas/biometric-template.schema';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';

@Module({
  imports: [
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: BiometricTemplate.name, schema: BiometricTemplateSchema },
      { name: Patient.name, schema: PatientSchema },
    ]),
  ],
  controllers: [BiometricController],
  providers: [
    BiometricService,
    BiometricSecurityService,
    {
      provide: BIOMETRIC_PROVIDER,
      useClass: MFS100BiometricProvider,
    },
  ],
  exports: [BiometricService],
})
export class BiometricModule {}
