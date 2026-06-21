/**
 * 认证夹具 - 管理登录状态
 * 支持 Mock 模式和真实 Gateway 模式
 */

import { Page } from '@playwright/test'

// 测试账号配置
export const TEST_USERS = {
  requester: {
    username: process.env.TEST_USER_REQUESTER || 'zhangsan',
    password: process.env.TEST_USER_REQUESTER_PASSWORD || 'password123',
    role: 'requester',
    orgId: process.env.TEST_ORG_ID || '550e8400-e29b-41d4-a716-446655440000',
  },
  agent: {
    username: process.env.TEST_USER_AGENT || 'lisi',
    password: process.env.TEST_USER_AGENT_PASSWORD || 'password123',
    role: 'agent',
    orgId: process.env.TEST_ORG_ID || '550e8400-e29b-41d4-a716-446655440000',
  },
}

// JWT Token 模拟（Mock 模式使用）
export function generateMockToken(user: typeof TEST_USERS.requester): string {
  const payload = {
    sub: user.username,
    roles: [user.role],
    org_id: user.orgId,
    exp: Date.now() + 3600 * 1000, // 1小时过期
  }
  // 模拟 JWT 格式（base64编码）
  return `mock_jwt_${Buffer.from(JSON.stringify(payload)).toString('base64')}`
}

/**
 * 以报单人身份登录
 * @param page Playwright page 对象
 * @param isMockMode 是否使用 Mock 模式
 */
export async function loginAsRequester(page: Page, isMockMode: boolean = true): Promise<void> {
  const user = TEST_USERS.requester
  
  if (isMockMode) {
    // Mock 模式：直接设置 localStorage 中的 token
    const token = generateMockToken(user)
    await page.addInitScript((token) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('user_role', 'requester')
      localStorage.setItem('user_name', '张三')
    }, token)
  } else {
    // 真实 Gateway 模式：通过表单登录
    await page.goto('/portal/login')
    await page.fill('[data-testid="username-input"]', user.username)
    await page.fill('[data-testid="password-input"]', user.password)
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/portal')
  }
}

/**
 * 以坐席身份登录
 * @param page Playwright page 对象
 * @param isMockMode 是否使用 Mock 模式
 */
export async function loginAsAgent(page: Page, isMockMode: boolean = true): Promise<void> {
  const user = TEST_USERS.agent
  
  if (isMockMode) {
    // Mock 模式：直接设置 localStorage 中的 token
    const token = generateMockToken(user)
    await page.addInitScript((token) => {
      localStorage.setItem('auth_token', token)
      localStorage.setItem('user_role', 'agent')
      localStorage.setItem('user_name', '李四')
    }, token)
  } else {
    // 真实 Gateway 模式：通过表单登录
    await page.goto('/agent/login')
    await page.fill('[data-testid="username-input"]', user.username)
    await page.fill('[data-testid="password-input"]', user.password)
    await page.click('[data-testid="login-button"]')
    await page.waitForURL('/agent')
  }
}

/**
 * 登出
 * @param page Playwright page 对象
 */
export async function logout(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_role')
    localStorage.removeItem('user_name')
  })
}

/**
 * 检查是否已登录
 * @param page Playwright page 对象
 * @returns 是否已登录
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  const token = await page.evaluate(() => localStorage.getItem('auth_token'))
  return token !== null && token !== ''
}
