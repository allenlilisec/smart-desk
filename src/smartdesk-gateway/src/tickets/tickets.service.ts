import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../common/types/user.types';
import { AuditService } from '../rbac/audit.service';
import { Role } from '../rbac/roles';

export interface StubTicket {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: string;
  requester_id: string;
  assignee_id: string | null;
  category_id: string | null;
  created_at: string;
  description: string;
}

const STUB_TICKETS: StubTicket[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    number: 'SD-2026-000001',
    title: 'Requester1 ticket',
    status: 'new',
    priority: 'P3',
    requester_id: '33333333-3333-4333-8333-333333333333',
    assignee_id: null,
    category_id: null,
    created_at: '2026-06-14T00:00:00Z',
    description: 'Owned by requester1',
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    number: 'SD-2026-000002',
    title: 'Requester2 ticket',
    status: 'new',
    priority: 'P3',
    requester_id: '44444444-4444-4444-8444-444444444444',
    assignee_id: null,
    category_id: null,
    created_at: '2026-06-14T00:00:00Z',
    description: 'Owned by requester2',
  },
];

@Injectable()
export class TicketsService {
  constructor(private readonly audit: AuditService) {}

  getTicket(id: string, user: AuthenticatedUser, route: string, method: string): StubTicket {
    const ticket = STUB_TICKETS.find((t) => t.id === id);
    if (!ticket) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Ticket not found',
      });
    }

    if (!this.canReadTicket(user, ticket)) {
      this.audit.recordForbidden(
        user,
        route,
        method,
        'ticket:read',
        'Requester cannot access ticket owned by another user',
      );
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
    }

    return ticket;
  }

  private canReadTicket(user: AuthenticatedUser, ticket: StubTicket): boolean {
    if (user.roles.includes(Role.Admin) || user.roles.includes(Role.Manager)) {
      return true;
    }
    if (user.roles.includes(Role.Agent) || user.roles.includes(Role.Lead)) {
      return true;
    }
    if (user.roles.includes(Role.Requester)) {
      return ticket.requester_id === user.userId;
    }
    return false;
  }
}
