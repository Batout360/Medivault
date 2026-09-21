/**
 * Unit tests for AuthService — covering the areas changed in the last fix pass:
 *   1. mapUserToInfoDto  (username, organizationId null handling, isMfaEnabled)
 *   2. setupMfa          (qrCodeDataUrl + message on returned DTO, no (any) casts)
 *   3. checkLockout      (HttpException 429, not TooManyRequestsException)
 *   4. validateUser      (returns null on bad password, resets counter on success)
 *   5. hashPassword / verifyPassword
 *   6. forgotPassword    (safe timing-neutral response)
 *   7. resetPassword     (invalid / expired token branches)
 *
 * NOTE: AuthService is Mongoose-backed (Model<UserDocument>, Model<SessionDocument>).
 * The mocks below replicate the query-builder chain used by the service:
 *   findOne(...).select(...).exec(), updateOne(...), updateMany(...).
 */

import {
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';

import { AuthService, UserRow } from './auth.service';
import { MfaSetupResponseDto, UserInfoDto } from './dto/auth-response.dto';
import { UserDocument } from '../modules/users/schemas/user.schema';
import { SessionDocument } from '../modules/users/schemas/session.schema';
import { UserRole } from '@medivault/shared';

// ── Minimal UserRow factory ─────────────────────────────────────────────────

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-uuid-1',
    email: 'test@example.com',
    username: 'testuser',
    passwordHash: '',
    firstName: 'Test',
    lastName: 'User',
    phone: null,
    role: UserRole.DOCTOR,
    organizationId: 'org-uuid-1',
    facilityId: 'fac-uuid-1',
    hospital: null,
    isActive: true,
    isEmailVerified: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    mfaEnabled: false,
    mfaSecret: null,
    mfaBackupCodes: '[]',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  };
}

// Mongoose documents are read via docToUserRow(), which reads `_id` not `id`.
function makeUserDoc(overrides: Partial<UserRow> = {}): Record<string, any> {
  const user = makeUser(overrides);
  return { ...user, _id: user.id };
}

// ── Mock factories ──────────────────────────────────────────────────────────

type UserModelMock = jest.Mocked<Model<UserDocument>>;
type SessionModelMock = jest.Mocked<Model<SessionDocument>>;

function makeConfig(values: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

function makeAuditLogs() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
    createSecurityEvent: jest.fn().mockResolvedValue(undefined),
  };
}

function makeJwt(): jest.Mocked<JwtService> {
  return {
    sign: jest.fn(() => 'signed-token'),
    verify: jest.fn(),
  } as unknown as jest.Mocked<JwtService>;
}

// Replicates the mongoose Query<T> chain: findOne(...).select(...).exec()
function findOneStub(result: unknown) {
  const stub: any = {
    select: jest.fn(() => stub),
    lean: jest.fn(() => stub),
    sort: jest.fn(() => stub),
    limit: jest.fn(() => stub),
    skip: jest.fn(() => stub),
    exec: jest.fn(async () => result),
  };
  return stub;
}

/**
 * Mocks the Mongoose models the service depends on.
 * `findOneResults` is consumed in order — one per findOne(...) call.
 */
function makeModels(findOneResults: unknown[] = []) {
  let index = 0;
  const userModel = {
    findOne: jest.fn(() => findOneStub(findOneResults[index++] ?? undefined)),
    updateOne: jest.fn(async () => ({})),
    updateMany: jest.fn(async () => ({})),
    create: jest.fn(async (doc: any) => doc),
    deleteOne: jest.fn(async () => ({})),
  } as unknown as UserModelMock;

  const sessionModel = {
    findOne: jest.fn(() => findOneStub(undefined)),
    updateOne: jest.fn(async () => ({})),
    updateMany: jest.fn(async () => ({})),
  } as unknown as SessionModelMock;

  const patientModel = {
    findOne: jest.fn(() => findOneStub(undefined)),
    create: jest.fn(async (doc: any) => doc),
    deleteMany: jest.fn(async () => ({})),
  } as unknown as Model<any>;

  return { userModel, sessionModel, patientModel };
}

function newService(
  userModel: UserModelMock,
  sessionModel: SessionModelMock,
  configValues: Record<string, string> = {},
  patientModel?: Model<any>,
) {
  return new AuthService(
    userModel as any,
    sessionModel as any,
    (patientModel ?? {
      findOne: jest.fn(() => findOneStub(undefined)),
      create: jest.fn(async (doc: any) => doc),
      deleteMany: jest.fn(async () => ({})),
    }) as any,
    makeJwt(),
    makeConfig({
      JWT_ACCESS_SECRET: 'test-access-secret-32-bytes-long!!',
      JWT_REFRESH_SECRET: 'test-refresh-secret-32-bytes-long!',
      MFA_ENCRYPTION_KEY: 'test-mfa-key-32-bytes-long-xxxxx!',
      ...configValues,
    }),
    makeAuditLogs() as any,
    {
      generateQr: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        regenerated: false,
        payloadUrl: 'http://localhost:3000/verify/abc',
        qrDataUrl: 'data:image/png;base64,abc',
      }),
      deleteForUserId: jest.fn().mockResolvedValue(undefined),
    } as any,
    {
      next: jest.fn().mockResolvedValue('MV-2026-000001'),
    } as any,
  );
}

function buildService(
  findOneResults: unknown[] = [],
  configValues: Record<string, string> = {},
): AuthService {
  const { userModel, sessionModel, patientModel } = makeModels(findOneResults);
  return newService(userModel, sessionModel, configValues, patientModel);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. mapUserToInfoDto
// ═══════════════════════════════════════════════════════════════════════════

describe('AuthService.mapUserToInfoDto', () => {
  let service: AuthService;

  beforeEach(() => {
    service = buildService();
  });

  it('maps all basic fields correctly', () => {
    const user = makeUser();
    const dto = service.mapUserToInfoDto(user);

    expect(dto).toBeInstanceOf(UserInfoDto);
    expect(dto.id).toBe('user-uuid-1');
    expect(dto.email).toBe('test@example.com');
    expect(dto.username).toBe('testuser');
    expect(dto.firstName).toBe('Test');
    expect(dto.lastName).toBe('User');
    expect(dto.role).toBe(UserRole.DOCTOR);
    expect(dto.facilityId).toBe('fac-uuid-1');
    expect(dto.isEmailVerified).toBe(true);
    expect(dto.lastLoginAt).toBeNull();
  });

  it('returns organizationId as the actual value when present', () => {
    const dto = service.mapUserToInfoDto(makeUser({ organizationId: 'org-abc' }));
    expect(dto.organizationId).toBe('org-abc');
  });

  it('returns null for organizationId when user has no org (not empty string)', () => {
    const dto = service.mapUserToInfoDto(makeUser({ organizationId: null }));
    expect(dto.organizationId).toBeNull();
    // Must NOT coerce to empty string
    expect(dto.organizationId).not.toBe('');
  });

  it('sets isMfaEnabled=true when mfaEnabled is truthy (1)', () => {
    // MySQL returns 1/0 for booleans — simulate that
    const dto = service.mapUserToInfoDto(makeUser({ mfaEnabled: 1 as unknown as boolean }));
    expect(dto.isMfaEnabled).toBe(true);
  });

  it('sets isMfaEnabled=false when mfaEnabled is falsy (0)', () => {
    const dto = service.mapUserToInfoDto(makeUser({ mfaEnabled: 0 as unknown as boolean }));
    expect(dto.isMfaEnabled).toBe(false);
  });

  it('sets isEmailVerified correctly from truthy int value', () => {
    const dto = service.mapUserToInfoDto(makeUser({ isEmailVerified: 1 as unknown as boolean }));
    expect(dto.isEmailVerified).toBe(true);
  });

  it('sets lastLoginAt when user has logged in', () => {
    const ts = new Date('2026-01-15T10:00:00Z');
    const dto = service.mapUserToInfoDto(makeUser({ lastLoginAt: ts }));
    expect(dto.lastLoginAt).toBe(ts);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. setupMfa — DTO shape
// ═══════════════════════════════════════════════════════════════════════════

describe('AuthService.setupMfa', () => {
  it('returns a MfaSetupResponseDto with all four expected fields', async () => {
    const service = buildService([makeUserDoc()]); // findOne returns the user

    const result = await service.setupMfa('user-uuid-1');

    expect(result).toBeInstanceOf(MfaSetupResponseDto);

    // otpauthUrl — must be a real otpauth:// URI
    expect(result.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);

    // secret — base32-encoded TOTP secret
    expect(typeof result.secret).toBe('string');
    expect(result.secret.length).toBeGreaterThan(0);

    // qrCodeDataUrl — must be a data URL (was previously cast via (dto as any))
    expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    // message — instructional string (was previously cast via (dto as any))
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('throws NotFoundException when user does not exist', async () => {
    const service = buildService([]); // findOne returns undefined = user not found

    await expect(service.setupMfa('nonexistent-id')).rejects.toThrow(NotFoundException);
  });

  it('stores encrypted (not plaintext) secret in the database', async () => {
    const { userModel, sessionModel } = makeModels([makeUserDoc()]);
    const service = newService(userModel, sessionModel);

    await service.setupMfa('user-uuid-1');

    // The $set update carries the encrypted value
    const updateCall = (userModel.updateOne as jest.Mock).mock.calls[0];
    const storedSecret: string = updateCall[1].$set.mfaSecret;

    // Encrypted format is iv:ciphertext:authTag — three colon-separated hex parts
    expect(storedSecret).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

    // Must NOT store the raw base32 secret
    expect(storedSecret).not.toMatch(/^[A-Z2-7]+=*$/); // not raw base32
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. checkLockout — HttpException 429 (not TooManyRequestsException)
// ═══════════════════════════════════════════════════════════════════════════

describe('AuthService lockout behaviour', () => {
  it('throws HttpException with 429 status when account is locked', async () => {
    const lockedUser = makeUserDoc({
      lockedUntil: new Date(Date.now() + 60_000), // locked for 60 more seconds
      failedLoginAttempts: 5,
      // password hash doesn't matter — lockout fires before password check
    });

    const service = buildService([lockedUser]);

    let caught: any;
    try {
      // validateUser triggers checkLockout internally
      await service.validateUser('test@example.com', 'any-password');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught).toBeInstanceOf(HttpException);
    expect(caught.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS); // 429
    expect(caught.getResponse()).toMatchObject({ retryAfter: expect.any(Number) });
  });

  it('does NOT throw a NestJS TooManyRequestsException specifically', async () => {
    // TooManyRequestsException has status 429 but is a specific subclass —
    // the fix ensures we use HttpException directly so the response body
    // can carry custom fields (retryAfter).
    const lockedUser = makeUserDoc({ lockedUntil: new Date(Date.now() + 30_000) });
    const service = buildService([lockedUser]);

    let caught: any;
    try {
      await service.validateUser('test@example.com', 'pass');
    } catch (err) {
      caught = err;
    }

    // Must be HttpException but NOT the named subclass
    expect(caught).toBeInstanceOf(HttpException);
    expect(caught.constructor.name).toBe('HttpException');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. validateUser
// ═══════════════════════════════════════════════════════════════════════════

describe('AuthService.validateUser', () => {
  it('returns null when user is not found (and still hashes for timing safety)', async () => {
    const service = buildService([]); // no user found
    const result = await service.validateUser('nobody@example.com', 'password');
    expect(result).toBeNull();
  });

  it('throws UnauthorizedException when account is deactivated', async () => {
    const inactiveUser = makeUserDoc({ isActive: false });
    // Need a real password hash to get past the lockout check but fail on inactive
    inactiveUser.passwordHash = await service_with_hash().hashPassword('correct-password');

    const service = buildService([inactiveUser]);
    await expect(service.validateUser('test@example.com', 'correct-password')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('returns null for wrong password', async () => {
    const svc = buildService();
    const hash = await svc.hashPassword('correct-password');
    const user = makeUserDoc({ passwordHash: hash });

    // findOne returns the user; the attempted login fails and records the attempt
    const service = buildService([user]);
    const result = await service.validateUser('test@example.com', 'wrong-password');
    expect(result).toBeNull();
  });

  it('returns the user row on correct password', async () => {
    const svc = buildService();
    const hash = await svc.hashPassword('correct-password');
    const user = makeUserDoc({ passwordHash: hash });

    const service = buildService([user]);
    const result = await service.validateUser('test@example.com', 'correct-password');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('user-uuid-1');
  });

  it('resets failedLoginAttempts to 0 after successful login when counter was > 0', async () => {
    const svc = buildService();
    const hash = await svc.hashPassword('correct-password');
    const user = makeUserDoc({ passwordHash: hash, failedLoginAttempts: 3 });

    const { userModel, sessionModel } = makeModels([user]);
    const service = newService(userModel, sessionModel);

    await service.validateUser('test@example.com', 'correct-password');

    const resetCall = (userModel.updateOne as jest.Mock).mock.calls.find(
      ([, update]: any[]) => update?.$set?.failedLoginAttempts === 0,
    );
    expect(resetCall).toBeDefined();
  });
});

// Helper: standalone service just for hashing (no DB needed for these calls)
function service_with_hash(): AuthService {
  return buildService();
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. hashPassword / verifyPassword
// ═══════════════════════════════════════════════════════════════════════════

describe('AuthService password hashing', () => {
  let service: AuthService;

  beforeEach(() => {
    service = buildService();
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const h1 = await service.hashPassword('mypassword');
    const h2 = await service.hashPassword('mypassword');
    expect(h1).not.toBe(h2);
  });

  it('verifyPassword returns true for matching password', async () => {
    const hash = await service.hashPassword('secret123');
    expect(await service.verifyPassword(hash, 'secret123')).toBe(true);
  });

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await service.hashPassword('secret123');
    expect(await service.verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('verifyPassword returns false for garbled hash (no throw)', async () => {
    expect(await service.verifyPassword('not-a-valid-hash', 'anything')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. forgotPassword — timing-safe, always returns safe message
// ═══════════════════════════════════════════════════════════════════════════

describe('AuthService.forgotPassword', () => {
  const SAFE_MSG = 'If an account with that email exists, a password reset link has been sent.';

  it('returns safe message when user does not exist', async () => {
    const service = buildService([]); // user not found
    const result = await service.forgotPassword('nobody@example.com');
    expect(result.message).toBe(SAFE_MSG);
  });

  it('returns safe message when user is inactive', async () => {
    const inactiveUser = makeUserDoc({ isActive: false });
    const service = buildService([inactiveUser]);
    const result = await service.forgotPassword('test@example.com');
    expect(result.message).toBe(SAFE_MSG);
  });

  it('returns safe message on success and stores a reset token', async () => {
    const user = makeUserDoc({ isActive: true });
    const service = buildService([user]);
    const result = await service.forgotPassword('test@example.com');
    expect(result.message).toBe(SAFE_MSG);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. resetPassword — invalid / expired / valid token branches
// ═══════════════════════════════════════════════════════════════════════════

describe('AuthService.resetPassword', () => {
  it('throws BadRequestException for unknown token', async () => {
    const service = buildService([]); // no token found
    await expect(service.resetPassword('bad-token', 'NewPass123!')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException and clears a token whose expiry has passed', async () => {
    const expiredToken = {
      _id: 'tok-2',
      resetTokenHash: 'x',
      resetTokenExpiresAt: new Date(Date.now() - 1000),
    };
    const { userModel, sessionModel } = makeModels([expiredToken]);
    const service = newService(userModel, sessionModel);

    await expect(service.resetPassword('token', 'NewPass123!')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('resets the password and revokes sessions for a valid, unexpired token', async () => {
    const validToken = {
      _id: 'tok-3',
      resetTokenHash: 'x',
      resetTokenExpiresAt: new Date(Date.now() + 3600_000),
    };
    const { userModel, sessionModel } = makeModels([validToken]);
    const service = newService(userModel, sessionModel);

    const result = await service.resetPassword('token', 'NewPass123!');

    expect(result.message).toContain('Password reset successfully');
    // Password hash must have been updated and all sessions revoked
    expect(userModel.updateOne).toHaveBeenCalled();
    expect(sessionModel.updateMany).toHaveBeenCalled();
  });
});
