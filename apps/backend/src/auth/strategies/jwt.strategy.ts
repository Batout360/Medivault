import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { Model } from 'mongoose';

import { User, UserDocument } from '../../modules/users/schemas/user.schema';
import { Session, SessionDocument } from '../../modules/users/schemas/session.schema';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  sessionId: string;
  organizationId: string | null;
  facilityId: string | null;
  hospital?: string | null;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request): string | null =>
          (req?.cookies as Record<string, string>)?.['access_token'] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      issuer: 'medivault-api',
      audience: 'medivault-clients',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload & { userId: string }> {
    const user = await this.userModel
      .findOne({ _id: payload.sub, deletedAt: null })
      .select('_id email role isActive organizationId facilityId hospital')
      .lean();

    if (!user) throw new UnauthorizedException('User account not found');
    if (!user.isActive) throw new UnauthorizedException('User account is deactivated');

    // Check session is still active and not expired/revoked
    if (payload.sessionId) {
      const session = await this.sessionModel
        .findOne({ _id: payload.sessionId })
        .select('isRevoked expiresAt')
        .lean();

      if (!session || session.isRevoked || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Session expired or revoked.');
      }
    }

    return {
      ...payload,
      userId: user._id as string,
      role: user.role,
    };
  }
}
