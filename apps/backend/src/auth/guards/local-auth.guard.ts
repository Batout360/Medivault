import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Triggers the Passport local strategy (email + password validation).
 * Used exclusively on POST /auth/login.
 */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
