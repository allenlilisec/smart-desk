import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedUser, JwtPayload } from '../common/types/user.types';
import { RedisService } from '../redis/redis.service';
import { IDENTITY_PROVIDER, IdentityProvider, LocalUserRecord } from './idp/identity-provider.interface';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface MeResponse {
  user_id: string;
  username: string;
  display_name: string;
  org_id: string;
  roles: string[];
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly idp: IdentityProvider,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async login(username: string, password: string): Promise<TokenPair> {
    const user = await this.idp.validateCredentials(username, password);
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
      });
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload & { type?: string };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('jwt.secret'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid refresh token',
      });
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid refresh token',
      });
    }

    const sessionActive = await this.redis.exists(`session:${payload.sid}`);
    if (!sessionActive) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Session expired',
      });
    }

    const storedUserId = await this.redis.get(`refresh:${payload.jti}`);
    if (!storedUserId || storedUserId !== payload.sub) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Refresh token revoked or expired',
      });
    }

    const user = await this.idp.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'User not found',
      });
    }

    await this.revokeSession(payload.sid, payload.jti);
    return this.issueTokens(user);
  }

  async logout(user: AuthenticatedUser, accessJti?: string): Promise<void> {
    await this.revokeSession(user.sessionId);
    if (accessJti) {
      const accessTtl = this.config.get<number>('jwt.accessTtlSeconds') ?? 900;
      await this.redis.set(`blacklist:access:${accessJti}`, '1', accessTtl);
    }
  }

  toMe(user: AuthenticatedUser): MeResponse {
    return {
      user_id: user.userId,
      username: user.username,
      display_name: user.displayName,
      org_id: user.orgId,
      roles: user.roles,
    };
  }

  private async issueTokens(user: LocalUserRecord): Promise<TokenPair> {
    const accessTtl = this.config.get<number>('jwt.accessTtlSeconds') ?? 900;
    const refreshTtl = this.config.get<number>('jwt.refreshTtlSeconds') ?? 604800;
    const sessionId = uuidv4();
    const accessJti = uuidv4();
    const refreshJti = uuidv4();

    const basePayload = {
      sub: user.id,
      username: user.username,
      display_name: user.displayName,
      org: user.orgId,
      roles: user.roles,
      sid: sessionId,
    };

    const accessPayload: JwtPayload = { ...basePayload, jti: accessJti };
    const refreshPayload = { ...basePayload, jti: refreshJti, type: 'refresh' };

    const accessToken = this.jwt.sign(accessPayload, { expiresIn: accessTtl });
    const refreshToken = this.jwt.sign(refreshPayload, { expiresIn: refreshTtl });

    await this.redis.set(`session:${sessionId}`, user.id, refreshTtl);
    await this.redis.set(`refresh:${refreshJti}`, user.id, refreshTtl);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: accessTtl,
    };
  }

  private async revokeSession(sessionId: string, refreshJti?: string): Promise<void> {
    await this.redis.del(`session:${sessionId}`);
    if (refreshJti) {
      await this.redis.del(`refresh:${refreshJti}`);
    }
  }
}
