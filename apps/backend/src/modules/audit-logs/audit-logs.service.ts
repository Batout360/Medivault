import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';
import { User, UserDocument } from '../users/schemas/user.schema';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Write an immutable audit record.
   * Never throws — audit failures must not break business logic.
   */
  async log(dto: CreateAuditLogDto): Promise<void> {
    try {
      const now = new Date();
      await new this.auditLogModel({
        _id: uuidv4(),
        eventType: dto.eventType,
        userId: dto.userId ?? null,
        userRole: dto.userRole ?? null,
        organizationId: dto.organizationId ?? null,
        facilityId: dto.facilityId ?? null,
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
        sessionId: dto.sessionId ?? null,
        requestId: dto.requestId ?? null,
        resourceType: dto.resourceType ?? null,
        resourceId: dto.resourceId ?? null,
        action: dto.action ?? null,
        result: dto.result ?? 'success',
        metadata: dto.metadata ?? null,
        severity: null,
        details: null,
        createdAt: now,
      }).save();
    } catch (err) {
      this.logger.error('Failed to write audit log', err);
    }
  }

  async logBatch(dtos: CreateAuditLogDto[]): Promise<void> {
    for (const dto of dtos) await this.log(dto);
  }

  /**
   * Maps a raw audit-log row to the shape the dashboard / audit-logs / admin
   * pages expect (they reference `id`, `timestamp`, `user`, `target`, `type`,
   * `event`, `eventType`, `action`, `userEmail`, …).
   */
  private mapEntry(row: Record<string, any>): any {
    return {
      id: row._id,
      _id: row._id,
      eventType: row.eventType ?? null,
      event: row.eventType ?? null,
      action: row.action ?? row.eventType ?? null,
      userId: row.userId ?? null,
      userEmail: null,
      user: row.userId ?? 'System',
      userRole: row.userRole ?? null,
      resourceType: row.resourceType ?? null,
      resourceId: row.resourceId ?? null,
      target: row.resourceType ?? '—',
      ipAddress: row.ipAddress ?? null,
      result: mapResult(row.result),
      severity: row.severity ?? null,
      details: row.details ? JSON.stringify(row.details) : null,
      requestId: row.requestId ?? null,
      sessionId: row.sessionId ?? null,
      createdAt: row.createdAt,
      timestamp: row.createdAt,
      type: toActivityType(row.eventType, row.resourceType),
    };
  }

  async findAll(
    query: AuditLogQueryDto,
    requestingUser: { role: string; organizationId: string },
  ): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 20,
      q,
      type,
      eventType,
      userId,
      resourceType,
      resourceId,
      startDate,
      endDate,
      from,
      to,
      result,
    } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    if (requestingUser.role !== 'SUPER_ADMIN') {
      filter.organizationId = requestingUser.organizationId;
    }
    if (type === 'security') filter.resourceType = 'SECURITY';
    if (eventType) filter.eventType = eventType;
    if (userId) filter.userId = userId;
    if (resourceType) filter.resourceType = resourceType;
    if (resourceId) filter.resourceId = resourceId;
    if (result) filter.result = result?.toLowerCase();
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [
        { eventType: regex },
        { action: regex },
        { userId: regex },
        { resourceType: regex },
        { resourceId: regex },
        { ipAddress: regex },
      ];
    }

    const start = startDate ?? from;
    const end = endDate ?? to;
    if (start || end) {
      filter.createdAt = {};
      if (start) filter.createdAt.$gte = new Date(start);
      if (end) filter.createdAt.$lte = new Date(end);
    }

    const [rows, total] = await Promise.all([
      this.auditLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.auditLogModel.countDocuments(filter).exec(),
    ]);

    return paginate(
      (rows ?? []).map((r) => this.mapEntry(r)),
      total,
      page,
      limit,
    );
  }

  async findByPatient(
    patientId: string,
    requestingUser: { role: string; organizationId: string },
  ): Promise<any[]> {
    const filter: Record<string, any> = {
      resourceId: patientId,
      resourceType: 'PATIENT',
    };
    if (requestingUser.role !== 'SUPER_ADMIN') {
      filter.organizationId = requestingUser.organizationId;
    }

    const rows = await this.auditLogModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()
      .exec();

    return this.enrichWithViewers((rows ?? []).map((r) => this.mapEntry(r)));
  }

  async findByUser(
    userId: string,
    requestingUser: { role: string; organizationId: string },
  ): Promise<any[]> {
    const filter: Record<string, any> = { userId };
    if (requestingUser.role !== 'SUPER_ADMIN') {
      filter.organizationId = requestingUser.organizationId;
    }

    return this.auditLogModel.find(filter).sort({ createdAt: -1 }).limit(200).lean().exec();
  }

  /**
   * Audit history for a single resource (e.g. a DOCUMENT) — powers the
   * "view document history" dialogs. Default scoped to the requesting user's
   * organization except for SUPER_ADMIN.
   */
  async findByResource(
    resourceType: string,
    resourceId: string,
    requestingUser: { role: string; organizationId: string },
  ): Promise<any[]> {
    const filter: Record<string, any> = { resourceType, resourceId };
    if (requestingUser.role !== 'SUPER_ADMIN') {
      filter.organizationId = requestingUser.organizationId;
    }

    const rows = await this.auditLogModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();

    return (rows ?? []).map((r) => this.mapEntry(r));
  }

  /**
   * Resolve the acting users into human-readable display names so that a
   * patient can see *who* accessed their record. Falls back to the actor id
   * (or 'System') when the row has no user or the user no longer exists.
   */
  private async enrichWithViewers(entries: any[]): Promise<any[]> {
    const actorIds = [...new Set(entries.map((e) => e.userId).filter(Boolean))];
    const users = actorIds.length
      ? await this.userModel
          .find({ _id: { $in: actorIds } })
          .select('_id firstName lastName email')
          .lean()
          .exec()
      : [];
    const byId = new Map(users.map((u) => [String(u._id), u]));

    return entries.map((e) => {
      const actor = e.userId ? byId.get(String(e.userId)) : null;
      if (actor && actor._id) {
        const fullName = [actor.firstName, actor.lastName].filter(Boolean).join(' ') || null;
        return {
          ...e,
          user: fullName ?? actor.email ?? e.userId ?? 'System',
          userEmail: actor.email ?? null,
        };
      }
      return {
        ...e,
        user: e.userId ? String(e.userId) : 'System',
      };
    });
  }

  async createSecurityEvent(event: {
    eventType: string;
    severity: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await new this.auditLogModel({
        _id: uuidv4(),
        eventType: event.eventType,
        userId: event.userId ?? null,
        userRole: null,
        organizationId: null,
        facilityId: null,
        patientId: null,
        resourceType: 'SECURITY',
        resourceId: null,
        action: event.eventType,
        result: 'security_event',
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
        requestId: null,
        sessionId: null,
        metadata: null,
        severity: event.severity,
        details: event.details ?? null,
        createdAt: new Date(),
      }).save();
    } catch (err) {
      this.logger.error('Failed to create security event', err);
    }
  }

  async getSecurityEvents(
    query: AuditLogQueryDto,
    _requestingUser: { role: string; organizationId: string },
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = { resourceType: 'SECURITY' };

    const [rows, total] = await Promise.all([
      this.auditLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.auditLogModel.countDocuments(filter).exec(),
    ]);

    return paginate(
      (rows ?? []).map((r) => this.mapEntry(r)),
      total,
      page,
      limit,
    );
  }
}

function mapResult(result: string | null | undefined): string {
  switch (result?.toLowerCase()) {
    case 'success':
      return 'SUCCESS';
    case 'failure':
    case 'denied':
      return 'FAILURE';
    case 'security_event':
      return 'DENIED';
    default:
      return (result ?? 'SUCCESS').toUpperCase();
  }
}

function toActivityType(eventType: string | null, resourceType: string | null): string {
  const ev = (eventType ?? '').toUpperCase();
  if (ev.startsWith('BIOMETRIC')) return 'biometric';
  if (ev.includes('LOGIN') || ev.includes('LOGOUT')) return 'auth';
  if (ev.startsWith('PERMISSION') || resourceType === 'SECURITY') return 'admin';
  if (resourceType === 'PATIENT') return 'patient';
  return 'record';
}
