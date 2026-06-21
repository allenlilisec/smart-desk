/**
 * Portal 页面测试夹具
 * 提供报单人门户页面对象
 */

import { test as base, expect, type Page } from '@playwright/test';
import {
  PORTAL_TEST_IDS as PortalPageIds,
  MY_TICKETS_TEST_IDS as MyTicketsPageIds,
  PORTAL_TICKET_DETAIL_TEST_IDS as TicketDetailPageIds,
} from '../../src/lib/test-ids';

export { expect };

/**
 * Portal Page Object Model
 */
export class PortalPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('/portal');
    await this.page.waitForSelector(`[data-testid="${PortalPageIds.PAGE_CONTAINER}"]`);
  }

  // 新建工单表单
  async fillTicketForm(data: {
    title: string;
    description: string;
    categoryId?: string;
    priority?: string;
  }) {
    await this.page.fill(`[data-testid="${PortalPageIds.TITLE_INPUT}"]`, data.title);
    await this.page.fill(`[data-testid="${PortalPageIds.DESCRIPTION_INPUT}"]`, data.description);
    
    if (data.categoryId) {
      await this.page.click(`[data-testid="${PortalPageIds.CATEGORY_SELECT}"]`);
      await this.page.click(`[role="option"][value="${data.categoryId}"]`);
    }
    
    if (data.priority) {
      await this.page.click(`[data-testid="${PortalPageIds.PRIORITY_SELECT}"]`);
      await this.page.click(`[role="option"][value="${data.priority}"]`);
    }
  }

  async submitTicket() {
    await this.page.click(`[data-testid="${PortalPageIds.SUBMIT_BUTTON}"]`);
  }

  async expectSuccessMessage() {
    await expect(this.page.locator(`[data-testid="${PortalPageIds.SUCCESS_MESSAGE}"]`)).toBeVisible();
  }

  async navigateToMyTickets() {
    await this.page.click(`[data-testid="${PortalPageIds.MY_TICKETS_LINK}"]`);
  }
}

/**
 * My Tickets Page Object Model
 */
export class MyTicketsPage {
  constructor(public readonly page: Page) {}

  async goto() {
    await this.page.goto('/portal/my-tickets');
    await this.page.waitForSelector(`[data-testid="${MyTicketsPageIds.PAGE_CONTAINER}"]`);
  }

  async expectTicketsList() {
    await expect(this.page.locator(`[data-testid="${MyTicketsPageIds.TICKETS_LIST}"]`)).toBeVisible();
  }

  async expectTicketWithTitle(title: string) {
    const ticket = this.page.locator(`[data-testid="${MyTicketsPageIds.TICKET_TITLE}"]:has-text("${title}")`);
    await expect(ticket).toBeVisible();
  }

  async clickNewTicketButton() {
    await this.page.click(`[data-testid="${MyTicketsPageIds.NEW_TICKET_BUTTON}"]`);
  }

  async searchTickets(query: string) {
    await this.page.fill(`[data-testid="${MyTicketsPageIds.SEARCH_INPUT}"]`, query);
  }

  async filterByStatus(status: string) {
    await this.page.click(`[data-testid="${MyTicketsPageIds.STATUS_FILTER}"]`);
    await this.page.click(`[role="option"][value="${status}"]`);
  }

  async clickTicket(ticketId: string) {
    await this.page.click(`[data-ticket-id="${ticketId}"]`);
  }
}

/**
 * Ticket Detail Page Object Model
 */
export class TicketDetailPage {
  constructor(public readonly page: Page) {}

  async goto(ticketId: string) {
    await this.page.goto(`/portal/tickets/${ticketId}`);
    await this.page.waitForSelector(`[data-testid="${TicketDetailPageIds.PAGE_CONTAINER}"]`);
  }

  async expectTicketInfo() {
    await expect(this.page.locator(`[data-testid="${TicketDetailPageIds.TICKET_INFO}"]`)).toBeVisible();
  }

  async expectTicketTitle(title: string) {
    await expect(this.page.locator(`[data-testid="${TicketDetailPageIds.TICKET_TITLE}"]`)).toHaveText(title);
  }

  async expectCommentsList() {
    await expect(this.page.locator(`[data-testid="${TicketDetailPageIds.COMMENTS_LIST}"]`)).toBeVisible();
  }

  async addComment(body: string) {
    await this.page.fill(`[data-testid="${TicketDetailPageIds.COMMENT_INPUT}"]`, body);
    await this.page.click(`[data-testid="${TicketDetailPageIds.SUBMIT_COMMENT_BUTTON}"]`);
  }

  async goBack() {
    await this.page.click(`[data-testid="${TicketDetailPageIds.BACK_BUTTON}"]`);
  }
}

// 测试夹具类型
interface PortalFixtures {
  portalPage: PortalPage;
  myTicketsPage: MyTicketsPage;
  ticketDetailPage: TicketDetailPage;
}

// 扩展测试
export const test = base.extend<PortalFixtures>({
  portalPage: async ({ page }, use) => {
    await use(new PortalPage(page));
  },
  myTicketsPage: async ({ page }, use) => {
    await use(new MyTicketsPage(page));
  },
  ticketDetailPage: async ({ page }, use) => {
    await use(new TicketDetailPage(page));
  },
});
