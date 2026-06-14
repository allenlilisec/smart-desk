import { Role } from '../../rbac/roles';

export interface AuthenticatedUser {
  userId: string;
  username: string;
  displayName: string;
  orgId: string;
  roles: Role[];
  sessionId: string;
}

export interface JwtPayload {
  sub: string;
  username: string;
  display_name: string;
  org: string;
  roles: Role[];
  sid: string;
  jti: string;
  type?: 'access' | 'refresh';
}
