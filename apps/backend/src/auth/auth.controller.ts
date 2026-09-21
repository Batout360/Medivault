import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AuthResponseDto,
  MessageResponseDto,
  MfaSetupResponseDto,
  SessionInfoDto,
  UserInfoDto,
} from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import {
  ChangePasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  VerifyMfaDto,
} from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AccessTokenPayload, UserRow } from './auth.service';
import { ConfigService } from '@nestjs/config';

/** Cookie name constants */
const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

/**
 * AuthController — all /auth/* REST endpoints.
 *
 * Cookie security policy:
 *   - httpOnly  : true  (JS cannot access the cookie)
 *   - secure    : true in production (HTTPS only)
 *   - sameSite  : 'strict' (no cross-site sending)
 *   - path      : '/'
 *
 * Tokens are never exposed in the JSON response body for browser clients.
 * The `accessToken` field in AuthResponseDto exists only for non-browser
 * clients (mobile apps, etc.) that cannot read cookies.
 */
@ApiTags('Authentication')
@UseGuards(JwtAuthGuard)
@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.isProduction = configService.get<string>('NODE_ENV') === 'production';
  }

  // ─── Cookie helpers ───────────────────────────────────────────────────────

  private setAccessTokenCookie(res: Response, token: string): void {
    res.cookie(ACCESS_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60 * 1000, // 15 minutes in ms
    });
  }

  private setRefreshTokenCookie(res: Response, token: string): void {
    res.cookie(REFRESH_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth/refresh', // Scope refresh token to refresh endpoint only
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    });
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      path: '/',
    });
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/login
  // ─────────────────────────────────────────────────────────────────────────

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'Authenticates the user with email/password (+ TOTP code if MFA is enabled). ' +
      'Sets httpOnly access_token and refresh_token cookies. ' +
      'Returns a minimal user object in the body — the access token is included ' +
      'only for non-browser clients.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many requests — account locked or rate limited' })
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: LoginDto,
  ): Promise<AuthResponseDto> {
    // LocalAuthGuard has already called authService.validateUser and attached user to req.user
    const validatedUser = req.user as UserRow;
    const ip = (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';

    const result = await this.authService.login(validatedUser, dto, ip, userAgent);

    this.setAccessTokenCookie(res, result.accessToken);
    this.setRefreshTokenCookie(res, result.refreshToken);

    const response = new AuthResponseDto();
    response.accessToken = result.accessToken; // for non-browser clients
    response.tokenType = 'Bearer';
    response.expiresIn = result.expiresIn;
    response.user = result.user;
    return response;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/register
  // ─────────────────────────────────────────────────────────────────────────

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Create a new account (self-registration)',
    description:
      'Allows new users to register accounts with PATIENT, DOCTOR, NURSE, or RECEPTIONIST roles. ' +
      'SUPER_ADMIN and ADMIN accounts cannot be self-registered — they must be created by an administrator. ' +
      'Returns a confirmation message and the new user ID.',
  })
  @ApiResponse({
    status: 201,
    type: MessageResponseDto,
    description: 'Account created successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error or disallowed role' })
  @ApiResponse({ status: 409, description: 'Email or username already in use' })
  async register(
    @Req() req: Request,
    @Body() dto: RegisterDto,
  ): Promise<MessageResponseDto & { userId: string }> {
    const ip =
      (req.headers['x-forwarded-for'] as string) ?? (req as any).socket?.remoteAddress ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    const result = await this.authService.register(dto, ip, userAgent);
    return result as MessageResponseDto & { userId: string };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/logout
  // ─────────────────────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Log out of the current session',
    description: 'Revokes the current session and clears auth cookies.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async logout(
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    const ip = (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';
    await this.authService.logout(user.sub, user.sessionId, ip, userAgent);
    this.clearAuthCookies(res);
    const response = new MessageResponseDto();
    response.message = 'Logged out successfully.';
    return response;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/refresh
  // ─────────────────────────────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) // More permissive than the auth throttler: 20/min
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Rotate refresh token and obtain a new access token',
    description:
      'Reads the refresh_token httpOnly cookie, validates it, and issues a ' +
      'new token pair (rotation). The old refresh token is immediately revoked.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto, description: 'Tokens rotated' })
  @ApiResponse({ status: 401, description: 'Invalid, expired, or already-used refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ expiresIn: number; tokenType: string }> {
    const rawRefreshToken = (req.cookies as Record<string, string>)?.[REFRESH_TOKEN_COOKIE];

    if (!rawRefreshToken) {
      this.clearAuthCookies(res);
      throw new UnauthorizedException('Refresh token cookie is missing.');
    }

    const ip = (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? 'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';

    const result = await this.authService.refreshTokens(rawRefreshToken, ip, userAgent);

    this.setAccessTokenCookie(res, result.accessToken);
    this.setRefreshTokenCookie(res, result.refreshToken);

    return { expiresIn: result.expiresIn, tokenType: 'Bearer' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/forgot-password
  // ─────────────────────────────────────────────────────────────────────────

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 3, ttl: 3_600_000 } }) // 3 per hour per IP
  @ApiOperation({
    summary: 'Request a password reset email',
    description:
      'Sends a password reset link if the email is registered. ' +
      'Always returns the same response to prevent user enumeration.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    const result = await this.authService.forgotPassword(dto.email);
    const response = new MessageResponseDto();
    response.message = result.message;
    return response;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/reset-password
  // ─────────────────────────────────────────────────────────────────────────

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using the token from the email link',
    description: 'Validates the one-time reset token and sets a new password.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    const result = await this.authService.resetPassword(dto.token, dto.newPassword);
    const response = new MessageResponseDto();
    response.message = result.message;
    return response;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/verify-email
  // ─────────────────────────────────────────────────────────────────────────

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email address using the token from the verification email',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<MessageResponseDto> {
    const result = await this.authService.verifyEmail(dto.token);
    const response = new MessageResponseDto();
    response.message = result.message;
    return response;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/change-password
  // ─────────────────────────────────────────────────────────────────────────

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Change password while authenticated',
    description: 'Requires the current password. All other sessions are revoked on success.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 400, description: 'New password reuses current password' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  async changePassword(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    const result = await this.authService.changePassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
      user.sessionId,
    );
    const response = new MessageResponseDto();
    response.message = result.message;
    return response;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /auth/session
  // ─────────────────────────────────────────────────────────────────────────

  @Get('session')
  @SkipThrottle({ default: true, auth: true })
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Restore an existing session (used on page reload)',
    description:
      'Returns the current authenticated user and a refreshed access token. ' +
      'Used by the frontend on page load to restore in-memory auth state from the HttpOnly cookie.',
  })
  @ApiResponse({ status: 200, description: 'Session info', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'No valid session' })
  async getSession(
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserInfoDto; accessToken: string; expiresAt: number }> {
    const userInfo = await this.authService.getCurrentUser(user.sub);
    // Issue a fresh short-lived access token so the in-memory store is always current
    const { accessToken, expiresIn } = this.authService.issueAccessToken(user);
    this.setAccessTokenCookie(res, accessToken);
    return {
      user: userInfo,
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /auth/me
  // ─────────────────────────────────────────────────────────────────────────

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get the current authenticated user profile',
  })
  @ApiResponse({ status: 200, type: UserInfoDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser() user: AccessTokenPayload): Promise<UserInfoDto> {
    return this.authService.getCurrentUser(user.sub);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/mfa/setup
  // ─────────────────────────────────────────────────────────────────────────

  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Initiate MFA (TOTP) setup',
    description:
      'Generates a TOTP secret and returns the otpauth URL as a QR code data URL. ' +
      'The secret is not activated until POST /auth/mfa/verify is called with a valid code.',
  })
  @ApiResponse({ status: 200, type: MfaSetupResponseDto })
  @ApiResponse({ status: 409, description: 'MFA already enabled' })
  async setupMfa(@CurrentUser() user: AccessTokenPayload): Promise<MfaSetupResponseDto> {
    return this.authService.setupMfa(user.sub);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/mfa/verify
  // ─────────────────────────────────────────────────────────────────────────

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Verify a TOTP code and enable MFA',
    description:
      'Confirms MFA setup by verifying the first TOTP code from the authenticator app. ' +
      'Must be called after POST /auth/mfa/setup.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid TOTP code' })
  async verifyMfa(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: VerifyMfaDto,
  ): Promise<MessageResponseDto> {
    const result = await this.authService.verifyMfaAndEnable(user.sub, dto.code);
    const response = new MessageResponseDto();
    response.message = result.message;
    return response;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /auth/sessions
  // ─────────────────────────────────────────────────────────────────────────

  @Get('sessions')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List all active sessions for the current user',
  })
  @ApiResponse({ status: 200, type: [SessionInfoDto] })
  async getSessions(@CurrentUser() user: AccessTokenPayload): Promise<SessionInfoDto[]> {
    return this.authService.getSessions(user.sub, user.sessionId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /auth/sessions/:id
  // ─────────────────────────────────────────────────────────────────────────

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Revoke a specific session',
    description: 'Revokes the specified session. Use session ID "all" to revoke all sessions.',
  })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async revokeSession(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    if (id === 'all') {
      await this.authService.logoutAll(user.sub, '', '');
      this.clearAuthCookies(res);
      const response = new MessageResponseDto();
      response.message = 'All sessions have been revoked.';
      return response;
    }

    await this.authService.revokeSession(user.sub, id);

    // If revoking the current session, clear cookies
    if (id === user.sessionId) {
      this.clearAuthCookies(res);
    }

    const response = new MessageResponseDto();
    response.message = 'Session revoked successfully.';
    return response;
  }
}
