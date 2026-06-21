/**
 * E2E 测试：坐席队列与工单交互
 *
 * 测试场景：
 * 1. 坐席查看工单队列
 * 2. 工单详情与评论交互
 * 3. 工单状态流转
 *
 * Mock 模式下通过 seedMockTickets / seedMockComments 直接注入前置数据，
 * 不再使用 window.__mockTickets 或 || true / || IS_MOCK_MODE 等假绿断言。
 *
 * @see SUP-498
 */

import { test, expect } from '../../fixtures/auth.fixture';
import {
  initMockRoutes,
  clearMockState,
  getMockState,
  seedMockTickets,
  seedMockComments,
} from '../../helpers/api-mock';
import { TICKET_TEMPLATES, TEST_USERS, COMMENT_TEMPLATES } from '../../fixtures/test-data';
import type { Ticket, Comment } from '../../fixtures/types';

const IS_MOCK_MODE = process.env.E2E_MODE !== 'real';

// 构造一个张三提交的待处理工单
function makeZhangsanTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: `ticket-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    org_id: 'org-test-001',
    requester_id: TEST_USERS.zhangsan.id,
    title: TICKET_TEMPLATES.standardTicket.title,
    description: TICKET_TEMPLATES.standardTicket.description,
    status: 'new',
    priority: TICKET_TEMPLATES.standardTicket.priority,
    category_id: TICKET_TEMPLATES.standardTicket.categoryId,
    assignee_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resolved_at: null,
    closed_at: null,
    first_response_at: null,
    tags: [],
    suggestion: null,
    ...overrides,
  };
}

test.describe('用例 1：坐席查看工单队列', () => {
  test.beforeEach(() => {
    if (IS_MOCK_MODE) {
      clearMockState();
    }
  });

  test('坐席成功查看工单队列', async ({ agentPage: page }) => {
    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'lisi');
    }

    await test.step('访问坐席门户', async () => {
      await page.goto('/agent');
      await expect(page).toHaveTitle(/坐席|工单|Agent/i);
      await expect(page.locator('[data-testid="agent-header"]').first()).toBeVisible();
    });

    await test.step('查看工单队列', async () => {
      const queueContainer = page.locator('[data-testid="ticket-queue"]');
      await expect(queueContainer).toBeVisible({ timeout: 5000 });
    });
  });

  test('工单列表显示正确信息', async ({ agentPage: page }) => {
    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'lisi');
      seedMockTickets([makeZhangsanTicket()]);
    }

    await page.goto('/agent');
    await page.waitForLoadState('networkidle');

    await test.step('验证工单信息列存在', async () => {
      const headerTexts = await page.locator('[data-testid="queue-header"] th').allTextContents();
      const hasKeyColumns = headerTexts.some(text =>
        /标题|状态|优先级|创建人|时间|title|status|priority|requester|created/i.test(text)
      );
      expect(hasKeyColumns).toBeTruthy();
    });

    await test.step('验证列表中存在工单', async () => {
      const ticketItem = page.locator('[data-testid="ticket-item"]').first();
      await expect(ticketItem).toBeVisible({ timeout: 5000 });
    });
  });

  test('张三提交的工单可见', async ({ agentPage: page }) => {
    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'lisi');
      seedMockTickets([makeZhangsanTicket({ id: 'ticket-zhangsan-001' })]);
    }

    await page.goto('/agent');
    await page.waitForLoadState('networkidle');

    await test.step('验证张三工单可见', async () => {
      const ticketRow = page.locator('[data-testid="ticket-item"]').filter({
        hasText: /无法访问黄区代码仓/,
      });
      await expect(ticketRow).toBeVisible({ timeout: 5000 });

      const mockState = getMockState();
      const zhangsanTicket = mockState.tickets.find(
        (t: Ticket) => t.requester_id === TEST_USERS.zhangsan.id
      );
      expect(zhangsanTicket).toBeDefined();
      expect(zhangsanTicket?.title).toBe(TICKET_TEMPLATES.standardTicket.title);
    });
  });
});

test.describe('用例 2：工单详情与评论交互', () => {
  test.beforeEach(() => {
    if (IS_MOCK_MODE) {
      clearMockState();
    }
  });

  test('坐席进入工单详情页', async ({ agentPage: page }) => {
    const ticket = makeZhangsanTicket({ id: 'ticket-detail-001' });

    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'lisi');
      seedMockTickets([ticket]);
    }

    await test.step('访问工单详情', async () => {
      await page.goto(`/agent/tickets/${ticket.id}`);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(`/agent/tickets/${ticket.id}`);
    });

    await test.step('验证详情页元素', async () => {
      await expect(page.locator('[data-testid="ticket-title"]').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('[data-testid="ticket-info"]').first()).toBeVisible();
      await expect(page.locator('[data-testid="comments-section"]').first()).toBeVisible();
    });
  });

  test('坐席添加内部备注', async ({ agentPage: page }) => {
    const ticket = makeZhangsanTicket({ id: 'ticket-internal-001' });

    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'lisi');
      seedMockTickets([ticket]);
    }

    await page.goto(`/agent/tickets/${ticket.id}`);
    await page.waitForLoadState('networkidle');

    await test.step('选择内部备注类型', async () => {
      await page.locator('[data-testid="internal-comment-radio"]').check();
    });

    await test.step('填写并提交内部备注', async () => {
      await page.locator('[data-testid="comment-textarea"]').fill(COMMENT_TEMPLATES.internalNote.body);
      await page.locator('[data-testid="submit-comment-button"]').click();
      await page.waitForLoadState('networkidle');
    });

    await test.step('验证评论提交成功', async () => {
      const mockState = getMockState();
      const ticketComments = mockState.comments.find(([ticketId]: [string, Comment[]]) => ticketId === ticket.id);
      expect(ticketComments).toBeDefined();
      const comments = ticketComments![1];
      expect(comments.length).toBeGreaterThan(0);
      expect(comments[0].body).toBe(COMMENT_TEMPLATES.internalNote.body);
      expect(comments[0].visibility).toBe('internal');

      const newComment = page.locator('[data-testid="comment-item"]').filter({
        hasText: COMMENT_TEMPLATES.internalNote.body,
      });
      await expect(newComment).toBeVisible({ timeout: 5000 });
    });
  });

  test('坐席添加对外回复', async ({ agentPage: page }) => {
    const ticket = makeZhangsanTicket({ id: 'ticket-public-001' });

    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'lisi');
      seedMockTickets([ticket]);
    }

    await page.goto(`/agent/tickets/${ticket.id}`);
    await page.waitForLoadState('networkidle');

    await test.step('选择对外回复类型', async () => {
      await page.locator('[data-testid="public-comment-radio"]').check();
    });

    await test.step('填写并提交对外回复', async () => {
      await page.locator('[data-testid="comment-textarea"]').fill(COMMENT_TEMPLATES.publicReply.body);
      await page.locator('[data-testid="submit-comment-button"]').click();
      await page.waitForLoadState('networkidle');
    });

    await test.step('验证对外回复提交成功', async () => {
      const mockState = getMockState();
      const ticketComments = mockState.comments.find(([ticketId]: [string, Comment[]]) => ticketId === ticket.id);
      expect(ticketComments).toBeDefined();
      const comments = ticketComments![1];
      const publicComment = comments.find((c: Comment) => c.visibility === 'public');
      expect(publicComment).toBeDefined();
      expect(publicComment?.body).toBe(COMMENT_TEMPLATES.publicReply.body);

      const newComment = page.locator('[data-testid="comment-item"]').filter({
        hasText: COMMENT_TEMPLATES.publicReply.body,
      });
      await expect(newComment).toBeVisible({ timeout: 5000 });
    });
  });

  test('评论列表更新正确', async ({ agentPage: page }) => {
    const ticket = makeZhangsanTicket({ id: 'ticket-comments-001' });
    const seededComment: Comment = {
      id: 'comment-seed-001',
      ticket_id: ticket.id,
      author_id: TEST_USERS.lisi.id,
      author_name: TEST_USERS.lisi.displayName,
      body: COMMENT_TEMPLATES.internalNote.body,
      visibility: 'internal',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'lisi');
      seedMockTickets([ticket]);
      seedMockComments(ticket.id, [seededComment]);
    }

    await page.goto(`/agent/tickets/${ticket.id}`);
    await page.waitForLoadState('networkidle');

    await test.step('验证评论列表渲染', async () => {
      const commentItem = page.locator('[data-testid="comment-item"]').filter({
        hasText: COMMENT_TEMPLATES.internalNote.body,
      });
      await expect(commentItem).toBeVisible({ timeout: 5000 });
      await expect(page.locator('[data-testid="comment-author"]').first()).toBeVisible();
      await expect(page.locator('[data-testid="comment-time"]').first()).toBeVisible();
    });
  });
});

test.describe('用例 3：工单状态流转', () => {
  test.beforeEach(() => {
    if (IS_MOCK_MODE) {
      clearMockState();
    }
  });

  test('坐席执行接单操作', async ({ agentPage: page }) => {
    const ticket = makeZhangsanTicket({ id: 'ticket-accept-001' });

    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'lisi');
      seedMockTickets([ticket]);
    }

    await page.goto(`/agent/tickets/${ticket.id}`);
    await page.waitForLoadState('networkidle');

    await test.step('执行接单操作', async () => {
      await page.locator('[data-testid="accept-ticket-button"]').click();
      await page.waitForLoadState('networkidle');
    });

    await test.step('验证状态变为已受理', async () => {
      const mockState = getMockState();
      const updated = mockState.tickets.find((t: Ticket) => t.id === ticket.id);
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('accepted');

      const statusBadge = page.locator('[data-testid="ticket-status"]');
      await expect(statusBadge).toHaveText(/已受理|accepted/i, { timeout: 5000 });
    });
  });

  test('坐席执行开始处理操作', async ({ agentPage: page }) => {
    const ticket = makeZhangsanTicket({
      id: 'ticket-start-001',
      status: 'accepted',
      assignee_id: TEST_USERS.lisi.id,
    });

    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'lisi');
      seedMockTickets([ticket]);
    }

    await page.goto(`/agent/tickets/${ticket.id}`);
    await page.waitForLoadState('networkidle');

    await test.step('执行开始处理操作', async () => {
      await page.locator('[data-testid="start-ticket-button"]').click();
      await page.waitForLoadState('networkidle');
    });

    await test.step('验证状态变为处理中', async () => {
      const mockState = getMockState();
      const updated = mockState.tickets.find((t: Ticket) => t.id === ticket.id);
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('in_progress');

      const statusBadge = page.locator('[data-testid="ticket-status"]');
      await expect(statusBadge).toHaveText(/处理中|in_progress/i, { timeout: 5000 });
    });
  });

  test('坐席执行解决操作', async ({ agentPage: page }) => {
    const ticket = makeZhangsanTicket({
      id: 'ticket-resolve-001',
      status: 'in_progress',
      assignee_id: TEST_USERS.lisi.id,
    });

    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'lisi');
      seedMockTickets([ticket]);
    }

    await page.goto(`/agent/tickets/${ticket.id}`);
    await page.waitForLoadState('networkidle');

    await test.step('执行解决操作', async () => {
      await page.locator('[data-testid="resolve-ticket-button"]').click();

      const confirmButton = page.locator('[data-testid="confirm-resolve"]').first();
      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click();
      }

      await page.waitForLoadState('networkidle');
    });

    await test.step('验证状态变为已解决', async () => {
      const mockState = getMockState();
      const updated = mockState.tickets.find((t: Ticket) => t.id === ticket.id);
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('resolved');
      expect(updated!.resolved_at).toBeTruthy();

      const statusBadge = page.locator('[data-testid="ticket-status"]');
      await expect(statusBadge).toHaveText(/已解决|resolved/i, { timeout: 5000 });
    });
  });

  test('状态流转符合预期 - new -> accepted -> in_progress -> resolved', async ({ agentPage: page }) => {
    const ticket = makeZhangsanTicket({ id: 'ticket-flow-001' });

    if (IS_MOCK_MODE) {
      await initMockRoutes(page, { enableDelay: false }, 'lisi');
      seedMockTickets([ticket]);
    }

    await page.goto(`/agent/tickets/${ticket.id}`);
    await page.waitForLoadState('networkidle');

    await test.step('初始状态为待受理', async () => {
      const statusBadge = page.locator('[data-testid="ticket-status"]');
      await expect(statusBadge).toHaveText(/新工单|new/i, { timeout: 5000 });
    });

    await test.step('流转到已受理', async () => {
      await page.locator('[data-testid="accept-ticket-button"]').click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="ticket-status"]')).toHaveText(/已受理|accepted/i, { timeout: 5000 });
    });

    await test.step('流转到处理中', async () => {
      await page.locator('[data-testid="start-ticket-button"]').click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="ticket-status"]')).toHaveText(/处理中|in_progress/i, { timeout: 5000 });
    });

    await test.step('流转到已解决', async () => {
      await page.locator('[data-testid="resolve-ticket-button"]').click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="ticket-status"]')).toHaveText(/已解决|resolved/i, { timeout: 5000 });
    });

    await test.step('验证最终 Mock 状态', async () => {
      const mockState = getMockState();
      const updated = mockState.tickets.find((t: Ticket) => t.id === ticket.id);
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('resolved');
      expect(updated!.resolved_at).toBeTruthy();
    });
  });
});
