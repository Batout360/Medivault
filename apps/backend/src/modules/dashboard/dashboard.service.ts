import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { PATIENT_ROLES } from '@medivault/shared';

export interface DashboardStats {
  totalPatients: number;
  patientsTrend: number;
  todayRegistrations: number;
  activeStaff: number;
  pendingLabReports: number;
  fingerprintScansToday: number;
  recentAlerts: number;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async getStats(organizationId: string): Promise<DashboardStats> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const patients = this.connection.collection('patients');
    const users = this.connection.collection('users');
    const docs = this.connection.collection('medical_records');
    const audits = this.connection.collection('audit_logs');

    const [
      totalPatients,
      registrations30d,
      registrationsPrev30d,
      todayRegistrations,
      activeStaff,
      labReports,
      fingerprintScansToday,
      recentAlerts,
    ] = await Promise.all([
      patients.countDocuments({ organizationId, deletedAt: null }),
      patients.countDocuments({
        organizationId,
        deletedAt: null,
        registeredAt: { $gte: thirtyDaysAgo },
      }),
      patients.countDocuments({
        organizationId,
        deletedAt: null,
        registeredAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
      }),
      patients.countDocuments({
        organizationId,
        deletedAt: null,
        registeredAt: { $gte: startOfToday },
      }),
      users.countDocuments({
        organizationId,
        isActive: true,
        deletedAt: null,
        role: { $nin: PATIENT_ROLES },
      }),
      docs.countDocuments({
        organizationId,
        type: 'lab_report',
        deletedAt: null,
      }),
      audits.countDocuments({
        organizationId,
        createdAt: { $gte: startOfToday },
        action: { $in: ['IDENTIFY_BIOMETRIC', 'ENROLL_BIOMETRIC'] },
      }),
      audits.countDocuments({
        createdAt: { $gte: last24h },
        $or: [{ result: 'failure' }, { result: 'security_event' }, { severity: { $ne: null } }],
      }),
    ]);

    const patientsTrend =
      registrationsPrev30d === 0
        ? registrations30d > 0
          ? 100
          : 0
        : Math.round(((registrations30d - registrationsPrev30d) / registrationsPrev30d) * 100);

    return {
      totalPatients,
      patientsTrend,
      todayRegistrations,
      activeStaff,
      pendingLabReports: labReports,
      fingerprintScansToday,
      recentAlerts,
    };
  }
}
