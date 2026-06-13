import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Role } from '../../rbac/roles';
import {
  IdentityProvider,
  LocalUserRecord,
} from './identity-provider.interface';

const SEED_USERS: Array<Omit<LocalUserRecord, 'passwordHash'> & { password: string }> = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'admin',
    displayName: 'System Admin',
    orgId: 'default',
    roles: [Role.Admin],
    password: 'admin123',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    username: 'agent1',
    displayName: 'Agent One',
    orgId: 'default',
    roles: [Role.Agent],
    password: 'agent123',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    username: 'requester1',
    displayName: 'Requester One',
    orgId: 'default',
    roles: [Role.Requester],
    password: 'req123',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    username: 'requester2',
    displayName: 'Requester Two',
    orgId: 'default',
    roles: [Role.Requester],
    password: 'req123',
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    username: 'manager1',
    displayName: 'Manager One',
    orgId: 'default',
    roles: [Role.Manager],
    password: 'mgr123',
  },
];

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('__dummy_timing_safe_compare__', 10);

@Injectable()
export class LocalIdentityProvider implements IdentityProvider {
  private readonly usersByUsername = new Map<string, LocalUserRecord>();
  private readonly usersById = new Map<string, LocalUserRecord>();

  constructor(private readonly config: ConfigService) {
    const nodeEnv = this.config.get<string>('nodeEnv') ?? 'development';
    if (nodeEnv === 'production') {
      return;
    }

    const orgId = this.config.get<string>('org.defaultOrgId') ?? 'default';
    for (const seed of SEED_USERS) {
      const record: LocalUserRecord = {
        id: seed.id,
        username: seed.username,
        displayName: seed.displayName,
        orgId: seed.orgId || orgId,
        roles: seed.roles,
        passwordHash: bcrypt.hashSync(seed.password, 10),
      };
      this.usersByUsername.set(record.username, record);
      this.usersById.set(record.id, record);
    }
  }

  async validateCredentials(username: string, password: string): Promise<LocalUserRecord | null> {
    const user = this.usersByUsername.get(username);
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const ok = await bcrypt.compare(password, passwordHash);
    return user && ok ? user : null;
  }

  async findById(userId: string): Promise<LocalUserRecord | null> {
    return this.usersById.get(userId) ?? null;
  }
}
