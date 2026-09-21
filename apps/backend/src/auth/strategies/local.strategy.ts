import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

/**
 * Passport local strategy — validates email + password on POST /auth/login.
 *
 * On success, the validated user is attached to request.user and passed to
 * the route handler (AuthController.login).
 * On failure, a 401 Unauthorized is returned.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  private readonly logger = new Logger(LocalStrategy.name);

  constructor(private readonly authService: AuthService) {
    super({
      // Tell Passport to read `email` instead of the default `username` field
      usernameField: 'email',
      passwordField: 'password',
    });
  }

  /**
   * Called by Passport for every local auth attempt.
   * @throws UnauthorizedException if credentials are invalid
   */
  async validate(email: string, password: string): Promise<unknown> {
    const user = await this.authService.validateUser(email, password);

    if (!user) {
      this.logger.warn(
        `Failed login attempt for ${email.toLowerCase().trim()}: Invalid email or password`,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }
}
