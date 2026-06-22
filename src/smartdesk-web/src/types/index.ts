/**
 * 类型定义入口
 */

// 从 ticket.ts 导出（工单相关类型）
export type {
  TicketStatus,
  TicketPriority,
  UserRole,
  CommentVisibility,
  Ticket,
  TicketAggregate,
  TicketPage,
  Comment,
  CommentPage,
  Me,
} from './ticket';

// 从 routing-rule.ts 导出（路由规则类型）
export type {
  Priority as RoutingPriority,
  Strategy,
  RoutingRule,
  RoutingRuleCreate,
  RoutingRuleUpdate,
  RoutingRulePage,
  RoutingRuleQueryParams,
  RoutingRuleReorderRequest,
} from './routing-rule';
