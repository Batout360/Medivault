import { registerAs } from '@nestjs/config';

/**
 * Security configuration for the Medivault authentication system.
 * All sensitive thresholds are centralised here so they can be tuned
 * without touching business logic.
 */
export const securityConfig = registerAs('security', () => ({
  // ─── Account Lockout ──────────────────────────────────────────────────────

  /**
   * Number of consecutive failed login attempts before the account is locked.
   */
  maxLoginAttempts: 5,

  /**
   * Base lockout duration in seconds.
   * Actual lockout = 2^failedAttempts seconds (progressive back-off).
   * e.g. after attempt 5: 2^5 = 32 s, attempt 6: 64 s, ...
   */
  lockoutDurationSeconds: 30 * 60, // hard ceiling 30 minutes

  /**
   * Window (seconds) within which failed attempts are counted.
   */
  failedAttemptWindowSeconds: 15 * 60, // 15 minutes

  // ─── Password Policy ─────────────────────────────────────────────────────

  /**
   * Argon2id hashing parameters — OWASP 2023 recommended minimum.
   */
  argon2: {
    memoryCost: 65536, // 64 MiB
    timeCost: 3, // 3 iterations
    parallelism: 4, // 4 parallel threads
    hashLength: 32,
  },

  /**
   * Minimum / maximum password lengths enforced at the DTO level as well.
   */
  passwordMinLength: 12,
  passwordMaxLength: 128,

  /**
   * How many previous password hashes to retain to prevent re-use.
   */
  passwordHistoryDepth: 5,

  /**
   * Password expiry in days (0 = never expires).
   */
  passwordExpiryDays: 90,

  // ─── Token & Session ─────────────────────────────────────────────────────

  /**
   * Access token lifetime (seconds).  15 minutes.
   */
  accessTokenTtlSeconds: 15 * 60,

  /**
   * Refresh token lifetime (seconds).  7 days.
   */
  refreshTokenTtlSeconds: 7 * 24 * 60 * 60,

  /**
   * Maximum number of concurrent active sessions per user.
   */
  maxActiveSessions: 5,

  // ─── Email Verification & Password Reset ─────────────────────────────────

  /**
   * Email verification token validity (seconds).  24 hours.
   */
  emailVerificationTtlSeconds: 24 * 60 * 60,

  /**
   * Password reset token validity (seconds).  1 hour.
   */
  passwordResetTtlSeconds: 60 * 60,

  // ─── MFA ─────────────────────────────────────────────────────────────────

  /**
   * TOTP window — number of 30-second steps either side to tolerate clock skew.
   */
  totpWindow: 1,

  /**
   * Issuer shown in authenticator app.
   */
  totpIssuer: 'Medivault',

  // ─── Cookie ──────────────────────────────────────────────────────────────

  /**
   * Whether to set Secure flag on cookies.
   * Always true in production; dev can override via NODE_ENV.
   */
  secureCookies: process.env.NODE_ENV === 'production',

  /**
   * SameSite policy for auth cookies.
   */
  sameSite: 'strict' as const,

  // ─── Rate Limits (used as metadata / documentation) ──────────────────────

  /**
   * Maximum login attempts per minute per IP.
   */
  loginRateLimit: 5,

  /**
   * Maximum forgot-password requests per hour per IP.
   */
  forgotPasswordRateLimit: 3,
}));

export type SecurityConfig = ReturnType<typeof securityConfig>;
