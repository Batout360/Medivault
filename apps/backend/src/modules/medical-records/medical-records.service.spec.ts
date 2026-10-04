/**
 * Unit tests for MedicalRecordsService organisation resolution.
 *
 * Regression: SUPER_ADMIN accounts are platform-level and carry
 * `organizationId === null`. The controller coerced that to `''`, which the
 * non-nullable `MedicalRecord.organizationId` path rejected with a Mongoose
 * ValidationError — surfacing as a 500 on every clinical write — and which
 * matched zero documents on every read.
 */

import { NotFoundException } from '@nestjs/common';
import { MedicalRecordsService } from './medical-records.service';

interface Collections {
  patients: { findOne: jest.Mock };
}

const PATIENT_ORG = 'org-patient';
const REQUESTER_ORG = 'org-requester';

function makeService(patient: { organizationId?: string | null } | null) {
  const collections: Collections = {
    patients: { findOne: jest.fn().mockResolvedValue(patient) },
  };

  const save = jest.fn().mockImplementation(function (this: any) {
    return Promise.resolve({ toObject: () => this });
  });

  const model: any = jest.fn(function (this: any, doc: unknown) {
    Object.assign(this, doc);
    this.save = save;
  });
  model.db = { collection: jest.fn((name: string) => collections[name as keyof Collections]) };

  const find = jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ exec: jest.fn() }) }),
  });
  model.find = find;
  model.findOne = jest.fn();

  const auditLogs = { log: jest.fn().mockResolvedValue(undefined) };

  return {
    service: new MedicalRecordsService(model, auditLogs as any),
    collections,
    model,
    save,
    find,
    auditLogs,
  };
}

const ctx = { ip: '127.0.0.1', userAgent: 'jest', requestId: 'req-1' };

describe('MedicalRecordsService.resolveOrgId', () => {
  it('returns the requester organisation for tenant actors without hitting the database', async () => {
    const { service, collections } = makeService({ organizationId: PATIENT_ORG });

    await expect(service.resolveOrgId('patient-1', REQUESTER_ORG)).resolves.toBe(REQUESTER_ORG);
    expect(collections.patients.findOne).not.toHaveBeenCalled();
  });

  it("inherits the patient's organisation for platform actors (SUPER_ADMIN)", async () => {
    const { service } = makeService({ organizationId: PATIENT_ORG });

    await expect(service.resolveOrgId('patient-1', null)).resolves.toBe(PATIENT_ORG);
  });

  it('resolves to null for an unassigned patient rather than an empty string', async () => {
    const { service } = makeService({ organizationId: null });

    const orgId = await service.resolveOrgId('patient-1', null);

    expect(orgId).toBeNull();
    expect(orgId).not.toBe('');
  });

  it('throws NotFound for an unknown patient instead of writing a phantom record', async () => {
    const { service } = makeService(null);

    await expect(service.resolveOrgId('missing', null)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MedicalRecordsService writes — organisation attribution', () => {
  it('persists a non-empty organisationId for SUPER_ADMIN (regression: was a 500)', async () => {
    const { service, save, model } = makeService({ organizationId: PATIENT_ORG });
    const orgId = await service.resolveOrgId('patient-1', null);

    await service.addLabReport(
      'patient-1',
      { testName: 'Complete Blood Count' } as any,
      'user-1',
      orgId,
      ctx,
    );

    expect(model).toHaveBeenCalledWith(expect.objectContaining({ organizationId: PATIENT_ORG }));
    expect(save).toHaveBeenCalled();
  });

  it('persists a null organisationId without a validation error when the patient is unassigned', async () => {
    const { service, model } = makeService({ organizationId: null });
    const orgId = await service.resolveOrgId('patient-1', null);

    await service.addPrescription(
      'patient-1',
      {
        medicationName: 'Metformin',
        dosage: '500 mg',
        frequency: 'twice daily',
        route: 'ORAL',
      } as any,
      'user-1',
      orgId,
      ctx,
    );

    expect(model).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: null, type: 'prescription' }),
    );
  });
});

describe('MedicalRecordsService reads — organisation scoping', () => {
  it('scopes list queries to the resolved organisation', async () => {
    const { service, find } = makeService({ organizationId: PATIENT_ORG });
    const orgId = await service.resolveOrgId('patient-1', null);

    await service.getLabReports('patient-1', orgId);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'patient-1', organizationId: PATIENT_ORG }),
    );
  });
});
