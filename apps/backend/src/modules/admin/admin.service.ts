import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalPatients: number;
  biometricEnrollments: number;
  securityEvents24h: number;
  failedLogins24h: number;
  storageUsedMb: number;
  databaseSizeMb: number | null;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async getStats(organizationId: string): Promise<AdminStats> {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const users = this.connection.collection('users');
    const patients = this.connection.collection('patients');
    const templates = this.connection.collection('biometric_templates');
    const audits = this.connection.collection('audit_logs');
    const documents = this.connection.collection('documents');

    const [
      totalUsers,
      activeUsers,
      totalPatients,
      biometricEnrollments,
      securityEvents24h,
      failedLogins24h,
      storageResult,
    ] = await Promise.all([
      users.countDocuments({ organizationId, deletedAt: null }),
      users.countDocuments({ organizationId, isActive: true, deletedAt: null }),
      patients.countDocuments({ organizationId, deletedAt: null }),
      patients.countDocuments({
        organizationId,
        deletedAt: null,
        biometricEnrolled: true,
      }),
      audits.countDocuments({
        createdAt: { $gte: last24h },
        resourceType: 'SECURITY',
      }),
      audits.countDocuments({
        createdAt: { $gte: last24h },
        eventType: 'FAILED_LOGIN',
      }),
      documents
        .aggregate([
          { $match: { organizationId, deletedAt: null } },
          { $group: { _id: null, total: { $sum: '$sizeBytes' } } },
        ])
        .toArray(),
    ]);

    const storageUsedMb =
      storageResult.length > 0 ? Math.round((storageResult[0].total / 1048576) * 10) / 10 : 0;

    let databaseSizeMb: number | null = null;
    try {
      const dbStats = await this.connection.db!.stats();
      databaseSizeMb = Math.round((dbStats.dataSize / 1048576) * 10) / 10;
    } catch {
      this.logger.warn('db.stats() unavailable — returning null for databaseSizeMb');
    }

    return {
      totalUsers,
      activeUsers,
      totalPatients,
      biometricEnrollments,
      securityEvents24h,
      failedLogins24h,
      storageUsedMb,
      databaseSizeMb,
    };
  }
}
