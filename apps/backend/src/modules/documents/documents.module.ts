import { Module } from '@nestjs/common';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Connection } from 'mongoose';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { LocalStorageProvider, STORAGE_PROVIDER } from './storage/storage.provider';
import { GridFSStorageProvider } from './storage/gridfs.provider';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { Document as MedivaultDocument, DocumentSchema } from './schemas/document.schema';
import { Patient, PatientSchema } from '../patients/schemas/patient.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    ConfigModule,
    AuditLogsModule,
    MongooseModule.forFeature([
      { name: MedivaultDocument.name, schema: DocumentSchema },
      { name: Patient.name, schema: PatientSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, getConnectionToken()],
      useFactory: (config: ConfigService, connection: Connection) =>
        config.get<string>('STORAGE_PROVIDER', 'local') === 'gridfs'
          ? new GridFSStorageProvider(config, connection)
          : new LocalStorageProvider(config),
    },
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
