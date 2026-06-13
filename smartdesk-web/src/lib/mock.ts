import type {
  Comment,
  CommentPage,
  Me,
  Ticket,
  TicketAggregate,
  TicketPage,
  TimelineEntry,
  TokenPair,
  TransitionAction,
} from "./types";

const MOCK_USER_REQUESTER: Me = {
  user_id: "u-req-001",
  username: "zhangsan",
  display_name: "张三",
  org_id: "org-001",
  roles: ["requester"],
};

const MOCK_USER_AGENT: Me = {
  user_id: "u-agent-001",
  username: "lisi",
  display_name: "李四",
  org_id: "org-001",
  roles: ["agent"],
};

let mockTickets: TicketAggregate[] = [
  {
    id: "t-001",
    number: "SD-2026-000101",
    title: "VPN 无法连接",
    description: "公司 VPN 客户端连接后 30 秒自动断开，已尝试重启电脑。",
    status: "in_progress",
    priority: "P2",
    assignee_id: "u-agent-001",
    category_id: null,
    created_at: "2026-06-13T08:00:00Z",
    comments_count: 2,
  },
  {
    id: "t-002",
    number: "SD-2026-000102",
    title: "申请安装 Adobe Acrobat",
    description: "设计部需要 PDF 编辑软件，请协助安装正版授权。",
    status: "resolved",
    priority: "P3",
    assignee_id: "u-agent-001",
    category_id: null,
    created_at: "2026-06-12T14:30:00Z",
    comments_count: 1,
  },
  {
    id: "t-003",
    number: "SD-2026-000103",
    title: "邮箱收不到外部邮件",
    description: "自昨天起无法收到客户发来的邮件，发送正常。",
    status: "new",
    priority: "P1",
    assignee_id: null,
    category_id: null,
    created_at: "2026-06-13T16:00:00Z",
    comments_count: 0,
  },
];

let mockComments: Record<string, Comment[]> = {
  "t-001": [
    {
      id: "c-001",
      body: "已收到，正在排查网络策略。",
      visibility: "public",
      author_id: "u-agent-001",
      created_at: "2026-06-13T09:00:00Z",
    },
    {
      id: "c-002",
      body: "疑似防火墙规则变更，需联系网络组。",
      visibility: "internal",
      author_id: "u-agent-001",
      created_at: "2026-06-13T10:00:00Z",
    },
  ],
  "t-002": [
    {
      id: "c-003",
      body: "Adobe Acrobat 已安装完成，请查收桌面快捷方式。",
      visibility: "public",
      author_id: "u-agent-001",
      created_at: "2026-06-12T16:00:00Z",
    },
  ],
};

let mockTimeline: Record<string, TimelineEntry[]> = {
  "t-001": [
    {
      id: "tl-001",
      event_type: "ticket.created",
      actor_id: "u-req-001",
      payload: { status: "new" },
      created_at: "2026-06-13T08:00:00Z",
    },
    {
      id: "tl-002",
      event_type: "ticket.accepted",
      actor_id: "u-agent-001",
      payload: { from: "new", to: "accepted" },
      created_at: "2026-06-13T08:30:00Z",
    },
    {
      id: "tl-003",
      event_type: "ticket.started",
      actor_id: "u-agent-001",
      payload: { from: "accepted", to: "in_progress" },
      created_at: "2026-06-13T09:00:00Z",
    },
  ],
  "t-002": [
    {
      id: "tl-004",
      event_type: "ticket.created",
      actor_id: "u-req-001",
      payload: { status: "new" },
      created_at: "2026-06-12T14:30:00Z",
    },
    {
      id: "tl-005",
      event_type: "ticket.resolved",
      actor_id: "u-agent-001",
      payload: { from: "in_progress", to: "resolved" },
      created_at: "2026-06-12T16:00:00Z",
    },
  ],
  "t-003": [
    {
      id: "tl-006",
      event_type: "ticket.created",
      actor_id: "u-req-001",
      payload: { status: "new" },
      created_at: "2026-06-13T16:00:00Z",
    },
  ],
};

let currentMockUser: Me = MOCK_USER_REQUESTER;

function delay(ms = 300): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function nextTicketNumber(): string {
  const n = mockTickets.length + 101;
  return `SD-2026-${String(n).padStart(6, "0")}`;
}

const TRANSITION_MAP: Record<TransitionAction, Ticket["status"] | null> = {
  accept: "accepted",
  start: "in_progress",
  wait_user: "pending_user",
  resolve: "resolved",
  close: "closed",
  reopen: "in_progress",
  suspend: "suspended",
  resume: "in_progress",
  cancel: "cancelled",
};

export const mockApi = {
  async login(username: string, _password: string): Promise<{ tokens: TokenPair; me: Me }> {
    await delay();
    const me = username === "lisi" ? MOCK_USER_AGENT : MOCK_USER_REQUESTER;
    currentMockUser = me;
    return {
      tokens: {
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
        token_type: "Bearer",
        expires_in: 3600,
      },
      me,
    };
  },

  async getMe(): Promise<Me> {
    await delay(100);
    return currentMockUser;
  },

  async logout(): Promise<void> {
    await delay(100);
  },

  async listTickets(params?: { status?: string }): Promise<TicketPage> {
    await delay();
    let items = [...mockTickets];
    if (params?.status) {
      items = items.filter((t) => t.status === params.status);
    }
    if (currentMockUser.roles.includes("requester")) {
      items = items.filter((t) => t.id !== "t-003" || t.status === "new");
    }
    return { items, page: 1, page_size: 20, total: items.length };
  },

  async getTicket(id: string): Promise<TicketAggregate> {
    await delay();
    const ticket = mockTickets.find((t) => t.id === id);
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
    mockTickets = [ticket, ...mockTickets];
    mockTimeline[id] = [
      {
        id: `tl-${Date.now()}`,
        event_type: "ticket.created",
        actor_id: currentMockUser.user_id,
        payload: { status: "new" },
        created_at: ticket.created_at,
      },
    ];
    mockComments[id] = [];
    return ticket;
  },

  async transition(id: string, action: TransitionAction, reason?: string): Promise<Ticket> {
    await delay();
    const idx = mockTickets.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error("工单不存在");
    const newStatus = TRANSITION_MAP[action];
    if (!newStatus) throw new Error("无效操作");
    const old = mockTickets[idx];
    mockTickets[idx] = { ...old, status: newStatus };
    const entry: TimelineEntry = {
      id: `tl-${Date.now()}`,
      event_type: `ticket.${action}`,
      actor_id: currentMockUser.user_id,
      payload: { from: old.status, to: newStatus, reason },
      created_at: new Date().toISOString(),
    };
    mockTimeline[id] = [...(mockTimeline[id] || []), entry];
    return mockTickets[idx];
  },

  async listComments(ticketId: string, includeInternal = false): Promise<CommentPage> {
    await delay();
    let items = mockComments[ticketId] || [];
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
      author_id: currentMockUser.user_id,
      created_at: new Date().toISOString(),
    };
    mockComments[ticketId] = [...(mockComments[ticketId] || []), comment];
    const ticket = mockTickets.find((t) => t.id === ticketId);
    if (ticket) ticket.comments_count = (ticket.comments_count || 0) + 1;
  },

  async getTimeline(ticketId: string): Promise<{ items: TimelineEntry[] }> {
    await delay();
    return { items: mockTimeline[ticketId] || [] };
  },
};
