import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuditLogsModule } from '../modules/audit-logs/audit-logs.module';
import { PatientsModule } from '../modules/patients/patients.module';
import { MedicalProfileModule } from '../modules/medical-profile/medical-profile.module';

import { User, UserSchema } from '../modules/users/schemas/user.schema';
import { Session, SessionSchema } from '../modules/users/schemas/session.schema';
import { Patient, PatientSchema } from '../modules/patients/schemas/patient.schema';

// Strategies
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';

// Guards
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as NonNullable<
            JwtModuleOptions['signOptions']
          >['expiresIn'],
          issuer: 'medivault-api',
          audience: 'medivault-clients',
        },
      }),
    }),
    // Register the Mongoose models needed by this module
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Session.name, schema: SessionSchema },
      { name: Patient.name, schema: PatientSchema },
    ]),
    AuditLogsModule,
    PatientsModule,
    MedicalProfileModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    RefreshTokenStrategy,
    JwtAuthGuard,
    RolesGuard,
    LocalAuthGuard,
    RefreshTokenGuard,
  ],
  exports: [AuthService, JwtModule, PassportModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
