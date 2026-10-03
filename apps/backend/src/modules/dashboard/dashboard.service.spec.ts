/**
 * Unit tests for DashboardService tenant scoping.
 *
 * Regression: SUPER_ADMIN accounts are platform-level and carry
 * `organizationId === null`. The controller used to coerce that to `''`, which
 * matched zero documents in every query and made all four stat cards read 0.
 */

import { DashboardService } from './dashboard.service';

type Query = Record<string, any>;

interface Collections {
  patients: { countDocuments: jest.Mock };
  users: { countDocuments: jest.Mock };
  medical_records: { countDocuments: jest.Mock };
  audit_logs: { countDocuments: jest.Mock };
}

function makeService(counts?: Partial<Record<keyof Collections, number>>) {
  const make = (name: keyof Collections) => ({
    countDocuments: jest.fn().mockResolvedValue(counts?.[name] ?? 0),
  });

  const collections: Collections = {
    patients: make('patients'),
    users: make('users'),
    medical_records: make('medical_records'),
    audit_logs: make('audit_logs'),
  };

  const connection = { collection: jest.fn((name: string) => collections[name as keyof Collections]) };
  return { service: new DashboardService(connection as any), collections, connection };
}

const firstPatientQuery = (c: Collections): Query => c.patients.countDocuments.mock.calls[0][0];
const auditQueries = (c: Collections): Query[] =>
  c.audit_logs.countDocuments.mock.calls.map((call) => call[0] as Query);

describe('DashboardService.getStats — tenant scoping', () => {
  it('scopes every query to the caller organization for tenant roles', async () => {
    const { service, collections } = makeService();

    await service.getStats('org-1', 'ORG_ADMIN');

    expect(firstPatientQuery(collections)).toMatchObject({ organizationId: 'org-1' });
    expect(collections.users.countDocuments.mock.calls[0][0]).toMatchObject({
      organizationId: 'org-1',
    });
    expect(collections.medical_records.countDocuments.mock.calls[0][0]).toMatchObject({
      organizationId: 'org-1',
    });
    for (const query of auditQueries(collections)) {
      expect(query.organizationId).toBe('org-1');
    }
  });

  it('does NOT org-scope for SUPER_ADMIN (whose organizationId is null)', async () => {
    const { service, collections } = makeService();

    await service.getStats(null, 'SUPER_ADMIN');

    expect(firstPatientQuery(collections)).not.toHaveProperty('organizationId');
    expect(collections.users.countDocuments.mock.calls[0][0]).not.toHaveProperty('organizationId');
    expect(collections.medical_records.countDocuments.mock.calls[0][0]).not.toHaveProperty(
      'organizationId',
    );
    for (const query of auditQueries(collections)) {
      expect(query).not.toHaveProperty('organizationId');
    }
  });

  it('never emits an empty-string organizationId filter', async () => {
    const { service, collections } = makeService();

    await service.getStats(null, 'SUPER_ADMIN');

    const filters = [
      ...collections.patients.countDocuments.mock.calls,
      ...collections.users.countDocuments.mock.calls,
      ...collections.medical_records.countDocuments.mock.calls,
      ...collections.audit_logs.countDocuments.mock.calls,
    ].map((call) => call[0] as Query);

    expect(filters.length).toBeGreaterThan(0);
    for (const filter of filters) {
      expect(filter.organizationId).not.toBe('');
    }
  });

  it('keeps non-super-admin callers with no organization scoped to null (no cross-tenant leak)', async () => {
    const { service, collections } = makeService();

    await service.getStats(null, 'DOCTOR');

    expect(firstPatientQuery(collections)).toMatchObject({ organizationId: null });
  });

  it('returns the counted values', async () => {
    const { service } = makeService({
      patients: 42,
      users: 7,
      medical_records: 3,
      audit_logs: 5,
    });

    const stats = await service.getStats('org-1', 'ORG_ADMIN');

    expect(stats).toMatchObject({
      totalPatients: 42,
      activeStaff: 7,
      pendingLabReports: 3,
      fingerprintScansToday: 5,
      recentAlerts: 5,
    });
    expect(typeof stats.patientsTrend).toBe('number');
    expect(typeof stats.todayRegistrations).toBe('number');
  });

  it('computes patientsTrend from the 30d vs prior-30d registration windows', async () => {
    const { service, collections } = makeService();
    // 1st call = total, 2nd = last 30d, 3rd = prior 30d, 4th = today
    collections.patients.countDocuments
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(30)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(4);

    const stats = await service.getStats('org-1', 'ORG_ADMIN');

    expect(stats.patientsTrend).toBe(50);
    expect(stats.todayRegistrations).toBe(4);
    expect(stats.totalPatients).toBe(100);
  });
});