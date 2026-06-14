export enum Role {
  Requester = 'requester',
  Agent = 'agent',
  Lead = 'lead',
  Manager = 'manager',
  Admin = 'admin',
}

export const ALL_ROLES = Object.values(Role);

export enum Action {
  TicketCreate = 'ticket:create',
  TicketList = 'ticket:list',
  TicketRead = 'ticket:read',
  TicketUpdate = 'ticket:update',
  TicketTransition = 'ticket:transition',
  TicketAssign = 'ticket:assign',
  CommentRead = 'comment:read',
  CommentCreate = 'comment:create',
  AttachmentRead = 'attachment:read',
  AttachmentCreate = 'attachment:create',
  StatsRead = 'stats:read',
  StatsExport = 'stats:export',
  AdminRead = 'admin:read',
  AdminWrite = 'admin:write',
}

const roleActions: Record<Role, Action[]> = {
  [Role.Requester]: [
    Action.TicketCreate,
    Action.TicketList,
    Action.TicketRead,
    Action.CommentRead,
    Action.CommentCreate,
    Action.AttachmentRead,
    Action.AttachmentCreate,
  ],
  [Role.Agent]: [
    Action.TicketCreate,
    Action.TicketList,
    Action.TicketRead,
    Action.TicketUpdate,
    Action.TicketTransition,
    Action.CommentRead,
    Action.CommentCreate,
    Action.AttachmentRead,
    Action.AttachmentCreate,
  ],
  [Role.Lead]: [
    Action.TicketCreate,
    Action.TicketList,
    Action.TicketRead,
    Action.TicketUpdate,
    Action.TicketTransition,
    Action.TicketAssign,
    Action.CommentRead,
    Action.CommentCreate,
    Action.AttachmentRead,
    Action.AttachmentCreate,
    Action.StatsRead,
  ],
  [Role.Manager]: [
    Action.TicketList,
    Action.TicketRead,
    Action.CommentRead,
    Action.AttachmentRead,
    Action.StatsRead,
    Action.StatsExport,
  ],
  [Role.Admin]: [
    Action.TicketCreate,
    Action.TicketList,
    Action.TicketRead,
    Action.TicketUpdate,
    Action.TicketTransition,
    Action.TicketAssign,
    Action.CommentRead,
    Action.CommentCreate,
    Action.AttachmentRead,
    Action.AttachmentCreate,
    Action.StatsRead,
    Action.StatsExport,
    Action.AdminRead,
    Action.AdminWrite,
  ],
};

export function rolesCanPerform(roles: Role[], action: Action): boolean {
  return roles.some((role) => roleActions[role]?.includes(action));
}

export function canUpdateTicket(roles: Role[]): boolean {
  if (roles.includes(Role.Manager)) {
    return false;
  }
  return rolesCanPerform(roles, Action.TicketUpdate);
}
