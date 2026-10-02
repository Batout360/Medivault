import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { BiometricController } from './biometric.controller';
import { BiometricService } from './biometric.service';
import { BiometricSecurityService } from './services/biometric-security.service';
import { MFS100BiometricProvider } from './providers/mfs100-biometric.provider';
import { MSO1300BiometricProvider } from './providers/mso1300-biometric.provider';
import { BIOMETRIC_PROVIDER } from './providers/biometric-provider.interface';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { BiometricTemplate, BiometricTemplateSchema } from './schemas/biometric-template.schema';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';

/**
 * Select the biometric provider based on the BIOMETRIC_PROVIDER environment
 * variable. Supported values:
 *
 *   mso1300  — Idemia MSO 1300 E3 (MorphoSmartCST.dll)  ← production default
 *   mfs100   — Mantra MFS100 (MFS100.dll)                ← legacy
 *   mock     — development / CI stub (handled upstream via mock flag)
 *
 * Falls back to MSO1300 if the variable is not set.
 */
function biometricProviderFactory() {
  return {
    provide: BIOMETRIC_PROVIDER,
    useFactory: (config: ConfigService) => {
      const requested = (config.get<string>('BIOMETRIC_PROVIDER') ?? 'mso1300')
        .toLowerCase()
        .trim();

      switch (requested) {
        case 'mfs100':
          return new MFS100BiometricProvider();
        case 'mso1300':
        default:
          return new MSO1300BiometricProvider();
      }
    },
    inject: [ConfigService],
  };
}

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
    biometricProviderFactory(),
  ],
  exports: [BiometricService],
})
export class BiometricModule {}
