/**
 * E2E 测试数据
 *
 * 包含：
 * - 测试工单数据
 * - 测试评论数据
 * - Mock API 响应模板
 */

export interface TicketData {
  id?: string;
  title: string;
  description: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'new' | 'open' | 'in_progress' | 'resolved' | 'closed';
  createdBy?: string;
  assignedTo?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CommentData {
  id?: string;
  ticketId: string;
  content: string;
  author: string;
  isInternal?: boolean;
  createdAt?: string;
}

/**
 * 标准测试工单 - 张三提单
 */
export const SAMPLE_TICKET_ZHANGSAN: TicketData = {
  id: 'ticket-001',
  title: '无法访问黄区代码仓',
  description: '今天尝试提交代码时，提示没有权限访问黄区代码仓库，需要协助处理。',
  category: 'access',
  priority: 'high',
  status: 'new',
  createdBy: 'zhangsan',
  assignedTo: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * 标准测试评论
 */
export const SAMPLE_COMMENTS: CommentData[] = [
  {
    id: 'comment-001',
    ticketId: 'ticket-001',
    content: '收到，正在核实权限配置',
    author: 'lisi',
    isInternal: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'comment-002',
    ticketId: 'ticket-001',
    content: '该用户权限正常，可能是 VPN 连接问题',
    author: 'lisi',
    isInternal: true,
    createdAt: new Date(Date.now() + 60000).toISOString(),
  },
];

/**
 * Mock API 响应模板
 * 用于 Mock 模式下的 API 拦截
 */
export const MOCK_API_RESPONSES = {
  // 工单列表
  'GET /api/tickets': {
    tickets: [SAMPLE_TICKET_ZHANGSAN],
    total: 1,
    page: 1,
    pageSize: 20,
  },

  // 工单详情
  'GET /api/tickets/:id': SAMPLE_TICKET_ZHANGSAN,

  // 创建工单
  'POST /api/tickets': {
    ...SAMPLE_TICKET_ZHANGSAN,
    id: 'ticket-new-' + Date.now(),
  },

  // 评论列表
  'GET /api/tickets/:id/comments': {
    comments: SAMPLE_COMMENTS,
    total: SAMPLE_COMMENTS.length,
  },

  // 创建评论
  'POST /api/tickets/:id/comments': (data: { content: string; isInternal?: boolean }) => ({
    id: 'comment-new-' + Date.now(),
    ticketId: 'ticket-001',
    content: data.content,
    author: 'lisi',
    isInternal: data.isInternal || false,
    createdAt: new Date().toISOString(),
  }),

  // 状态流转
  'POST /api/tickets/:id/transitions': (data: { status: string }) => ({
    ...SAMPLE_TICKET_ZHANGSAN,
    status: data.status,
    updatedAt: new Date().toISOString(),
  }),
};

/**
 * 生成新的测试工单数据
 */
export function generateTicketData(overrides: Partial<TicketData> = {}): TicketData {
  return {
    ...SAMPLE_TICKET_ZHANGSAN,
    id: `ticket-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * 生成新的评论数据
 */
export function generateCommentData(ticketId: string, overrides: Partial<CommentData> = {}): CommentData {
  return {
    id: `comment-${Date.now()}`,
    ticketId,
    content: '这是一条测试评论',
    author: 'lisi',
    isInternal: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
