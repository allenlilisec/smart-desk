/**
 * 工单相关类型定义（生产代码使用）
 *
 * 从 e2e/fixtures/types 提取核心类型，供生产代码引用
 * 避免生产代码直接依赖 e2e fixtures
 */

/** 工单状态 */
export type TicketStatus =
  | 'new'
  | 'accepted'
  | 'in_progress'
  | 'pending_user'
  | 'resolved'
  | 'closed'
  | 'suspended'
  | 'cancelled';

/** 工单优先级 */
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

/** 用户角色 */
export type UserRole = 'requester' | 'agent' | 'lead' | 'manager' | 'admin';

/** 评论可见性 */
export type CommentVisibility = 'public' | 'internal';

/** 工单模型 */
export interface Ticket {
  id: string;
  number?: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
  assignee_id: string | null;
  category_id: string | null;
  created_at: string;
  org_id?: string;
  requester_id?: string;
  description?: string;
  updated_at?: string;
  resolved_at?: string | null;
  closed_at?: string | null;
  first_response_at?: string | null;
  tags?: string[];
  suggestion?: any | null;
}

/** 工单聚合（详情） */
export interface TicketAggregate extends Ticket {
  requester?: {
    id: string;
    display_name: string;
    email?: string | null;
  };
  requester_name?: string;
  comments_count?: number;
}

/** 工单列表响应 */
export interface TicketPage {
  items: Ticket[];
  total: number;
  page: number;
  page_size: number;
}

/** 评论模型 */
export interface Comment {
  id: string;
  body: string;
  visibility: CommentVisibility;
  author_id: string;
  created_at: string;
  author_name?: string;
  ticket_id?: string;
  updated_at?: string;
}

/** 评论列表响应 */
export interface CommentPage {
  items: Comment[];
  total: number;
  page: number;
  page_size: number;
}

/** 当前用户信息 */
export interface Me {
  user_id: string;
  username: string;
  display_name: string;
  roles: UserRole[];
}
