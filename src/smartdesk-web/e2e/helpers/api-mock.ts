import { Page, Route, Request } from '@playwright/test';
import { MOCK_API_RESPONSES, TicketData, CommentData } from '../fixtures/test-data';

/**
 * API Mock 助手
 * 用于 Mock 模式下拦截和模拟 API 响应
 */

export class ApiMockHelper {
  private page: Page;
  private mockEnabled: boolean;
  private customHandlers: Map<string, (route: Route, request: Request) => void> = new Map();

  constructor(page: Page) {
    this.page = page;
    this.mockEnabled = process.env.E2E_MODE === 'mock';
  }

  /**
   * 启用 Mock 模式
   * 拦截 Gateway API 请求并返回模拟数据
   */
  async enableMock(): Promise<void> {
    if (!this.mockEnabled) {
      console.log('⚠️  非 Mock 模式，跳过 API Mock');
      return;
    }

    console.log('🎭 启用 API Mock');

    // 拦截所有 Gateway API 请求
    await this.page.route('**/api/**', this.handleMockRoute.bind(this));
    
    // 拦截 Next.js API 路由
    await this.page.route('/api/**', this.handleMockRoute.bind(this));
  }

  /**
   * 禁用 Mock 模式
   */
  async disableMock(): Promise<void> {
    await this.page.unrouteAll();
    this.customHandlers.clear();
  }

  /**
   * 添加自定义 Mock 处理器
   * @param pattern URL 匹配模式
   * @param handler 处理函数
   */
  addHandler(pattern: string, handler: (route: Route, request: Request) => void): void {
    this.customHandlers.set(pattern, handler);
  }

  /**
   * 处理 Mock 路由
   */
  private async handleMockRoute(route: Route, request: Request): Promise<void> {
    const url = request.url();
    const method = request.method();
    const pathname = new URL(url).pathname;
    const key = `${method} ${pathname}`;

    // 先检查自定义处理器
    for (const [pattern, handler] of this.customHandlers) {
      if (this.matchPattern(pathname, pattern)) {
        return handler(route, request);
      }
    }

    // 使用默认 Mock 响应
    const mockResponse = this.getMockResponse(key, pathname, method, request);
    
    if (mockResponse) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse),
      });
    } else {
      // 未匹配到 Mock，继续请求
      await route.continue();
    }
  }

  /**
   * 匹配 URL 模式
   */
  private matchPattern(pathname: string, pattern: string): boolean {
    // 简单实现：支持 :param 和 * 通配
    const regex = new RegExp(
      '^' + pattern
        .replace(/\//g, '\\/')
        .replace(/:\w+/g, '[^/]+')
        .replace(/\*/g, '.*') + '$'
    );
    return regex.test(pathname);
  }

  /**
   * 获取 Mock 响应
   */
  private getMockResponse(key: string, pathname: string, method: string, request: Request): any {
    // 精确匹配
    if (key in MOCK_API_RESPONSES) {
      const response = MOCK_API_RESPONSES[key as keyof typeof MOCK_API_RESPONSES];
      return typeof response === 'function' ? response(request.postDataJSON() || {}) : response;
    }

    // 路径参数匹配 (如 /api/tickets/123)
    const patterns = Object.keys(MOCK_API_RESPONSES);
    for (const pattern of patterns) {
      if (this.matchDynamicPath(pattern, key)) {
        const response = MOCK_API_RESPONSES[pattern as keyof typeof MOCK_API_RESPONSES];
        return typeof response === 'function' ? response(request.postDataJSON() || {}) : response;
      }
    }

    return null;
  }

  /**
   * 匹配动态路径
   * 如 /api/tickets/:id 匹配 /api/tickets/123
   */
  private matchDynamicPath(pattern: string, actual: string): boolean {
    const patternParts = pattern.split(' ');
    const actualParts = actual.split(' ');
    
    if (patternParts.length !== actualParts.length) return false;
    if (patternParts[0] !== actualParts[0]) return false;

    const patternPath = patternParts[1];
    const actualPath = actualParts[1];

    const patternSegments = patternPath.split('/');
    const actualSegments = actualPath.split('/');

    if (patternSegments.length !== actualSegments.length) return false;

    return patternSegments.every((segment, i) => {
      if (segment.startsWith(':')) return true; // 路径参数
      return segment === actualSegments[i];
    });
  }

  /**
   * Mock 工单创建
   */
  mockTicketCreate(ticketData: TicketData): void {
    this.addHandler('/api/tickets', (route, request) => {
      if (request.method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(ticketData),
        });
      } else {
        route.continue();
      }
    });
  }

  /**
   * Mock 工单列表
   */
  mockTicketList(tickets: TicketData[]): void {
    this.addHandler('/api/tickets', (route, request) => {
      if (request.method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tickets, total: tickets.length }),
        });
      } else {
        route.continue();
      }
    });
  }

  /**
   * Mock 评论创建
   */
  mockCommentCreate(commentData: CommentData): void {
    const pattern = '/api/tickets/*/comments';
    this.addHandler(pattern, (route, request) => {
      if (request.method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(commentData),
        });
      } else {
        route.continue();
      }
    });
  }

  /**
   * Mock 状态流转
   */
  mockStatusTransition(ticketId: string, newStatus: string): void {
    const pattern = `/api/tickets/${ticketId}/transitions`;
    this.addHandler(pattern, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: newStatus, updatedAt: new Date().toISOString() }),
      });
    });
  }

  /**
   * Mock 工单创建（/api/v1/tickets）
   */
  mockTicketCreateV1(ticketData: TicketData): void {
    this.addHandler('/api/v1/tickets', (route, request) => {
      if (request.method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: ticketData }),
        });
      } else {
        route.continue();
      }
    });
  }

  /**
   * Mock 工单列表（/api/v1/tickets）
   */
  mockTicketListV1(tickets: TicketData[]): void {
    this.addHandler('/api/v1/tickets', (route, request) => {
      if (request.method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { items: tickets, total: tickets.length } }),
        });
      } else {
        route.continue();
      }
    });
  }

  /**
   * Mock 工单详情（/api/v1/tickets/:id）
   */
  mockTicketDetailV1(ticketData: TicketData): void {
    const pattern = '/api/v1/tickets/:id';
    this.addHandler(pattern, (route, request) => {
      if (request.method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: ticketData }),
        });
      } else {
        route.continue();
      }
    });
  }
}

/**
 * 创建 API Mock 助手的工厂函数
 */
export function createApiMock(page: Page): ApiMockHelper {
  return new ApiMockHelper(page);
}
