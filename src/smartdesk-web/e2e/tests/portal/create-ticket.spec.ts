/**
 * E2E 测试：报单人提单流程
 * 
 * 测试场景：
 * 1. 以 zhangsan 登录 /portal
 * 2. 提交工单「无法访问黄区代码仓」
 * 3. 验证工单创建成功、状态正确
 * 
 * @see SUP-497
 */

import { test, expect } from '../../fixtures/auth.fixture';
import { initMockRoutes, clearMockState, getMockState } from '../../helpers/api-mock';
import { TICKET_TEMPLATES, TEST_USERS } from '../../fixtures/test-data';

// ═══════════════════════════════════════════════════════════
// 测试配置
// ═══════════════════════════════════════════════════════════

const IS_MOCK_MODE = process.env.E2E_MODE !== 'real';

// ═══════════════════════════════════════════════════════════
// 测试套件：报单人提单流程
// ═══════════════════════════════════════════════════════════

test.describe('报单人提单流程', () => {
  
  // 每个测试用例前清理 Mock 状态
  test.beforeEach(() => {
    if (IS_MOCK_MODE) {
      clearMockState();
    }
  });
  
  // ═══════════════════════════════════════════════════════
  // 用例 1：成功提单流程
  // ═══════════════════════════════════════════════════════
  
  test('报单人成功创建工单', async ({ requesterPage: page }) => {
    // 如果是 Mock 模式，初始化 Mock 路由
    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'zhangsan');
    }
    
    // Step 1: 访问报单人门户
    await test.step('访问报单人门户', async () => {
      await page.goto('/portal');
      
      // 验证页面标题
      await expect(page).toHaveTitle(/报单门户|工单门户|Portal/i);
      
      // 验证页面元素存在
      await expect(page.locator('[data-testid="portal-header"], h1, .portal-title').first()).toBeVisible();
    });
    
    // Step 2: 点击「新建工单」按钮
    await test.step('点击新建工单按钮', async () => {
      const createButton = page.locator('[data-testid="create-ticket-button"], button:has-text("新建工单"), a:has-text("新建工单")').first();
      
      // 等待按钮可见并点击
      await expect(createButton).toBeVisible({ timeout: 5000 });
      await createButton.click();
      
      // 验证跳转到创建工单页面
      await expect(page).toHaveURL(/\/portal\/tickets\/new|create|new-ticket/);
    });
    
    // Step 3: 填写工单信息
    await test.step('填写工单信息', async () => {
      const ticketData = TICKET_TEMPLATES.standardTicket;
      
      // 填写标题
      const titleInput = page.locator('[data-testid="ticket-title-input"], input[name="title"], #title').first();
      await expect(titleInput).toBeVisible({ timeout: 5000 });
      await titleInput.fill(ticketData.title);
      
      // 填写描述
      const descInput = page.locator('[data-testid="ticket-description-input"], textarea[name="description"], #description').first();
      await expect(descInput).toBeVisible();
      await descInput.fill(ticketData.description);
      
      // 选择分类（如果有分类选择器）
      const categorySelect = page.locator('[data-testid="ticket-category-select"], select[name="category"]').first();
      if (await categorySelect.isVisible().catch(() => false)) {
        await categorySelect.selectOption({ value: ticketData.categoryId });
      }
      
      // 选择优先级（如果有优先级选择器）
      const prioritySelect = page.locator('[data-testid="ticket-priority-select"], select[name="priority"]').first();
      if (await prioritySelect.isVisible().catch(() => false)) {
        await prioritySelect.selectOption({ value: ticketData.priority });
      }
    });
    
    // Step 4: 提交工单
    await test.step('提交工单', async () => {
      const submitButton = page.locator('[data-testid="submit-ticket-button"], button[type="submit"], button:has-text("提交")').first();
      
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toBeEnabled();
      await submitButton.click();
      
      // 等待提交完成（页面跳转或成功提示）
      await page.waitForLoadState('networkidle');
    });
    
    // Step 5: 验证提交成功
    await test.step('验证工单创建成功', async () => {
      // 验证成功提示
      const successToast = page.locator('[data-testid="success-toast"], .toast-success, .alert-success, [role="alert"]').first();
      
      // 验证页面跳转至工单详情或显示成功消息
      const urlPattern = /\/portal\/tickets\/|ticket-details|ticket-\w+/;
      const hasSuccessMessage = await successToast.isVisible().catch(() => false);
      const hasRedirected = await page.waitForURL(urlPattern, { timeout: 5000 }).catch(() => false) || 
                            page.url().match(urlPattern) !== null;
      
      expect(hasSuccessMessage || hasRedirected).toBeTruthy();
      
      // Mock 模式下验证状态
      if (IS_MOCK_MODE) {
        const mockState = getMockState();
        expect(mockState.tickets.length).toBeGreaterThan(0);
        
        const createdTicket = mockState.tickets[0];
        expect(createdTicket.title).toBe(TICKET_TEMPLATES.standardTicket.title);
        expect(createdTicket.status).toBe('new');
        expect(createdTicket.requester_id).toBe(TEST_USERS.zhangsan.id);
      }
    });
  });
  
  // ═══════════════════════════════════════════════════════
  // 用例 2：验证表单验证
  // ═══════════════════════════════════════════════════════
  
  test('提单表单验证 - 必填字段', async ({ requesterPage: page }) => {
    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'zhangsan');
    }
    
    // 访问创建工单页面
    await page.goto('/portal/tickets/new');
    
    // 等待表单加载
    const form = page.locator('form, [data-testid="ticket-form"]').first();
    await expect(form).toBeVisible({ timeout: 5000 });
    
    // 直接点击提交按钮（不填写任何字段）
    const submitButton = page.locator('[data-testid="submit-ticket-button"], button[type="submit"]').first();
    await submitButton.click();
    
    // 验证表单验证错误提示
    await test.step('验证标题必填', async () => {
      const titleError = page.locator('[data-testid="title-error"], [data-error="title"], input[name="title"] + .error, .field-error').first();
      const hasValidationError = await titleError.isVisible().catch(() => false) || 
                                await page.locator('text=标题').locator('..').locator('.error').first().isVisible().catch(() => false);
      
      // 或者验证提交按钮仍为禁用状态
      const isSubmitDisabled = await submitButton.isDisabled().catch(() => false);
      
      expect(hasValidationError || isSubmitDisabled).toBeTruthy();
    });
    
    await test.step('验证描述必填', async () => {
      const descError = page.locator('[data-testid="description-error"], [data-error="description"], textarea[name="description"] + .error').first();
      const hasValidationError = await descError.isVisible().catch(() => false);
      
      expect(hasValidationError || await submitButton.isDisabled().catch(() => false)).toBeTruthy();
    });
  });
  
  // ═══════════════════════════════════════════════════════
  // 用例 3：取消提单
  // ═══════════════════════════════════════════════════════
  
  test('取消提单返回列表页', async ({ requesterPage: page }) => {
    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'zhangsan');
    }
    
    // 访问创建工单页面
    await page.goto('/portal/tickets/new');
    
    // 填写部分信息
    const titleInput = page.locator('input[name="title"], [data-testid="ticket-title-input"]').first();
    await titleInput.fill('测试工单');
    
    // 点击取消按钮
    const cancelButton = page.locator('[data-testid="cancel-button"], button:has-text("取消"), a:has-text("取消")').first();
    
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click();
      
      // 验证返回列表页
      await expect(page).toHaveURL(/\/portal|tickets/);
    }
  });
  
  // ═══════════════════════════════════════════════════════
  // 用例 4：高优先级工单创建
  // ═══════════════════════════════════════════════════════
  
  test('创建高优先级工单', async ({ requesterPage: page }) => {
    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'zhangsan');
    }
    
    // 访问创建工单页面
    await page.goto('/portal/tickets/new');
    
    const highPriorityTicket = TICKET_TEMPLATES.highPriorityTicket;
    
    // 填写高优先级工单
    await page.fill('input[name="title"], [data-testid="ticket-title-input"]', highPriorityTicket.title);
    await page.fill('textarea[name="description"], [data-testid="ticket-description-input"]', highPriorityTicket.description);
    
    // 选择高优先级
    const prioritySelect = page.locator('select[name="priority"], [data-testid="ticket-priority-select"]').first();
    if (await prioritySelect.isVisible().catch(() => false)) {
      await prioritySelect.selectOption({ value: highPriorityTicket.priority });
    }
    
    // 提交工单
    const submitButton = page.locator('button[type="submit"], [data-testid="submit-ticket-button"]').first();
    await submitButton.click();
    
    // 等待提交完成
    await page.waitForLoadState('networkidle');
    
    // 验证成功
    const successIndicator = page.locator('[data-testid="success-toast"], .success, .alert-success').first();
    const urlPattern = /\/portal\/tickets\/|ticket-details/;
    
    const hasSuccess = await successIndicator.isVisible().catch(() => false);
    const hasRedirected = page.url().match(urlPattern) !== null;
    
    expect(hasSuccess || hasRedirected).toBeTruthy();
    
    // Mock 模式验证
    if (IS_MOCK_MODE) {
      const mockState = getMockState();
      const createdTicket = mockState.tickets.find(t => t.title === highPriorityTicket.title);
      expect(createdTicket).toBeDefined();
      expect(createdTicket?.priority).toBe('P1');
    }
  });
});
