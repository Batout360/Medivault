import { registerAs } from '@nestjs/config';

/**
 * JWT configuration — sourced exclusively from environment variables.
 * Both secrets must be cryptographically strong (min 32 chars, ideally 64).
 * Generate with: openssl rand -base64 64
 */
export const jwtConfig = registerAs('jwt', () => ({
  /**
   * Secret for signing access tokens.
   * Env: JWT_ACCESS_SECRET
   */
  accessSecret: process.env.JWT_ACCESS_SECRET as string,

  /**
   * Secret for signing refresh tokens.
   * MUST be different from accessSecret.
   * Env: JWT_REFRESH_SECRET
   */
  refreshSecret: process.env.JWT_REFRESH_SECRET as string,

  /**
   * Access token lifetime.
   * Env: JWT_ACCESS_EXPIRES_IN   (default: "15m")
   */
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',

  /**
   * Refresh token lifetime.
   * Env: JWT_REFRESH_EXPIRES_IN  (default: "7d")
   */
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  /**
   * Numeric seconds for the cookie max-age of the access token.
   * 15 minutes = 900 seconds.
   */
  accessCookieMaxAge: 15 * 60 * 1000, // ms — used for cookie options

  /**
   * Numeric milliseconds for the cookie max-age of the refresh token.
   * 7 days.
   */
  refreshCookieMaxAge: 7 * 24 * 60 * 60 * 1000, // ms

  /**
   * JWT issuer claim — identifies the issuer of the token.
   */
  issuer: 'medivault-api',

  /**
   * JWT audience claim.
   */
  audience: 'medivault-clients',
}));

export type JwtConfig = ReturnType<typeof jwtConfig>;
