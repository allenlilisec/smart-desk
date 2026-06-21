/**
 * 测试数据定义
 * 
 * 包含测试用例所需的各类数据模板：
 * - 用户信息（测试账号）
 * - 工单数据
 * - 评论数据
 * - API 响应模板
 */

import { Ticket, TicketCreate, TicketStatus, Priority, Me, Comment, CommentCreate } from './types';

// ═══════════════════════════════════════════════════════════
// 测试账号定义
// ═══════════════════════════════════════════════════════════

export const TEST_USERS = {
  /** 报单人 - 张三 */
  zhangsan: {
    id: 'user-zhangsan-001',
    username: 'zhangsan',
    password: 'test123',
    displayName: '张三',
    roles: ['requester'] as const,
  },
  
  /** 坐席 - 李四 */
  lisi: {
    id: 'user-lisi-002',
    username: 'lisi',
    password: 'test123',
    displayName: '李四',
    roles: ['agent'] as const,
  },
  
  /** 管理员 - admin */
  admin: {
    id: 'user-admin-001',
    username: 'admin',
    password: 'admin123',
    displayName: '管理员',
    roles: ['admin'] as const,
  },
} as const;

export type TestUser = typeof TEST_USERS[keyof typeof TEST_USERS];

// ═══════════════════════════════════════════════════════════
// 测试组织定义
// ═══════════════════════════════════════════════════════════

export const TEST_ORG = {
  id: 'org-test-001',
  name: '测试组织',
} as const;

// ═══════════════════════════════════════════════════════════
// 工单测试数据模板
// ═══════════════════════════════════════════════════════════

export const TICKET_TEMPLATES = {
  /** 标准提单数据 */
  standardTicket: {
    title: '无法访问黄区代码仓',
    description: '从昨天开始无法访问 GitLab 黄区仓库，提示 403 错误。',
    categoryId: 'category-access-001',
    priority: 'P2' as Priority,
  },
  
  /** 高优先级工单 */
  highPriorityTicket: {
    title: '生产环境服务不可用',
    description: '核心服务宕机，影响所有用户访问。',
    categoryId: 'category-prod-001',
    priority: 'P1' as Priority,
  },
  
  /** 低优先级工单 */
  lowPriorityTicket: {
    title: '界面显示异常',
    description: '首页导航栏在某些浏览器下显示错位。',
    categoryId: 'category-ui-001',
    priority: 'P3' as Priority,
  },
} as const;

// ═══════════════════════════════════════════════════════════
// 评论测试数据模板
// ═══════════════════════════════════════════════════════════

export const COMMENT_TEMPLATES = {
  /** 对外回复（对齐 gateway.yaml CommentCreate.visibility=public） */
  publicReply: {
    body: '您好，我们已收到您的反馈，正在排查中。',
    visibility: 'public' as const,
  },

  /** 内部备注（对齐 gateway.yaml CommentCreate.visibility=internal） */
  internalNote: {
    body: '需要联系运维团队确认 GitLab 访问权限。',
    visibility: 'internal' as const,
  },
} as const;

// ═══════════════════════════════════════════════════════════
// API 响应模板（Mock 数据）
// ═══════════════════════════════════════════════════════════

export const MOCK_RESPONSES = {
  /**
   * 登录成功响应
   */
  loginSuccess: (user: TestUser) => ({
    access_token: `mock-access-token-${user.username}`,
    token_type: 'Bearer',
    expires_in: 3600,
  }),
  
  /**
   * 当前用户信息响应
   */
  meResponse: (user: TestUser): Me => ({
    user_id: user.id,
    username: user.username,
    display_name: user.displayName,
    roles: [...user.roles],
  }),
  
  /**
   * 工单详情响应
   */
  ticketDetail: (ticketId: string, ticketData: TicketCreate, requesterId: string): Ticket => ({
    id: ticketId,
    org_id: TEST_ORG.id,
    requester_id: requesterId,
    title: ticketData.title,
    description: ticketData.description,
    status: 'new' as TicketStatus,
    priority: ticketData.priority,
    category_id: ticketData.categoryId,
    assignee_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resolved_at: null,
    closed_at: null,
    first_response_at: null,
    tags: [],
    suggestion: null,
  }),
  
  /**
   * 评论列表响应
   */
  commentList: (ticketId: string, comments: Comment[]) => ({
    items: comments,
    total: comments.length,
    page: 1,
    page_size: 20,
  }),
  
  /**
   * 工单列表响应
   */
  ticketList: (tickets: Ticket[]) => ({
    items: tickets,
    total: tickets.length,
    page: 1,
    page_size: 20,
  }),
};

// ═══════════════════════════════════════════════════════════
// 测试辅助函数
// ═══════════════════════════════════════════════════════════

/**
 * 生成唯一测试 ID
 */
export function generateTestId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * 创建完整的 TicketCreate 对象
 */
export function createTicketCreate(
  template: keyof typeof TICKET_TEMPLATES = 'standardTicket',
  overrides: Partial<TicketCreate> = {}
): TicketCreate {
  return {
    title: TICKET_TEMPLATES[template].title,
    description: TICKET_TEMPLATES[template].description,
    categoryId: TICKET_TEMPLATES[template].categoryId,
    priority: TICKET_TEMPLATES[template].priority,
    ...overrides,
  };
}

/**
 * 创建评论对象
 */
export function createComment(
  template: keyof typeof COMMENT_TEMPLATES,
  authorId: string,
  ticketId: string
): Comment {
  const templateData = COMMENT_TEMPLATES[template];
  return {
    id: generateTestId('comment'),
    ticket_id: ticketId,
    author_id: authorId,
    author_name: TEST_USERS.lisi.displayName,
    body: templateData.body,
    visibility: templateData.visibility,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * 验证工单数据
 */
export function validateTicket(ticket: Ticket): boolean {
  return !!(
    ticket.id &&
    ticket.title &&
    ticket.description &&
    ticket.status &&
    ticket.priority &&
    ticket.created_at
  );
}

// ═══════════════════════════════════════════════════════════
// 导出类型
// ═══════════════════════════════════════════════════════════

export * from './types';
