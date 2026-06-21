/**
 * API客户端
 * 基于 src/openapi/gateway.yaml 契约实现
 */

import type {
  Ticket,
  TicketAggregate,
  TicketPage,
  TicketCreate,
  TicketUpdate,
  TransitionRequest,
  CommentPage,
  CommentCreate,
  Me,
  Category,
} from '@/types/ticket';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

// 模拟延迟
const MOCK_DELAY = 300;

// 检查是否为Mock模式
const isMockMode = () => {
  return process.env.NEXT_PUBLIC_MOCK_MODE === 'true' || process.env.MOCK_MODE === 'true';
};

// 模拟数据存储
const mockTickets: Ticket[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    number: 'SD-2026-000001',
    title: '无法登录系统',
    status: 'new',
    priority: 'P1',
    assignee_id: null,
    category_id: '550e8400-e29b-41d4-a716-446655440010',
    csat_score: null,
    csat_rated_at: null,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    number: 'SD-2026-000002',
    title: '密码重置申请',
    status: 'in_progress',
    priority: 'P2',
    assignee_id: '550e8400-e29b-41d4-a716-446655440100',
    category_id: '550e8400-e29b-41d4-a716-446655440011',
    csat_score: null,
    csat_rated_at: null,
    created_at: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    number: 'SD-2026-000003',
    title: '系统报错反馈',
    status: 'resolved',
    priority: 'P3',
    assignee_id: '550e8400-e29b-41d4-a716-446655440100',
    category_id: '550e8400-e29b-41d4-a716-446655440012',
    csat_score: 5,
    csat_rated_at: new Date(Date.now() - 3600000).toISOString(),
    created_at: new Date(Date.now() - 259200000).toISOString(),
  },
];

const mockTicketDetails: Record<string, TicketAggregate> = {
  '550e8400-e29b-41d4-a716-446655440001': {
    ...mockTickets[0],
    description: '今天尝试登录系统时提示"账号被锁定"，请协助解锁。',
    requester: {
      id: '550e8400-e29b-41d4-a716-446655440200',
      display_name: '张三',
      email: 'zhangsan@example.com',
    },
    sla: null,
    suggestion: null,
    comments_count: 0,
  },
  '550e8400-e29b-41d4-a716-446655440002': {
    ...mockTickets[1],
    description: '忘记密码，需要重置为初始密码。',
    requester: {
      id: '550e8400-e29b-41d4-a716-446655440200',
      display_name: '张三',
      email: 'zhangsan@example.com',
    },
    sla: {
      priority: 'P2',
      response_due_at: new Date(Date.now() + 3600000).toISOString(),
      resolve_due_at: new Date(Date.now() + 86400000).toISOString(),
      response_met: true,
      resolve_met: false,
      paused: false,
      breached: false,
    },
    suggestion: null,
    comments_count: 2,
  },
  '550e8400-e29b-41d4-a716-446655440003': {
    ...mockTickets[2],
    description: '在提交表单时出现500错误。',
    requester: {
      id: '550e8400-e29b-41d4-a716-446655440200',
      display_name: '张三',
      email: 'zhangsan@example.com',
    },
    sla: {
      priority: 'P3',
      response_due_at: new Date(Date.now() - 7200000).toISOString(),
      resolve_due_at: new Date(Date.now() - 3600000).toISOString(),
      response_met: true,
      resolve_met: true,
      paused: false,
      breached: false,
    },
    suggestion: null,
    comments_count: 5,
  },
};

const mockComments: CommentPage = {
  items: [
    {
      id: '550e8400-e29b-41d4-a716-446655440300',
      body: '已收到您的工单，正在处理中。',
      visibility: 'public',
      author_id: '550e8400-e29b-41d4-a716-446655440100',
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440301',
      body: '内部备注：需要联系IT部门协助。',
      visibility: 'internal',
      author_id: '550e8400-e29b-41d4-a716-446655440100',
      created_at: new Date(Date.now() - 1800000).toISOString(),
    },
  ],
  page: 1,
  page_size: 20,
  total: 2,
};

const mockCategories: Category[] = [
  { id: '550e8400-e29b-41d4-a716-446655440010', parent_id: null, code: 'LOGIN', name: '登录问题', active: true, sort: 1 },
  { id: '550e8400-e29b-41d4-a716-446655440011', parent_id: null, code: 'PWD', name: '密码相关', active: true, sort: 2 },
  { id: '550e8400-e29b-41d4-a716-446655440012', parent_id: null, code: 'BUG', name: '系统缺陷', active: true, sort: 3 },
  { id: '550e8400-e29b-41d4-a716-446655440013', parent_id: null, code: 'FEAT', name: '功能建议', active: true, sort: 4 },
];

// Mock API实现
class MockApiClient {
  private requesterTickets: Ticket[] = [...mockTickets];

  async getMe(): Promise<Me> {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
    return {
      user_id: '550e8400-e29b-41d4-a716-446655440200',
      username: 'zhangsan',
      display_name: '张三',
      roles: ['requester'],
    };
  }

  async getAgentMe(): Promise<Me> {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
    return {
      user_id: '550e8400-e29b-41d4-a716-446655440100',
      username: 'lisi',
      display_name: '李四',
      roles: ['agent'],
    };
  }

  async getTickets(params?: {
    status?: string;
    priority?: string;
    page?: number;
    page_size?: number;
  }): Promise<TicketPage> {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
    const page = params?.page || 1;
    const pageSize = params?.page_size || 20;
    
    let items = [...this.requesterTickets];
    
    if (params?.status) {
      items = items.filter(t => t.status === params.status);
    }
    if (params?.priority) {
      items = items.filter(t => t.priority === params.priority);
    }
    
    return {
      items,
      page,
      page_size: pageSize,
      total: items.length,
    };
  }

  async getTicket(id: string): Promise<TicketAggregate> {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
    const ticket = mockTicketDetails[id];
    if (!ticket) {
      throw new Error('工单不存在');
    }
    return ticket;
  }

  async createTicket(data: TicketCreate): Promise<Ticket> {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
    const newTicket: Ticket = {
      id: `550e8400-e29b-41d4-a716-${Date.now()}`,
      number: `SD-2026-${String(this.requesterTickets.length + 1).padStart(6, '0')}`,
      title: data.title,
      status: 'new',
      priority: data.priority || 'P3',
      assignee_id: null,
      category_id: data.category_id || null,
      csat_score: null,
      csat_rated_at: null,
      created_at: new Date().toISOString(),
    };
    this.requesterTickets.unshift(newTicket);
    return newTicket;
  }

  async updateTicket(id: string, data: TicketUpdate): Promise<Ticket> {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
    const ticket = this.requesterTickets.find(t => t.id === id);
    if (!ticket) throw new Error('工单不存在');
    
    if (data.title) ticket.title = data.title;
    if (data.priority) ticket.priority = data.priority;
    if (data.category_id) ticket.category_id = data.category_id;
    
    return ticket;
  }

  async transitionTicket(id: string, data: TransitionRequest): Promise<Ticket> {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
    const ticket = this.requesterTickets.find(t => t.id === id);
    if (!ticket) throw new Error('工单不存在');
    
    // 状态流转映射
    const statusMap: Record<string, Ticket['status']> = {
      accept: 'accepted',
      start: 'in_progress',
      wait_user: 'pending_user',
      resolve: 'resolved',
      close: 'closed',
      reopen: 'new',
      suspend: 'suspended',
      resume: 'new',
      cancel: 'cancelled',
    };
    
    ticket.status = statusMap[data.action] || ticket.status;
    return ticket;
  }

  async getComments(_ticketId: string): Promise<CommentPage> {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
    return mockComments;
  }

  async createComment(ticketId: string, data: CommentCreate): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
    mockComments.items.push({
      id: `550e8400-e29b-41d4-a716-${Date.now()}`,
      body: data.body,
      visibility: data.visibility,
      author_id: '550e8400-e29b-41d4-a716-446655440100',
      created_at: new Date().toISOString(),
    });
    mockComments.total++;
  }

  async getCategories(): Promise<Category[]> {
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
    return mockCategories;
  }
}

// 真实API客户端
class RealApiClient {
  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getMe(): Promise<Me> {
    return this.fetch<Me>('/auth/me');
  }

  async getTickets(params?: {
    status?: string;
    priority?: string;
    page?: number;
    page_size?: number;
  }): Promise<TicketPage> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.priority) query.set('priority', params.priority);
    if (params?.page) query.set('page', String(params.page));
    if (params?.page_size) query.set('page_size', String(params.page_size));
    
    return this.fetch<TicketPage>(`/tickets?${query.toString()}`);
  }

  async getTicket(id: string): Promise<TicketAggregate> {
    return this.fetch<TicketAggregate>(`/tickets/${id}`);
  }

  async createTicket(data: TicketCreate): Promise<Ticket> {
    return this.fetch<Ticket>('/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTicket(id: string, data: TicketUpdate): Promise<Ticket> {
    return this.fetch<Ticket>(`/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async transitionTicket(id: string, data: TransitionRequest): Promise<Ticket> {
    return this.fetch<Ticket>(`/tickets/${id}/transitions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getComments(ticketId: string): Promise<CommentPage> {
    return this.fetch<CommentPage>(`/tickets/${ticketId}/comments`);
  }

  async createComment(ticketId: string, data: CommentCreate): Promise<void> {
    await this.fetch(`/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCategories(): Promise<Category[]> {
    return this.fetch<Category[]>('/categories');
  }
}

// 导出API客户端实例
export const api = isMockMode() ? new MockApiClient() : new RealApiClient();

// 为了E2E测试，也导出Mock实现
export const mockApi = new MockApiClient();
