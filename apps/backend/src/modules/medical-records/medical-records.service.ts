import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { PATIENT_ROLES } from '@medivault/shared';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { paginate, PaginationDto, PaginatedResult } from '../../common/dto/pagination.dto';
import { MedicalRecord, MedicalRecordDocument } from './schemas/medical-record.schema';

import { CreateEncounterDto, UpdateEncounterDto } from './dto/create-encounter.dto';
import { CreateDiagnosisDto } from './dto/create-diagnosis.dto';
import { CreateVitalDto } from './dto/create-vital.dto';
import { CreateClinicalNoteDto } from './dto/create-clinical-note.dto';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { CreateLabReportDto } from './dto/create-lab-report.dto';
import { CreateImagingReportDto } from './dto/create-imaging-report.dto';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { CreateProcedureDto } from './dto/create-procedure.dto';

export interface RequestContext {
  ip: string;
  userAgent: string;
  requestId: string;
}

export interface RequestingUser {
  id: string;
  role: string;
  organizationId: string;
  facilityId?: string;
}

@Injectable()
export class MedicalRecordsService {
  private readonly logger = new Logger(MedicalRecordsService.name);

  constructor(
    @InjectModel(MedicalRecord.name)
    private readonly medicalRecordModel: Model<MedicalRecordDocument>,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Patients store `organizationId: null` when unassigned (e.g. self-registered
   * accounts), while authenticated users arrive here with a non-nullable orgId
   * (`user.organizationId ?? ''`). Normalise empty-string back to null so the
   * two representations match when scoping a patient lookup.
   */
  private orgIdForPatientLookup(orgId: string): string | null {
    return orgId || null;
  }

  private async verifyPatientInOrg(patientId: string, orgId: string): Promise<void> {
    // Lightweight existence + org-scope check — avoids loading the full patient document.
    // Patients use UUID string _ids (see Patient schema), so type the raw collection accordingly.
    const exists = await this.medicalRecordModel.db
      .collection<{ _id: string; organizationId: string | null; deletedAt: Date | null }>(
        'patients',
      )
      .findOne(
        { _id: patientId, organizationId: this.orgIdForPatientLookup(orgId), deletedAt: null },
        { projection: { _id: 1 } },
      );
    if (!exists) throw new NotFoundException(`Patient ${patientId} not found in organisation.`);
  }

  private async verifyEncounterOwnership(
    encounterId: string,
    patientId: string,
    orgId: string,
  ): Promise<MedicalRecordDocument> {
    const record = await this.medicalRecordModel.findOne({
      _id: encounterId,
      patientId,
      organizationId: orgId,
      type: 'encounter',
      deletedAt: null,
    });
    if (!record) throw new NotFoundException(`Encounter ${encounterId} not found.`);
    return record;
  }

  // ── Encounters ─────────────────────────────────────────────────────────────

  async createEncounter(
    patientId: string,
    dto: CreateEncounterDto,
    doctorId: string,
    orgId: string,
    ctx: RequestContext,
  ): Promise<any> {
    const id = uuidv4();
    const now = new Date();

    await new this.medicalRecordModel({
      _id: id,
      type: 'encounter',
      patientId,
      encounterId: null,
      authorId: doctorId,
      organizationId: orgId,
      facilityId: dto.facilityId ?? null,
      data: {
        doctorId,
        facilityId: dto.facilityId ?? null,
        encounterType: dto.encounterType,
        encounterDate: dto.encounterDate ? new Date(dto.encounterDate) : now,
        chiefComplaint: dto.chiefComplaint ?? null,
        historyOfPresentIllness: dto.historyOfPresentIllness ?? null,
        physicalExam: dto.physicalExam ?? null,
        assessment: dto.assessment ?? null,
        plan: dto.plan ?? null,
        notes: dto.notes ?? null,
        followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
        isConfidential: dto.isConfidential ?? false,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }).save();

    await this.auditLogs.log({
      eventType: 'MEDICAL_RECORD_CREATE',
      userId: doctorId,
      organizationId: orgId,
      resourceType: 'MEDICAL_RECORD',
      resourceId: id,
      action: 'CREATE_ENCOUNTER',
      result: 'success',
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { patientId, encounterType: dto.encounterType },
    });

    return this.getEncounterById(
      id,
      patientId,
      orgId,
      { id: doctorId, role: 'DOCTOR', organizationId: orgId },
      ctx,
    );
  }

  async getEncounters(
    patientId: string,
    orgId: string,
    query: PaginationDto,
    requestingUser: RequestingUser,
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 20, sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;
    const sort = sortOrder === 'asc' ? 1 : -1;

    const filter = { patientId, organizationId: orgId, type: 'encounter', deletedAt: null };

    const [rows, total] = await Promise.all([
      this.medicalRecordModel
        .find(filter)
        .sort({ 'data.encounterDate': sort })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.medicalRecordModel.countDocuments(filter).exec(),
    ]);

    await this.auditLogs.log({
      eventType: 'MEDICAL_RECORD_READ',
      userId: requestingUser.id,
      organizationId: orgId,
      resourceType: 'MEDICAL_RECORD',
      resourceId: patientId,
      action: 'LIST_ENCOUNTERS',
      result: 'success',
      metadata: { patientId },
    });

    return paginate(rows ?? [], total, page, limit);
  }

  async getEncounterById(
    encounterId: string,
    patientId: string,
    orgId: string,
    requestingUser: RequestingUser,
    ctx: RequestContext,
  ): Promise<any> {
    const record = await this.medicalRecordModel
      .findOne({
        _id: encounterId,
        patientId,
        organizationId: orgId,
        type: 'encounter',
        deletedAt: null,
      })
      .lean()
      .exec();

    if (!record) throw new NotFoundException(`Encounter ${encounterId} not found.`);

    // Load related sub-records in parallel — each capped to prevent unbounded reads
    const SUB_RECORD_LIMIT = 100;
    const [diagnoses, clinicalNotes, prescriptions, labReports, imagingReports, procedures] =
      await Promise.all([
        this.medicalRecordModel
          .find({ encounterId, type: 'diagnosis', deletedAt: null })
          .limit(SUB_RECORD_LIMIT)
          .lean()
          .exec(),
        this.medicalRecordModel
          .find({ encounterId, type: 'note', deletedAt: null })
          .sort({ createdAt: -1 })
          .limit(SUB_RECORD_LIMIT)
          .lean()
          .exec(),
        this.medicalRecordModel
          .find({ encounterId, type: 'prescription', deletedAt: null })
          .limit(SUB_RECORD_LIMIT)
          .lean()
          .exec(),
        this.medicalRecordModel
          .find({ encounterId, type: 'lab_report', deletedAt: null })
          .limit(SUB_RECORD_LIMIT)
          .lean()
          .exec(),
        this.medicalRecordModel
          .find({ encounterId, type: 'imaging', deletedAt: null })
          .limit(SUB_RECORD_LIMIT)
          .lean()
          .exec(),
        this.medicalRecordModel
          .find({ encounterId, type: 'procedure', deletedAt: null })
          .limit(SUB_RECORD_LIMIT)
          .lean()
          .exec(),
      ]);

    await this.auditLogs.log({
      eventType: 'MEDICAL_RECORD_READ',
      userId: requestingUser.id,
      organizationId: orgId,
      resourceType: 'MEDICAL_RECORD',
      resourceId: encounterId,
      action: 'VIEW_ENCOUNTER',
      result: 'success',
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { patientId },
    });

    return {
      ...record,
      diagnoses: diagnoses ?? [],
      clinicalNotes: clinicalNotes ?? [],
      prescriptions: prescriptions ?? [],
      labReports: labReports ?? [],
      imagingReports: imagingReports ?? [],
      procedures: procedures ?? [],
    };
  }

  async updateEncounter(
    encounterId: string,
    dto: UpdateEncounterDto,
    patientId: string,
    orgId: string,
    requestingUser: RequestingUser,
    ctx: RequestContext,
  ): Promise<any> {
    await this.verifyEncounterOwnership(encounterId, patientId, orgId);

    const updates: Record<string, any> = { updatedAt: new Date() };

    if (dto.encounterType !== undefined) updates['data.encounterType'] = dto.encounterType;
    if (dto.encounterDate !== undefined)
      updates['data.encounterDate'] = new Date(dto.encounterDate);
    if (dto.chiefComplaint !== undefined) updates['data.chiefComplaint'] = dto.chiefComplaint;
    if (dto.historyOfPresentIllness !== undefined)
      updates['data.historyOfPresentIllness'] = dto.historyOfPresentIllness;
    if (dto.physicalExam !== undefined) updates['data.physicalExam'] = dto.physicalExam;
    if (dto.assessment !== undefined) updates['data.assessment'] = dto.assessment;
    if (dto.plan !== undefined) updates['data.plan'] = dto.plan;
    if (dto.notes !== undefined) updates['data.notes'] = dto.notes;
    if (dto.followUpDate !== undefined)
      updates['data.followUpDate'] = dto.followUpDate ? new Date(dto.followUpDate) : null;
    if (dto.isConfidential !== undefined) updates['data.isConfidential'] = dto.isConfidential;

    await this.medicalRecordModel.updateOne({ _id: encounterId }, { $set: updates }).exec();

    await this.auditLogs.log({
      eventType: 'MEDICAL_RECORD_UPDATE',
      userId: requestingUser.id,
      organizationId: orgId,
      resourceType: 'MEDICAL_RECORD',
      resourceId: encounterId,
      action: 'UPDATE_ENCOUNTER',
      result: 'success',
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { patientId, changes: Object.keys(dto) },
    });

    return this.getEncounterById(encounterId, patientId, orgId, requestingUser, ctx);
  }

  // ── Diagnoses ──────────────────────────────────────────────────────────────

  async addDiagnosis(
    patientId: string,
    dto: CreateDiagnosisDto,
    addedById: string,
    orgId: string,
    ctx: RequestContext,
  ) {
    await this.verifyEncounterOwnership(dto.medicalRecordId, patientId, orgId);

    const id = uuidv4();
    const now = new Date();

    const doc = await new this.medicalRecordModel({
      _id: id,
      type: 'diagnosis',
      patientId,
      encounterId: dto.medicalRecordId,
      authorId: addedById,
      organizationId: orgId,
      facilityId: null,
      data: {
        diagnosisCode: dto.diagnosisCode ?? null,
        diagnosisName: dto.diagnosisName,
        diagnosisType: dto.diagnosisType ?? null,
        severity: dto.severity ?? null,
        status: dto.status ?? 'ACTIVE',
        notes: dto.notes ?? null,
        diagnosedAt: now,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }).save();

    await this.auditLogs.log({
      eventType: 'MEDICAL_RECORD_CREATE',
      userId: addedById,
      organizationId: orgId,
      resourceType: 'DIAGNOSIS',
      resourceId: id,
      action: 'ADD_DIAGNOSIS',
      result: 'success',
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { patientId, medicalRecordId: dto.medicalRecordId },
    });

    return doc.toObject();
  }

  async getDiagnoses(patientId: string, orgId: string) {
    return this.medicalRecordModel
      .find({ patientId, organizationId: orgId, type: 'diagnosis', deletedAt: null })
      .sort({ 'data.diagnosedAt': -1 })
      .lean()
      .exec();
  }

  // ── Vitals ─────────────────────────────────────────────────────────────────

  async addVital(patientId: string, dto: CreateVitalDto, recordedById: string, orgId: string) {
    let bmi: number | null = null;
    if (dto.weight && dto.height && dto.height > 0) {
      const heightM = dto.height / 100;
      bmi = parseFloat((dto.weight / (heightM * heightM)).toFixed(1));
    }

    const id = uuidv4();
    const now = new Date();

    const doc = await new this.medicalRecordModel({
      _id: id,
      type: 'vital',
      patientId,
      encounterId: null,
      authorId: recordedById,
      organizationId: orgId,
      facilityId: null,
      data: {
        recordedById,
        bloodPressureSystolic: dto.bloodPressureSystolic ?? null,
        bloodPressureDiastolic: dto.bloodPressureDiastolic ?? null,
        heartRate: dto.heartRate ?? null,
        temperature: dto.temperature ?? null,
        respiratoryRate: dto.respiratoryRate ?? null,
        oxygenSaturation: dto.oxygenSaturation ?? null,
        weight: dto.weight ?? null,
        height: dto.height ?? null,
        bmi,
        glucose: dto.glucose ?? null,
        notes: dto.notes ?? null,
        recordedAt: new Date(dto.recordedAt),
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }).save();

    return doc.toObject();
  }

  async getVitals(patientId: string, orgId: string, limit = 20) {
    return this.medicalRecordModel
      .find({ patientId, organizationId: orgId, type: 'vital', deletedAt: null })
      .sort({ 'data.recordedAt': -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  // ── Clinical Notes ─────────────────────────────────────────────────────────

  async addClinicalNote(
    patientId: string,
    dto: CreateClinicalNoteDto,
    authorId: string,
    orgId: string,
    ctx: RequestContext,
  ) {
    await this.verifyEncounterOwnership(dto.medicalRecordId, patientId, orgId);

    const id = uuidv4();
    const now = new Date();

    const doc = await new this.medicalRecordModel({
      _id: id,
      type: 'note',
      patientId,
      encounterId: dto.medicalRecordId,
      authorId,
      organizationId: orgId,
      facilityId: null,
      data: {
        noteType: dto.noteType,
        content: dto.content,
        isAmended: false,
        amendedById: null,
        amendedAt: null,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }).save();

    await this.auditLogs.log({
      eventType: 'MEDICAL_RECORD_CREATE',
      userId: authorId,
      organizationId: orgId,
      resourceType: 'CLINICAL_NOTE',
      resourceId: id,
      action: 'ADD_CLINICAL_NOTE',
      result: 'success',
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { patientId, medicalRecordId: dto.medicalRecordId },
    });

    return doc.toObject();
  }

  async getClinicalNotes(patientId: string, orgId: string) {
    return this.medicalRecordModel
      .find({ patientId, organizationId: orgId, type: 'note', deletedAt: null })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  // ── Prescriptions ──────────────────────────────────────────────────────────

  async addPrescription(
    patientId: string,
    dto: CreatePrescriptionDto,
    prescribedById: string,
    orgId: string,
    ctx: RequestContext,
  ) {
    if (dto.medicalRecordId) {
      await this.verifyEncounterOwnership(dto.medicalRecordId, patientId, orgId);
    }

    const id = uuidv4();
    const now = new Date();

    const doc = await new this.medicalRecordModel({
      _id: id,
      type: 'prescription',
      patientId,
      encounterId: dto.medicalRecordId ?? null,
      authorId: prescribedById,
      organizationId: orgId,
      facilityId: null,
      data: {
        prescribedById,
        medicationName: dto.medicationName,
        genericName: dto.genericName ?? null,
        dosage: dto.dosage,
        frequency: dto.frequency,
        route: dto.route ?? null,
        duration: dto.duration ?? null,
        quantity: dto.quantity ?? null,
        refills: dto.refills ?? 0,
        instructions: dto.instructions ?? null,
        isActive: true,
        prescribedAt: now,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        dispensedAt: null,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }).save();

    await this.auditLogs.log({
      eventType: 'PRESCRIPTION_CREATE',
      userId: prescribedById,
      organizationId: orgId,
      resourceType: 'PRESCRIPTION',
      resourceId: id,
      action: 'ADD_PRESCRIPTION',
      result: 'success',
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: {
        patientId,
        medicationName: dto.medicationName,
        medicalRecordId: dto.medicalRecordId,
      },
    });

    return doc.toObject();
  }

  async getPrescriptions(patientId: string, orgId: string) {
    return this.medicalRecordModel
      .find({ patientId, organizationId: orgId, type: 'prescription', deletedAt: null })
      .sort({ 'data.prescribedAt': -1 })
      .lean()
      .exec();
  }

  // ── Lab Reports ────────────────────────────────────────────────────────────

  async addLabReport(
    patientId: string,
    dto: CreateLabReportDto,
    orderedById: string,
    orgId: string,
    ctx: RequestContext,
  ) {
    if (dto.medicalRecordId) {
      await this.verifyEncounterOwnership(dto.medicalRecordId, patientId, orgId);
    }

    const id = uuidv4();
    const now = new Date();

    const doc = await new this.medicalRecordModel({
      _id: id,
      type: 'lab_report',
      patientId,
      encounterId: dto.medicalRecordId ?? null,
      authorId: orderedById,
      organizationId: orgId,
      facilityId: null,
      data: {
        orderedById,
        testName: dto.testName,
        testCode: dto.testCode ?? null,
        status: 'completed',
        results: dto.results ?? null,
        normalRange: dto.normalRange ?? null,
        unit: dto.unit ?? null,
        interpretation: dto.interpretation ?? null,
        labName: dto.labName ?? null,
        reportDate: dto.reportDate ? new Date(dto.reportDate) : null,
        notes: dto.notes ?? null,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }).save();

    await this.auditLogs.log({
      eventType: 'MEDICAL_RECORD_CREATE',
      userId: orderedById,
      organizationId: orgId,
      resourceType: 'LAB_REPORT',
      resourceId: id,
      action: 'ADD_LAB_REPORT',
      result: 'success',
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { patientId, testName: dto.testName },
    });

    return doc.toObject();
  }

  async getLabReports(patientId: string, orgId: string) {
    return this.medicalRecordModel
      .find({ patientId, organizationId: orgId, type: 'lab_report', deletedAt: null })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  // ── Imaging Reports ────────────────────────────────────────────────────────

  async addImagingReport(
    patientId: string,
    dto: CreateImagingReportDto,
    orderedById: string,
    orgId: string,
    ctx: RequestContext,
  ) {
    if (dto.medicalRecordId) {
      await this.verifyEncounterOwnership(dto.medicalRecordId, patientId, orgId);
    }

    const id = uuidv4();
    const now = new Date();

    const doc = await new this.medicalRecordModel({
      _id: id,
      type: 'imaging',
      patientId,
      encounterId: dto.medicalRecordId ?? null,
      authorId: orderedById,
      organizationId: orgId,
      facilityId: null,
      data: {
        orderedById,
        imagingType: dto.imagingType,
        bodyPart: dto.bodyPart ?? null,
        indication: dto.indication ?? null,
        findings: dto.findings ?? null,
        impression: dto.impression ?? null,
        radiologistId: dto.radiologistId ?? null,
        reportDate: dto.reportDate ? new Date(dto.reportDate) : null,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }).save();

    await this.auditLogs.log({
      eventType: 'MEDICAL_RECORD_CREATE',
      userId: orderedById,
      organizationId: orgId,
      resourceType: 'IMAGING_REPORT',
      resourceId: id,
      action: 'ADD_IMAGING_REPORT',
      result: 'success',
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { patientId, imagingType: dto.imagingType },
    });

    return doc.toObject();
  }

  async getImagingReports(patientId: string, orgId: string) {
    return this.medicalRecordModel
      .find({ patientId, organizationId: orgId, type: 'imaging', deletedAt: null })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  // ── Vaccinations ───────────────────────────────────────────────────────────

  async addVaccination(
    patientId: string,
    dto: CreateVaccinationDto,
    administeredById: string,
    orgId: string,
  ) {
    const id = uuidv4();
    const now = new Date();

    const doc = await new this.medicalRecordModel({
      _id: id,
      type: 'vaccination',
      patientId,
      encounterId: null,
      authorId: administeredById,
      organizationId: orgId,
      facilityId: null,
      data: {
        administeredById,
        vaccineName: dto.vaccineName,
        vaccineCode: dto.vaccineCode ?? null,
        dose: dto.dose ?? null,
        lotNumber: dto.lotNumber ?? null,
        manufacturer: dto.manufacturer ?? null,
        administeredAt: new Date(dto.administeredAt),
        nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : null,
        site: dto.site ?? null,
        route: dto.route ?? null,
        notes: dto.notes ?? null,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }).save();

    return doc.toObject();
  }

  async getVaccinations(patientId: string, orgId: string) {
    return this.medicalRecordModel
      .find({ patientId, organizationId: orgId, type: 'vaccination', deletedAt: null })
      .sort({ 'data.administeredAt': -1 })
      .lean()
      .exec();
  }

  // ── Procedures ─────────────────────────────────────────────────────────────

  async addProcedure(
    patientId: string,
    dto: CreateProcedureDto,
    performedById: string,
    orgId: string,
    ctx: RequestContext,
  ) {
    if (dto.medicalRecordId) {
      await this.verifyEncounterOwnership(dto.medicalRecordId, patientId, orgId);
    }

    const id = uuidv4();
    const now = new Date();

    const doc = await new this.medicalRecordModel({
      _id: id,
      type: 'procedure',
      patientId,
      encounterId: dto.medicalRecordId ?? null,
      authorId: performedById,
      organizationId: orgId,
      facilityId: null,
      data: {
        performedById,
        procedureCode: dto.procedureCode ?? null,
        procedureName: dto.procedureName,
        performedAt: new Date(dto.performedAt),
        duration: dto.duration ?? null,
        notes: dto.notes ?? null,
        outcome: dto.outcome ?? null,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }).save();

    await this.auditLogs.log({
      eventType: 'MEDICAL_RECORD_CREATE',
      userId: performedById,
      organizationId: orgId,
      resourceType: 'PROCEDURE',
      resourceId: id,
      action: 'ADD_PROCEDURE',
      result: 'success',
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { patientId, procedureName: dto.procedureName },
    });

    return doc.toObject();
  }

  async getProcedures(patientId: string, orgId: string) {
    return this.medicalRecordModel
      .find({ patientId, organizationId: orgId, type: 'procedure', deletedAt: null })
      .sort({ 'data.performedAt': -1 })
      .lean()
      .exec();
  }

  // ── Full Medical History ───────────────────────────────────────────────────

  async getFullMedicalHistory(
    patientId: string,
    orgId: string,
    requestingUser: RequestingUser,
    ctx: RequestContext,
  ) {
    const baseFilter = { patientId, organizationId: orgId, deletedAt: null };

    const [
      encounters,
      diagnoses,
      vitals,
      clinicalNotes,
      prescriptions,
      labReports,
      imagingReports,
      vaccinations,
      procedures,
    ] = await Promise.all([
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'encounter' })
        .sort({ 'data.encounterDate': -1 })
        .lean()
        .exec(),
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'diagnosis' })
        .sort({ 'data.diagnosedAt': -1 })
        .lean()
        .exec(),
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'vital' })
        .sort({ 'data.recordedAt': -1 })
        .limit(50)
        .lean()
        .exec(),
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'note' })
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'prescription' })
        .sort({ 'data.prescribedAt': -1 })
        .lean()
        .exec(),
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'lab_report' })
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'imaging' })
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'vaccination' })
        .sort({ 'data.administeredAt': -1 })
        .lean()
        .exec(),
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'procedure' })
        .sort({ 'data.performedAt': -1 })
        .lean()
        .exec(),
    ]);

    await this.auditLogs.log({
      eventType: 'MEDICAL_RECORD_READ',
      userId: requestingUser.id,
      organizationId: orgId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'VIEW_FULL_HISTORY',
      result: 'success',
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      metadata: { patientId },
    });

    return {
      encounters: encounters ?? [],
      diagnoses: diagnoses ?? [],
      vitals: vitals ?? [],
      clinicalNotes: clinicalNotes ?? [],
      prescriptions: prescriptions ?? [],
      labReports: labReports ?? [],
      imagingReports: imagingReports ?? [],
      vaccinations: vaccinations ?? [],
      procedures: procedures ?? [],
    };
  }

  // ── Patient-visible record summary ──────────────────────────────────────────

  /**
   * Sanitised, aggregated summary of a patient's medical record for roles that
   * must NOT see the full clinical detail (patients, billing, etc.).
   * Confidential encounters/notes are always excluded.
   */
  async getPatientMedicalSummary(patientId: string, orgId: string, requestingUser: RequestingUser) {
    await this.verifyPatientInOrg(patientId, orgId);

    const isClinicalRole = [
      'SUPER_ADMIN',
      'ORG_ADMIN',
      'FACILITY_ADMIN',
      'DOCTOR',
      'NURSE',
    ].includes(requestingUser.role);

    const baseFilter: Record<string, unknown> = {
      patientId,
      organizationId: orgId,
      deletedAt: null,
    };

    const typeCountFilters = [
      'encounter',
      'diagnosis',
      'vital',
      'note',
      'prescription',
      'lab_report',
      'imaging',
      'vaccination',
      'procedure',
    ].map((type) => ({ ...baseFilter, type }));

    const counts = await Promise.all(
      typeCountFilters.map((f) => this.medicalRecordModel.countDocuments(f).exec()),
    );
    const [
      encounterCount,
      diagnosisCount,
      vitalCount,
      noteCount,
      prescriptionCount,
      labCount,
      imagingCount,
      vaccinationCount,
      procedureCount,
    ] = counts;

    // Active diagnoses
    const activeDiagnoses = await this.medicalRecordModel
      .find({ ...baseFilter, type: 'diagnosis', 'data.status': 'ACTIVE' })
      .sort({ 'data.diagnosedAt': -1 })
      .limit(20)
      .lean()
      .exec();

    // Latest vital (non-confidential)
    const latestVital = await this.medicalRecordModel
      .find({ ...baseFilter, type: 'vital' })
      .sort({ 'data.recordedAt': -1 })
      .limit(1)
      .lean()
      .exec()
      .then((rows) => rows[0] ?? null);

    // Active prescriptions
    const activePrescriptions = await this.medicalRecordModel
      .find({ ...baseFilter, type: 'prescription', 'data.isActive': true })
      .sort({ 'data.prescribedAt': -1 })
      .limit(20)
      .lean()
      .exec();

    // Recent lab reports / vaccinations / procedures / imaging
    const [recentLabs, recentVaccinations, recentProcedures, recentImaging] = await Promise.all([
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'lab_report' })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .exec(),
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'vaccination' })
        .sort({ 'data.administeredAt': -1 })
        .limit(5)
        .lean()
        .exec(),
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'procedure' })
        .sort({ 'data.performedAt': -1 })
        .limit(5)
        .lean()
        .exec(),
      this.medicalRecordModel
        .find({ ...baseFilter, type: 'imaging' })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .exec(),
    ]);

    // Documents count + recent metadata (from the raw collection — no schema import needed)
    const documentsCollection = this.medicalRecordModel.db.collection('documents');
    const [documentCount, recentDocuments] = await Promise.all([
      documentsCollection.countDocuments({ patientId, isDeleted: false }),
      documentsCollection
        .find({ patientId, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .project({
          _id: 1,
          originalName: 1,
          category: 1,
          sourceHospital: 1,
          uploadedById: 1,
          createdAt: 1,
        })
        .toArray(),
    ]);

    // Patient demographics + allergy alerts (from the raw collection)
    const patientCollection = this.medicalRecordModel.db.collection<{
      _id: string;
      profileId: string | null;
      mrn: string;
      firstName: string;
      lastName: string;
      dateOfBirth: Date;
      gender: string;
      bloodGroup: string | null;
      allergies: Array<{ isActive: boolean; allergen: string; severity: string | null }>;
    }>('patients');
    const patient = await patientCollection.findOne(
      { _id: patientId, organizationId: this.orgIdForPatientLookup(orgId), deletedAt: null },
      {
        projection: {
          _id: 1,
          profileId: 1,
          mrn: 1,
          firstName: 1,
          lastName: 1,
          dateOfBirth: 1,
          gender: 1,
          bloodGroup: 1,
          allergies: 1,
        },
      },
    );
    if (!patient) throw new NotFoundException('Patient not found.');

    const criticalSeverities = new Set(['SEVERE', 'LIFE_THREATENING']);
    const activeAllergies = (patient.allergies ?? []).filter((a: any) => a.isActive);
    const criticalAllergies = activeAllergies
      .filter((a: any) => criticalSeverities.has(a.severity ?? ''))
      .slice(0, 5)
      .map((a: any) => ({ allergen: a.allergen, severity: a.severity }));

    await this.auditLogs.log({
      eventType: 'MEDICAL_RECORD_READ',
      userId: requestingUser.id,
      organizationId: orgId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'VIEW_RECORD_SUMMARY',
      result: 'success',
      metadata: { patientId, role: requestingUser.role, isClinicalRole },
    });

    const pickPrescriptionSummary = (rx: any) => ({
      _id: rx._id,
      medicationName: rx.data?.medicationName,
      dosage: rx.data?.dosage,
      frequency: rx.data?.frequency,
      route: rx.data?.route,
      prescribedAt: rx.data?.prescribedAt,
      expiresAt: rx.data?.expiresAt,
    });

    const pickLabSummary = (lab: any) => ({
      _id: lab._id,
      testName: lab.data?.testName,
      status: lab.data?.status,
      reportDate: lab.data?.reportDate,
      interpretation: lab.data?.interpretation,
    });

    const pickVaccinationSummary = (v: any) => ({
      _id: v._id,
      vaccineName: v.data?.vaccineName,
      dose: v.data?.dose,
      administeredAt: v.data?.administeredAt,
    });

    const pickProcedureSummary = (p: any) => ({
      _id: p._id,
      procedureName: p.data?.procedureName,
      performedAt: p.data?.performedAt,
      outcome: p.data?.outcome,
    });

    const pickImagingSummary = (i: any) => ({
      _id: i._id,
      imagingType: i.data?.imagingType,
      bodyPart: i.data?.bodyPart,
      reportDate: i.data?.reportDate,
      impression: i.data?.impression,
    });

    const pickDiagnosisSummary = (d: any) => ({
      _id: d._id,
      diagnosisName: d.data?.diagnosisName,
      diagnosisCode: d.data?.diagnosisCode ?? null,
      severity: d.data?.severity ?? null,
      status: d.data?.status ?? 'ACTIVE',
      diagnosedAt: d.data?.diagnosedAt,
    });

    return {
      patientId,
      patient: {
        profileId: patient.profileId ?? null,
        mrn: patient.mrn,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        bloodGroup: patient.bloodGroup ?? null,
      },
      isClinicalRole,
      totals: {
        encounters: encounterCount,
        diagnoses: diagnosisCount,
        vitals: vitalCount,
        notes: noteCount,
        prescriptions: prescriptionCount,
        labReports: labCount,
        imaging: imagingCount,
        vaccinations: vaccinationCount,
        procedures: procedureCount,
        documents: documentCount,
      },
      activeDiagnoses: (activeDiagnoses ?? []).map(pickDiagnosisSummary),
      latestVital: latestVital
        ? {
            recordedAt: latestVital.data?.recordedAt,
            bloodPressureSystolic: latestVital.data?.bloodPressureSystolic ?? null,
            bloodPressureDiastolic: latestVital.data?.bloodPressureDiastolic ?? null,
            heartRate: latestVital.data?.heartRate ?? null,
            oxygenSaturation: latestVital.data?.oxygenSaturation ?? null,
            temperature: latestVital.data?.temperature ?? null,
            respiratoryRate: latestVital.data?.respiratoryRate ?? null,
            weight: latestVital.data?.weight ?? null,
            height: latestVital.data?.height ?? null,
            bmi: latestVital.data?.bmi ?? null,
          }
        : null,
      activePrescriptions: (activePrescriptions ?? []).map(pickPrescriptionSummary),
      recentLabReports: (recentLabs ?? []).map(pickLabSummary),
      recentVaccinations: (recentVaccinations ?? []).map(pickVaccinationSummary),
      recentProcedures: (recentProcedures ?? []).map(pickProcedureSummary),
      recentImagingReports: (recentImaging ?? []).map(pickImagingSummary),
      allergies: {
        activeAllergiesCount: activeAllergies.length,
        criticalAllergies,
      },
      recentDocuments: (recentDocuments ?? []).map((d: any) => ({
        _id: d._id,
        originalName: d.originalName,
        category: d.category ?? null,
        sourceHospital: d.sourceHospital ?? null,
        uploadedBy: d.uploadedById ?? null,
        uploadedAt: d.createdAt,
      })),
      note: isClinicalRole
        ? undefined
        : 'You are viewing a summary. Contact your provider for full medical records.',
    };
  }
}
