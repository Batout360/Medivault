import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MedicalProfileController } from './medical-profile.controller';
import { MedicalProfileService } from './medical-profile.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MedicalProfile, MedicalProfileSchema } from './schemas/medical-profile.schema';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';

@Module({
  imports: [
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: MedicalProfile.name, schema: MedicalProfileSchema },
      { name: Patient.name, schema: PatientSchema },
    ]),
  ],
  controllers: [MedicalProfileController],
  providers: [MedicalProfileService],
  exports: [MedicalProfileService],
})
export class MedicalProfileModule {}
