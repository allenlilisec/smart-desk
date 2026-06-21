import type {
  Category,
  Comment,
  Me,
  NotificationPolicy,
  SlaPolicy,
  Ticket,
  TicketAggregate,
  TimelineEntry,
  TransitionAction,
  User,
} from "./types";

export const MOCK_USER_REQUESTER: Me = {
  user_id: "u-req-001",
  username: "zhangsan",
  display_name: "张三",
  org_id: "org-001",
  roles: ["requester"],
};

export const MOCK_USER_AGENT: Me = {
  user_id: "u-agent-001",
  username: "lisi",
  display_name: "李四",
  org_id: "org-001",
  roles: ["agent"],
};

export const MOCK_USER_LEAD: Me = {
  user_id: "u-lead-001",
  username: "wangwu",
  display_name: "王五",
  org_id: "org-001",
  roles: ["lead"],
};

export const MOCK_USER_MANAGER: Me = {
  user_id: "u-mgr-001",
  username: "zhaoliu",
  display_name: "赵六",
  org_id: "org-001",
  roles: ["manager"],
};

export const MOCK_USER_ADMIN: Me = {
  user_id: "u-admin-001",
  username: "admin",
  display_name: "系统管理员",
  org_id: "org-001",
  roles: ["admin"],
};

export const mockState: {
  tickets: TicketAggregate[];
  comments: Record<string, Comment[]>;
  timeline: Record<string, TimelineEntry[]>;
  currentUser: Me;
} = {
  tickets: [
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
  ],
  comments: {
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
  },
  timeline: {
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
  },
  currentUser: MOCK_USER_REQUESTER,
};

export function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nextTicketNumber(): string {
  const n = mockState.tickets.length + 101;
  return `SD-2026-${String(n).padStart(6, "0")}`;
}

export const TRANSITION_MAP: Record<TransitionAction, Ticket["status"] | null> = {
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

// Admin mock data
export const mockAdminState: {
  categories: Category[];
  slaPolicies: SlaPolicy[];
  users: User[];
  notificationPolicies: NotificationPolicy[];
} = {
  categories: [
    { id: "cat-001", parent_id: null, code: "IT", name: "IT 支持", active: true, sort: 1 },
    { id: "cat-002", parent_id: "cat-001", code: "VPN", name: "VPN 问题", active: true, sort: 1 },
    { id: "cat-003", parent_id: "cat-001", code: "SOFTWARE", name: "软件安装", active: true, sort: 2 },
    { id: "cat-004", parent_id: null, code: "HR", name: "人力资源", active: true, sort: 2 },
    { id: "cat-005", parent_id: "cat-004", code: "LEAVE", name: "请假申请", active: true, sort: 1 },
    { id: "cat-006", parent_id: null, code: "FACILITY", name: "行政后勤", active: true, sort: 3 },
  ],
  slaPolicies: [
    {
      id: "sla-001",
      name: "标准 SLA",
      active: true,
      targets: [
        { priority: "P1", response_minutes: 30, resolve_minutes: 240 },
        { priority: "P2", response_minutes: 120, resolve_minutes: 480 },
        { priority: "P3", response_minutes: 240, resolve_minutes: 1440 },
        { priority: "P4", response_minutes: 480, resolve_minutes: 2880 },
      ],
    },
    {
      id: "sla-002",
      name: "VIP 客户 SLA",
      active: true,
      targets: [
        { priority: "P1", response_minutes: 15, resolve_minutes: 120 },
        { priority: "P2", response_minutes: 60, resolve_minutes: 240 },
        { priority: "P3", response_minutes: 120, resolve_minutes: 480 },
        { priority: "P4", response_minutes: 240, resolve_minutes: 960 },
      ],
    },
  ],
  users: [
    { id: "u-req-001", username: "zhangsan", email: "zhangsan@example.com", display_name: "张三", status: "active", roles: ["requester"] },
    { id: "u-agent-001", username: "lisi", email: "lisi@example.com", display_name: "李四", status: "active", roles: ["agent"] },
    { id: "u-lead-001", username: "wangwu", email: "wangwu@example.com", display_name: "王五", status: "active", roles: ["lead"] },
    { id: "u-mgr-001", username: "zhaoliu", email: "zhaoliu@example.com", display_name: "赵六", status: "active", roles: ["manager"] },
    { id: "u-admin-001", username: "admin", email: "admin@example.com", display_name: "系统管理员", status: "active", roles: ["admin"] },
    { id: "u-002", username: "chenqi", email: "chenqi@example.com", display_name: "陈七", status: "active", roles: ["requester"] },
    { id: "u-003", username: "zhuba", email: "zhuba@example.com", display_name: "朱八", status: "disabled", roles: ["requester"] },
    { id: "u-004", username: "agent02", email: "agent02@example.com", display_name: "客服小张", status: "active", roles: ["agent"] },
  ],
  notificationPolicies: [
    { role: "requester", event_type: "ticket.created", channel: "email", enabled: true },
    { role: "requester", event_type: "ticket.resolved", channel: "email", enabled: true },
    { role: "requester", event_type: "ticket.closed", channel: "email", enabled: true },
    { role: "agent", event_type: "ticket.assigned", channel: "inapp", enabled: true },
    { role: "agent", event_type: "ticket.commented", channel: "inapp", enabled: true },
    { role: "lead", event_type: "ticket.escalated", channel: "email", enabled: true },
    { role: "manager", event_type: "sla.breached", channel: "email", enabled: true },
    { role: "admin", event_type: "system.alert", channel: "email", enabled: true },
  ],
};
