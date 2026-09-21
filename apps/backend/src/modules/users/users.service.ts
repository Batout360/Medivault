import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import * as argon2 from 'argon2';

import { User, UserDocument } from './schemas/user.schema';
import { Session, SessionDocument } from './schemas/session.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateProfileDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';

const ARGON2_OPTIONS: argon2.HashOptions = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

/**
 * Exclusion-only projection — removes sensitive fields from query results.
 * MongoDB forbids mixing inclusion (1) and exclusion (0) in the same
 * projection (except for _id). Use exclusion-only to avoid a runtime error.
 */
const SAFE_FIELDS_PROJECTION = {
  passwordHash: 0,
  mfaSecret: 0,
  mfaBackupCodes: 0,
  resetTokenHash: 0,
  resetTokenExpiresAt: 0,
  emailVerificationTokenHash: 0,
  emailVerificationTokenExpiresAt: 0,
  failedLoginAttempts: 0,
  lockedUntil: 0,
  passwordChangedAt: 0,
  deletedAt: 0,
};

/** Shape returned by all public methods */
type SafeUser = Omit<
  User,
  'passwordHash' | 'mfaSecret' | 'resetTokenHash' | 'emailVerificationTokenHash' | 'mfaBackupCodes'
>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------

  async findAll(
    query: UserQueryDto,
    requestingUser: { id: string; role: string; organizationId?: string | null },
  ): Promise<PaginatedResult<SafeUser>> {
    const { page = 1, limit = 20, q, role, organizationId, facilityId, isActive } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { deletedAt: null };

    // Organisation scoping
    if (requestingUser.role !== 'SUPER_ADMIN') {
      filter['organizationId'] = requestingUser.organizationId ?? null;
    } else if (organizationId) {
      filter['organizationId'] = organizationId;
    }

    if (role) filter['role'] = role;
    if (facilityId) filter['facilityId'] = facilityId;
    if (isActive !== undefined) filter['isActive'] = isActive === 'true';
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter['$or'] = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { username: regex },
      ];
    }

    const [docs, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select(SAFE_FIELDS_PROJECTION)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    // Remap _id → id for API consistency
    const data = docs.map(this.remapId);

    return paginate(data as SafeUser[], total, page, limit);
  }

  // ---------------------------------------------------------------------------
  // findById
  // ---------------------------------------------------------------------------

  async findById(
    userId: string,
    requestingUser: { id: string; role: string; organizationId?: string | null },
  ): Promise<SafeUser> {
    const filter: Record<string, unknown> = { _id: userId, deletedAt: null };

    if (requestingUser.role !== 'SUPER_ADMIN') {
      filter['organizationId'] = requestingUser.organizationId ?? null;
    }

    const doc = await this.userModel.findOne(filter).select(SAFE_FIELDS_PROJECTION).lean().exec();

    if (!doc) throw new NotFoundException('User not found.');
    return this.remapId(doc) as SafeUser;
  }

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  async create(
    dto: CreateUserDto,
    requestingUser: {
      id: string;
      role: string;
      organizationId?: string | null;
      facilityId?: string | null;
    },
    requestContext: { ip: string; userAgent: string; requestId: string },
  ): Promise<SafeUser> {
    if (dto.role === 'SUPER_ADMIN' && requestingUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN can create SUPER_ADMIN accounts.');
    }

    // Facility admins may only create staff inside their own org and facility.
    let organizationId =
      requestingUser.role === 'SUPER_ADMIN'
        ? (dto.organizationId ?? null)
        : (requestingUser.organizationId ?? dto.organizationId ?? null);
    let facilityId = dto.facilityId ?? null;
    if (requestingUser.role === 'FACILITY_ADMIN') {
      organizationId = requestingUser.organizationId ?? organizationId;
      facilityId = requestingUser.facilityId ?? facilityId;
    }
    if (dto.role === 'ORG_ADMIN' && requestingUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN can create ORG_ADMIN accounts.');
    }
    if (requestingUser.role === 'FACILITY_ADMIN' && dto.role === 'FACILITY_ADMIN') {
      throw new ForbiddenException(
        'Only SUPER_ADMIN or ORG_ADMIN can create FACILITY_ADMIN accounts.',
      );
    }

    // Uniqueness checks
    const [existingEmail, existingUsername] = await Promise.all([
      this.userModel.findOne({ email: dto.email.toLowerCase().trim() }).select('_id').lean().exec(),
      this.userModel
        .findOne({ username: dto.username.toLowerCase().trim() })
        .select('_id')
        .lean()
        .exec(),
    ]);
    if (existingEmail) throw new ConflictException('Email address is already registered.');
    if (existingUsername) throw new ConflictException('Username is already taken.');

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);
    const now = new Date();
    const id = uuidv4();

    const newUser = new this.userModel({
      _id: id,
      email: dto.email.toLowerCase().trim(),
      username: dto.username.toLowerCase().trim(),
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone ?? null,
      role: dto.role,
      organizationId,
      facilityId,
      hospital: dto.hospital?.trim() || null,
      isActive: true,
      isEmailVerified: false,
      mfaEnabled: false,
      mfaBackupCodes: '[]',
      failedLoginAttempts: 0,
      createdAt: now,
      updatedAt: now,
    });

    await newUser.save();

    // Fetch back with safe projection
    const created = await this.findById(id, { id: requestingUser.id, role: 'SUPER_ADMIN' });

    await this.auditLogs.log({
      eventType: 'USER_CREATE',
      userId: requestingUser.id,
      organizationId: organizationId ?? undefined,
      resourceType: 'USER',
      resourceId: id,
      action: 'CREATE_USER',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
      metadata: { role: dto.role, email: dto.email },
    });

    this.logger.log(`User created: ${dto.email} by ${requestingUser.id}`);
    return created;
  }

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  async update(
    userId: string,
    dto: UpdateUserDto,
    requestingUser: {
      id: string;
      role: string;
      organizationId?: string | null;
      facilityId?: string | null;
    },
    requestContext: { ip: string; userAgent: string; requestId: string },
  ): Promise<SafeUser> {
    // Verify existence and org scope
    const existing = await this.findById(userId, requestingUser);

    if (dto.role === 'SUPER_ADMIN' && requestingUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN can assign SUPER_ADMIN role.');
    }

    // FACILITY_ADMIN may edit clinical/patient staff inside their org — but may
    // not touch other admins or change roles/facilities.
    if (requestingUser.role === 'FACILITY_ADMIN') {
      if (dto.role !== undefined) {
        throw new ForbiddenException('Facility admins cannot change user roles.');
      }
      if (dto.facilityId !== undefined && dto.facilityId !== (requestingUser.facilityId ?? null)) {
        throw new ForbiddenException(
          'Facility admins can only assign users to their own facility.',
        );
      }
      if (
        existing.role === 'SUPER_ADMIN' ||
        existing.role === 'ORG_ADMIN' ||
        existing.role === 'FACILITY_ADMIN'
      ) {
        throw new ForbiddenException('You cannot modify other administrator accounts.');
      }
    }
    if (
      requestingUser.role !== 'SUPER_ADMIN' &&
      dto.role === 'ORG_ADMIN' &&
      existing.role !== 'ORG_ADMIN'
    ) {
      throw new ForbiddenException('Only SUPER_ADMIN can assign ORG_ADMIN role.');
    }

    const updates: Partial<User> & { updatedAt: Date } = { updatedAt: new Date() };
    if (dto.firstName !== undefined) updates.firstName = dto.firstName;
    if (dto.lastName !== undefined) updates.lastName = dto.lastName;
    if (dto.phone !== undefined) updates.phone = dto.phone;
    if (dto.isActive !== undefined) updates.isActive = dto.isActive;
    if (dto.role !== undefined) updates.role = dto.role as any;
    if (dto.facilityId !== undefined) updates.facilityId = dto.facilityId.trim() || null;
    if (dto.hospital !== undefined) updates.hospital = dto.hospital.trim() || null;

    // Changing the sign-in email — must stay unique across all active accounts.
    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      if (email && email !== existing.email) {
        const clash = await this.userModel
          .findOne({ email, _id: { $ne: userId }, deletedAt: null })
          .select('_id')
          .lean()
          .exec();
        if (clash) throw new ConflictException('Email address is already registered.');
        updates.email = email;
        // The new address has not been verified yet.
        updates.isEmailVerified = false;
      }
    }

    // Changing the sign-in username — must stay unique across all active accounts.
    if (dto.username !== undefined) {
      const username = dto.username.toLowerCase().trim();
      if (username && username !== existing.username) {
        const clash = await this.userModel
          .findOne({ username, _id: { $ne: userId }, deletedAt: null })
          .select('_id')
          .lean()
          .exec();
        if (clash) throw new ConflictException('Username is already taken.');
        updates.username = username;
      }
    }

    await this.userModel.updateOne({ _id: userId }, { $set: updates }).exec();

    await this.auditLogs.log({
      eventType: 'USER_UPDATE',
      userId: requestingUser.id,
      organizationId: requestingUser.organizationId ?? undefined,
      resourceType: 'USER',
      resourceId: userId,
      action: 'UPDATE_USER',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });

    return this.findById(userId, requestingUser);
  }

  // ---------------------------------------------------------------------------
  // deactivate
  // ---------------------------------------------------------------------------

  async deactivate(
    userId: string,
    requestingUser: { id: string; role: string; organizationId?: string | null },
    requestContext: { ip: string; userAgent: string; requestId: string },
  ): Promise<{ message: string }> {
    const existing = await this.findById(userId, requestingUser);

    if (userId === requestingUser.id) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }
    if (
      existing.role === 'SUPER_ADMIN' ||
      existing.role === 'ORG_ADMIN' ||
      existing.role === 'FACILITY_ADMIN'
    ) {
      if (requestingUser.role !== 'SUPER_ADMIN') {
        throw new ForbiddenException('Insufficient permissions.');
      }
    }

    const now = new Date();

    await Promise.all([
      this.userModel
        .updateOne({ _id: userId }, { $set: { isActive: false, deletedAt: now, updatedAt: now } })
        .exec(),
      // Revoke all active sessions for the user
      this.sessionModel
        .updateMany({ userId, isRevoked: false }, { $set: { isRevoked: true, updatedAt: now } })
        .exec(),
    ]);

    await this.auditLogs.log({
      eventType: 'USER_DELETE',
      userId: requestingUser.id,
      organizationId: requestingUser.organizationId ?? undefined,
      resourceType: 'USER',
      resourceId: userId,
      action: 'DEACTIVATE_USER',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });

    return { message: 'User account deactivated.' };
  }

  // ---------------------------------------------------------------------------
  // adminResetPassword
  // ---------------------------------------------------------------------------

  async adminResetPassword(
    userId: string,
    newPassword: string,
    requestingUser: { id: string; role: string; organizationId?: string | null },
    requestContext: { ip: string; userAgent: string; requestId: string },
  ): Promise<{ message: string }> {
    const existing = await this.findById(userId, requestingUser);

    // A facility admin may not reset the password of any administrator account.
    if (
      requestingUser.role === 'FACILITY_ADMIN' &&
      (existing.role === 'SUPER_ADMIN' ||
        existing.role === 'ORG_ADMIN' ||
        existing.role === 'FACILITY_ADMIN')
    ) {
      throw new ForbiddenException('You cannot reset another administrator’s password.');
    }
    // Only a super admin may reset another super admin's password.
    if (existing.role === 'SUPER_ADMIN' && requestingUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN can reset this account’s password.');
    }

    const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);
    const now = new Date();

    await Promise.all([
      this.userModel
        .updateOne(
          { _id: userId },
          {
            $set: {
              passwordHash,
              passwordChangedAt: now,
              failedLoginAttempts: 0,
              lockedUntil: null,
              updatedAt: now,
            },
          },
        )
        .exec(),
      // Revoke all sessions so the user must re-authenticate with the new password
      this.sessionModel
        .updateMany({ userId, isRevoked: false }, { $set: { isRevoked: true, updatedAt: now } })
        .exec(),
    ]);

    await this.auditLogs.log({
      eventType: 'USER_UPDATE',
      userId: requestingUser.id,
      organizationId: requestingUser.organizationId ?? undefined,
      resourceType: 'USER',
      resourceId: userId,
      action: 'ADMIN_RESET_PASSWORD',
      result: 'success',
      ipAddress: requestContext.ip,
      userAgent: requestContext.userAgent,
      requestId: requestContext.requestId,
    });

    return { message: 'Password reset successfully.' };
  }

  // ---------------------------------------------------------------------------
  // getProfile  (own-user lookup — no org-scope check)
  // ---------------------------------------------------------------------------

  async getProfile(userId: string): Promise<SafeUser> {
    const doc = await this.userModel
      .findOne({ _id: userId })
      .select(SAFE_FIELDS_PROJECTION)
      .lean()
      .exec();

    if (!doc) throw new NotFoundException('User not found.');
    return this.remapId(doc) as SafeUser;
  }

  // ---------------------------------------------------------------------------
  // updateProfile  (own-user self-service update)
  // ---------------------------------------------------------------------------

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<SafeUser> {
    const updates: Partial<User> & { updatedAt: Date } = { updatedAt: new Date() };
    if (dto.firstName !== undefined) updates.firstName = dto.firstName;
    if (dto.lastName !== undefined) updates.lastName = dto.lastName;
    if (dto.phone !== undefined) updates.phone = dto.phone;
    if (dto.hospital !== undefined) updates.hospital = dto.hospital.trim() || null;

    await this.userModel.updateOne({ _id: userId }, { $set: updates }).exec();
    return this.getProfile(userId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Lean Mongoose documents use `_id` as the key. Remap to `id` so the API
   * surface matches the TypeORM-era shape that controllers and DTOs rely on.
   */
  private remapId(doc: Record<string, unknown>): Record<string, unknown> {
    const { _id, ...rest } = doc as any;
    return { id: _id, ...rest };
  }
}
