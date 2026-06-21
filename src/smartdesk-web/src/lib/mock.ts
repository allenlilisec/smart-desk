import type {
  Category,
  Comment,
  CommentPage,
  Me,
  NotificationPolicy,
  SlaPolicy,
  Ticket,
  TicketAggregate,
  TicketPage,
  TimelineEntry,
  TokenPair,
  TransitionAction,
  UserPage,
} from "./types";
import {
  delay,
  MOCK_USER_ADMIN,
  MOCK_USER_AGENT,
  MOCK_USER_LEAD,
  MOCK_USER_MANAGER,
  MOCK_USER_REQUESTER,
  mockAdminState,
  mockState,
  nextTicketNumber,
  TRANSITION_MAP,
} from "./mock-state";

export const mockApi = {
  async login(username: string, _password: string): Promise<{ tokens: TokenPair; me: Me }> {
    await delay();
    const me = username === "lisi" ? MOCK_USER_AGENT : MOCK_USER_REQUESTER;
    mockState.currentUser = me;
    return {
      tokens: {
        access_token: "mock-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      },
      me,
    };
  },

  async getMe(): Promise<Me> {
    await delay(100);
    return mockState.currentUser;
  },

  async logout(): Promise<void> {
    await delay(100);
  },

  async listTickets(params?: { status?: string }): Promise<TicketPage> {
    await delay();
    let items = [...mockState.tickets];
    if (params?.status) {
      items = items.filter((t) => t.status === params.status);
    }
    if (mockState.currentUser.roles.includes("requester")) {
      items = items.filter((t) => t.id !== "t-003" || t.status === "new");
    }
    return { items, page: 1, page_size: 20, total: items.length };
  },

  async getTicket(id: string): Promise<TicketAggregate> {
    await delay();
    const ticket = mockState.tickets.find((t) => t.id === id);
    if (!ticket) throw new Error("工单不存在");
    return ticket;
  },

  async createTicket(data: { title: string; description: string; priority?: string }): Promise<Ticket> {
    await delay();
    const id = `t-${Date.now()}`;
    const ticket: TicketAggregate = {
      id,
      number: nextTicketNumber(),
      title: data.title,
      description: data.description,
      status: "new",
      priority: (data.priority as Ticket["priority"]) || "P3",
      assignee_id: null,
      category_id: null,
      created_at: new Date().toISOString(),
      comments_count: 0,
    };
    mockState.tickets = [ticket, ...mockState.tickets];
    mockState.timeline[id] = [
      {
        id: `tl-${Date.now()}`,
        event_type: "ticket.created",
        actor_id: mockState.currentUser.user_id,
        payload: { status: "new" },
        created_at: ticket.created_at,
      },
    ];
    mockState.comments[id] = [];
    return ticket;
  },

  async transition(id: string, action: TransitionAction, reason?: string): Promise<Ticket> {
    await delay();
    const idx = mockState.tickets.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error("工单不存在");
    const newStatus = TRANSITION_MAP[action];
    if (!newStatus) throw new Error("无效操作");
    const old = mockState.tickets[idx];
    mockState.tickets[idx] = { ...old, status: newStatus };
    const entry: TimelineEntry = {
      id: `tl-${Date.now()}`,
      event_type: `ticket.${action}`,
      actor_id: mockState.currentUser.user_id,
      payload: { from: old.status, to: newStatus, reason },
      created_at: new Date().toISOString(),
    };
    mockState.timeline[id] = [...(mockState.timeline[id] || []), entry];
    return mockState.tickets[idx];
  },

  async listComments(ticketId: string, includeInternal = false): Promise<CommentPage> {
    await delay();
    let items = mockState.comments[ticketId] || [];
    if (!includeInternal) {
      items = items.filter((c) => c.visibility === "public");
    }
    return { items, page: 1, page_size: 50, total: items.length };
  },

  async addComment(
    ticketId: string,
    body: string,
    visibility: "public" | "internal"
  ): Promise<void> {
    await delay();
    const comment: Comment = {
      id: `c-${Date.now()}`,
      body,
      visibility,
      author_id: mockState.currentUser.user_id,
      created_at: new Date().toISOString(),
    };
    mockState.comments[ticketId] = [...(mockState.comments[ticketId] || []), comment];
    const ticket = mockState.tickets.find((t) => t.id === ticketId);
    if (ticket) ticket.comments_count = (ticket.comments_count || 0) + 1;
  },

  async getTimeline(ticketId: string): Promise<{ items: TimelineEntry[] }> {
    await delay();
    return { items: mockState.timeline[ticketId] || [] };
  },

  // Admin mocks
  async listCategories(): Promise<Category[]> {
    await delay();
    return mockAdminState.categories;
  },

  async listSlaPolicies(): Promise<SlaPolicy[]> {
    await delay();
    return mockAdminState.slaPolicies;
  },

  async listUsers(params?: { page?: number; page_size?: number }): Promise<UserPage> {
    await delay();
    const items = mockAdminState.users;
    const page = params?.page || 1;
    const page_size = params?.page_size || 20;
    const start = (page - 1) * page_size;
    const end = start + page_size;
    return {
      items: items.slice(start, end),
      page,
      page_size,
      total: items.length,
    };
  },

  async listNotificationPolicies(): Promise<NotificationPolicy[]> {
    await delay();
    return mockAdminState.notificationPolicies;
  },
};
