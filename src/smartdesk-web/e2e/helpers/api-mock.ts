/**
 * API Mock 助手
 * 
 * 提供 Mock API 路由的工具函数，用于在 Mock 模式下拦截和模拟 API 响应。
 * 支持：
 * - 路由拦截配置
 * - 响应模板
 * - 状态码控制
 * - 延迟模拟
 * 
 * @see https://playwright.dev/docs/mock
 */

import { Page, Route, Request } from '@playwright/test';
import { 
  Ticket, 
  TicketCreate, 
  TicketPage, 
  Me, 
  TokenPair, 
  CommentPage,
  TicketAggregate,
  Comment,
} from '../fixtures/types';
import { MOCK_RESPONSES, generateTestId, TEST_USERS } from '../fixtures/test-data';

// ═══════════════════════════════════════════════════════════
// Mock 配置
// ═══════════════════════════════════════════════════════════

export interface MockConfig {
  /** 是否启用延迟模拟 */
  enableDelay?: boolean;
  /** 默认延迟时间（毫秒） */
  defaultDelay?: number;
  /** 模拟错误率（0-1） */
  errorRate?: number;
}

const defaultConfig: MockConfig = {
  enableDelay: false,
  defaultDelay: 200,
  errorRate: 0,
};

let mockConfig: MockConfig = { ...defaultConfig };

// ═══════════════════════════════════════════════════════════
// Mock 存储（用于保持跨请求的状态）
// ═══════════════════════════════════════════════════════════

type MockState = {
  tickets: Map<string, Ticket>;
  comments: Map<string, Comment[]>;
  currentUser: Me | null;
};

const mockState: MockState = {
  tickets: new Map(),
  comments: new Map(),
  currentUser: null,
};

// ═══════════════════════════════════════════════════════════
// 响应构建器
// ═══════════════════════════════════════════════════════════

/**
 * 构建成功响应
 */
export function buildSuccessResponse<T>(data: T, delay?: number) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
    ...(delay && { delay }),
  };
}

/**
 * 构建创建成功响应（201）
 */
export function buildCreatedResponse<T>(data: T, delay?: number) {
  return {
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify(data),
    ...(delay && { delay }),
  };
}

/**
 * 构建错误响应
 */
export function buildErrorResponse(status: number, message: string, delay?: number) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      error: getErrorCode(status),
      message,
    }),
    ...(delay && { delay }),
  };
}

/**
 * 获取错误码
 */
function getErrorCode(status: number): string {
  const codes: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
  };
  return codes[status] || 'UNKNOWN_ERROR';
}

// ═══════════════════════════════════════════════════════════
// 核心 Mock 路由
// ═══════════════════════════════════════════════════════════

/**
 * Mock 认证路由
 */
export async function mockAuthRoutes(page: Page, config: MockConfig = mockConfig) {
  // 登录
  await page.route('**/api/v1/auth/login', async (route: Route) => {
    const request = route.request();
    const body = await request.postDataJSON();
    
    // 验证凭证
    const user = Object.values(TEST_USERS).find(
      u => u.username === body?.username && u.password === body?.password
    );
    
    if (!user) {
      await route.fulfill(buildErrorResponse(401, 'Invalid credentials'));
      return;
    }
    
    // 设置当前用户
    const userInfo = MOCK_RESPONSES.meResponse(user);
    mockState.currentUser = userInfo;
    
    // 构建响应（包含 Set-Cookie header）
    const response = buildCreatedResponse(MOCK_RESPONSES.loginSuccess(user));
    await route.fulfill({
      ...response,
      headers: {
        ...response,
        'Set-Cookie': `sd_rt=mock-refresh-token-${user.username}; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800`,
      },
    });
  });
  
  // 刷新 token
  await page.route('**/api/v1/auth/refresh', async (route: Route) => {
    const request = route.request();
    const cookies = await request.headerValue('Cookie');
    
    if (!cookies?.includes('sd_rt=')) {
      await route.fulfill(buildErrorResponse(401, 'Invalid refresh token'));
      return;
    }
    
    const response = buildSuccessResponse({
      access_token: 'mock-refreshed-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
    
    await route.fulfill({
      ...response,
      headers: {
        'Set-Cookie': `sd_rt=mock-refresh-token-new; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800`,
      },
    });
  });
  
  // 登出
  await page.route('**/api/v1/auth/logout', async (route: Route) => {
    mockState.currentUser = null;
    await route.fulfill({
      status: 204,
      headers: {
        'Set-Cookie': `sd_rt=; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=0`,
      },
    });
  });
  
  // 当前用户信息
  await page.route('**/api/v1/auth/me', async (route: Route) => {
    if (!mockState.currentUser) {
      await route.fulfill(buildErrorResponse(401, 'Not authenticated'));
      return;
    }
    await route.fulfill(buildSuccessResponse(mockState.currentUser));
  });
}

/**
 * Mock 工单路由
 */
export async function mockTicketRoutes(page: Page, config: MockConfig = mockConfig) {
  const delay = config.enableDelay ? config.defaultDelay : 0;
  
  // 创建工单
  await page.route('**/api/v1/tickets', async (route: Route) => {
    const request = route.request();
    
    if (request.method() === 'POST') {
      const body = await request.postDataJSON() as TicketCreate;
      
      // 验证必填字段
      if (!body?.title || !body?.description) {
        await route.fulfill(buildErrorResponse(400, 'Title and description are required'));
        return;
      }
      
      const ticketId = generateTestId('ticket');
      const ticket = MOCK_RESPONSES.ticketDetail(
        ticketId,
        body,
        mockState.currentUser?.user_id || 'anonymous'
      );
      
      // 存储工单
      mockState.tickets.set(ticketId, ticket);
      mockState.comments.set(ticketId, []);
      
      await route.fulfill(buildCreatedResponse(ticket, delay));
    } else if (request.method() === 'GET') {
      // 工单列表查询
      const url = new URL(request.url());
      const status = url.searchParams.get('status');
      const requesterId = url.searchParams.get('requester_id');
      
      let tickets = Array.from(mockState.tickets.values());
      
      // 按状态过滤
      if (status) {
        tickets = tickets.filter(t => t.status === status);
      }
      
      // 按报单人过滤（requester 只能看到自己的）
      if (requesterId) {
        tickets = tickets.filter(t => t.requester_id === requesterId);
      }
      
      const pageData: TicketPage = {
        items: tickets,
        total: tickets.length,
        page: parseInt(url.searchParams.get('page') || '1'),
        page_size: parseInt(url.searchParams.get('page_size') || '20'),
      };
      
      await route.fulfill(buildSuccessResponse(pageData, delay));
    }
  });
  
  // 工单详情
  await page.route(/\/api\/v1\/tickets\/[^\/]+$/, async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const ticketId = url.pathname.split('/').pop();
    
    if (request.method() === 'GET') {
      const ticket = mockState.tickets.get(ticketId || '');
      
      if (!ticket) {
        await route.fulfill(buildErrorResponse(404, 'Ticket not found'));
        return;
      }
      
      // 验证权限（requester 只能看自己的）
      if (mockState.currentUser?.roles?.includes('requester') && 
          ticket.requester_id !== mockState.currentUser?.user_id) {
        await route.fulfill(buildErrorResponse(403, 'Access denied'));
        return;
      }
      
      const aggregate: TicketAggregate = {
        ...ticket,
        requester_name: TEST_USERS.zhangsan.displayName,
      };
      
      await route.fulfill(buildSuccessResponse(aggregate, delay));
    } else if (request.method() === 'PATCH') {
      // 更新工单
      const ticket = mockState.tickets.get(ticketId || '');
      
      if (!ticket) {
        await route.fulfill(buildErrorResponse(404, 'Ticket not found'));
        return;
      }
      
      const body = await request.postDataJSON();
      const updatedTicket = {
        ...ticket,
        ...body,
        updated_at: new Date().toISOString(),
      };
      
      mockState.tickets.set(ticketId || '', updatedTicket);
      await route.fulfill(buildSuccessResponse(updatedTicket, delay));
    }
  });
}

/**
 * Mock 评论路由
 */
export async function mockCommentRoutes(page: Page, config: MockConfig = mockConfig) {
  const delay = config.enableDelay ? config.defaultDelay : 0;
  
  await page.route(/\/api\/v1\/tickets\/[^\/]+\/comments$/, async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const ticketId = url.pathname.split('/')[3]; // /api/v1/tickets/{id}/comments
    
    if (request.method() === 'GET') {
      const comments = mockState.comments.get(ticketId) || [];
      
      // requester 不返回 internal 评论
      const filteredComments = mockState.currentUser?.roles?.includes('requester')
        ? comments.filter(c => !c.is_internal)
        : comments;
      
      const pageData: CommentPage = {
        items: filteredComments,
        total: filteredComments.length,
        page: 1,
        page_size: 20,
      };
      
      await route.fulfill(buildSuccessResponse(pageData, delay));
    } else if (request.method() === 'POST') {
      const body = await request.postDataJSON();
      
      // 验证权限：internal 评论只有 agent/lead/manager 能创建
      if (body?.is_internal && !mockState.currentUser?.roles?.some(r => ['agent', 'lead', 'manager', 'admin'].includes(r))) {
        await route.fulfill(buildErrorResponse(403, 'Cannot create internal comment'));
        return;
      }
      
      const comment: Comment = {
        id: generateTestId('comment'),
        ticket_id: ticketId,
        author_id: mockState.currentUser?.user_id || 'anonymous',
        author_name: mockState.currentUser?.display_name || 'Unknown',
        content: body?.content || '',
        is_internal: body?.is_internal || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      const comments = mockState.comments.get(ticketId) || [];
      comments.push(comment);
      mockState.comments.set(ticketId, comments);
      
      await route.fulfill(buildCreatedResponse(comment, delay));
    }
  });
}

/**
 * Mock 状态流转路由
 */
export async function mockTransitionRoutes(page: Page, config: MockConfig = mockConfig) {
  const delay = config.enableDelay ? config.defaultDelay : 0;
  
  await page.route(/\/api\/v1\/tickets\/[^\/]+\/transitions$/, async (route: Route) => {
    const request = route.request();
    
    if (request.method() !== 'POST') {
      await route.route.continue();
      return;
    }
    
    const url = new URL(request.url());
    const ticketId = url.pathname.split('/')[3];
    const body = await request.postDataJSON();
    const ticket = mockState.tickets.get(ticketId || '');
    
    if (!ticket) {
      await route.fulfill(buildErrorResponse(404, 'Ticket not found'));
      return;
    }
    
    // 验证状态跃迁（简化版）
    const validTransitions: Record<string, string[]> = {
      'open': ['pending', 'closed'],
      'pending': ['pending_agent', 'pending_requester', 'resolved', 'closed'],
      'pending_agent': ['pending', 'resolved'],
      'pending_requester': ['pending', 'resolved', 'closed'],
      'resolved': ['closed'],
      'closed': [],
    };
    
    const newStatus = body?.status;
    const validNext = validTransitions[ticket.status] || [];
    
    if (!validNext.includes(newStatus)) {
      await route.fulfill(buildErrorResponse(409, `Invalid transition from ${ticket.status} to ${newStatus}`));
      return;
    }
    
    const updatedTicket = {
      ...ticket,
      status: newStatus,
      updated_at: new Date().toISOString(),
      ...(newStatus === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
      ...(newStatus === 'closed' ? { closed_at: new Date().toISOString() } : {}),
    };
    
    mockState.tickets.set(ticketId || '', updatedTicket);
    await route.fulfill(buildSuccessResponse(updatedTicket, delay));
  });
}

// ═══════════════════════════════════════════════════════════
// 综合 Mock 初始化
// ═══════════════════════════════════════════════════════════

/**
 * 初始化所有 Mock 路由
 * 
 * @param page - Playwright Page 实例
 * @param config - Mock 配置
 * @param user - 预设当前用户（可选）
 */
export async function initMockRoutes(
  page: Page, 
  config: MockConfig = {},
  user?: keyof typeof TEST_USERS
) {
  // 合并配置
  mockConfig = { ...defaultConfig, ...config };
  
  // 设置当前用户
  if (user) {
    const userData = TEST_USERS[user];
    mockState.currentUser = MOCK_RESPONSES.meResponse(userData);
  }
  
  // 初始化所有路由
  await mockAuthRoutes(page, mockConfig);
  await mockTicketRoutes(page, mockConfig);
  await mockCommentRoutes(page, mockConfig);
  await mockTransitionRoutes(page, mockConfig);
  
  console.log('✅ Mock routes initialized');
}

/**
 * 清除 Mock 状态
 */
export function clearMockState() {
  mockState.tickets.clear();
  mockState.comments.clear();
  mockState.currentUser = null;
}

/**
 * 获取 Mock 状态（用于测试断言）
 */
export function getMockState() {
  return {
    tickets: Array.from(mockState.tickets.values()),
    comments: Array.from(mockState.comments.entries()),
    currentUser: mockState.currentUser,
  };
}

/**
 * 设置 Mock 配置
 */
export function setMockConfig(config: Partial<MockConfig>) {
  mockConfig = { ...mockConfig, ...config };
}

// ═══════════════════════════════════════════════════════════
// 导出所有内容
// ═══════════════════════════════════════════════════════════

export {
  mockConfig,
  mockState,
  defaultConfig,
  buildSuccessResponse,
  buildCreatedResponse,
  buildErrorResponse,
};
