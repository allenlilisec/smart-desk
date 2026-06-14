import { Role } from '../../rbac/roles';

export interface LocalUserRecord {
  id: string;
  username: string;
  displayName: string;
  orgId: string;
  roles: Role[];
  passwordHash: string;
}

export interface IdentityProvider {
  validateCredentials(username: string, password: string): Promise<LocalUserRecord | null>;
  findById(userId: string): Promise<LocalUserRecord | null>;
}

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');
