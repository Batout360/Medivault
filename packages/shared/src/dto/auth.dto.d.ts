import { UserRole } from '../enums/roles.enum';
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
    expiresIn: number;
    tokenType: 'Bearer';
    user: AuthenticatedUserDto;
    requiresMfa: boolean;
    mfaToken?: string;
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
    mfaToken: string;
    code: string;
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
    temporaryPassword?: string;
    sendWelcomeEmail?: boolean;
}
/**
 * Token payload (decoded JWT claims)
 */
export interface JwtPayload {
    sub: string;
    email: string;
    role: UserRole;
    orgId: string;
    facId: string | null;
    permissions: string[];
    iat: number;
    exp: number;
    jti: string;
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
    preventPasswordReuse: number;
    expiryDays: number | null;
}
//# sourceMappingURL=auth.dto.d.ts.map