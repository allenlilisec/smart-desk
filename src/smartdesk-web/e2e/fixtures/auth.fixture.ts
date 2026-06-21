/**
 * 认证 Fixture
 * 
 * 提供测试用例的登录状态管理，支持 Mock 模式和真实 Gateway 模式。
 * 使用 Playwright 的 fixture 机制，实现依赖注入。
 * 
 * @see https://playwright.dev/docs/test-fixtures
 */

import { test as base, Page, expect, APIRequestContext } from '@playwright/test';
import { TestUser, TokenPair, Me, Ticket } from './types';
import { TEST_USERS, MOCK_RESPONSES, generateTestId } from './test-data';

// ═══════════════════════════════════════════════════════════
// Fixture 类型定义
// ═══════════════════════════════════════════════════════════

type AuthFixture = {
  /** 已登录的页面实例 */
  authenticatedPage: Page;
  
  /** 报单人页面（zhangsan） */
  requesterPage: Page;
  
  /** 坐席页面（lisi） */
  agentPage: Page;
  
  /** 管理员页面 */
  adminPage: Page;
  
  /** 登录工具函数 */
  loginAs: (page: Page, user: keyof typeof TEST_USERS) => Promise<Page>;
  
  /** 获取认证信息 */
  getAuthInfo: (user: keyof typeof TEST_USERS) => Promise<{ token: string; user: Me }>;
  
  /** API 请求上下文（已认证） */
  authenticatedApi: APIRequestContext;
};

// ═══════════════════════════════════════════════════════════
// 全局存储（用于跨测试保持登录状态）
// ═══════════════════════════════════════════════════════════

const authStorage = new Map<string, { token: string; user: Me }>();

// ═══════════════════════════════════════════════════════════
// 登录实现
// ═══════════════════════════════════════════════════════════

/**
 * Mock 模式登录 - 使用 localStorage 注入 token
 */
async function mockLogin(page: Page, userKey: keyof typeof TEST_USERS): Promise<{ token: string; user: Me }> {
  const user = TEST_USERS[userKey];
  const tokenData = MOCK_RESPONSES.loginSuccess(user);
  const userInfo = MOCK_RESPONSES.meResponse(user);
  
  // 注入 token 到 localStorage
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('sd_access_token', token);
    localStorage.setItem('sd_user', JSON.stringify(user));
    localStorage.setItem('sd_token_expires', (Date.now() + 3600000).toString());
  }, { token: tokenData.access_token, user: userInfo });
  
  return { token: tokenData.access_token, user: userInfo };
}

/**
 * 真实 Gateway 模式登录 - 调用实际登录 API
 */
async function realLogin(page: Page, userKey: keyof typeof TEST_USERS): Promise<{ token: string; user: Me }> {
  const user = TEST_USERS[userKey];
  
  // 导航到登录页
  await page.goto('/login');
  
  // 填写登录表单
  await page.fill('[data-testid="login-username"]', user.username);
  await page.fill('[data-testid="login-password"]', user.password);
  
  // 点击登录按钮
  await page.click('[data-testid="login-submit"]');
  
  // 等待登录成功（重定向到首页或 portal）
  await page.waitForURL(/\/(portal|agent|admin)?$/, { timeout: 10000 });
  
  // 从 localStorage 获取 token
  const token = await page.evaluate(() => localStorage.getItem('sd_access_token'));
  const userInfoStr = await page.evaluate(() => localStorage.getItem('sd_user'));
  
  if (!token || !userInfoStr) {
    throw new Error(`Login failed for user: ${user.username}`);
  }
  
  return { token, user: JSON.parse(userInfoStr) };
}

/**
 * 统一的登录入口
 */
async function performLogin(
  page: Page, 
  userKey: keyof typeof TEST_USERS
): Promise<{ token: string; user: Me }> {
  const isMockMode = process.env.E2E_MODE !== 'real';
  
  if (isMockMode) {
    return mockLogin(page, userKey);
  } else {
    return realLogin(page, userKey);
  }
}

// ═══════════════════════════════════════════════════════════
// Playwright Fixture 扩展
// ═══════════════════════════════════════════════════════════

export const test = base.extend<AuthFixture>({
  /**
   * 通用认证页面 - 以 zhangsan 登录
   */
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    
    await performLogin(page, 'zhangsan');
    await page.goto('/portal');
    
    await use(page);
    
    await context.close();
  },
  
  /**
   * 报单人页面 - zhangsan
   */
  requesterPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    
    await performLogin(page, 'zhangsan');
    await page.goto('/portal');
    
    await use(page);
    
    await context.close();
  },
  
  /**
   * 坐席页面 - lisi
   */
  agentPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    
    await performLogin(page, 'lisi');
    await page.goto('/agent');
    
    await use(page);
    
    await context.close();
  },
  
  /**
   * 管理员页面
   */
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    
    await performLogin(page, 'admin');
    await page.goto('/admin');
    
    await use(page);
    
    await context.close();
  },
  
  /**
   * 登录工具函数
   */
  loginAs: async ({}, use) => {
    await use(async (page: Page, userKey: keyof typeof TEST_USERS) => {
      return performLogin(page, userKey);
    });
  },
  
  /**
   * 获取认证信息（不创建页面）
   */
  getAuthInfo: async ({}, use) => {
    await use(async (userKey: keyof typeof TEST_USERS) => {
      const cached = authStorage.get(userKey);
      if (cached) {
        return cached;
      }
      
      const user = TEST_USERS[userKey];
      const tokenData = MOCK_RESPONSES.loginSuccess(user);
      const userInfo = MOCK_RESPONSES.meResponse(user);
      
      const authInfo = { token: tokenData.access_token, user: userInfo };
      authStorage.set(userKey, authInfo);
      
      return authInfo;
    });
  },
  
  /**
   * 已认证的 API 请求上下文
   */
  authenticatedApi: async ({ playwright }, use) => {
    const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
    const authInfo = authStorage.get('zhangsan') || { token: 'mock-token' };
    
    const apiContext = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: {
        'Authorization': `Bearer ${authInfo.token}`,
      },
    });
    
    await use(apiContext);
    
    await apiContext.dispose();
  },
});

// ═══════════════════════════════════════════════════════════
// 导出 expect
// ═══════════════════════════════════════════════════════════

export { expect };

// ═══════════════════════════════════════════════════════════
// 辅助函数导出
// ═══════════════════════════════════════════════════════════

export { TEST_USERS, MOCK_RESPONSES, generateTestId };
