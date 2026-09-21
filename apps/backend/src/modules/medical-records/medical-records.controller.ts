import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole, PATIENT_ROLES } from '@medivault/shared';

import { MedicalRecordsService, RequestingUser } from './medical-records.service';
import { CreateEncounterDto, UpdateEncounterDto } from './dto/create-encounter.dto';
import { CreateDiagnosisDto } from './dto/create-diagnosis.dto';
import { CreateVitalDto } from './dto/create-vital.dto';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { CreateLabReportDto } from './dto/create-lab-report.dto';
import { CreateImagingReportDto } from './dto/create-imaging-report.dto';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { CreateProcedureDto } from './dto/create-procedure.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PatientAccessGuard } from '../../common/guards/patient-access.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AccessTokenPayload } from '../../auth/auth.service';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Medical Records')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients/:patientId')
export class MedicalRecordsController {
  constructor(private readonly medicalRecordsService: MedicalRecordsService) {}

  private ctx(req: Request) {
    return {
      ip: (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
      requestId: (req.headers['x-request-id'] as string) ?? '',
    };
  }

  private reqUser(user: AccessTokenPayload): RequestingUser {
    return {
      id: user.sub,
      role: user.role,
      organizationId: user.organizationId ?? '',
      facilityId: user.facilityId ?? undefined,
    };
  }

  // ── Encounters ────────────────────────────────────────────────────────────

  @Post('encounters')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Create a new encounter / medical record' })
  async createEncounter(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateEncounterDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ): Promise<any> {
    return this.medicalRecordsService.createEncounter(
      patientId,
      dto,
      user.sub,
      user.organizationId ?? '',
      this.ctx(req),
    );
  }

  @Get('encounters')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'List encounters for a patient' })
  async getEncounters(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: PaginationDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.getEncounters(
      patientId,
      user.organizationId ?? '',
      query,
      this.reqUser(user),
    );
  }

  @Get('encounters/:encounterId')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'Get a single encounter' })
  async getEncounterById(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('encounterId', ParseUUIDPipe) encounterId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ): Promise<any> {
    return this.medicalRecordsService.getEncounterById(
      encounterId,
      patientId,
      user.organizationId ?? '',
      this.reqUser(user),
      this.ctx(req),
    );
  }

  @Patch('encounters/:encounterId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Update an encounter' })
  async updateEncounter(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('encounterId', ParseUUIDPipe) encounterId: string,
    @Body() dto: UpdateEncounterDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ): Promise<any> {
    return this.medicalRecordsService.updateEncounter(
      encounterId,
      dto,
      patientId,
      user.organizationId ?? '',
      this.reqUser(user),
      this.ctx(req),
    );
  }

  // ── Diagnoses ─────────────────────────────────────────────────────────────

  @Post('diagnoses')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Add a diagnosis' })
  async addDiagnosis(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateDiagnosisDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalRecordsService.addDiagnosis(
      patientId,
      dto,
      user.sub,
      user.organizationId ?? '',
      this.ctx(req),
    );
  }

  @Get('diagnoses')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'Get diagnoses for a patient' })
  async getDiagnoses(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.getDiagnoses(patientId, user.organizationId ?? '');
  }

  // ── Vitals ────────────────────────────────────────────────────────────────

  @Post('vitals')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Record vitals' })
  async addVital(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateVitalDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.addVital(patientId, dto, user.sub, user.organizationId ?? '');
  }

  @Get('vitals')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'Get vitals for a patient' })
  async getVitals(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.getVitals(patientId, user.organizationId ?? '');
  }

  // ── Clinical Notes ────────────────────────────────────────────────────────

  @Post('notes')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Add a clinical note' })
  async addNote(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateClinicalNoteDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalRecordsService.addClinicalNote(
      patientId,
      dto,
      user.sub,
      user.organizationId ?? '',
      this.ctx(req),
    );
  }

  @Get('notes')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'Get clinical notes for a patient' })
  async getNotes(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.getClinicalNotes(patientId, user.organizationId ?? '');
  }

  // ── Prescriptions ─────────────────────────────────────────────────────────

  @Post('prescriptions')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Create a prescription' })
  async addPrescription(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreatePrescriptionDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalRecordsService.addPrescription(
      patientId,
      dto,
      user.sub,
      user.organizationId ?? '',
      this.ctx(req),
    );
  }

  @Get('prescriptions')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.PHARMACIST,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'Get prescriptions for a patient' })
  async getPrescriptions(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.getPrescriptions(patientId, user.organizationId ?? '');
  }

  // ── Lab Reports ───────────────────────────────────────────────────────────

  @Post('lab-reports')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Add a lab report' })
  async addLabReport(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateLabReportDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalRecordsService.addLabReport(
      patientId,
      dto,
      user.sub,
      user.organizationId ?? '',
      this.ctx(req),
    );
  }

  @Get('lab-reports')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.LAB_TECHNICIAN,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'Get lab reports for a patient' })
  async getLabReports(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.getLabReports(patientId, user.organizationId ?? '');
  }

  // ── Imaging ───────────────────────────────────────────────────────────────

  @Post('imaging')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Add an imaging report' })
  async addImaging(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateImagingReportDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalRecordsService.addImagingReport(
      patientId,
      dto,
      user.sub,
      user.organizationId ?? '',
      this.ctx(req),
    );
  }

  @Get('imaging')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RADIOLOGIST,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'Get imaging reports for a patient' })
  async getImaging(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.getImagingReports(patientId, user.organizationId ?? '');
  }

  // ── Vaccinations ──────────────────────────────────────────────────────────

  @Post('vaccinations')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Record a vaccination' })
  async addVaccination(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateVaccinationDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.addVaccination(
      patientId,
      dto,
      user.sub,
      user.organizationId ?? '',
    );
  }

  @Get('vaccinations')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'Get vaccinations for a patient' })
  async getVaccinations(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.getVaccinations(patientId, user.organizationId ?? '');
  }

  // ── Procedures ────────────────────────────────────────────────────────────

  @Post('procedures')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Record a procedure' })
  async addProcedure(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateProcedureDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalRecordsService.addProcedure(
      patientId,
      dto,
      user.sub,
      user.organizationId ?? '',
      this.ctx(req),
    );
  }

  @Get('procedures')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'Get procedures for a patient' })
  async getProcedures(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.getProcedures(patientId, user.organizationId ?? '');
  }

  // ── Full Medical History ──────────────────────────────────────────────────

  @Get('history')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'Get complete medical history for a patient' })
  async getHistory(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalRecordsService.getFullMedicalHistory(
      patientId,
      user.organizationId ?? '',
      this.reqUser(user),
      this.ctx(req),
    );
  }

  // ── Patient-visible record summary ──────────────────────────────────────────

  /**
   * Sanitised summary of a patient's medical record.
   * Available to every authenticated role (including the patient themselves),
   * scoped by the PatientAccessGuard so users can only view records they are
   * allowed to. Non-editor roles (e.g. PATIENT) are intentionally limited to
   * this aggregated view rather than the raw clinical endpoints.
   */
  @Get('medical-summary')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.PHARMACIST,
    UserRole.LAB_TECHNICIAN,
    UserRole.RADIOLOGIST,
    UserRole.RECEPTIONIST,
    UserRole.BILLING_STAFF,
    ...PATIENT_ROLES,
  )
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'Get sanitised medical record summary (all roles, incl. patients)' })
  async getMedicalSummary(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.getPatientMedicalSummary(
      patientId,
      user.organizationId ?? '',
      this.reqUser(user),
    );
  }
}
