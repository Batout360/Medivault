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
  /** Row served by findOne — drives the ownership checks. */
  foundById: unknown = null,
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
  const makeChain = (rows: unknown) => {
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
  // Some callers await the Query directly (the encounter ownership check) while
  // others chain .lean().exec(), so the stub is both the row and its own chain.
  model.findOne = jest.fn(() => {
    if (!foundById) return makeChain(null);
    return Object.assign(
      { ...foundById },
      makeChain(foundById) as unknown as Record<string, unknown>,
    );
  });

  const updateOne = jest.fn(() => ({
    exec: jest.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 }),
  }));
  model.updateOne = updateOne;

  const auditLogs = { log: jest.fn().mockResolvedValue(undefined) };
  const userFind = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(users) }),
    }),
  });
  const userModel: any = { find: userFind };
  const patientModel: any = {
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 1 }),
  };

  return {
    service: new MedicalRecordsService(model, patientModel, userModel, auditLogs as any),
    collections,
    model,
    userFind,
    save,
    find,
    findOne: model.findOne,
    updateOne,
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

/**
 * Doctors must be able to change, end and restart a prescription. The record is
 * a polymorphic medical-records document, so the three operations are all
 * `$set`s on `data.*` — the invariants worth pinning down are that only the
 * supplied keys are written, and that `isActive` never drifts from the
 * `endedAt` / `endReason` pair describing it.
 */
describe('MedicalRecordsService — prescription lifecycle', () => {
  const RX_ID = 'rx-1';
  /** The acting clinician, as the service receives it. */
  const DOCTOR = { id: 'doc-1', role: 'DOCTOR', organizationId: PATIENT_ORG };
  /** The same clinician as the users collection stores them. */
  const DOCTOR_USER = { _id: 'doc-1', firstName: 'Anita', lastName: 'Sharma', role: 'DOCTOR' };

  const ACTIVE_RX = {
    _id: RX_ID,
    type: 'prescription',
    patientId: 'patient-1',
    organizationId: PATIENT_ORG,
    authorId: 'doc-1',
    data: {
      medicationName: 'Metformin',
      dosage: '500 mg',
      frequency: 'twice daily',
      isActive: true,
    },
  };

  function withPrescription(record: Record<string, unknown> | null = ACTIVE_RX) {
    return makeService(
      { organizationId: PATIENT_ORG },
      [DOCTOR_USER],
      {},
      record as Record<string, unknown> | null,
    );
  }

  /** The `$set` payload of the single updateOne call the service issued. */
  function writtenUpdates(updateOne: jest.Mock): Record<string, unknown> {
    expect(updateOne).toHaveBeenCalledTimes(1);
    return updateOne.mock.calls[0][1].$set as Record<string, unknown>;
  }

  it('scopes the lookup to the patient, organisation and record type', async () => {
    const { service, findOne } = withPrescription();

    await service.updatePrescription(RX_ID, { dosage: '850 mg' }, 'patient-1', PATIENT_ORG, DOCTOR, ctx);

    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: RX_ID,
        patientId: 'patient-1',
        organizationId: PATIENT_ORG,
        type: 'prescription',
        deletedAt: null,
      }),
    );
  });

  it('refuses to change a prescription that is not in the caller’s scope', async () => {
    const { service, updateOne } = withPrescription(null);

    await expect(
      service.updatePrescription(RX_ID, { dosage: '850 mg' }, 'patient-1', PATIENT_ORG, DOCTOR, ctx),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('writes only the fields the clinician changed', async () => {
    const { service, updateOne } = withPrescription();

    await service.updatePrescription(
      RX_ID,
      { dosage: '850 mg', duration: '14 days' },
      'patient-1',
      PATIENT_ORG,
      DOCTOR,
      ctx,
    );

    const updates = writtenUpdates(updateOne);
    expect(updates['data.dosage']).toBe('850 mg');
    expect(updates['data.duration']).toBe('14 days');
    // Untouched keys must be absent — writing them would blank the rest of the order.
    expect(updates).not.toHaveProperty('data.medicationName');
    expect(updates).not.toHaveProperty('data.frequency');
    expect(updates).not.toHaveProperty('data.instructions');
  });

  it('clears expiresAt when the clinician blanks the expiry date', async () => {
    const { service, updateOne } = withPrescription();

    await service.updatePrescription(
      RX_ID,
      { expiresAt: '' as unknown as string },
      'patient-1',
      PATIENT_ORG,
      DOCTOR,
      ctx,
    );

    // An empty string is falsy, so it clears rather than becoming an invalid Date.
    expect(writtenUpdates(updateOne)['data.expiresAt']).toBeNull();
  });

  it('records the fields it changed in the audit log', async () => {
    const { service, auditLogs } = withPrescription();

    await service.updatePrescription(
      RX_ID,
      { dosage: '850 mg' },
      'patient-1',
      PATIENT_ORG,
      DOCTOR,
      ctx,
    );

    expect(auditLogs.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PRESCRIPTION_UPDATE',
        action: 'UPDATE_PRESCRIPTION',
        resourceId: RX_ID,
        metadata: expect.objectContaining({ changes: ['dosage'] }),
      }),
    );
  });

  it('ends a prescription, stamping when it stopped and why', async () => {
    const { service, updateOne } = withPrescription();

    await service.endPrescription(
      RX_ID,
      { reason: 'Course completed' },
      'patient-1',
      PATIENT_ORG,
      DOCTOR,
      ctx,
    );

    const updates = writtenUpdates(updateOne);
    expect(updates['data.isActive']).toBe(false);
    expect(updates['data.endReason']).toBe('Course completed');
    expect(updates['data.endedAt']).toBeInstanceOf(Date);
  });

  it('honours an explicit end date supplied by the clinician', async () => {
    const { service, updateOne } = withPrescription();

    await service.endPrescription(
      RX_ID,
      { reason: 'Adverse reaction', endedAt: '2026-10-01T00:00:00.000Z' },
      'patient-1',
      PATIENT_ORG,
      DOCTOR,
      ctx,
    );

    const updates = writtenUpdates(updateOne);
    expect((updates['data.endedAt'] as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(updates['data.isActive']).toBe(false);
  });

  it('keeps the original end date when a prescription is ended twice', async () => {
    const endedRx = {
      ...ACTIVE_RX,
      data: { ...ACTIVE_RX.data, isActive: false, endedAt: '2026-09-01T00:00:00.000Z' },
    };
    const { service, updateOne } = withPrescription(endedRx);

    await service.endPrescription(RX_ID, {}, 'patient-1', PATIENT_ORG, DOCTOR, ctx);

    const updates = writtenUpdates(updateOne);
    expect(updates['data.isActive']).toBe(false);
    expect((updates['data.endedAt'] as Date).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('never leaves isActive false without an end date', async () => {
    const endedRx = {
      ...ACTIVE_RX,
      data: { ...ACTIVE_RX.data, isActive: false, endedAt: '2026-09-01T00:00:00.000Z' },
    };
    const { service, updateOne } = withPrescription(endedRx);

    // isActive flipped through the generic update route rather than /end.
    await service.updatePrescription(
      RX_ID,
      { isActive: false },
      'patient-1',
      PATIENT_ORG,
      DOCTOR,
      ctx,
    );

    const updates = writtenUpdates(updateOne);
    expect(updates['data.isActive']).toBe(false);
    expect(updates['data.endedAt']).toBeInstanceOf(Date);
  });

  it('restores an ended prescription and clears its end trail', async () => {
    const endedRx = {
      ...ACTIVE_RX,
      data: {
        ...ACTIVE_RX.data,
        isActive: false,
        endedAt: '2026-09-01T00:00:00.000Z',
        endReason: 'Course completed',
      },
    };
    const { service, updateOne } = withPrescription(endedRx);

    await service.reactivatePrescription(RX_ID, 'patient-1', PATIENT_ORG, DOCTOR, ctx);

    const updates = writtenUpdates(updateOne);
    expect(updates['data.isActive']).toBe(true);
    expect(updates['data.endedAt']).toBeNull();
    expect(updates['data.endReason']).toBeNull();
  });

  it('audits ending and restarting separately', async () => {
    const { service, auditLogs } = withPrescription();

    await service.endPrescription(RX_ID, {}, 'patient-1', PATIENT_ORG, DOCTOR, ctx);
    await service.reactivatePrescription(RX_ID, 'patient-1', PATIENT_ORG, DOCTOR, ctx);

    expect(auditLogs.log).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ eventType: 'PRESCRIPTION_END', action: 'END_PRESCRIPTION' }),
    );
    expect(auditLogs.log).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action: 'REACTIVATE_PRESCRIPTION' }),
    );
  });
});
