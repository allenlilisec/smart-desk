/**
 * 工单相关类型定义
 * 基于 src/openapi/gateway.yaml 契约
 */

// 工单状态枚举
export type TicketStatus =
  | 'new'
  | 'accepted'
  | 'in_progress'
  | 'pending_user'
  | 'resolved'
  | 'closed'
  | 'suspended'
  | 'cancelled';

// 工单优先级枚举
export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';

// 状态流转动作枚举
export type TransitionAction =
  | 'accept'
  | 'start'
  | 'wait_user'
  | 'resolve'
  | 'close'
  | 'reopen'
  | 'suspend'
  | 'resume'
  | 'cancel';

// 评论可见性枚举
export type CommentVisibility = 'public' | 'internal';

// 用户角色枚举
export type UserRole = 'requester' | 'agent' | 'lead' | 'manager' | 'admin';

// 工单基础信息
export interface Ticket {
  id: string;
  number: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee_id: string | null;
  category_id: string | null;
  csat_score: number | null;
  csat_rated_at: string | null;
  created_at: string;
}

// 工单详情聚合
export interface TicketAggregate extends Ticket {
  description: string;
  requester: RequesterContext | null;
  sla: SlaView | null;
  suggestion: SuggestionView | null;
  comments_count: number;
}

// 报单人上下文
export interface RequesterContext {
  id: string;
  display_name: string;
  email: string | null;
}

// SLA视图
export interface SlaView {
  priority: TicketPriority;
  response_due_at: string;
  resolve_due_at: string;
  response_met: boolean;
  resolve_met: boolean;
  paused: boolean;
  breached: boolean;
}

// 建议视图
export interface SuggestionView {
  category_id: string | null;
  confidence: number;
  priority: TicketPriority;
  applied: boolean;
}

// 工单列表分页
export interface TicketPage {
  items: Ticket[];
  page: number;
  page_size: number;
  total: number;
}

// 创建工单请求
export interface TicketCreate {
  title: string;
  description: string;
  category_id?: string | null;
  priority?: TicketPriority;
  attachment_ids?: string[];
}

// 更新工单请求
export interface TicketUpdate {
  title?: string;
  description?: string;
  category_id?: string;
  priority?: TicketPriority;
}

// 状态流转请求
export interface TransitionRequest {
  action: TransitionAction;
  reason?: string;
}

// 评论
export interface Comment {
  id: string;
  body: string;
  visibility: CommentVisibility;
  author_id: string;
  created_at: string;
}

// 评论分页
export interface CommentPage {
  items: Comment[];
  page: number;
  page_size: number;
  total: number;
}

// 创建评论请求
export interface CommentCreate {
  body: string;
  visibility: CommentVisibility;
  mentions?: string[];
}

// 用户信息
export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  status: 'active' | 'disabled';
  roles: UserRole[];
}

// 当前用户信息
export interface Me {
  user_id: string;
  username: string;
  display_name: string;
  roles: UserRole[];
}

// 分类
export interface Category {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  active: boolean;
  sort: number;
}

// API错误
export interface ApiError {
  code: string;
  message: string;
  details?: object[];
  trace_id?: string;
}
