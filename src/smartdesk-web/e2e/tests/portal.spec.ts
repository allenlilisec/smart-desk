/**
 * Portal E2E 测试
 * 测试 /portal 报单人门户功能
 */

import { test, expect } from '../fixtures/portal.fixture';

test.describe('Portal 报单人门户', () => {
  test.describe('新建工单', () => {
    test('可以提交新工单', async ({ portalPage }) => {
      await portalPage.goto();
      await portalPage.fillTicketForm({
        title: '测试工单标题',
        description: '这是测试工单描述',
        priority: 'P3',
      });
      await portalPage.submitTicket();
      await portalPage.expectSuccessMessage();
    });

    test('标题为空时不能提交', async ({ portalPage }) => {
      await portalPage.goto();
      const submitButton = portalPage.page.locator('[data-testid="ticket-submit-button"]');
      await expect(submitButton).toBeDisabled();
    });
  });

  test.describe('我的工单列表', () => {
    test('可以查看工单列表', async ({ myTicketsPage }) => {
      await myTicketsPage.goto();
      await myTicketsPage.expectTicketsList();
    });

    test('可以搜索工单', async ({ myTicketsPage }) => {
      await myTicketsPage.goto();
      await myTicketsPage.searchTickets('测试');
      // 搜索结果应该过滤列表
    });

    test('可以筛选工单状态', async ({ myTicketsPage }) => {
      await myTicketsPage.goto();
      await myTicketsPage.filterByStatus('new');
      // 应该只显示新建状态的工单
    });

    test('可以点击工单查看详情', async ({ myTicketsPage, ticketDetailPage }) => {
      await myTicketsPage.goto();
      // 假设有一个工单ID
      await myTicketsPage.clickTicket('550e8400-e29b-41d4-a716-446655440001');
      await ticketDetailPage.expectTicketInfo();
    });
  });

  test.describe('工单详情', () => {
    test('可以查看工单详情', async ({ ticketDetailPage }) => {
      await ticketDetailPage.goto('550e8400-e29b-41d4-a716-446655440001');
      await ticketDetailPage.expectTicketInfo();
    });

    test('可以查看评论列表', async ({ ticketDetailPage }) => {
      await ticketDetailPage.goto('550e8400-e29b-41d4-a716-446655440002');
      await ticketDetailPage.expectCommentsList();
    });

    test('可以添加评论', async ({ ticketDetailPage }) => {
      await ticketDetailPage.goto('550e8400-e29b-41d4-a716-446655440002');
      await ticketDetailPage.addComment('这是测试评论');
      // 应该显示新评论
    });
  });
});
