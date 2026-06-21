import { test, expect } from '../fixtures/auth.fixture';
import { createApiMock } from '../helpers/api-mock';
import { SAMPLE_TICKET_ZHANGSAN, generateTicketData } from '../fixtures/test-data';

/**
 * 示例 E2E 测试用例
 *
 * 演示如何使用 fixtures 和 helpers
 *
 * TODO: 根据实际页面实现更新选择器
 */

test.describe('示例测试', () => {
  let apiMock: ReturnType<typeof createApiMock>;

  test.beforeEach(async ({ page }) => {
    apiMock = createApiMock(page);
    await apiMock.enableMock();
  });

  test('页面可正常加载', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/SmartDesk/);
  });

  test('Mock API 可正常工作', async ({ page, auth, isMockMode }) => {
    // 仅在 Mock 模式下运行
    test.skip(!isMockMode, '仅 Mock 模式');

    // 设置 Mock 响应
    const mockTicket = generateTicketData();
    apiMock.mockTicketCreate(mockTicket);

    // Mock 登录
    await auth.login('portal');

    // 访问页面（实际页面实现后更新）
    // await page.goto('/portal');
    // await page.click('button:has-text("新建工单")');
  });
});

test.describe('张三提单流程', () => {
  test.beforeEach(async ({ page }) => {
    const apiMock = createApiMock(page);
    await apiMock.enableMock();
  });

  test('报单人可登录', async ({ page, auth }) => {
    await auth.login('portal');
    // TODO: 验证登录成功后的页面状态
  });

  test('报单人可创建工单', async ({ page, auth, isMockMode }) => {
    test.skip(!isMockMode, '仅 Mock 模式');

    const apiMock = createApiMock(page);
    const mockTicket = generateTicketData(SAMPLE_TICKET_ZHANGSAN);
    apiMock.mockTicketCreate(mockTicket);

    await auth.login('portal');

    // TODO: 实现完整的提单流程测试
    // 1. 访问 /portal
    // 2. 点击「新建工单」
    // 3. 填写表单
    // 4. 提交
    // 5. 验证结果
  });
});

test.describe('李四队列与评论', () => {
  test.beforeEach(async ({ page }) => {
    const apiMock = createApiMock(page);
    await apiMock.enableMock();
  });

  test('坐席可登录', async ({ page, auth }) => {
    await auth.login('agent');
    // TODO: 验证登录成功后的页面状态
  });

  test('坐席可查看工单队列', async ({ page, auth, isMockMode }) => {
    test.skip(!isMockMode, '仅 Mock 模式');

    const apiMock = createApiMock(page);
    apiMock.mockTicketList([SAMPLE_TICKET_ZHANGSAN]);

    await auth.login('agent');

    // TODO: 实现队列查看测试
    // 1. 访问 /agent
    // 2. 验证工单列表
  });
});
