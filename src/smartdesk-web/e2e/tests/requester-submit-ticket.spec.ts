import { test, expect } from '@playwright/test';
import { generateTicketData, TicketData } from '../fixtures/test-data';

/**
 * SUP-497: 报单人提单流程 E2E 测试
 *
 * 支持 Mock 模式与真实 Gateway 模式。
 * - Mock 模式：通过 page.route 拦截 /api/v1/** 请求。
 * - Gateway 模式：请求转发到真实 Gateway。
 */

test.describe('报单人提单流程', () => {
  test.describe('用例 1：报单人提单', () => {
    test('以 zhangsan 登录并提交工单', async ({ page }) => {
      // 设置 Mock API
      const mockTickets: TicketData[] = [];
      await page.route('/api/v1/**', async (route, request) => {
        const url = new URL(request.url());
        const method = request.method();
        
        // POST /api/v1/tickets - 创建工单
        if (url.pathname === '/api/v1/tickets' && method === 'POST') {
          const body = await request.postDataJSON() || {};
          const ticket = generateTicketData({
            title: body.title,
            description: body.description,
            category: body.category,
            priority: body.priority || 'high',
            status: 'new',
            createdBy: 'zhangsan',
            assignedTo: '',
          });
          mockTickets.unshift(ticket);
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: ticket }),
          });
          return;
        }
        
        // GET /api/v1/tickets/:id - 获取工单详情
        if (url.pathname.startsWith('/api/v1/tickets/') && method === 'GET') {
          const ticketId = url.pathname.split('/').pop() || '';
          const ticket = mockTickets.find((t) => t.id === ticketId);
          if (ticket) {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ success: true, data: ticket }),
            });
          } else {
            await route.fulfill({
              status: 404,
              contentType: 'application/json',
              body: JSON.stringify({ success: false, error: 'Ticket not found' }),
            });
          }
          return;
        }
        
        await route.continue();
      });

      // Step 1: 设置登录状态并访问报单人门户
      await page.goto('/portal');
      await page.evaluate(() => {
        localStorage.setItem('auth_token', 'mock_token_123');
        localStorage.setItem('user_role', 'portal');
        localStorage.setItem('user_name', '张三');
      });
      await page.reload();
      
      await expect(page).toHaveURL('/portal');
      await expect(page.locator('[data-testid="portal-home"]')).toBeVisible();

      // Step 2: 点击「新建工单」
      await page.click('[data-testid="create-ticket-button"]');
      await page.waitForURL('/portal/tickets/create');
      await expect(page).toHaveURL('/portal/tickets/create');
      await expect(page.locator('[data-testid="ticket-create-form"]')).toBeVisible();

      // Step 3: 填写工单标题
      await page.fill('[data-testid="ticket-title-input"]', '无法访问黄区代码仓');

      // Step 4: 选择分类
      await page.selectOption('[data-testid="ticket-category-select"]', { label: '访问权限申请' });

      // Step 5: 填写描述
      await page.fill(
        '[data-testid="ticket-description-textarea"]',
        '申请访问黄区代码仓库权限，用于开发工作'
      );

      // Step 6: 提交工单
      await page.click('[data-testid="ticket-submit-button"]');

      // 验证：工单创建成功提示
      await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
      await expect(page.locator('[data-testid="success-toast"]')).toContainText('工单创建成功');

      // 验证：页面跳转至工单详情
      await page.waitForURL(/\/portal\/tickets\/[^/]+$/);
      await expect(page).toHaveURL(/\/portal\/tickets\/[^/]+$/);

      // 验证：工单状态与标题显示正确
      await expect(page.locator('[data-testid="ticket-status"]')).toContainText('新工单');
      await expect(page.locator('[data-testid="ticket-title"]')).toContainText('无法访问黄区代码仓');
      
      // 清理路由
      await page.unrouteAll();
    });

    test('工单创建失败后显示错误提示', async ({ page }) => {
      // 设置登录状态
      await page.goto('/portal/tickets/create');
      await page.evaluate(() => {
        localStorage.setItem('auth_token', 'mock_token_123');
        localStorage.setItem('user_role', 'portal');
        localStorage.setItem('user_name', '张三');
      });
      await page.reload();

      // 不填写必填项直接提交
      await page.click('[data-testid="ticket-submit-button"]');

      // 验证：表单验证错误
      await expect(page.locator('[data-testid="title-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="title-error"]')).toContainText('请填写工单标题');
    });

    test('未登录用户访问创建页面应重定向到登录', async ({ page }) => {
      // 确保没有登录状态
      await page.goto('/portal/tickets/create');
      await page.evaluate(() => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_name');
      });
      await page.reload();
      
      // 等待重定向完成
      await page.waitForURL('/portal/login');
      await expect(page).toHaveURL('/portal/login');
    });
  });

  test.describe('用例 2：提单后查看我的工单', () => {
    test('创建工单后能在列表中查看', async ({ page }) => {
      // 设置 Mock API
      const mockTickets: TicketData[] = [];
      await page.route('/api/v1/**', async (route, request) => {
        const url = new URL(request.url());
        const method = request.method();
        
        // GET /api/v1/tickets - 工单列表
        if (url.pathname === '/api/v1/tickets' && method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: { items: mockTickets, total: mockTickets.length } }),
          });
          return;
        }
        
        // POST /api/v1/tickets - 创建工单
        if (url.pathname === '/api/v1/tickets' && method === 'POST') {
          const body = await request.postDataJSON() || {};
          const ticket = generateTicketData({
            title: body.title,
            description: body.description,
            category: body.category,
            priority: body.priority || 'high',
            status: 'new',
            createdBy: 'zhangsan',
            assignedTo: '',
          });
          mockTickets.unshift(ticket);
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: ticket }),
          });
          return;
        }
        
        // GET /api/v1/tickets/:id - 获取工单详情
        if (url.pathname.startsWith('/api/v1/tickets/') && method === 'GET') {
          const ticketId = url.pathname.split('/').pop() || '';
          const ticket = mockTickets.find((t) => t.id === ticketId);
          if (ticket) {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ success: true, data: ticket }),
            });
          } else {
            await route.fulfill({
              status: 404,
              contentType: 'application/json',
              body: JSON.stringify({ success: false, error: 'Ticket not found' }),
            });
          }
          return;
        }
        
        await route.continue();
      });

      // 设置登录状态
      await page.goto('/portal');
      await page.evaluate(() => {
        localStorage.setItem('auth_token', 'mock_token_123');
        localStorage.setItem('user_role', 'portal');
        localStorage.setItem('user_name', '张三');
      });
      await page.reload();

      // 先创建一个工单
      await page.goto('/portal/tickets/create');
      await page.fill('[data-testid="ticket-title-input"]', '无法访问黄区代码仓');
      await page.selectOption('[data-testid="ticket-category-select"]', { label: '访问权限申请' });
      await page.fill('[data-testid="ticket-description-textarea"]', '申请访问权限');
      await page.click('[data-testid="ticket-submit-button"]');
      
      // 等待跳转到工单详情页
      await page.waitForURL(/\/portal\/tickets\/[^/]+$/);
      await expect(page).toHaveURL(/\/portal\/tickets\/[^/]+$/);

      // 进入「我的工单」列表
      await page.goto('/portal/tickets');
      await expect(page).toHaveURL('/portal/tickets');
      await expect(page.locator('[data-testid="ticket-list"]')).toBeVisible();

      // 等待列表加载并验证最新创建的工单
      await expect(page.locator('[data-testid="ticket-list-row"]')).toHaveCount(1);
      const firstRow = page.locator('[data-testid="ticket-list-row"]').first();
      await expect(firstRow).toBeVisible();
      await expect(firstRow.locator('[data-testid="ticket-title-cell"]')).toContainText('无法访问黄区代码仓');
      await expect(firstRow.locator('[data-testid="ticket-status-cell"]')).toContainText('新工单');
      await expect(firstRow.locator('[data-testid="ticket-created-at-cell"]')).toBeVisible();
      
      // 清理路由
      await page.unrouteAll();
    });

    test('工单列表支持搜索和筛选', async ({ page }) => {
      // 预置两条 Mock 工单
      const ticketA = generateTicketData({
        title: '无法访问黄区代码仓',
        category: 'access_request',
        status: 'new',
        priority: 'high',
        createdBy: 'zhangsan',
        assignedTo: '',
      });
      const ticketB = generateTicketData({
        title: 'VPN 连接问题',
        category: 'network',
        status: 'in_progress',
        priority: 'medium',
        createdBy: 'zhangsan',
        assignedTo: '',
      });
      const mockTickets = [ticketA, ticketB];
      
      // 设置 Mock API
      await page.route('/api/v1/**', async (route, request) => {
        const url = new URL(request.url());
        const method = request.method();
        
        if (url.pathname === '/api/v1/tickets' && method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: { items: mockTickets, total: mockTickets.length } }),
          });
          return;
        }
        
        await route.continue();
      });

      // 设置登录状态
      await page.goto('/portal');
      await page.evaluate(() => {
        localStorage.setItem('auth_token', 'mock_token_123');
        localStorage.setItem('user_role', 'portal');
        localStorage.setItem('user_name', '张三');
      });
      await page.reload();
      
      await page.goto('/portal/tickets');
      await expect(page.locator('[data-testid="ticket-list-row"]')).toHaveCount(2);

      // 测试搜索功能
      await page.fill('[data-testid="ticket-search-input"]', '黄区');
      await page.click('[data-testid="ticket-search-button"]');

      const rows = page.locator('[data-testid="ticket-list-row"]');
      await expect(rows).toHaveCount(1);
      await expect(rows.first().locator('[data-testid="ticket-title-cell"]')).toContainText('黄区');

      // 测试状态筛选
      await page.selectOption('[data-testid="ticket-status-filter"]', 'new');
      await expect(rows).toHaveCount(1);
      await expect(rows.first().locator('[data-testid="ticket-status-cell"]')).toContainText('新工单');
      
      // 清理路由
      await page.unrouteAll();
    });

    test('工单标题超长时截断显示', async ({ page }) => {
      const longTitle = '这是一个非常长的工单标题，用于测试超长文本的截断显示效果，确保 UI 不会崩溃';
      const mockTickets = [
        generateTicketData({
          title: longTitle,
          category: 'other',
          status: 'new',
          priority: 'low',
          createdBy: 'zhangsan',
          assignedTo: '',
        })
      ];
      
      // 设置 Mock API
      await page.route('/api/v1/**', async (route, request) => {
        const url = new URL(request.url());
        const method = request.method();
        
        if (url.pathname === '/api/v1/tickets' && method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: { items: mockTickets, total: mockTickets.length } }),
          });
          return;
        }
        
        await route.continue();
      });

      // 设置登录状态
      await page.goto('/portal');
      await page.evaluate(() => {
        localStorage.setItem('auth_token', 'mock_token_123');
        localStorage.setItem('user_role', 'portal');
        localStorage.setItem('user_name', '张三');
      });
      await page.reload();
      
      await page.goto('/portal/tickets');
      await expect(page.locator('[data-testid="ticket-list-row"]')).toHaveCount(1);

      const titleCell = page.locator('[data-testid="ticket-title-cell"]').first();
      await expect(titleCell).toBeVisible();
      await expect(titleCell).toContainText(longTitle.substring(0, 20));
      
      // 清理路由
      await page.unrouteAll();
    });
  });
});
