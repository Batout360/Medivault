/**
 * Unit tests for PatientsService.findAll query construction.
 *
 * Regression 1 — the `q` parameter was accepted by PatientSearchDto but never
 * applied to the Mongo filter, so typing in the Users search box returned the
 * entire patient list.
 *
 * Regression 2 — blood groups exist in two spellings ("A+" from self-registration,
 * "A_POSITIVE" from staff registration). The filter mapped only the display
 * symbol to the enum, so rows holding the symbol were unreachable, and rows
 * holding the enum leaked that raw string into the UI.
 */

import { PatientsService } from './patients.service';

interface Captured {
  countFilter: Record<string, unknown> | null;
  findFilter: Record<string, unknown> | null;
}

function makeService(rows: unknown[] = []) {
  const captured: Captured = { countFilter: null, findFilter: null };

  const lean = jest.fn().mockResolvedValue(rows);
  const limit = jest.fn().mockReturnValue({ lean });
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip });
  const select = jest.fn().mockReturnValue({ sort });

  const model: any = {
    countDocuments: jest.fn((filter: Record<string, unknown>) => {
      captured.countFilter = filter;
      return Promise.resolve(rows.length);
    }),
    find: jest.fn((filter: Record<string, unknown>) => {
      captured.findFilter = filter;
      return { select };
    }),
  };

  const service = new PatientsService(model, {} as any, {} as any, { log: jest.fn() } as any);

  return { service, model, captured };
}

const superAdmin = { id: 'user-1', role: 'SUPER_ADMIN' };

describe('PatientsService.findAll — text search', () => {
  it('applies a case-insensitive $or across name, MRN, profileId, phone and email', async () => {
    const { service, captured } = makeService();

    await service.findAll(null, undefined, { q: 'yakuza' } as any, superAdmin);

    const or = captured.findFilter?.$or as Record<string, RegExp>[];
    expect(Array.isArray(or)).toBe(true);
    expect(or).toHaveLength(6);
    expect(Object.keys(or[0])).toEqual(['firstName']);
    for (const clause of or) {
      expect(clause[Object.keys(clause)[0]]).toBeInstanceOf(RegExp);
      expect(clause[Object.keys(clause)[0]].flags).toContain('i');
    }
  });

  it('matches the search term across every searchable field', async () => {
    const { service, captured } = makeService();

    await service.findAll(null, undefined, { q: 'abc' } as any, superAdmin);

    const or = captured.findFilter?.$or as Record<string, RegExp>[];
    const fields = or.map((clause) => Object.keys(clause)[0]);
    expect(fields).toEqual(['firstName', 'lastName', 'mrn', 'profileId', 'phoneNumber', 'email']);
  });

  it('escapes regex metacharacters so user input cannot inject a pattern', async () => {
    const { service, captured } = makeService();

    await service.findAll(null, undefined, { q: 'a.*b' } as any, superAdmin);

    const or = captured.findFilter?.$or as Record<string, RegExp>[];
    expect(or[0].firstName.source).toBe('a\\.\\*b');
  });

  it('omits $or entirely when no search term is supplied', async () => {
    const { service, captured } = makeService();

    await service.findAll(null, undefined, {} as any, superAdmin);

    expect(captured.findFilter).not.toHaveProperty('$or');
  });

  it('uses the identical filter for the count and the page query', async () => {
    const { service, captured } = makeService();

    await service.findAll(null, undefined, { q: 'smith' } as any, superAdmin);

    expect(captured.countFilter).toEqual(captured.findFilter);
  });
});

describe('PatientsService.findAll — blood group filter', () => {
  it('matches both the enum and symbol spelling for a display filter value', async () => {
    const { service, captured } = makeService();

    await service.findAll(null, undefined, { bloodGroup: 'A-' } as any, superAdmin);

    expect(captured.findFilter?.bloodGroup).toEqual({
      $in: ['A_NEGATIVE', 'A-'],
    });
  });

  it('accepts the stored enum spelling as the filter value', async () => {
    const { service, captured } = makeService();

    await service.findAll(null, undefined, { bloodGroup: 'A_POSITIVE' } as any, superAdmin);

    expect(captured.findFilter?.bloodGroup).toEqual({
      $in: ['A_POSITIVE', 'A+'],
    });
  });

  it('covers every supported blood group', async () => {
    const { service, captured } = makeService();

    for (const symbol of ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) {
      await service.findAll(null, undefined, { bloodGroup: symbol } as any, superAdmin);
      expect(captured.findFilter?.bloodGroup).toEqual({
        $in: [expect.any(String), symbol],
      });
    }
  });

  it('falls back to an exact match for an unrecognised value', async () => {
    const { service, captured } = makeService();

    await service.findAll(null, undefined, { bloodGroup: 'WEIRD' } as any, superAdmin);

    expect(captured.findFilter?.bloodGroup).toBe('WEIRD');
  });
});

describe('PatientsService.findAll — tenancy scoping', () => {
  it('does not scope by organisation for SUPER_ADMIN', async () => {
    const { service, captured } = makeService();

    await service.findAll(null, undefined, {} as any, superAdmin);

    expect(captured.findFilter).not.toHaveProperty('organizationId');
  });

  it('scopes by organisation for tenant actors', async () => {
    const { service, captured } = makeService();

    await service.findAll('org-1', undefined, {} as any, {
      id: 'user-2',
      role: 'DOCTOR',
    });

    expect(captured.findFilter?.organizationId).toBe('org-1');
  });
});
