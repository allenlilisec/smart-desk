/**
 * Agent 页面测试夹具
 * 提供坐席工作台页面对象
 */

import { test as base, expect, type Page } from '@playwright/test';
import {
  AGENT_QUEUE_TEST_IDS as QueuePageIds,
  AGENT_TICKET_DETAIL_TEST_IDS as TicketDetailPageIds,
} from '../../src/lib/test-ids';

export { expect };

/**
 * Queue Page Object Model
 */
export class QueuePage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('/agent/queue');
    await this.page.waitForSelector(`[data-testid="${QueuePageIds.PAGE_CONTAINER}"]`);
  }

  async expectQueueList() {
    await expect(this.page.locator(`[data-testid="${QueuePageIds.QUEUE_LIST}"]`)).toBeVisible();
  }

  async expectTicketWithTitle(title: string) {
    const ticket = this.page.locator(`[data-testid="${QueuePageIds.TICKET_TITLE}"]:has-text("${title}")`);
    await expect(ticket).toBeVisible();
  }

  async searchTickets(query: string) {
    await this.page.fill(`[data-testid="${QueuePageIds.SEARCH_INPUT}"]`, query);
  }

  async filterByStatus(status: string) {
    await this.page.click(`[data-testid="${QueuePageIds.STATUS_FILTER}"]`);
    await this.page.click(`[role="option"][value="${status}"]`);
  }

  async acceptTicket(ticketId: string) {
    const acceptButton = this.page.locator(`[data-ticket-id="${ticketId}"] [data-testid="${QueuePageIds.ACCEPT_BUTTON}"]`);
    await acceptButton.click();
  }

  async viewTicket(ticketId: string) {
    const viewButton = this.page.locator(`[data-ticket-id="${ticketId}"] [data-testid="${QueuePageIds.VIEW_BUTTON}"]`);
    await viewButton.click();
  }

  async clickTicket(ticketId: string) {
    await this.page.click(`[data-ticket-id="${ticketId}"]`);
  }
}

/**
 * Agent Ticket Detail Page Object Model
 */
export class AgentTicketDetailPage {
  constructor(public readonly page: Page) {}

  async goto(ticketId: string) {
    await this.page.goto(`/agent/tickets/${ticketId}`);
    await this.page.waitForSelector(`[data-testid="${TicketDetailPageIds.PAGE_CONTAINER}"]`);
  }

  async expectTicketInfo() {
    await expect(this.page.locator(`[data-testid="${TicketDetailPageIds.TICKET_INFO}"]`)).toBeVisible();
  }

  async expectTicketTitle(title: string) {
    await expect(this.page.locator(`[data-testid="${TicketDetailPageIds.TICKET_TITLE}"]`)).toHaveText(title);
  }

  async expectStatusActions() {
    await expect(this.page.locator(`[data-testid="${TicketDetailPageIds.STATUS_ACTIONS}"]`)).toBeVisible();
  }

  async performTransition(action: string) {
    await this.page.click(`[data-testid="${TicketDetailPageIds.TRANSITION_SELECT}"]`);
    await this.page.click(`[role="option"][value="${action}"]`);
    await this.page.click(`[data-testid="${TicketDetailPageIds.TRANSITION_BUTTON}"]`);
  }

  async expectCommentsTab() {
    await expect(this.page.locator(`[data-testid="${TicketDetailPageIds.COMMENTS_TAB}"]`)).toBeVisible();
  }

  async expectInternalTab() {
    await expect(this.page.locator(`[data-testid="${TicketDetailPageIds.INTERNAL_TAB}"]`)).toBeVisible();
  }

  async addComment(body: string, visibility: 'public' | 'internal' = 'public') {
    await this.page.fill(`[data-testid="${TicketDetailPageIds.COMMENT_INPUT}"]`, body);
    if (visibility === 'internal') {
      await this.page.click(`[data-testid="${TicketDetailPageIds.VISIBILITY_SELECT}"]`);
      await this.page.click(`[role="option"][value="internal"]`);
    }
    await this.page.click(`[data-testid="${TicketDetailPageIds.SUBMIT_COMMENT_BUTTON}"]`);
  }

  async switchToInternalTab() {
    await this.page.click(`[data-testid="${TicketDetailPageIds.INTERNAL_TAB}"]`);
  }

  async goBack() {
    await this.page.click(`[data-testid="${TicketDetailPageIds.BACK_BUTTON}"]`);
  }
}

// 测试夹具类型
interface AgentFixtures {
  queuePage: QueuePage;
  agentTicketDetailPage: AgentTicketDetailPage;
}

// 扩展测试
export const test = base.extend<AgentFixtures>({
  queuePage: async ({ page }, use) => {
    await use(new QueuePage(page));
  },
  agentTicketDetailPage: async ({ page }, use) => {
    await use(new AgentTicketDetailPage(page));
  },
});
