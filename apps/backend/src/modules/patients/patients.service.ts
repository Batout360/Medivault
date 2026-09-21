import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientSearchDto } from './dto/patient-search.dto';
import { UpdateMePatientDto } from './dto/update-me-patient.dto';
import { AllergyDto, EmergencyContactDto } from './dto/create-patient.dto';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';
import { Patient, PatientDocument } from './schemas/patient.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Session, SessionDocument } from '../users/schemas/session.schema';
import { UserRole, PATIENT_ROLES } from '@medivault/shared';
import { AccessTokenPayload } from '../../auth/auth.service';
import { PatientIdService } from './patient-id.service';

/** Argon2id options — mirror the Users service so hashes are comparable. */
const ARGON2_OPTIONS: argon2.HashOptions = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  constructor(
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Session.name)
    private readonly sessionModel: Model<SessionDocument>,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private generateMRN(): string {
    const year = new Date().getFullYear();
    const random = randomBytes(4).toString('hex').toUpperCase();
    return `MRN-${year}-${random}`;
  }

  /**
   * Generates an 8-character URL-safe profile code (no ambiguous characters).
   * Collision-safe within the org because the (organizationId, profileId)
   * index is unique — callers retry on duplicate-key errors.
   */
  private generateProfileId(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += alphabet[randomBytes(1)[0] % alphabet.length];
    }
    return code;
  }

  private async ensureUniqueProfileId(organizationId: string | null): Promise<string> {
    let attempts = 0;
    let profileId!: string;
    do {
      profileId = this.generateProfileId();
      attempts++;
      if (attempts > 10) {
        throw new BadRequestException('Unable to generate unique profile ID.');
      }
      const existing = await this.patientModel.findOne({
        organizationId,
        profileId,
        deletedAt: null,
      });
      if (!existing) break;
    } while (true);
    return profileId;
  }

  private async ensurePatientExists(
    patientId: string,
    organizationId: string | null,
    role?: string,
  ): Promise<PatientDocument> {
    const filter: Record<string, unknown> = {
      _id: patientId,
      deletedAt: null,
    };
    if (role !== 'SUPER_ADMIN') filter['organizationId'] = organizationId;
    const patient = await this.patientModel.findOne(filter);
    if (!patient) throw new NotFoundException('Patient not found.');
    return patient;
  }

  // ---------------------------------------------------------------------------
  // Patient login provisioning
  // ---------------------------------------------------------------------------

  private generateTemporaryPassword(): string {
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const symbols = '!@#$%^&*';
    const pick = (set: string) => set[randomBytes(1)[0] % set.length];
    // Guarantee one of each class, then shuffle the rest.
    const chars = [
      pick(lower),
      pick(lower),
      pick(upper),
      pick(upper),
      pick(digits),
      pick(digits),
      pick(symbols),
      pick(symbols),
    ];
    for (let i = 0; i < 6; i++) {
      const set = [lower, upper, digits, symbols][randomBytes(1)[0] % 4];
      chars.push(pick(set));
    }
    // Fisher–Yates shuffle
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomBytes(1)[0] % (i + 1);
      [chars[i], chars[j]] = [chars[j]!, chars[i]!];
    }
    return chars.join('');
  }

  private async generateUniqueUsername(email: string): Promise<string> {
    const base = email
      .split('@')[0]!
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 26);
    let candidate = base || 'patient';
    for (let attempts = 0; attempts < 10; attempts++) {
      if (attempts > 0) candidate = `${base.slice(0, 22)}${randomBytes(2).toString('hex')}`;
      const existing = await this.userModel.findOne({ username: candidate }).select('_id').lean();
      if (!existing) return candidate;
    }
    throw new ConflictException('Unable to generate a unique username for the patient login.');
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  /**
   * Creates a USER login account for a patient record. Returns the generated
   * credentials (shown to the registering staff since there is no email sender).
   */
  private async provisionPatientLogin(params: {
    email: string;
    firstName: string;
    lastName: string;
    organizationId: string | null;
    facilityId: string | null;
  }): Promise<{ userId: string; username: string; temporaryPassword: string } | null> {
    const email = params.email.toLowerCase().trim();

    // If any account already uses this email, don't create a duplicate — the
    // patient (or staff) can link explicitly instead.
    const existing = await this.userModel
      .findOne({ email, deletedAt: null })
      .select('_id role')
      .lean();
    if (existing) {
      this.logger.warn(`Patient login skipped for ${email}: account already exists.`);
      return null;
    }

    const username = await this.generateUniqueUsername(email);
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await this.hashPassword(temporaryPassword);
    const now = new Date();
    const userId = uuidv4();

    await this.userModel.create({
      _id: userId,
      email,
      username,
      passwordHash,
      firstName: params.firstName,
      lastName: params.lastName,
      phone: null,
      role: UserRole.USER,
      organizationId: params.organizationId,
      facilityId: params.facilityId ?? null,
      hospital: null,
      isActive: true,
      isEmailVerified: false,
      mfaEnabled: false,
      mfaBackupCodes: '[]',
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      passwordChangedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    this.logger.warn(
      `[DEV ONLY] Patient login for ${email}: username=${username}, temporaryPassword=${temporaryPassword}`,
    );
    return { userId, username, temporaryPassword };
  }

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async create(
    dto: CreatePatientDto,
    createdById: string,
    organizationId: string | null,
    facilityId: string | null,
    requestContext: { ip: string; userAgent: string; requestId: string },
  ) {
    // Ensure MRN is unique within the organisation
    let mrn!: string;
    let attempts = 0;
    do {
      mrn = this.generateMRN();
      attempts++;
      if (attempts > 10) {
        throw new BadRequestException('Unable to generate unique MRN');
      }
      const existing = await this.patientModel.findOne({ mrn, organizationId });
      if (!existing) break;
    } while (true);

    const patientId = uuidv4();
    const now = new Date();

    const profileId = await this.ensureUniqueProfileId(organizationId);

    // Link the patient to a user account (same person, same place): an explicit
    // `userId` wins; otherwise auto-match a PATIENT account in the same org by
    // email. The patient's facility then inherits from the linked account so
    // patient and user always stay at the same place.
    let linkedUserId = dto.userId ?? null;
    let linkedFacilityId = facilityId;
    if (linkedUserId) {
      const account = await this.userModel
        .findById(linkedUserId)
        .select('role organizationId facilityId')
        .lean()
        .exec();
      if (account && account.organizationId === organizationId) {
        linkedFacilityId = linkedFacilityId ?? account.facilityId ?? null;
      } else {
        linkedUserId = null;
      }
    } else if (dto.email && organizationId) {
      const account = await this.userModel
        .findOne({
          email: dto.email.toLowerCase().trim(),
          organizationId,
          role: { $in: PATIENT_ROLES },
          deletedAt: null,
        })
        .select('_id facilityId')
        .lean()
        .exec();
      if (account) {
        linkedUserId = account._id as string;
        linkedFacilityId = linkedFacilityId ?? account.facilityId ?? null;
      }
    }

    // No linked account yet? Provision one so the patient can log in with a
    // temporary password (returned to the registering staff below). Requires an
    // email since login is email + password based.
    let provisionedLogin: {
      userId: string;
      username: string;
      temporaryPassword: string;
    } | null = null;
    if (!linkedUserId && dto.email && organizationId) {
      const email = dto.email.toLowerCase().trim();
      // A same-org PATIENT account would have been auto-linked above, so any
      // account still using this email is a conflict. Fail loudly instead of
      // silently creating a patient with no login.
      const conflict = await this.userModel
        .findOne({ email, deletedAt: null })
        .select('_id role')
        .lean()
        .exec();
      if (conflict) {
        throw new ConflictException(
          (PATIENT_ROLES as readonly string[]).includes(conflict.role)
            ? 'A patient account with this email already exists in another organization. Use a different email.'
            : 'This email is already registered to a staff account. Use a different email for this patient, or change that account’s email first.',
        );
      }
      provisionedLogin = await this.provisionPatientLogin({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        organizationId,
        facilityId: linkedFacilityId,
      });
      if (provisionedLogin) {
        linkedUserId = provisionedLogin.userId;
        linkedFacilityId = linkedFacilityId ?? facilityId;
      }
    }

    // Build embedded arrays from DTO
    const emergencyContacts = dto.emergencyContact
      ? [
          {
            id: uuidv4(),
            name: dto.emergencyContact.name,
            relationship: dto.emergencyContact.relationship,
            phone: dto.emergencyContact.phone,
            email: dto.emergencyContact.email ?? null,
            isActive: true,
            createdAt: now,
          },
        ]
      : [];

    const allergies = (dto.allergies ?? []).map((a) => ({
      id: uuidv4(),
      allergen: a.allergen,
      allergyType: a.allergyType ?? null,
      severity: a.severity ?? null,
      reaction: a.reaction ?? null,
      notes: a.notes ?? null,
      isActive: true,
      createdAt: now,
    }));

    const conditions = (dto.conditions ?? []).map((c) => ({
      id: uuidv4(),
      conditionName: c.conditionName,
      conditionCode: c.conditionCode ?? null,
      status: c.status ?? 'ACTIVE',
      diagnosedAt: c.diagnosedAt ? new Date(c.diagnosedAt) : null,
      notes: c.notes ?? null,
      createdAt: now,
    }));

    const patient = new this.patientModel({
      _id: patientId,
      mrn,
      profileId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      middleName: dto.middleName ?? null,
      dateOfBirth: new Date(dto.dateOfBirth),
      gender: dto.gender,
      bloodGroup: dto.bloodGroup ?? null,
      phoneNumber: dto.phone,
      email: dto.email ?? null,
      address: dto.address ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
      pincode: dto.pincode ?? null,
      organizationId,
      facilityId: linkedFacilityId,
      userId: linkedUserId,
      registeredById: createdById,
      registeredAt: now,
      isActive: true,
      biometricEnrolled: false,
      emergencyContacts,
      allergies,
      conditions,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await patient.save();

    await this.auditLogs.log({
      eventType: 'PATIENT_CREATE',
      userId: createdById,
      organizationId,
      facilityId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'CREATE_PATIENT',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
      metadata: { mrn },
    });

    const created = await this.findById(
      patientId,
      organizationId,
      { id: createdById, role: 'ORG_ADMIN' },
      requestContext,
    );
    return {
      ...created,
      login: provisionedLogin
        ? {
            username: provisionedLogin.username,
            temporaryPassword: provisionedLogin.temporaryPassword,
          }
        : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Generate / reset patient login credentials
  // ---------------------------------------------------------------------------

  async generatePatientLogin(
    patientId: string,
    organizationId: string | null,
    requestingUser: { id: string; role: string },
    requestContext: { ip: string; userAgent: string; requestId: string },
  ) {
    const patient = await this.ensurePatientExists(patientId, organizationId, requestingUser.role);
    const email = (patient.email ?? '').trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Patient must have an email address to get login credentials.');
    }

    const now = new Date();
    let username: string;
    let linkedUserId: string;
    let createdAccount = false;
    let tookOverAccount = false;

    if (patient.userId) {
      const account = await this.userModel
        .findById(patient.userId)
        .select('role organizationId')
        .lean()
        .exec();
      if (!account || !(PATIENT_ROLES as readonly string[]).includes(account.role)) {
        throw new ConflictException('Linked account is not a patient account.');
      }
      if (account.organizationId !== organizationId) {
        throw new BadRequestException('Linked account belongs to another organization.');
      }
      linkedUserId = patient.userId;
      username = account.username ?? '';
    } else {
      const provisioned = await this.provisionPatientLogin({
        email,
        firstName: patient.firstName,
        lastName: patient.lastName,
        organizationId,
        facilityId: patient.facilityId ?? null,
      });
      if (provisioned) {
        username = provisioned.username;
        linkedUserId = provisioned.userId;
        createdAccount = true;
      } else {
        // Provisioning was skipped because an account with this email already
        // exists. Link it if it is a valid same-organization patient account.
        const existing = await this.userModel
          .findOne({ email, deletedAt: null })
          .select('_id username role organizationId')
          .lean()
          .exec();
        if (!existing) {
          throw new ConflictException('Could not create login credentials for this email.');
        }
        if (!(PATIENT_ROLES as readonly string[]).includes(existing.role)) {
          throw new ConflictException(
            'An account already exists for this email, but it is not a patient account. ' +
              'Change that user’s email in the admin panel, or use a different email for this patient, then try again.',
          );
        }
        if (existing.organizationId !== organizationId) {
          // A patient account with this email belongs to another organization.
          // Only a SUPER_ADMIN may take ownership of it and link it to this
          // patient. Everyone else must stay blocked.
          if (requestingUser.role !== UserRole.SUPER_ADMIN) {
            throw new ForbiddenException(
              'An account already exists for this email in another organization. ' +
                'Only a SUPER_ADMIN can take over that account.',
            );
          }
          tookOverAccount = true;
          await this.userModel
            .updateOne(
              { _id: existing._id },
              {
                $set: {
                  organizationId,
                  facilityId: patient.facilityId ?? null,
                  updatedAt: now,
                },
              },
            )
            .exec();
          // The account used to belong to another org — drop it from any other
          // org's patient record so the account is linked only here.
          await this.patientModel
            .updateMany(
              {
                userId: existing._id,
                organizationId: { $ne: organizationId },
                deletedAt: null,
              },
              { $set: { userId: null, updatedAt: now } },
            )
            .exec();
          this.logger.warn(
            `SUPER_ADMIN ${requestingUser.id} took over patient account ${existing._id} (${email}) from another organization.`,
          );
        }
        username = existing.username ?? '';
        linkedUserId = existing._id as string;
      }
    }

    // The patient now has an account — reset its password so the temporary
    // credentials handed to staff are guaranteed to work.
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await this.hashPassword(temporaryPassword);
    await this.userModel
      .updateOne(
        { _id: linkedUserId },
        { $set: { passwordHash, passwordChangedAt: null, isActive: true, updatedAt: now } },
      )
      .exec();
    // Revoke active sessions so the patient must log in again with the new password.
    await this.sessionModel
      .updateMany(
        { userId: linkedUserId, isRevoked: false },
        { $set: { isRevoked: true, updatedAt: now } },
      )
      .exec();

    // Persist the link when the patient record did not have one yet.
    await this.patientModel
      .updateOne({ _id: patientId }, { $set: { userId: linkedUserId, updatedAt: now } })
      .exec();

    await this.auditLogs.log({
      eventType: 'PATIENT_LOGIN_GENERATED',
      userId: requestingUser.id,
      organizationId,
      facilityId: patient.facilityId ?? null,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: createdAccount
        ? 'GENERATE_PATIENT_LOGIN'
        : tookOverAccount
          ? 'TAKE_OVER_PATIENT_ACCOUNT'
          : 'RESET_PATIENT_PASSWORD',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });

    this.logger.warn(
      `[DEV ONLY] ${createdAccount ? 'Generated' : 'Reset'} patient login for ${email}: temporaryPassword=${temporaryPassword}`,
    );

    return {
      userId: linkedUserId,
      email,
      username,
      temporaryPassword,
      createdAccount,
    };
  }

  // ---------------------------------------------------------------------------
  // List (paginated)
  // ---------------------------------------------------------------------------

  async findAll(
    organizationId: string | null,
    facilityId: string | undefined,
    query: PatientSearchDto,
    requestingUser: { id: string; role: string },
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder, order } = query;
    const skip = (page - 1) * limit;

    const isSuperAdmin = requestingUser.role === 'SUPER_ADMIN';
    const filter: Record<string, unknown> = {
      deletedAt: null,
    };
    if (!isSuperAdmin) filter['organizationId'] = organizationId;

    if (
      facilityId &&
      !['ORG_ADMIN', 'FACILITY_ADMIN', 'SUPER_ADMIN'].includes(requestingUser.role)
    ) {
      filter['facilityId'] = facilityId;
    }

    if (query.gender) filter['gender'] = query.gender;
    if (query.bloodGroup) {
      // The query param arrives as display format (e.g. "A+") from the frontend
      // filter UI, but the DB stores the enum string (e.g. "A_POSITIVE").
      const BLOOD_GROUP_DISPLAY_TO_DB: Record<string, string> = {
        'A+': 'A_POSITIVE',
        'A-': 'A_NEGATIVE',
        'B+': 'B_POSITIVE',
        'B-': 'B_NEGATIVE',
        'AB+': 'AB_POSITIVE',
        'AB-': 'AB_NEGATIVE',
        'O+': 'O_POSITIVE',
        'O-': 'O_NEGATIVE',
      };
      filter['bloodGroup'] = BLOOD_GROUP_DISPLAY_TO_DB[query.bloodGroup] ?? query.bloodGroup;
    }

    // Map sortable column names to patient fields (default: newest first).
    const sortFieldMap: Record<string, string> = {
      createdAt: 'registeredAt',
      updatedAt: 'updatedAt',
      registeredAt: 'registeredAt',
      name: 'lastName',
      lastName: 'lastName',
      mrn: 'mrn',
      dateOfBirth: 'dateOfBirth',
    };
    const sortField = sortFieldMap[sortBy] ?? 'registeredAt';
    const sortDir = (order ?? sortOrder ?? 'desc') === 'asc' ? 1 : -1;

    const [total, rows] = await Promise.all([
      this.patientModel.countDocuments(filter),
      this.patientModel
        .find(filter)
        .select(
          '_id profileId mrn firstName lastName dateOfBirth gender bloodGroup phoneNumber email isActive registeredAt',
        )
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return paginate(rows, total, page, limit);
  }

  // ---------------------------------------------------------------------------
  // Get by ID
  // ---------------------------------------------------------------------------

  async findById(
    patientId: string,
    organizationId: string | null,
    requestingUser: { id: string; role: string; facilityId?: string },
    requestContext: { ip: string; userAgent: string; requestId: string },
  ) {
    const filter: Record<string, unknown> = {
      _id: patientId,
      deletedAt: null,
    };
    if (requestingUser.role !== 'SUPER_ADMIN') filter['organizationId'] = organizationId;
    const patient = await this.patientModel.findOne(filter).lean();

    if (!patient) throw new NotFoundException('Patient not found.');

    await this.auditLogs.log({
      eventType: 'PATIENT_READ',
      userId: requestingUser.id,
      organizationId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'VIEW_PATIENT',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });

    return patient;
  }

  // ---------------------------------------------------------------------------
  // Get by 8-character profile code (admins / doctors)
  // ---------------------------------------------------------------------------

  async findByProfileId(
    profileId: string,
    organizationId: string | null,
    requestingUser: { id: string; role: string; facilityId?: string },
    requestContext: { ip: string; userAgent: string; requestId: string },
  ) {
    const code = profileId.trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(code)) {
      throw new BadRequestException('Invalid profile ID format.');
    }

    const filter: Record<string, unknown> = {
      profileId: code,
      deletedAt: null,
    };
    if (requestingUser.role !== 'SUPER_ADMIN') filter['organizationId'] = organizationId;

    const patient = await this.patientModel.findOne(filter).lean();

    if (!patient) throw new NotFoundException('Patient not found by profile ID.');

    await this.auditLogs.log({
      eventType: 'PATIENT_READ',
      userId: requestingUser.id,
      organizationId,
      resourceType: 'PATIENT',
      resourceId: patient._id,
      action: 'VIEW_PATIENT_BY_PROFILE',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
      metadata: { profileId: code },
    });

    return patient;
  }

  // ---------------------------------------------------------------------------
  // Get by canonical MediVault ID (MV-YYYY-NNNNNN)
  // ---------------------------------------------------------------------------

  async findByPatientId(
    rawPatientId: string,
    organizationId: string | null,
    requestingUser: { id: string; role: string; facilityId?: string },
    requestContext: { ip: string; userAgent: string; requestId: string },
  ) {
    const patientId = PatientIdService.normalize(rawPatientId);
    if (!patientId) {
      throw new BadRequestException('Invalid patient ID — expected MV-YYYY-NNNNNN.');
    }

    const filter: Record<string, unknown> = {
      patientId,
      deletedAt: null,
    };
    if (requestingUser.role !== 'SUPER_ADMIN') filter['organizationId'] = organizationId;

    const patient = await this.patientModel.findOne(filter).lean();

    if (!patient) throw new NotFoundException('Patient not found by MediVault ID.');

    await this.auditLogs.log({
      eventType: 'PATIENT_READ',
      userId: requestingUser.id,
      organizationId,
      resourceType: 'PATIENT',
      resourceId: patient._id,
      action: 'VIEW_PATIENT_BY_MV_ID',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
      metadata: { patientId },
    });

    return patient;
  }

  // ---------------------------------------------------------------------------
  // Get own patient record (role: PATIENT)
  // ---------------------------------------------------------------------------

  async getMyPatient(
    email: string,
    userId: string | null,
    organizationId: string | null,
    requestContext: { ip: string; userAgent: string; requestId: string },
  ) {
    // Prefer the account link (patient.userId === account id). If that misses
    // (e.g. a record created before linking, or a patient matched only by email),
    // fall back to matching the account's email so the user still resolves to
    // their own record.
    let patient = userId
      ? await this.patientModel.findOne({ deletedAt: null, organizationId, userId }).lean().exec()
      : null;

    if (!patient && email) {
      patient = await this.patientModel
        .findOne({
          deletedAt: null,
          organizationId,
          email: email.toLowerCase().trim(),
        })
        .lean()
        .exec();
    }

    if (!patient) {
      // No record linked to this account yet — not an error. The frontend
      // renders an explicit "no MediVault ID yet" state (and the create
      // flow links one), so return null instead of a 404.
      return null;
    }

    await this.auditLogs.log({
      eventType: 'PATIENT_READ',
      userId: email,
      organizationId,
      resourceType: 'PATIENT',
      resourceId: patient._id,
      action: 'VIEW_OWN_PROFILE',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });

    return patient;
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  async search(
    dto: PatientSearchDto,
    organizationId: string | null,
    facilityId: string | undefined,
    requestingUser: { id: string; role: string },
  ) {
    if (!dto.q && !dto.mrn && !dto.profileId && !dto.phone && !dto.email) {
      throw new BadRequestException('At least one search parameter is required.');
    }

    const isSuperAdmin = requestingUser.role === 'SUPER_ADMIN';
    const filter: Record<string, unknown> = {
      deletedAt: null,
    };
    if (!isSuperAdmin) filter['organizationId'] = organizationId;

    if (
      facilityId &&
      !['ORG_ADMIN', 'FACILITY_ADMIN', 'SUPER_ADMIN'].includes(requestingUser.role)
    ) {
      filter['facilityId'] = facilityId;
    }

    const orClauses: Record<string, unknown>[] = [];

    if (dto.q) {
      // Escape all regex special characters before using user input in a RegExp
      // to prevent ReDoS (Regular Expression Denial of Service) attacks.
      const escaped = dto.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      orClauses.push(
        { firstName: regex },
        { lastName: regex },
        { mrn: regex },
        { profileId: regex },
        { phoneNumber: regex },
        { email: regex },
      );
    }
    if (dto.mrn) orClauses.push({ mrn: dto.mrn });
    if (dto.profileId) orClauses.push({ profileId: dto.profileId.toUpperCase() });
    if (dto.phone) orClauses.push({ phoneNumber: dto.phone });
    if (dto.email) orClauses.push({ email: dto.email });

    if (orClauses.length) {
      filter['$or'] = orClauses;
    }

    const rows = await this.patientModel
      .find(filter)
      .select(
        '_id profileId mrn firstName lastName dateOfBirth gender bloodGroup phoneNumber email isActive registeredAt',
      )
      .sort({ lastName: 1 })
      .limit(50)
      .lean();

    return rows;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  async update(
    patientId: string,
    dto: UpdatePatientDto,
    organizationId: string | null,
    updatedById: string,
    role: string,
    requestContext: { ip: string; userAgent: string; requestId: string },
  ) {
    await this.ensurePatientExists(patientId, organizationId, role);

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };

    if (dto.firstName !== undefined) updateFields['firstName'] = dto.firstName;
    if (dto.lastName !== undefined) updateFields['lastName'] = dto.lastName;
    if (dto.middleName !== undefined) updateFields['middleName'] = dto.middleName;
    if (dto.phone !== undefined) updateFields['phoneNumber'] = dto.phone;
    if (dto.email !== undefined) updateFields['email'] = dto.email;
    if (dto.bloodGroup !== undefined) updateFields['bloodGroup'] = dto.bloodGroup;
    if (dto.address !== undefined) updateFields['address'] = dto.address;
    if (dto.dateOfBirth !== undefined) updateFields['dateOfBirth'] = new Date(dto.dateOfBirth);
    if (dto.gender !== undefined) updateFields['gender'] = dto.gender;
    if (dto.userId !== undefined) {
      if (dto.userId) {
        const account = await this.userModel
          .findById(dto.userId)
          .select('role organizationId facilityId')
          .lean()
          .exec();
        if (!account || account.organizationId !== organizationId) {
          throw new BadRequestException('Linked user account not found in this organization.');
        }
        updateFields['userId'] = dto.userId;
        if (updateFields['facilityId'] === undefined) {
          updateFields['facilityId'] = account.facilityId ?? null;
        }
      } else {
        updateFields['userId'] = null;
      }
    }

    const filter: Record<string, unknown> = {
      _id: patientId,
      deletedAt: null,
    };
    if (role !== 'SUPER_ADMIN') filter['organizationId'] = organizationId;

    await this.patientModel.updateOne(filter, { $set: updateFields });

    await this.auditLogs.log({
      eventType: 'PATIENT_UPDATE',
      userId: updatedById,
      organizationId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'UPDATE_PATIENT',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });

    return this.findById(patientId, organizationId, { id: updatedById, role }, requestContext);
  }

  /**
   * Self-service update for the signed-in patient. Only contact and address
   * data may be edited — clinical and identity fields (DOB, gender, blood
   * group, linked account) can never be touched here. The linked login
   * account is kept in sync so the email stays usable to sign in.
   */
  async updateMe(
    user: AccessTokenPayload,
    dto: UpdateMePatientDto,
    requestContext: { ip: string; userAgent: string; requestId: string },
  ) {
    const organizationId = user.organizationId ?? null;
    const accountEmail = user.email?.toLowerCase().trim();

    const patient = await this.patientModel
      .findOne({
        deletedAt: null,
        organizationId,
        ...(user.sub ? { userId: user.sub } : accountEmail ? { email: accountEmail } : {}),
      })
      .lean()
      .exec();
    if (!patient) {
      throw new NotFoundException('No patient profile is linked to this account.');
    }
    const patientId = String(patient._id);

    const patientFields: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.firstName !== undefined) patientFields['firstName'] = dto.firstName;
    if (dto.lastName !== undefined) patientFields['lastName'] = dto.lastName;
    if (dto.middleName !== undefined) patientFields['middleName'] = dto.middleName;
    if (dto.phone !== undefined) patientFields['phoneNumber'] = dto.phone;
    if (dto.address !== undefined) {
      patientFields['address'] = dto.address as unknown as Record<string, unknown>;
    }
    if (dto.city !== undefined) patientFields['city'] = dto.city;
    if (dto.state !== undefined) patientFields['state'] = dto.state;
    if (dto.pincode !== undefined) patientFields['pincode'] = dto.pincode;

    const userFields: Record<string, unknown> = {};
    if (dto.firstName !== undefined) userFields['firstName'] = dto.firstName;
    if (dto.lastName !== undefined) userFields['lastName'] = dto.lastName;
    if (dto.phone !== undefined) userFields['phone'] = dto.phone;
    if (dto.email !== undefined) {
      const newEmail = dto.email.toLowerCase().trim();
      if (!user.sub) {
        throw new BadRequestException('Cannot update the login email for this account.');
      }
      const clash = await this.userModel
        .findOne({ email: newEmail, _id: { $ne: user.sub }, deletedAt: null })
        .select('_id')
        .lean()
        .exec();
      if (clash) {
        throw new ConflictException('This email is already used by another account.');
      }
      patientFields['email'] = newEmail;
      userFields['email'] = newEmail;
    }

    await this.patientModel.updateOne({ _id: patientId }, { $set: patientFields }).exec();
    if (user.sub && Object.keys(userFields).length > 0) {
      await this.userModel
        .updateOne({ _id: user.sub, deletedAt: null }, { $set: userFields })
        .exec();
    }

    await this.auditLogs.log({
      eventType: 'PATIENT_UPDATE',
      userId: user.sub,
      organizationId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'UPDATE_OWN_PROFILE',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });

    return this.findById(
      patientId,
      organizationId,
      { id: user.sub, role: user.role },
      requestContext,
    );
  }

  // ---------------------------------------------------------------------------
  // Soft delete
  // ---------------------------------------------------------------------------

  async softDelete(
    patientId: string,
    organizationId: string | null,
    deletedById: string,
    role: string,
    requestContext: { ip: string; userAgent: string; requestId: string },
  ) {
    await this.ensurePatientExists(patientId, organizationId, role);

    const now = new Date();
    const filter: Record<string, unknown> = {
      _id: patientId,
      deletedAt: null,
    };
    if (role !== 'SUPER_ADMIN') filter['organizationId'] = organizationId;
    await this.patientModel.updateOne(filter, { $set: { deletedAt: now, updatedAt: now } });

    await this.auditLogs.log({
      eventType: 'PATIENT_DELETE',
      userId: deletedById,
      organizationId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'DELETE_PATIENT',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });

    return { message: 'Patient record deactivated.' };
  }

  // ---------------------------------------------------------------------------
  // Allergy management (embedded array)
  // ---------------------------------------------------------------------------

  async addAllergy(
    patientId: string,
    dto: AllergyDto,
    organizationId: string | null,
    userId: string,
    role: string,
  ) {
    await this.ensurePatientExists(patientId, organizationId, role);

    const allergyEntry = {
      id: uuidv4(),
      allergen: dto.allergen,
      allergyType: dto.allergyType ?? null,
      severity: dto.severity ?? null,
      reaction: dto.reaction ?? null,
      notes: dto.notes ?? null,
      isActive: true,
      createdAt: new Date(),
    };

    const filter: Record<string, unknown> = {
      _id: patientId,
      deletedAt: null,
    };
    if (role !== 'SUPER_ADMIN') filter['organizationId'] = organizationId;

    await this.patientModel.updateOne(filter, {
      $push: { allergies: allergyEntry },
      $set: { updatedAt: new Date() },
    });

    await this.auditLogs.log({
      eventType: 'PATIENT_UPDATE',
      userId,
      organizationId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'ADD_ALLERGY',
      result: 'success',
    });

    return allergyEntry;
  }

  async removeAllergy(
    allergyId: string,
    patientId: string,
    organizationId: string | null,
    userId: string,
    role: string,
  ) {
    await this.ensurePatientExists(patientId, organizationId, role);

    const filter: Record<string, unknown> = {
      _id: patientId,
      deletedAt: null,
    };
    if (role !== 'SUPER_ADMIN') filter['organizationId'] = organizationId;

    await this.patientModel.updateOne(
      filter,
      {
        $set: { 'allergies.$[elem].isActive': false, updatedAt: new Date() },
      },
      { arrayFilters: [{ 'elem.id': allergyId }] },
    );

    await this.auditLogs.log({
      eventType: 'PATIENT_UPDATE',
      userId,
      organizationId,
      resourceType: 'PATIENT',
      resourceId: patientId,
      action: 'REMOVE_ALLERGY',
      result: 'success',
    });

    return { message: 'Allergy removed.' };
  }

  // ---------------------------------------------------------------------------
  // Emergency contact management (embedded array)
  // ---------------------------------------------------------------------------

  async addEmergencyContact(
    patientId: string,
    dto: EmergencyContactDto,
    organizationId: string | null,
    _userId: string,
    role: string,
  ) {
    await this.ensurePatientExists(patientId, organizationId, role);

    const contactEntry = {
      id: uuidv4(),
      name: dto.name,
      relationship: dto.relationship,
      phone: dto.phone,
      email: dto.email ?? null,
      isActive: true,
      createdAt: new Date(),
    };

    const filter: Record<string, unknown> = {
      _id: patientId,
      deletedAt: null,
    };
    if (role !== 'SUPER_ADMIN') filter['organizationId'] = organizationId;

    await this.patientModel.updateOne(filter, {
      $push: { emergencyContacts: contactEntry },
      $set: { updatedAt: new Date() },
    });

    return contactEntry;
  }

  // ---------------------------------------------------------------------------
  // Patient summary (lightweight read)
  // ---------------------------------------------------------------------------

  async getPatientSummary(patientId: string, organizationId: string | null, role?: string) {
    const filter: Record<string, unknown> = {
      _id: patientId,
      deletedAt: null,
    };
    if (role !== 'SUPER_ADMIN') filter['organizationId'] = organizationId;
    const patient = await this.patientModel
      .findOne(filter)
      .select('_id profileId mrn firstName lastName dateOfBirth gender bloodGroup allergies')
      .lean();

    if (!patient) throw new NotFoundException('Patient not found.');

    const criticalSeverities = new Set(['SEVERE', 'LIFE_THREATENING']);
    const criticalAllergies = (patient.allergies ?? [])
      .filter((a) => a.isActive && criticalSeverities.has(a.severity ?? ''))
      .slice(0, 5)
      .map(({ allergen, severity }) => ({ allergen, severity }));

    const rest = { ...patient } as Record<string, unknown>;
    delete rest.allergies;
    return { ...rest, criticalAllergies };
  }
}
