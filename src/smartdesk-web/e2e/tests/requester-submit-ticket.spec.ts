import { test, expect } from '../fixtures/auth.fixture';
import { createApiMock } from '../helpers/api-mock';
import { generateTicketData, TicketData } from '../fixtures/test-data';

/**
 * SUP-497: 报单人提单流程 E2E 测试
 *
 * 支持 Mock 模式与真实 Gateway 模式。
 * - Mock 模式：通过 ApiMockHelper 拦截 /api/v1/** 请求。
 * - Gateway 模式：请求转发到真实 Gateway，测试仅覆盖不依赖预置数据的流程。
 */

test.describe('报单人提单流程', () => {
  let apiMock: ReturnType<typeof createApiMock>;
  const mockTickets: TicketData[] = [];

  test.beforeEach(async ({ page, isMockMode }) => {
    apiMock = createApiMock(page);

    if (isMockMode) {
      // 动态 Mock /api/v1/tickets：创建与列表共享同一份内存数据
      apiMock.addHandler('/api/v1/tickets', (route, request) => {
        if (request.method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { items: mockTickets, total: mockTickets.length },
            }),
          });
          return;
        }

        if (request.method() === 'POST') {
          const body = request.postDataJSON() || {};
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
          route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: ticket }),
          });
          return;
        }

        route.continue();
      });

      // Mock 工单详情
      apiMock.addHandler('/api/v1/tickets/:id', (route, request) => {
        if (request.method() === 'GET') {
          const url = new URL(request.url());
          const ticketId = url.pathname.split('/').pop() || '';
          const ticket = mockTickets.find((t) => t.id === ticketId);

          if (ticket) {
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ success: true, data: ticket }),
            });
          } else {
            route.fulfill({
              status: 404,
              contentType: 'application/json',
              body: JSON.stringify({ success: false, error: 'Ticket not found' }),
            });
          }
          return;
        }

        route.continue();
      });
    }

    await apiMock.enableMock();
  });

  test.afterEach(async ({ auth }) => {
    await apiMock.disableMock();
    await auth.logout();
    mockTickets.length = 0;
  });

  test.describe('用例 1：报单人提单', () => {
    test('以 zhangsan 登录并提交工单', async ({ page, auth }) => {
      await auth.login('portal');

      // Step 1: 访问报单人门户
      await page.goto('/portal');
      await expect(page).toHaveURL('/portal');
      await expect(page.locator('[data-testid="portal-home"]')).toBeVisible();

      // Step 2: 点击「新建工单」
      await page.click('[data-testid="create-ticket-button"]');
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
      await expect(page).toHaveURL(/\/portal\/tickets\/[^/]+$/);

      // 验证：工单状态与标题显示正确
      await expect(page.locator('[data-testid="ticket-status"]')).toContainText('新工单');
      await expect(page.locator('[data-testid="ticket-title"]')).toContainText('无法访问黄区代码仓');
    });

    test('工单创建失败后显示错误提示', async ({ page, auth }) => {
      await auth.login('portal');
      await page.goto('/portal/tickets/create');

      // 不填写必填项直接提交
      await page.click('[data-testid="ticket-submit-button"]');

      // 验证：表单验证错误
      await expect(page.locator('[data-testid="title-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="title-error"]')).toContainText('请填写工单标题');
    });

    test('未登录用户访问创建页面应重定向到登录', async ({ page }) => {
      await page.goto('/portal/tickets/create');
      await expect(page).toHaveURL('/portal/login');
    });
  });

  test.describe('用例 2：提单后查看我的工单', () => {
    test('创建工单后能在列表中查看', async ({ page, auth }) => {
      await auth.login('portal');

      // 先创建一个工单
      await page.goto('/portal/tickets/create');
      await page.fill('[data-testid="ticket-title-input"]', '无法访问黄区代码仓');
      await page.selectOption('[data-testid="ticket-category-select"]', { label: '访问权限申请' });
      await page.fill('[data-testid="ticket-description-textarea"]', '申请访问权限');
      await page.click('[data-testid="ticket-submit-button"]');
      await expect(page).toHaveURL(/\/portal\/tickets\/[^/]+$/);

      // 进入「我的工单」列表
      await page.goto('/portal/tickets');
      await expect(page).toHaveURL('/portal/tickets');
      await expect(page.locator('[data-testid="ticket-list"]')).toBeVisible();

      // 验证最新创建的工单
      await expect(page.locator('[data-testid="ticket-list-row"]')).toHaveCount(1);
      const firstRow = page.locator('[data-testid="ticket-list-row"]').first();
      await expect(firstRow).toBeVisible();
      await expect(firstRow.locator('[data-testid="ticket-title-cell"]')).toContainText('无法访问黄区代码仓');
      await expect(firstRow.locator('[data-testid="ticket-status-cell"]')).toContainText('新工单');
      await expect(firstRow.locator('[data-testid="ticket-created-at-cell"]')).toBeVisible();
    });

    test('工单列表支持搜索和筛选', async ({ page, auth, isMockMode }) => {
      test.skip(!isMockMode, '搜索/筛选依赖稳定的预置数据，仅在 Mock 模式运行');

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
      mockTickets.push(ticketA, ticketB);

      await auth.login('portal');
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
    });

    test('工单标题超长时截断显示', async ({ page, auth, isMockMode }) => {
      test.skip(!isMockMode, '超长标题截断显示在 Mock 模式验证');

      const longTitle = '这是一个非常长的工单标题，用于测试超长文本的截断显示效果，确保 UI 不会崩溃';
      mockTickets.push(
        generateTicketData({
          title: longTitle,
          category: 'other',
          status: 'new',
          priority: 'low',
          createdBy: 'zhangsan',
          assignedTo: '',
        })
      );

      await auth.login('portal');
      await page.goto('/portal/tickets');
      await expect(page.locator('[data-testid="ticket-list-row"]')).toHaveCount(1);

      const titleCell = page.locator('[data-testid="ticket-title-cell"]').first();
      await expect(titleCell).toBeVisible();
      await expect(titleCell).toContainText(longTitle.substring(0, 20));
    });
  });
});
