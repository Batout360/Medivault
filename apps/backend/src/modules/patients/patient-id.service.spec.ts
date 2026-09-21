import { PatientIdService } from './patient-id.service';

describe('PatientIdService (format / normalize)', () => {
  it('formats a canonical MV-YYYY-NNNNNN label', () => {
    expect(PatientIdService.format('2026', 1)).toBe('MV-2026-000001');
    expect(PatientIdService.format('2026', 184)).toBe('MV-2026-000184');
    expect(PatientIdService.format('2026', 999999)).toBe('MV-2026-999999');
  });

  it('normalizes user-typed patient IDs to the canonical form', () => {
    expect(PatientIdService.normalize('MV-2026-000184')).toBe('MV-2026-000184');
    expect(PatientIdService.normalize('mv 2026 184')).toBe('MV-2026-000184');
    expect(PatientIdService.normalize('MV2026000184')).toBe('MV-2026-000184');
    expect(PatientIdService.normalize('mv-2026-000184')).toBe('MV-2026-000184');
  });

  it('rejects malformed patient IDs', () => {
    expect(PatientIdService.normalize('MV-2026-XXXXXX')).toBeNull();
    expect(PatientIdService.normalize('2026-000184')).toBeNull();
    expect(PatientIdService.normalize('')).toBeNull();
    expect(PatientIdService.normalize('MV-ABC-000001')).toBeNull();
  });

  it('increments the counter atomically (race-safe sequence)', async () => {
    const findOneAndUpdateStub = () => {
      const stub: any = {
        lean: jest.fn(() => stub),
        exec: jest.fn(async () => ({ _id: '2026', seq: 42 })),
      };
      return stub;
    };
    const counterModel = {
      updateOne: jest.fn().mockResolvedValue({}),
      findOneAndUpdate: jest.fn(findOneAndUpdateStub),
    } as any;

    const service = new PatientIdService(counterModel);
    await expect(service.next()).resolves.toBe('MV-2026-000042');
    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '2026' },
      { $inc: { seq: 1 } },
      { new: true },
    );
  });
});
