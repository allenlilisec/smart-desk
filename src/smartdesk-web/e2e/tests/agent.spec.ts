/**
 * Agent E2E 测试
 * 测试 /agent 坐席工作台功能
 */

import { test, expect } from '../fixtures/agent.fixture';

test.describe('Agent 坐席工作台', () => {
  test.describe('工单队列', () => {
    test('可以查看工单队列', async ({ queuePage }) => {
      await queuePage.goto();
      await queuePage.expectQueueList();
    });

    test('可以搜索工单', async ({ queuePage }) => {
      await queuePage.goto();
      await queuePage.searchTickets('登录');
      // 搜索结果应该过滤列表
    });

    test('可以筛选工单状态', async ({ queuePage }) => {
      await queuePage.goto();
      await queuePage.filterByStatus('new');
      // 应该只显示新建状态的工单
    });

    test('可以接单', async ({ queuePage }) => {
      await queuePage.goto();
      // 假设有一个新建状态的工单
      await queuePage.acceptTicket('550e8400-e29b-41d4-a716-446655440001');
    });

    test('可以查看工单详情', async ({ queuePage, agentTicketDetailPage }) => {
      await queuePage.goto();
      await queuePage.viewTicket('550e8400-e29b-41d4-a716-446655440001');
      await agentTicketDetailPage.expectTicketInfo();
    });
  });

  test.describe('工单详情', () => {
    test('可以查看工单详情', async ({ agentTicketDetailPage }) => {
      await agentTicketDetailPage.goto('550e8400-e29b-41d4-a716-446655440001');
      await agentTicketDetailPage.expectTicketInfo();
    });

    test('可以查看状态操作', async ({ agentTicketDetailPage }) => {
      await agentTicketDetailPage.goto('550e8400-e29b-41d4-a716-446655440001');
      await agentTicketDetailPage.expectStatusActions();
    });

    test('可以执行状态流转', async ({ agentTicketDetailPage }) => {
      await agentTicketDetailPage.goto('550e8400-e29b-41d4-a716-446655440001');
      await agentTicketDetailPage.performTransition('accept');
      // 状态应该变为已受理
    });

    test('可以查看评论', async ({ agentTicketDetailPage }) => {
      await agentTicketDetailPage.goto('550e8400-e29b-41d4-a716-446655440002');
      await agentTicketDetailPage.expectCommentsTab();
    });

    test('可以查看内部备注', async ({ agentTicketDetailPage }) => {
      await agentTicketDetailPage.goto('550e8400-e29b-41d4-a716-446655440002');
      await agentTicketDetailPage.expectInternalTab();
    });

    test('可以添加公开评论', async ({ agentTicketDetailPage }) => {
      await agentTicketDetailPage.goto('550e8400-e29b-41d4-a716-446655440002');
      await agentTicketDetailPage.addComment('这是公开评论', 'public');
    });

    test('可以添加内部备注', async ({ agentTicketDetailPage }) => {
      await agentTicketDetailPage.goto('550e8400-e29b-41d4-a716-446655440002');
      await agentTicketDetailPage.addComment('这是内部备注', 'internal');
    });
  });
});
