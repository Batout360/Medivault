import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { Model } from 'mongoose';

import { User, UserDocument } from '../../modules/users/schemas/user.schema';
import { Session, SessionDocument } from '../../modules/users/schemas/session.schema';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'refresh-token') {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null =>
          (req?.cookies as Record<string, string>)?.['refresh_token'] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      issuer: 'medivault-api',
      audience: 'medivault-clients',
      passReqToCallback: true,
    });
  }

  async validate(
    request: Request,
    payload: { sub: string; sessionId: string; jti: string },
  ): Promise<{ userId: string; sessionId: string; refreshToken: string }> {
    const rawRefreshToken = (request?.cookies as Record<string, string>)?.['refresh_token'] ?? '';

    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token cookie is missing.');
    }

    const incomingHash = createHash('sha256').update(rawRefreshToken).digest('hex');

    // Load session and include the select:false refreshTokenHash field
    const session = await this.sessionModel
      .findOne({ _id: payload.sessionId, userId: payload.sub })
      .select('+refreshTokenHash')
      .exec();

    if (!session) {
      // Session not found — potential reuse, revoke all sessions for this user
      await this.sessionModel.updateMany(
        { userId: payload.sub },
        { $set: { isRevoked: true, updatedAt: new Date() } },
      );
      throw new UnauthorizedException(
        'Token reuse detected. All sessions revoked. Please sign in again.',
      );
    }

    const sessionPlain = session.toObject ? session.toObject() : (session as any);

    // Constant-time hash comparison
    const storedHash = sessionPlain.refreshTokenHash ?? '';
    let hashesMatch = false;
    try {
      if (incomingHash.length === storedHash.length) {
        const a = Buffer.from(incomingHash, 'utf8');
        const b = Buffer.from(storedHash, 'utf8');
        // timingSafeEqual requires same-length buffers
        hashesMatch = timingSafeEqual(a, b);
      }
    } catch {
      hashesMatch = false;
    }

    if (!hashesMatch) {
      // Hash mismatch — treat as reuse
      await this.sessionModel.updateMany(
        { userId: payload.sub },
        { $set: { isRevoked: true, updatedAt: new Date() } },
      );
      throw new UnauthorizedException(
        'Token reuse detected. All sessions revoked. Please sign in again.',
      );
    }

    if (session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired or been revoked.');
    }

    // Verify user is still active
    const user = await this.userModel.findOne({ _id: payload.sub }).select('_id isActive').lean();

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is deactivated.');
    }

    return { userId: payload.sub, sessionId: payload.sessionId, refreshToken: rawRefreshToken };
  }
}
