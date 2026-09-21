import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { StorageProvider, STORAGE_PROVIDER, DownloadDisposition } from './storage/storage.provider';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentQueryDto } from './dto/document-query.dto';
import { FacilityDocumentQueryDto } from './dto/facility-document-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { ArchiveDocumentDto } from './dto/archive-document.dto';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';
import { Document as MedivaultDocument, DocumentDoc } from './schemas/document.schema';
import { Patient, PatientDocument } from '../patients/schemas/patient.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AccessTokenPayload } from '../../auth/auth.service';
import { v4 as uuidv4 } from 'uuid';

/** MIME types accepted for document upload. */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/dicom',
]);

/** 50 MB in bytes */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Signed URL valid for 15 minutes */
const SIGNED_URL_TTL_SECONDS = 15 * 60;

/**
 * Magic-byte signatures used to verify file content server-side. The MIME type
 * sent by the client is ignored for authorization purposes — the file's actual
 * content decides what is accepted.
 */
const MAGIC_SIGNATURES: Array<{ mime: string; matches: (buf: Buffer) => boolean }> = [
  {
    mime: 'application/pdf',
    matches: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46, // %PDF
  },
  {
    mime: 'image/jpeg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, // FF D8 FF
  },
  {
    mime: 'image/png',
    matches: (b) =>
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a, // .PNG\r\n\x1a\n
  },
  {
    mime: 'application/dicom',
    matches: (b) => b.length >= 132 && b.toString('latin1', 128, 132) === 'DICM',
  },
];

/** Detect a file's real type from its content. Returns null if unrecognized. */
function detectMimeType(buffer: Buffer): string | null {
  if (!buffer || buffer.length === 0) return null;
  for (const sig of MAGIC_SIGNATURES) {
    if (sig.matches(buffer)) return sig.mime;
  }
  return null;
}

export type RequestContext = {
  ip: string;
  userAgent: string;
  requestId: string;
};

/**
 * Identity claims used for facility-scoped document management. `facilityId`
 * is only ever taken from the verified JWT — never from client-supplied data.
 */
export type FacilityScopedUser = {
  id: string;
  role: string;
  organizationId: string | null;
  facilityId: string | null;
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectModel(MedivaultDocument.name)
    private readonly documentModel: Model<DocumentDoc>,
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly auditLogs: AuditLogsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  // ── Upload ─────────────────────────────────────────────────────────────────

  async uploadDocument(
    patientId: string,
    file: Express.Multer.File | undefined,
    dto: UploadDocumentDto,
    uploadedById: string,
    orgId: string,
    uploaderFacilityId: string | null,
    requestContext: RequestContext,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File exceeds maximum allowed size of 50 MB (received ${(file.size / 1024 / 1024).toFixed(2)} MB).`,
      );
    }

    // Verify the file by its actual content, not the client-asserted MIME type.
    const detectedMime = detectMimeType(file.buffer);
    if (!detectedMime) {
      throw new BadRequestException(
        'File content could not be verified as a supported document type (PDF, JPEG, PNG, DICOM).',
      );
    }
    if (!ALLOWED_MIME_TYPES.has(detectedMime)) {
      throw new BadRequestException(
        `Unsupported file type. Allowed types: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }

    await this.ensurePatientBelongsToOrg(patientId, orgId);

    const { storageKey } = await this.storage.save(file.buffer, detectedMime, file.originalname);

    const now = new Date();
    const id = uuidv4();
    const type = dto.documentType ?? 'OTHER';
    const organizationId = orgId?.trim() || null;
    // Facility is auto-recorded from the uploading doctor's session when the
    // client does not supply one — never trust a bare frontend facility value.
    const facilityId = dto.facilityId?.trim() || uploaderFacilityId || null;
    // The document is tied to the source hospital recorded on the uploading
    // staff member's profile when the client does not override it.
    const uploader = await this.userModel
      .findById(uploadedById)
      .select('hospital facilityId')
      .lean()
      .exec();
    const sourceHospital = dto.sourceHospital?.trim() || uploader?.hospital?.trim() || null;

    const doc = await new this.documentModel({
      _id: id,
      patientId,
      uploadedById,
      organizationId,
      fileName: storageKey,
      originalName: file.originalname,
      mimeType: detectedMime,
      sizeBytes: file.size,
      storagePath: storageKey,
      category: type,
      documentTitle: dto.title?.trim() || null,
      documentDate: dto.documentDate ? new Date(dto.documentDate) : now,
      facilityId,
      description: dto.description ?? null,
      sourceHospital,
      notes: dto.notes ?? null,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    }).save();

    await this.auditLogs.log({
      eventType: 'DOCUMENT_UPLOAD',
      userId: uploadedById,
      organizationId: organizationId ?? undefined,
      facilityId: facilityId ?? undefined,
      patientId,
      resourceType: 'DOCUMENT',
      resourceId: id,
      action: 'UPLOAD_DOCUMENT',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
      metadata: {
        patientId,
        documentType: type,
        documentTitle: dto.title?.trim() || null,
        sourceHospital,
        facilityId,
        mimeType: detectedMime,
        fileSize: file.size,
        originalName: file.originalname,
      },
    });

    this.logger.log(`Document ${id} uploaded for patient ${patientId}`);
    return this.toSafeDocument(doc);
  }

  // ── List ───────────────────────────────────────────────────────────────────

  async getDocuments(
    patientId: string,
    orgId: string,
    _requestingUser: { id: string; role: string; organizationId: string },
    query: DocumentQueryDto = {},
  ) {
    await this.ensurePatientBelongsToOrg(patientId, orgId);

    const filter: Record<string, any> = { patientId, isDeleted: false };
    const constraints: Record<string, any>[] = [];

    if (query.type) filter.category = query.type;
    if (query.uploadedBy) filter.uploadedById = query.uploadedBy;

    if (query.facility && query.facility.trim()) {
      constraints.push({
        $or: [{ sourceHospital: this.regexes(query.facility) }, { facilityId: query.facility }],
      });
    }

    // Free-text search across title, file name, description, notes and source.
    if (query.q && query.q.trim()) {
      constraints.push({
        $or: [
          { documentTitle: this.regexes(query.q.trim()) },
          { originalName: this.regexes(query.q.trim()) },
          { description: this.regexes(query.q.trim()) },
          { notes: this.regexes(query.q.trim()) },
          { sourceHospital: this.regexes(query.q.trim()) },
        ],
      });
    }

    // Date range on the clinical document date. The `to` bound is inclusive of
    // the full selected day (end-of-day), so a document dated on that day is
    // included even though `documentDate` also carries a time component.
    if (query.from || query.to) {
      filter.documentDate = {};
      if (query.from) filter.documentDate.$gte = new Date(query.from);
      if (query.to) {
        const end = new Date(query.to);
        end.setUTCHours(23, 59, 59, 999);
        filter.documentDate.$lte = end;
      }
    }

    if (constraints.length) filter.$and = constraints;

    const sortField: 'createdAt' | 'documentDate' =
      query.sortBy === 'documentDate' ? 'documentDate' : 'createdAt';
    const sortDir = query.order === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = {
      [sortField]: sortDir,
      createdAt: -1,
    };

    const rows = await this.documentModel.find(filter).sort(sort).lean().exec();

    return this.enrichWithUploaders(rows);
  }

  private regexes(term: string) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  }

  /**
   * Batch-enrich documents with the human-readable name/role of the user who
   * uploaded them (single query against the users collection), and strip
   * internal storage fields before returning to the client.
   */
  private async enrichWithUploaders(rows: any[]) {
    if (!rows.length) return rows;
    const uploaderIds = [...new Set(rows.map((r) => r.uploadedById).filter(Boolean))] as string[];
    const users = await this.userModel
      .find({ _id: { $in: uploaderIds }, deletedAt: null })
      .select('firstName lastName role')
      .lean()
      .exec();
    const byId = new Map(users.map((u) => [u._id as string, u]));
    return rows.map((doc) => {
      const uploader = byId.get(doc.uploadedById);
      const safe = this.toSafeDocument(doc);
      return {
        ...safe,
        uploadedByName: uploader ? `${uploader.firstName} ${uploader.lastName}` : null,
        uploadedByRole: uploader?.role ?? null,
      };
    });
  }

  // ── Uploaders (doctor filter) ─────────────────────────────────────────────

  /**
   * Distinct list of users who have uploaded documents for a patient — used to
   * power the "filter by doctor" control without exposing the full user list.
   */
  async getUploaders(
    patientId: string,
    orgId: string,
  ): Promise<Array<{ id: string; name: string; role: string }>> {
    await this.ensurePatientBelongsToOrg(patientId, orgId);

    const uploaderIds = (await this.documentModel
      .distinct('uploadedById', { patientId, isDeleted: false })
      .exec()) as string[];

    if (!uploaderIds.length) return [];

    const users = await this.userModel
      .find({
        _id: { $in: uploaderIds },
        deletedAt: null,
      })
      .select('firstName lastName role organizationId')
      .lean()
      .exec();

    return users
      .filter((u) => !u.organizationId || u.organizationId === orgId)
      .map((u) => ({
        id: u._id as string,
        name: `${u.firstName} ${u.lastName}`.trim() || (u._id as string),
        role: u.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Facility-wide list (facility-admin dashboard) ─────────────────────────

  /**
   * List documents across patients in the requesting admin's facility (or the
   * whole organization for org/super admins). Scope is derived from the
   * verified JWT, never from client-supplied values:
   *
   *   Authenticated User → Role → Facility Membership → Patient belongs to
   *   Facility → Document access.
   *
   * Patient search terms / patientIds are resolved against the scoped patient
   * set before any document query runs — a patient outside the facility simply
   * yields no results.
   */
  async getFacilityDocuments(
    requestingUser: FacilityScopedUser,
    query: FacilityDocumentQueryDto = {},
  ): Promise<PaginatedResult<any>> {
    const orgId = requestingUser.organizationId;
    const isSuperAdmin = requestingUser.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !orgId) throw new ForbiddenException('Access denied.');

    const scopedFacilityId = this.facilityScopeFor(requestingUser, query.facilityId);
    this.assertFacilityAdminHasFacility(requestingUser, scopedFacilityId);

    const filter: Record<string, any> = { isDeleted: false };
    if (!isSuperAdmin && orgId) filter.organizationId = orgId;
    if (scopedFacilityId) filter.facilityId = scopedFacilityId;

    // ── Patient-scoped filters ──────────────────────────────────────────────
    const patientTerm = query.patient?.trim();
    const exactPatientId = query.patientId?.trim();
    // SUPER_ADMIN is not org-scoped; all other roles are pinned to their JWT org.
    const scopeOrgId = isSuperAdmin ? null : orgId;

    if (exactPatientId) {
      await this.ensurePatientInScope(exactPatientId, scopeOrgId, scopedFacilityId);
      filter.patientId = exactPatientId;
    } else if (patientTerm) {
      const patientIds = await this.resolvePatientIds(patientTerm, scopeOrgId, scopedFacilityId);
      if (!patientIds.length) {
        const page = query.page ?? 1;
        const limit = Math.min(query.limit ?? 20, 100);
        return paginate<any>([], 0, page, limit);
      }
      filter.patientId = { $in: patientIds };
    }

    // ── Document filters ────────────────────────────────────────────────────
    if (query.type) filter.category = query.type;
    if (query.uploadedBy) filter.uploadedById = query.uploadedBy;

    const constraints: Record<string, any>[] = [];
    if (query.q?.trim()) {
      constraints.push({
        $or: [
          { documentTitle: this.regexes(query.q.trim()) },
          { originalName: this.regexes(query.q.trim()) },
          { description: this.regexes(query.q.trim()) },
          { notes: this.regexes(query.q.trim()) },
          { sourceHospital: this.regexes(query.q.trim()) },
        ],
      });
    }

    if (query.from || query.to) {
      filter.documentDate = {};
      if (query.from) filter.documentDate.$gte = new Date(query.from);
      if (query.to) {
        const end = new Date(query.to);
        end.setUTCHours(23, 59, 59, 999);
        filter.documentDate.$lte = end;
      }
    }

    if (constraints.length) filter.$and = constraints;

    // Archive status
    if (query.status === 'archived') filter.archivedAt = { $ne: null };
    else if (query.status !== 'all') filter.archivedAt = null;

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const sortField: 'documentDate' | 'createdAt' =
      query.sortBy === 'documentDate' ? 'documentDate' : 'createdAt';
    const sortDir = query.order === 'asc' ? 1 : -1;

    const [rows, total] = await Promise.all([
      this.documentModel
        .find(filter)
        .sort({ [sortField]: sortDir, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.documentModel.countDocuments(filter).exec(),
    ]);

    const enriched = await this.enrichFacilityRows(rows);
    return paginate(enriched, total, page, limit);
  }

  /**
   * Distinct uploaders across a facility — powers the "doctor filter" on the
   * facility document dashboard. Facility-scoped like the list itself.
   */
  async getFacilityUploaders(
    requestingUser: FacilityScopedUser,
  ): Promise<Array<{ id: string; name: string; role: string }>> {
    const orgId = requestingUser.organizationId;
    const isSuperAdmin = requestingUser.role === 'SUPER_ADMIN';
    if (!isSuperAdmin && !orgId) throw new ForbiddenException('Access denied.');

    const scopedFacilityId = this.facilityScopeFor(requestingUser, null);
    this.assertFacilityAdminHasFacility(requestingUser, scopedFacilityId);

    const match: Record<string, any> = { isDeleted: false };
    if (!isSuperAdmin && orgId) match.organizationId = orgId;
    if (scopedFacilityId) match.facilityId = scopedFacilityId;

    const uploaderIds = (await this.documentModel
      .distinct('uploadedById', match)
      .exec()) as string[];

    if (!uploaderIds.length) return [];

    const users = await this.userModel
      .find({ _id: { $in: uploaderIds }, deletedAt: null })
      .select('firstName lastName role organizationId')
      .lean()
      .exec();

    return users
      .filter((u) => !u.organizationId || u.organizationId === orgId)
      .map((u) => ({
        id: u._id as string,
        name: `${u.firstName} ${u.lastName}`.trim() || (u._id as string),
        role: u.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Metadata update (categorize / describe) ───────────────────────────────

  async updateDocument(
    documentId: string,
    patientId: string,
    dto: UpdateDocumentDto,
    requestingUser: AccessTokenPayload,
    requestContext: RequestContext,
  ) {
    const orgId = requestingUser.organizationId ?? '';
    const scopedFacilityId = this.facilityScopeFor(
      {
        id: requestingUser.sub,
        role: requestingUser.role,
        organizationId: requestingUser.organizationId,
        facilityId: requestingUser.facilityId,
      },
      null,
    );
    await this.ensurePatientInScope(patientId, orgId, scopedFacilityId);

    const document = await this.safeGetDocument(documentId, patientId);
    if (!document) throw new NotFoundException('Document not found.');

    const updates: Record<string, any> = {};
    if (dto.documentType !== undefined) updates.category = dto.documentType;
    if (dto.title !== undefined) updates.documentTitle = dto.title.trim() || null;
    if (dto.documentDate !== undefined)
      updates.documentDate = dto.documentDate ? new Date(dto.documentDate) : null;
    if (dto.description !== undefined) updates.description = dto.description.trim() || null;
    if (dto.sourceHospital !== undefined)
      updates.sourceHospital = dto.sourceHospital.trim() || null;
    if (dto.notes !== undefined) updates.notes = dto.notes.trim() || null;

    if (!Object.keys(updates).length) {
      throw new BadRequestException('No updatable fields provided.');
    }

    updates.updatedAt = new Date();
    await this.documentModel.updateOne({ _id: documentId }, { $set: updates }).exec();

    await this.auditLogs.log({
      eventType: 'DOCUMENT_UPDATE',
      userId: requestingUser.sub,
      userRole: requestingUser.role,
      organizationId: document.organizationId ?? orgId,
      facilityId: document.facilityId ?? scopedFacilityId ?? undefined,
      patientId,
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      action: 'UPDATE_DOCUMENT',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
      metadata: {
        originalName: document.originalName,
        documentType: document.category,
        updatedFields: Object.keys(updates).filter((k) => k !== 'updatedAt'),
        previousType: document.category,
        newType: updates.category ?? document.category,
        previousTitle: document.documentTitle,
        newTitle: updates.documentTitle ?? document.documentTitle,
      },
    });

    const updated = { ...document, ...updates };
    return this.toSafeDocument(updated);
  }

  // ── Archive / restore ─────────────────────────────────────────────────────

  async archiveDocument(
    documentId: string,
    patientId: string,
    dto: ArchiveDocumentDto,
    requestingUser: AccessTokenPayload,
    requestContext: RequestContext,
  ) {
    const orgId = requestingUser.organizationId ?? '';
    const scopedFacilityId = this.facilityScopeFor(
      {
        id: requestingUser.sub,
        role: requestingUser.role,
        organizationId: requestingUser.organizationId,
        facilityId: requestingUser.facilityId,
      },
      null,
    );
    await this.ensurePatientInScope(patientId, orgId, scopedFacilityId);

    const document = await this.safeGetDocument(documentId, patientId);
    if (!document) throw new NotFoundException('Document not found.');

    const now = new Date();
    const updates: Record<string, any> = dto.archived
      ? { archivedAt: now, archivedById: requestingUser.sub, updatedAt: now }
      : { archivedAt: null, archivedById: null, updatedAt: now };

    await this.documentModel.updateOne({ _id: documentId }, { $set: updates }).exec();

    await this.auditLogs.log({
      eventType: 'DOCUMENT_ARCHIVE',
      userId: requestingUser.sub,
      userRole: requestingUser.role,
      organizationId: document.organizationId ?? orgId,
      facilityId: document.facilityId ?? scopedFacilityId ?? undefined,
      patientId,
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      action: dto.archived ? 'ARCHIVE_DOCUMENT' : 'UNARCHIVE_DOCUMENT',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
      metadata: {
        originalName: document.originalName,
        documentType: document.category,
        archived: dto.archived,
      },
    });

    const updated = { ...document, ...updates };
    return this.toSafeDocument(updated);
  }

  // ── Document history ──────────────────────────────────────────────────────

  async getDocumentHistory(
    documentId: string,
    patientId: string,
    requestingUser: FacilityScopedUser,
  ) {
    const scopedFacilityId = this.facilityScopeFor(requestingUser, null);
    await this.ensurePatientInScope(
      patientId,
      requestingUser.organizationId ?? '',
      scopedFacilityId,
    );

    const document = await this.safeGetDocument(documentId, patientId);
    if (!document) throw new NotFoundException('Document not found.');

    const rows = await this.auditLogs.findByResource('DOCUMENT', documentId, {
      role: requestingUser.role,
      organizationId: requestingUser.organizationId ?? '',
    });

    const userIds = [...new Set(rows.map((r: any) => r.userId).filter(Boolean))] as string[];
    const users = userIds.length
      ? await this.userModel
          .find({ _id: { $in: userIds }, deletedAt: null })
          .select('firstName lastName role')
          .lean()
          .exec()
      : [];
    const byId = new Map(users.map((u) => [u._id as string, u]));

    return rows.map((r: any) => ({
      id: r.id,
      eventType: r.eventType,
      action: r.action,
      result: r.result,
      timestamp: r.timestamp ?? r.createdAt,
      userId: r.userId,
      userName: r.userId
        ? byId.get(r.userId)?.firstName + ' ' + byId.get(r.userId)?.lastName
        : 'System',
      userRole: r.userRole ?? byId.get(r.userId)?.role ?? null,
      ipAddress: r.ipAddress,
      metadata: r.metadata,
    }));
  }

  // ── Facility-scope helpers ────────────────────────────────────────────────

  /**
   * Facility admins are always pinned to their JWT facility. Org/super admins
   * may optionally narrow to one facility within their org via the query.
   */
  private facilityScopeFor(
    user: FacilityScopedUser,
    requestedFacilityId: string | null | undefined,
  ): string | null {
    if (user.role === 'FACILITY_ADMIN') return user.facilityId;
    return requestedFacilityId?.trim() || null;
  }

  private assertFacilityAdminHasFacility(
    user: FacilityScopedUser,
    facilityId: string | null,
  ): void {
    if (user.role === 'FACILITY_ADMIN' && !facilityId) {
      throw new ForbiddenException('Your account is not assigned to a facility.');
    }
  }

  /** Resolve patient IDs matching a free-text term, restricted to scope. */
  private async resolvePatientIds(
    term: string,
    orgId: string | null,
    facilityId: string | null,
  ): Promise<string[]> {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    const filter: Record<string, any> = {
      deletedAt: null,
      $or: [
        { firstName: regex },
        { lastName: regex },
        { mrn: regex },
        { profileId: regex },
        { phoneNumber: regex },
        { email: regex },
      ],
    };
    if (orgId) filter.organizationId = orgId;
    if (facilityId) filter.facilityId = facilityId;

    const patients = await this.patientModel.find(filter).select('_id').limit(200).lean().exec();

    return patients.map((p) => String(p._id));
  }

  /**
   * Patient belongs to facility (server-side, JWT-derived scope). A patient
   * outside the requesting admin's facility is treated as not found — never leak
   * that the record exists.
   */
  private async ensurePatientInScope(
    patientId: string,
    orgId: string | null,
    facilityId: string | null,
  ): Promise<void> {
    const filter: Record<string, any> = { _id: patientId, deletedAt: null };
    // Super admins are org-less and see across organizations.
    if (orgId) filter.organizationId = orgId;

    const patient = await this.patientModel.findOne(filter).lean().exec();
    if (!patient) throw new NotFoundException('Patient not found.');

    if (facilityId && patient.facilityId !== facilityId) {
      throw new ForbiddenException('You do not have access to patients outside your facility.');
    }
  }

  /** Attach patient + uploader display fields to facility-wide document rows. */
  private async enrichFacilityRows(rows: Record<string, any>[]): Promise<any[]> {
    if (!rows.length) return rows;

    const patientIds = [...new Set(rows.map((r) => r.patientId).filter(Boolean))] as string[];
    const uploaderIds = [...new Set(rows.map((r) => r.uploadedById).filter(Boolean))] as string[];

    const [patients, users] = await Promise.all([
      patientIds.length
        ? this.patientModel
            .find({ _id: { $in: patientIds } })
            .select('_id firstName lastName mrn profileId facilityId')
            .lean()
            .exec()
        : [],
      uploaderIds.length
        ? this.userModel
            .find({ _id: { $in: uploaderIds }, deletedAt: null })
            .select('firstName lastName role')
            .lean()
            .exec()
        : [],
    ]);

    const patientById = new Map(patients.map((p) => [String(p._id), p]));
    const uploaderById = new Map(users.map((u) => [String(u._id), u]));

    return rows.map((doc) => {
      const patient = patientById.get(doc.patientId);
      const uploader = uploaderById.get(doc.uploadedById);
      return {
        ...this.toSafeDocument(doc),
        patientName: patient ? `${patient.firstName} ${patient.lastName}`.trim() : null,
        patientMrn: patient?.mrn ?? null,
        patientProfileId: patient?.profileId ?? null,
        uploadedByName: uploader ? `${uploader.firstName} ${uploader.lastName}`.trim() : null,
        uploadedByRole: uploader?.role ?? null,
      };
    });
  }

  /**
   * Strip internal storage fields from a lean document row before it leaves
   * the API. `storagePath` / `fileName` identify the physical object and must
   * never be exposed to clients.
   */
  private toSafeDocument(doc: Record<string, any>) {
    if (!doc) return doc;
    // `uploadDocument` returns the saved Mongoose document; hydrate it to a
    // plain object so internal state ($__, _doc, isValidating…) never leaks.
    const raw = typeof (doc as any).toObject === 'function' ? (doc as any).toObject() : doc;
    const rest = { ...raw } as Record<string, any>;
    delete rest.storagePath;
    delete rest.fileName;
    return rest;
  }

  // ── Get by ID ──────────────────────────────────────────────────────────────

  async getDocumentById(
    documentId: string,
    patientId: string,
    orgId: string,
    _requestingUser: { id: string; role: string; organizationId: string },
  ) {
    await this.ensurePatientBelongsToOrg(patientId, orgId);
    const doc = await this.safeGetDocument(documentId, patientId);
    if (!doc) throw new NotFoundException('Document not found.');
    return this.toSafeDocument(doc);
  }

  // ── Download URL ───────────────────────────────────────────────────────────

  async getDownloadUrl(
    documentId: string,
    patientId: string,
    orgId: string,
    requestingUser: { id: string; role: string; organizationId: string },
    requestContext: RequestContext,
    mode?: DownloadDisposition,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    await this.ensurePatientBelongsToOrg(patientId, orgId);

    const document = await this.documentModel
      .findOne({ _id: documentId, patientId, isDeleted: false })
      .lean()
      .exec();
    if (!document) throw new NotFoundException('Document not found.');

    const url = await this.storage.generateSignedUrl(document.storagePath, SIGNED_URL_TTL_SECONDS, {
      disposition: mode ?? 'attachment',
    });

    await this.auditLogs.log({
      eventType: 'DOCUMENT_DOWNLOAD',
      userId: requestingUser.id,
      userRole: requestingUser.role,
      organizationId: orgId,
      facilityId: document.facilityId ?? undefined,
      patientId,
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      action: 'GET_DOWNLOAD_URL',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
      metadata: {
        patientId,
        documentType: document.category,
        originalName: document.originalName,
        disposition: mode ?? 'attachment',
      },
    });

    return { url, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
  }

  // ── Download by token ──────────────────────────────────────────────────────

  async downloadByToken(
    token: string,
    requestingUser: { id: string; role: string; organizationId: string | null },
    requestContext: RequestContext,
  ): Promise<{
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    disposition: DownloadDisposition;
  }> {
    let storageKey: string;
    let disposition: DownloadDisposition;
    try {
      const verified = this.storage.verifySignedToken(token);
      storageKey = verified.storageKey;
      disposition = verified.disposition;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid download token.';
      if (message.includes('expired')) throw new ForbiddenException('Download token has expired.');
      throw new BadRequestException('Invalid download token.');
    }

    const document = await this.documentModel
      .findOne({ storagePath: storageKey, isDeleted: false })
      .lean()
      .exec();
    if (!document) throw new NotFoundException('File not found or no longer available.');

    await this.auditLogs.log({
      eventType: 'DOCUMENT_DOWNLOAD',
      userId: requestingUser.id,
      userRole: requestingUser.role,
      organizationId: document.organizationId ?? null,
      facilityId: document.facilityId ?? undefined,
      patientId: document.patientId,
      resourceType: 'DOCUMENT',
      resourceId: document._id,
      // Inline fetches are "views"; attachment fetches are downloads.
      action: disposition === 'inline' ? 'VIEW_DOCUMENT' : 'DOWNLOAD_DOCUMENT',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
      metadata: {
        patientId: document.patientId,
        documentType: document.category,
        originalName: document.originalName,
        disposition,
      },
    });

    const buffer = await this.storage.read(storageKey);
    return {
      buffer,
      mimeType: document.mimeType,
      originalName: document.originalName,
      disposition,
    };
  }

  // ── Soft delete ────────────────────────────────────────────────────────────

  async deleteDocument(
    documentId: string,
    patientId: string,
    orgId: string,
    deletedById: string,
    requestContext: RequestContext,
  ) {
    await this.ensurePatientBelongsToOrg(patientId, orgId);

    const document = await this.documentModel
      .findOne({ _id: documentId, patientId, isDeleted: false })
      .lean()
      .exec();
    if (!document) throw new NotFoundException('Document not found.');

    await this.documentModel
      .findOneAndUpdate({ _id: documentId }, { $set: { isDeleted: true, updatedAt: new Date() } })
      .exec();

    await this.auditLogs.log({
      eventType: 'DOCUMENT_DELETE',
      userId: deletedById,
      organizationId: orgId,
      facilityId: document.facilityId ?? undefined,
      patientId,
      resourceType: 'DOCUMENT',
      resourceId: documentId,
      action: 'DELETE_DOCUMENT',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
      metadata: {
        patientId,
        documentType: document.category,
        originalName: document.originalName,
      },
    });

    return { message: 'Document deleted successfully.' };
  }

  // ── Versions ───────────────────────────────────────────────────────────────

  async getDocumentVersions(documentId: string, patientId: string, orgId: string) {
    await this.ensurePatientBelongsToOrg(patientId, orgId);

    const doc = await this.documentModel
      .findOne({ _id: documentId, patientId, isDeleted: false })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Document not found.');

    // Versioning is not a separate collection in the Mongoose schema.
    // Return the single document version as a version-1 record for compatibility.
    return [
      {
        id: doc._id,
        documentId: doc._id,
        version: 1,
        fileSize: doc.sizeBytes,
        createdAt: doc.createdAt,
        createdById: doc.uploadedById,
      },
    ];
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async ensurePatientBelongsToOrg(patientId: string, orgId: string): Promise<void> {
    const filter: Record<string, any> = { _id: patientId, deletedAt: null };
    // Super admins are org-less and see across organizations.
    if (orgId) filter.organizationId = orgId;

    const patient = await this.patientModel.findOne(filter).lean().exec();
    if (!patient) throw new NotFoundException('Patient not found.');
  }

  private async safeGetDocument(documentId: string, patientId: string) {
    return this.documentModel
      .findOne({ _id: documentId, patientId, isDeleted: false })
      .lean()
      .exec();
  }
}
