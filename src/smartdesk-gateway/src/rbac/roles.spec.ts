import { canUpdateTicket, Role, rolesCanPerform, Action } from './roles';

describe('RBAC matrix', () => {
  it('allows requester to create tickets', () => {
    expect(rolesCanPerform([Role.Requester], Action.TicketCreate)).toBe(true);
  });

  it('denies requester admin read', () => {
    expect(rolesCanPerform([Role.Requester], Action.AdminRead)).toBe(false);
  });

  it('denies manager ticket updates even with read access', () => {
    expect(canUpdateTicket([Role.Manager])).toBe(false);
  });

  it('allows agent ticket updates', () => {
    expect(canUpdateTicket([Role.Agent])).toBe(true);
  });
});
