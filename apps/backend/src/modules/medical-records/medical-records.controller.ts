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
import { UpdateDiagnosisDto } from './dto/update-diagnosis.dto';
import { CreateVitalDto } from './dto/create-vital.dto';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { EndPrescriptionDto, UpdatePrescriptionDto } from './dto/update-prescription.dto';
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

  /**
   * Effective organisation for a patient's records.
   *
   * Never fall back to an empty string: `MedicalRecord.organizationId` is a
   * nullable field, and SUPER_ADMIN tokens legitimately carry no organisation.
   * The service resolves those to the patient's own organisation.
   */
  private async orgIdFor(user: AccessTokenPayload, patientId: string): Promise<string | null> {
    return this.medicalRecordsService.resolveOrgId(patientId, user.organizationId ?? null);
  }

  private async reqUser(user: AccessTokenPayload, patientId: string): Promise<RequestingUser> {
    return {
      id: user.sub,
      role: user.role,
      organizationId: await this.orgIdFor(user, patientId),
      facilityId: user.facilityId ?? undefined,
    };
  }

  // ── Encounters ────────────────────────────────────────────────────────────

  @Post('encounters')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
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
      await this.orgIdFor(user, patientId),
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
      await this.orgIdFor(user, patientId),
      query,
      await this.reqUser(user, patientId),
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
      await this.orgIdFor(user, patientId),
      await this.reqUser(user, patientId),
      this.ctx(req),
    );
  }

  @Patch('encounters/:encounterId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
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
      await this.orgIdFor(user, patientId),
      await this.reqUser(user, patientId),
      this.ctx(req),
    );
  }

  // ── Diagnoses ─────────────────────────────────────────────────────────────

  @Post('diagnoses')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
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
      await this.orgIdFor(user, patientId),
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
    return this.medicalRecordsService.getDiagnoses(patientId, await this.orgIdFor(user, patientId));
  }

  @Patch('diagnoses/:diagnosisId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'Edit a diagnosis (name, status, severity, notes …)' })
  async updateDiagnosis(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('diagnosisId', ParseUUIDPipe) diagnosisId: string,
    @Body() dto: UpdateDiagnosisDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ): Promise<any> {
    return this.medicalRecordsService.updateDiagnosis(
      diagnosisId,
      dto,
      patientId,
      await this.orgIdFor(user, patientId),
      await this.reqUser(user, patientId),
      this.ctx(req),
    );
  }

  // ── Vitals ────────────────────────────────────────────────────────────────

  @Post('vitals')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'Record vitals' })
  async addVital(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateVitalDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.medicalRecordsService.addVital(
      patientId,
      dto,
      user.sub,
      await this.orgIdFor(user, patientId),
    );
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
    return this.medicalRecordsService.getVitals(patientId, await this.orgIdFor(user, patientId));
  }

  // ── Clinical Notes ────────────────────────────────────────────────────────

  @Post('notes')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
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
      await this.orgIdFor(user, patientId),
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
    return this.medicalRecordsService.getClinicalNotes(
      patientId,
      await this.orgIdFor(user, patientId),
    );
  }

  // ── Prescriptions ─────────────────────────────────────────────────────────

  @Post('prescriptions')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
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
      await this.orgIdFor(user, patientId),
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
    return this.medicalRecordsService.getPrescriptions(
      patientId,
      await this.orgIdFor(user, patientId),
    );
  }

  @Patch('prescriptions/:prescriptionId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
  @ApiOperation({
    summary: 'Change a prescription (dose, frequency, duration, status …)',
  })
  async updatePrescription(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('prescriptionId', ParseUUIDPipe) prescriptionId: string,
    @Body() dto: UpdatePrescriptionDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ): Promise<any> {
    return this.medicalRecordsService.updatePrescription(
      prescriptionId,
      dto,
      patientId,
      await this.orgIdFor(user, patientId),
      await this.reqUser(user, patientId),
      this.ctx(req),
    );
  }

  @Post('prescriptions/:prescriptionId/end')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'End a prescription (stop the medication)' })
  async endPrescription(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('prescriptionId', ParseUUIDPipe) prescriptionId: string,
    @Body() dto: EndPrescriptionDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ): Promise<any> {
    return this.medicalRecordsService.endPrescription(
      prescriptionId,
      dto ?? {},
      patientId,
      await this.orgIdFor(user, patientId),
      await this.reqUser(user, patientId),
      this.ctx(req),
    );
  }

  @Post('prescriptions/:prescriptionId/reactivate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
  @ApiOperation({ summary: 'Restart an ended prescription' })
  async reactivatePrescription(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('prescriptionId', ParseUUIDPipe) prescriptionId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ): Promise<any> {
    return this.medicalRecordsService.reactivatePrescription(
      prescriptionId,
      patientId,
      await this.orgIdFor(user, patientId),
      await this.reqUser(user, patientId),
      this.ctx(req),
    );
  }

  // ── Lab Reports ───────────────────────────────────────────────────────────

  @Post('lab-reports')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
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
      await this.orgIdFor(user, patientId),
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
    return this.medicalRecordsService.getLabReports(
      patientId,
      await this.orgIdFor(user, patientId),
    );
  }

  // ── Imaging ───────────────────────────────────────────────────────────────

  @Post('imaging')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
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
      await this.orgIdFor(user, patientId),
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
    return this.medicalRecordsService.getImagingReports(
      patientId,
      await this.orgIdFor(user, patientId),
    );
  }

  // ── Vaccinations ──────────────────────────────────────────────────────────

  @Post('vaccinations')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
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
      await this.orgIdFor(user, patientId),
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
    return this.medicalRecordsService.getVaccinations(
      patientId,
      await this.orgIdFor(user, patientId),
    );
  }

  // ── Procedures ────────────────────────────────────────────────────────────

  @Post('procedures')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseGuards(PatientAccessGuard)
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
      await this.orgIdFor(user, patientId),
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
    return this.medicalRecordsService.getProcedures(
      patientId,
      await this.orgIdFor(user, patientId),
    );
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
      await this.orgIdFor(user, patientId),
      await this.reqUser(user, patientId),
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
      await this.orgIdFor(user, patientId),
      await this.reqUser(user, patientId),
    );
  }
}
