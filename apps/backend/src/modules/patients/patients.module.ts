import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Patient, PatientSchema } from './schemas/patient.schema';
import { PatientIdCounter, PatientIdCounterSchema } from './schemas/patient-id-counter.schema';
import { PatientIdService } from './patient-id.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Session, SessionSchema } from '../users/schemas/session.schema';
import { MedicalProfileModule } from '../medical-profile/medical-profile.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Patient.name, schema: PatientSchema },
      { name: PatientIdCounter.name, schema: PatientIdCounterSchema },
      { name: User.name, schema: UserSchema },
      { name: Session.name, schema: SessionSchema },
    ]),
    AuditLogsModule,
    MedicalProfileModule,
  ],
  controllers: [PatientsController],
  providers: [PatientsService, PatientIdService],
  exports: [PatientsService, PatientIdService],
})
export class PatientsModule {}
