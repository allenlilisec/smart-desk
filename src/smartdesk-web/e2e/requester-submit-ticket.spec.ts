/**
 * SUP-497: 报单人提单流程 E2E 测试
 * 
 * 测试场景：
 * 1. 报单人提单
 * 2. 提单后查看我的工单
 */

import { test, expect, Page } from '@playwright/test'
import { loginAsRequester, logout, TEST_USERS } from './fixtures/auth'
import { setupMockAPI, clearMockAPI, getAllMockTickets, mockStore } from './helpers/api-mock'

test.describe('报单人提单流程', () => {
  // 每个测试前设置 Mock API
  test.beforeEach(async ({ page }) => {
    await setupMockAPI(page)
  })

  // 每个测试后清理
  test.afterEach(async ({ page }) => {
    await clearMockAPI(page)
    await logout(page)
  })

  test.describe('用例 1：报单人提单', () => {
    test('以 zhangsan 登录并提交工单', async ({ page }) => {
      // Step 1: 以 zhangsan 登录
      await loginAsRequester(page, true)
      
      // Step 2: 访问报单人门户
      await page.goto('/portal')
      await expect(page).toHaveURL('/portal')
      
      // 验证页面加载成功
      await expect(page.locator('[data-testid="portal-home"]')).toBeVisible()
      
      // Step 3: 点击「新建工单」
      await page.click('[data-testid="create-ticket-button"]')
      await expect(page).toHaveURL('/portal/tickets/create')
      
      // 验证工单创建页面加载
      await expect(page.locator('[data-testid="ticket-create-form"]')).toBeVisible()
      
      // Step 4: 填写工单标题「无法访问黄区代码仓」
      await page.fill('[data-testid="ticket-title-input"]', '无法访问黄区代码仓')
      
      // Step 5: 选择分类
      await page.selectOption('[data-testid="ticket-category-select"]', { label: '访问权限申请' })
      
      // Step 6: 填写描述
      await page.fill('[data-testid="ticket-description-textarea"]', 
        '申请访问黄区代码仓库权限，用于开发工作')
      
      // Step 7: 提交工单
      await page.click('[data-testid="ticket-submit-button"]')
      
      // 验证：工单创建成功提示
      await expect(page.locator('[data-testid="success-toast"]')).toBeVisible()
      await expect(page.locator('[data-testid="success-toast"]')).toContainText('工单创建成功')
      
      // 验证：页面跳转至工单详情
      await expect(page).toHaveURL(/\/portal\/tickets\/[^/]+$/)
      
      // 验证：工单状态显示正确（新工单状态为"new"）
      await expect(page.locator('[data-testid="ticket-status"]')).toContainText('新工单')
      
      // 验证：工单标题正确显示
      await expect(page.locator('[data-testid="ticket-title"]')).toContainText('无法访问黄区代码仓')
    })

    test('工单创建失败后显示错误提示', async ({ page }) => {
      // 登录
      await loginAsRequester(page, true)
      
      // 访问创建页面
      await page.goto('/portal/tickets/create')
      
      // 不填写必填项直接提交
      await page.click('[data-testid="ticket-submit-button"]')
      
      // 验证：表单验证错误
      await expect(page.locator('[data-testid="title-error"]')).toBeVisible()
      await expect(page.locator('[data-testid="title-error"]')).toContainText('请填写工单标题')
    })
  })

  test.describe('用例 2：提单后查看我的工单', () => {
    test('创建工单后能在列表中查看', async ({ page }) => {
      // 预创建工单数据
      mockStore.createTicket({
        title: '无法访问黄区代码仓',
        description: '申请访问权限',
        category: 'access_request',
        status: 'new',
        priority: 'P2',
        requesterId: TEST_USERS.requester.username,
        requesterName: '张三',
        assigneeId: null,
        assigneeName: null,
      })
      
      // Step 1: 以 zhangsan 登录
      await loginAsRequester(page, true)
      
      // Step 2: 进入「我的工单」列表
      await page.goto('/portal/tickets')
      await expect(page).toHaveURL('/portal/tickets')
      
      // 验证：工单列表加载成功
      await expect(page.locator('[data-testid="ticket-list"]')).toBeVisible()
      
      // Step 3: 查看最新创建的工单
      const firstRow = page.locator('[data-testid="ticket-list-row"]').first()
      await expect(firstRow).toBeVisible()
      
      // 验证：工单信息正确（标题）
      await expect(firstRow.locator('[data-testid="ticket-title-cell"]')).toContainText('无法访问黄区代码仓')
      
      // 验证：工单信息正确（状态）
      await expect(firstRow.locator('[data-testid="ticket-status-cell"]')).toContainText('新工单')
      
      // 验证：工单信息正确（创建时间）
      await expect(firstRow.locator('[data-testid="ticket-created-at-cell"]')).toBeVisible()
    })

    test('工单列表支持搜索和筛选', async ({ page }) => {
      // 预创建多个工单
      mockStore.createTicket({
        title: '无法访问黄区代码仓',
        description: '',
        category: 'access_request',
        status: 'new',
        priority: 'P2',
        requesterId: TEST_USERS.requester.username,
        requesterName: '张三',
        assigneeId: null,
        assigneeName: null,
      })
      
      mockStore.createTicket({
        title: 'VPN 连接问题',
        description: '',
        category: 'network',
        status: 'in_progress',
        priority: 'P1',
        requesterId: TEST_USERS.requester.username,
        requesterName: '张三',
        assigneeId: null,
        assigneeName: null,
      })
      
      // 登录
      await loginAsRequester(page, true)
      await page.goto('/portal/tickets')
      
      // 测试搜索功能
      await page.fill('[data-testid="ticket-search-input"]', '黄区')
      await page.click('[data-testid="ticket-search-button"]')
      
      // 验证：搜索结果只显示包含"黄区"的工单
      const rows = page.locator('[data-testid="ticket-list-row"]')
      await expect(rows).toHaveCount(1)
      await expect(rows.first().locator('[data-testid="ticket-title-cell"]')).toContainText('黄区')
      
      // 测试状态筛选
      await page.click('[data-testid="filter-status-new"]')
      await expect(rows).toHaveCount(1)
      await expect(rows.first().locator('[data-testid="ticket-status-cell"]')).toContainText('新工单')
    })
  })

  test.describe('边界场景', () => {
    test('未登录用户访问创建页面应重定向到登录', async ({ page }) => {
      // 不登录直接访问
      await page.goto('/portal/tickets/create')
      
      // 验证：重定向到登录页面
      await expect(page).toHaveURL('/portal/login')
    })

    test('工单标题超长时截断显示', async ({ page }) => {
      // 预创建超长子标题工单
      const longTitle = '这是一个非常长的工单标题，用于测试超长文本的截断显示效果，确保 UI 不会崩溃'
      mockStore.createTicket({
        title: longTitle,
        description: '',
        category: 'other',
        status: 'new',
        priority: 'P3',
        requesterId: TEST_USERS.requester.username,
        requesterName: '张三',
        assigneeId: null,
        assigneeName: null,
      })
      
      // 登录并查看列表
      await loginAsRequester(page, true)
      await page.goto('/portal/tickets')
      
      // 验证：超长标题被截断显示
      const titleCell = page.locator('[data-testid="ticket-title-cell"]').first()
      await expect(titleCell).toBeVisible()
      await expect(titleCell).toContainText(longTitle.substring(0, 20))
    })
  })
})
