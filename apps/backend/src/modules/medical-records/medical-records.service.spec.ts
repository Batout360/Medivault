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

function makeService(
  patient: { organizationId?: string | null } | null,
  users: Array<{ _id: string; firstName?: string; lastName?: string; role?: string }> = [],
  recordsByType: Record<string, unknown[]> = {},
) {
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

  // Chainable query stub: every link returns the chain, so any
  // .find().sort().skip().limit().select().lean().exec() combination resolves.
  const makeChain = (rows: unknown[]) => {
    const chain: Record<string, jest.Mock> = {};
    for (const method of ['sort', 'skip', 'limit', 'select', 'lean']) {
      chain[method] = jest.fn(() => chain);
    }
    chain['exec'] = jest.fn().mockResolvedValue(rows);
    return chain;
  };

  const find = jest.fn((filter: { type?: string } = {}) =>
    makeChain(recordsByType[filter.type ?? ''] ?? []),
  );
  model.find = find;
  model.findOne = jest.fn();

  const auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
  const userFind = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(users) }),
    }),
  });
  const userModel: any = { find: userFind };

  return {
    service: new MedicalRecordsService(model, userModel, auditLogs as any),
    collections,
    model,
    userFind,
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

/**
 * Regression: clinical records only persisted the clinician's user id, so the
 * UI had nothing to render for "who prescribed this" / "who diagnosed this".
 */
describe('MedicalRecordsService reads — author attribution', () => {
  const DOCTOR = { _id: 'doc-1', firstName: 'Anita', lastName: 'Sharma', role: 'DOCTOR' };

  /** Serves the supplied rows for each record type queried. */
  function withRecords(
    recordsByType: Record<string, Array<Record<string, unknown>>>,
    users: Array<Record<string, unknown>>,
  ) {
    return makeService({ organizationId: PATIENT_ORG }, users as any, recordsByType);
  }

  it('resolves the author name and role onto prescription records', async () => {
    const { service } = withRecords(
      {
        prescription: [
          { _id: 'r1', type: 'prescription', authorId: 'doc-1', data: { prescribedById: 'doc-1' } },
        ],
      },
      [DOCTOR],
    );

    const [record] = await service.getPrescriptions('patient-1', PATIENT_ORG);

    expect(record.authorName).toBe('Anita Sharma');
    expect(record.authorRole).toBe('DOCTOR');
    expect(record.authorLabel).toBe('Prescribed by');
  });

  it('resolves the author onto diagnosis records', async () => {
    const { service } = withRecords(
      { diagnosis: [{ _id: 'r1', type: 'diagnosis', authorId: 'doc-1', data: {} }] },
      [DOCTOR],
    );

    const [record] = await service.getDiagnoses('patient-1', PATIENT_ORG);

    expect(record.authorName).toBe('Anita Sharma');
    expect(record.authorLabel).toBe('Diagnosed by');
  });

  it('uses one user query for a whole page of records', async () => {
    const { service, userFind } = withRecords(
      {
        prescription: [
          { _id: 'r1', type: 'prescription', authorId: 'doc-1', data: {} },
          { _id: 'r2', type: 'prescription', authorId: 'doc-1', data: {} },
          { _id: 'r3', type: 'prescription', authorId: 'doc-2', data: {} },
        ],
      },
      [DOCTOR, { _id: 'doc-2', firstName: 'Raj', lastName: 'Patel', role: 'DOCTOR' }],
    );

    await service.getPrescriptions('patient-1', PATIENT_ORG);

    expect(userFind).toHaveBeenCalledTimes(1);
    expect(userFind.mock.calls[0][0]._id.$in).toEqual(expect.arrayContaining(['doc-1', 'doc-2']));
  });

  it('de-duplicates repeated author ids', async () => {
    const { service, userFind } = withRecords(
      {
        prescription: Array.from({ length: 5 }, (_, i) => ({
          _id: `r${i}`,
          type: 'prescription',
          authorId: 'doc-1',
          data: { prescribedById: 'doc-1' },
        })),
      },
      [DOCTOR],
    );

    await service.getPrescriptions('patient-1', PATIENT_ORG);

    expect(userFind.mock.calls[0][0]._id.$in).toEqual(['doc-1']);
  });

  it('leaves the author null when the account has been deleted', async () => {
    const { service } = withRecords(
      { prescription: [{ _id: 'r1', type: 'prescription', authorId: 'ghost', data: {} }] },
      [],
    );

    const [record] = await service.getPrescriptions('patient-1', PATIENT_ORG);

    expect(record.authorName).toBeNull();
    expect(record.authorRole).toBeNull();
    expect(record.authorLabel).toBe('Prescribed by');
  });

  it('resolves all nine history collections with a single user query', async () => {
    const types = [
      'encounter',
      'diagnosis',
      'vital',
      'note',
      'prescription',
      'lab_report',
      'imaging',
      'vaccination',
      'procedure',
    ];
    const { service, userFind } = withRecords(
      Object.fromEntries(
        types.map((type) => [
          type,
          [
            { _id: `r-${type}-1`, type, authorId: 'doc-1', data: {} },
            { _id: `r-${type}-2`, type, authorId: 'doc-2', data: {} },
          ],
        ]),
      ),
      [DOCTOR, { _id: 'doc-2', firstName: 'Raj', lastName: 'Patel', role: 'DOCTOR' }],
    );

    await service.getFullMedicalHistory(
      'patient-1',
      PATIENT_ORG,
      { id: 'user-1', role: 'DOCTOR', organizationId: PATIENT_ORG },
      ctx,
    );

    expect(userFind).toHaveBeenCalledTimes(1);
    expect(userFind.mock.calls[0][0]._id.$in).toEqual(['doc-1', 'doc-2']);
  });

  it('skips the user query entirely when there are no records', async () => {
    const { service, userFind } = withRecords({}, [DOCTOR]);

    await service.getPrescriptions('patient-1', PATIENT_ORG);

    expect(userFind).not.toHaveBeenCalled();
  });

  it('labels every supported record type', async () => {
    const expected: Record<string, string> = {
      encounter: 'Seen by',
      diagnosis: 'Diagnosed by',
      vital: 'Recorded by',
      note: 'Noted by',
      prescription: 'Prescribed by',
      lab_report: 'Ordered by',
      imaging: 'Reported by',
      vaccination: 'Administered by',
      procedure: 'Performed by',
    };

    const { service } = withRecords(
      Object.fromEntries(
        Object.keys(expected).map((type) => [
          type,
          [{ _id: `r-${type}`, type, authorId: 'doc-1', data: {} }],
        ]),
      ),
      [DOCTOR],
    );

    const records = await service.getFullMedicalHistory(
      'patient-1',
      PATIENT_ORG,
      { id: 'user-1', role: 'DOCTOR', organizationId: PATIENT_ORG },
      ctx,
    );

    const all = Object.values(records).flat() as Array<{
      type: string;
      authorLabel: string;
      authorName: string;
    }>;
    expect(all).toHaveLength(Object.keys(expected).length);
    for (const record of all) {
      expect(record.authorLabel).toBe(expected[record.type]);
      expect(record.authorName).toBe('Anita Sharma');
    }
  });
});
