import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole, PATIENT_ROLES } from '@medivault/shared';

import { PatientsService } from './patients.service';
import { MedicalProfileService } from '../medical-profile/medical-profile.service';
import { CreatePatientDto, AllergyDto, EmergencyContactDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { UpdateMePatientDto } from './dto/update-me-patient.dto';
import { PatientSearchDto } from './dto/patient-search.dto';
import { GenerateQrDto } from '../medical-profile/dto/generate-qr.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PatientAccessGuard } from '../../common/guards/patient-access.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AccessTokenPayload } from '../../auth/auth.service';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('Patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patientsService: PatientsService,
    private readonly medicalProfileService: MedicalProfileService,
  ) {}

  private ctx(req: Request) {
    return {
      ip:
        (req.headers['x-forwarded-for'] as string) ??
        req.socket.remoteAddress ??
        req.ip ??
        'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
      requestId: (req.headers['x-request-id'] as string) ?? '',
    };
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.RECEPTIONIST)
  @ApiOperation({ summary: 'Register a new patient' })
  create(
    @Body() dto: CreatePatientDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.patientsService.create(
      dto,
      user.sub,
      user.organizationId ?? null,
      user.facilityId ?? null,
      this.ctx(req),
    );
  }

  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
  )
  @ApiOperation({ summary: 'List patients (org/facility scoped)' })
  findAll(@Query() query: PatientSearchDto, @CurrentUser() user: AccessTokenPayload) {
    return this.patientsService.findAll(
      user.organizationId ?? null,
      user.facilityId ?? undefined,
      query,
      { id: user.sub, role: user.role },
    );
  }

  @Get('search')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
  )
  @ApiOperation({ summary: 'Search patients by name, MRN, phone, email' })
  search(@Query() dto: PatientSearchDto, @CurrentUser() user: AccessTokenPayload) {
    return this.patientsService.search(
      dto,
      user.organizationId ?? null,
      user.facilityId ?? undefined,
      { id: user.sub, role: user.role },
    );
  }

  @Get('me')
  @Roles(...PATIENT_ROLES)
  @ApiOperation({ summary: 'Get the currently signed-in patient’s own record' })
  async getMe(@CurrentUser() user: AccessTokenPayload, @Req() req: Request) {
    return this.patientsService.getMyPatient(
      user.email,
      user.sub,
      user.organizationId ?? null,
      this.ctx(req),
    );
  }

  // GET /patients/by-patient-id/:patientId — lookup by MV-YYYY-NNNNNN (staff)
  @Get('by-patient-id/:patientId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Get full patient profile by canonical MediVault ID (MV-YYYY-NNNNNN)',
  })
  findByPatientId(
    @Param('patientId') patientId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.patientsService.findByPatientId(
      patientId,
      user.organizationId ?? null,
      { id: user.sub, role: user.role, facilityId: user.facilityId ?? undefined },
      this.ctx(req),
    );
  }

  // POST /patients/:id/generate-login — create/reset a patient's login credentials
  @Post(':id/generate-login')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN)
  @ApiOperation({
    summary: 'Generate (or reset) login credentials for a patient',
    description:
      'Creates a USER account with a temporary password, or resets the ' +
      'password if the patient already has a linked login. Returns the credentials ' +
      'so staff can hand them to the patient.',
  })
  generateLogin(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.patientsService.generatePatientLogin(
      id,
      user.organizationId ?? null,
      { id: user.sub, role: user.role },
      this.ctx(req),
    );
  }

  @Get('by-profile/:profileId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Get full patient profile by 8-character profile ID' })
  findByProfileId(
    @Param('profileId') profileId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.patientsService.findByProfileId(
      profileId,
      user.organizationId ?? null,
      { id: user.sub, role: user.role, facilityId: user.facilityId ?? undefined },
      this.ctx(req),
    );
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
    ...PATIENT_ROLES,
  )
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'Get full patient profile' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.patientsService.findById(
      id,
      user.organizationId ?? null,
      { id: user.sub, role: user.role, facilityId: user.facilityId ?? undefined },
      this.ctx(req),
    );
  }

  @Get(':id/summary')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
  )
  @ApiOperation({ summary: 'Get minimal patient summary (post-fingerprint display)' })
  getSummary(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.patientsService.getPatientSummary(id, user.organizationId ?? null, user.role);
  }

  @Patch('me')
  @Roles(...PATIENT_ROLES)
  @ApiOperation({
    summary: 'Update own patient profile (name, contact, address, email)',
    description:
      'Lets a patient update their own name, phone, address, and email. ' +
      'Clinical and identity fields (date of birth, gender, blood group) cannot ' +
      'be changed by the patient. The email is kept in sync with the login account.',
  })
  updateMe(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateMePatientDto,
    @Req() req: Request,
  ) {
    return this.patientsService.updateMe(user, dto, this.ctx(req));
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.RECEPTIONIST)
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'Update patient demographics' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.patientsService.update(
      id,
      dto,
      user.organizationId ?? null,
      user.sub,
      user.role,
      this.ctx(req),
    );
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'Soft-delete patient record (admin only)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.patientsService.softDelete(
      id,
      user.organizationId ?? null,
      user.sub,
      user.role,
      this.ctx(req),
    );
  }

  @Post(':id/allergies')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'Add an allergy to patient record' })
  addAllergy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AllergyDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.patientsService.addAllergy(
      id,
      dto,
      user.organizationId ?? null,
      user.sub,
      user.role,
    );
  }

  @Delete(':id/allergies/:allergyId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Remove an allergy from patient record' })
  removeAllergy(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('allergyId', ParseUUIDPipe) allergyId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.patientsService.removeAllergy(
      allergyId,
      id,
      user.organizationId ?? null,
      user.sub,
      user.role,
    );
  }

  @Post(':id/emergency-contacts')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.RECEPTIONIST)
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'Add emergency contact' })
  addEmergencyContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmergencyContactDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.patientsService.addEmergencyContact(
      id,
      dto,
      user.organizationId ?? null,
      user.sub,
      user.role,
    );
  }

  // ── Patient-controlled QR aliases (thin wrappers over the canonical
  //    /medical-profile/patients/:id/qr* routes, kept for API parity) ──────

  @Get(':id/qr')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    ...PATIENT_ROLES,
  )
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'Get QR status and lifecycle for a patient' })
  getQrStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalProfileService.getQrStatus(
      id,
      user.organizationId ?? null,
      user,
      this.ctx(req),
    );
  }

  @Post(':id/qr/rotate')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    ...PATIENT_ROLES,
  )
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'Rotate (regenerate) a patient’s QR code' })
  rotateQr(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateQrDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalProfileService.generateQr(
      id,
      user.organizationId ?? null,
      user,
      dto?.baseUrl,
      this.ctx(req),
    );
  }

  @Post(':id/qr/revoke')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    ...PATIENT_ROLES,
  )
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'Revoke a patient’s QR code' })
  revokeQr(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalProfileService.revokeQr(
      id,
      user.organizationId ?? null,
      user,
      this.ctx(req),
    );
  }
}
