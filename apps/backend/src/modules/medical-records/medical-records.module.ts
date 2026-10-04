import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MedicalRecordsController } from './medical-records.controller';
import { MedicalRecordsService } from './medical-records.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MedicalRecord, MedicalRecordSchema } from './schemas/medical-record.schema';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [MedicalRecordsController],
  providers: [MedicalRecordsService],
  exports: [MedicalRecordsService],
})
export class MedicalRecordsModule {}
