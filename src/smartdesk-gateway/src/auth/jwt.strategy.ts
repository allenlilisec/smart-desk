import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser, JwtPayload } from '../common/types/user.types';
import { RedisService } from '../redis/redis.service';
import { IDENTITY_PROVIDER, IdentityProvider } from './idp/identity-provider.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
    @Inject(IDENTITY_PROVIDER) private readonly idp: IdentityProvider,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret') ?? 'change-me-in-production',
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid access token',
      });
    }

    const blacklisted = await this.redis.exists(`blacklist:access:${payload.jti}`);
    if (blacklisted) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Token has been revoked',
      });
    }

    const sessionActive = await this.redis.exists(`session:${payload.sid}`);
    if (!sessionActive) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Session expired',
      });
    }

    const user = await this.idp.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'User not found',
      });
    }

    return {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      orgId: user.orgId,
      roles: user.roles,
      sessionId: payload.sid,
    };
  }
}
