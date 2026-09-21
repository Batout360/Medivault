import { UserRole } from '../enums/roles.enum';

/**
 * Self-service patient identity payload submitted alongside account registration.
 * Used by POST /auth/register when `createPatientIdentity` is true.
 */
export interface SelfRegisterIdentityDto {
  dateOfBirth?: string; // YYYY-MM-DD
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
  bloodGroup?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  emergencyContact?: {
    name: string;
    relationship: string;
    phone?: string;
    email?: string;
  };
  allergies?: Array<{
    allergen: string;
    allergyType?: string;
    severity?: string;
    reaction?: string;
  }>;
  conditions?: Array<{
    conditionName: string;
    diagnosedAt?: string;
    notes?: string;
  }>;
}

/** Patient identity summary returned from self-service registration. */
export interface RegisteredIdentityDto {
  patientRecordId: string; // Internal Mongo UUID (not exposed publicly)
  patientId: string; // Canonical MV-YYYY-NNNNNN
  profileId: string; // 8-char profile code used by QR
  mvId: string; // Derived MV-XXXX-XXXX display handle
  qr: {
    status: string;
    payloadUrl: string;
    qrDataUrl: string; // data:image/png;base64 for instant onboarding display
  };
}

/** Response body from POST /auth/register for a self-service account. */
export interface RegisterResponseDto {
  message: string;
  userId: string;
  identity?: RegisteredIdentityDto;
}

/**
 * Request body for email/password login
 */
export interface LoginDto {
  email: string;
  password: string;
  rememberMe?: boolean;
  deviceFingerprint?: string;
}

/**
 * Request body for biometric login (staff)
 */
export interface BiometricLoginDto {
  deviceId: string;
  captureSessionToken: string;
  organizationId: string;
  facilityId?: string;
}

/**
 * Response returned on successful authentication
 */
export interface AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;           // Seconds until access token expiry
  tokenType: 'Bearer';
  user: AuthenticatedUserDto;
  requiresMfa: boolean;
  mfaToken?: string;           // Short-lived token used to complete MFA
}

/**
 * Authenticated user payload embedded in the auth response
 */
export interface AuthenticatedUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  organizationId: string;
  facilityId: string | null;
  hospital?: string | null;
  isActive: boolean;
  permissions: string[];
  avatarUrl: string | null;
  lastLoginAt: Date | null;
}

/**
 * Request body for refreshing the access token
 */
export interface RefreshTokenDto {
  refreshToken: string;
}

/**
 * Request body to initiate a password reset
 */
export interface ForgotPasswordDto {
  email: string;
}

/**
 * Request body to complete a password reset
 */
export interface ResetPasswordDto {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Request body to change password while logged in
 */
export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * MFA setup response (TOTP)
 */
export interface MfaSetupResponseDto {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

/**
 * MFA verification request
 */
export interface MfaVerifyDto {
  mfaToken: string;           // From AuthResponseDto.mfaToken
  code: string;               // 6-digit TOTP code or backup code
  deviceFingerprint?: string;
  trustDevice?: boolean;
}

/**
 * User registration DTO (used by admin to invite users)
 */
export interface RegisterUserDto {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  organizationId: string;
  facilityId?: string;
  phoneNumber?: string;
  department?: string;
  specialization?: string;
  licenseNumber?: string;
  temporaryPassword?: string;  // If not provided, a welcome email with set-password link is sent
  sendWelcomeEmail?: boolean;
}

/**
 * Token payload (decoded JWT claims)
 */
export interface JwtPayload {
  sub: string;                // User ID
  email: string;
  role: UserRole;
  orgId: string;
  facId: string | null;
  permissions: string[];
  iat: number;
  exp: number;
  jti: string;               // JWT ID for revocation
  sessionId: string;
}

/**
 * Session info returned from /auth/session endpoint
 */
export interface SessionInfoDto {
  userId: string;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  isCurrentSession: boolean;
}

/**
 * Password validation rules
 */
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxRepeatedChars: number;
  preventCommonPasswords: boolean;
  preventPasswordReuse: number;  // Number of previous passwords to check
  expiryDays: number | null;    // null = never expires
}
