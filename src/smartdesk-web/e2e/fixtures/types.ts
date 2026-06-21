/**
 * E2E 测试类型定义
 * 
 * 对齐 gateway.yaml 契约定义
 */

// ═══════════════════════════════════════════════════════════
// 枚举类型
// ═══════════════════════════════════════════════════════════

/** 工单状态 */
export type TicketStatus = 
  | 'open'           // 待受理
  | 'pending'        // 处理中
  | 'pending_agent'  // 待回复
  | 'pending_requester' // 待用户确认
  | 'resolved'       // 已解决
  | 'closed';        // 已关闭

/** 工单优先级 */
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

/** 用户角色 */
export type UserRole = 'requester' | 'agent' | 'lead' | 'manager' | 'admin';

// ═══════════════════════════════════════════════════════════
// 用户相关类型
// ═══════════════════════════════════════════════════════════

/** 登录请求 */
export interface LoginRequest {
  username: string;
  password: string;
}

/** Token 响应 */
export interface TokenPair {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** 当前用户信息 */
export interface Me {
  user_id: string;
  username: string;
  display_name: string;
  roles: UserRole[];
}

/** 测试用户信息 */
export interface TestUser {
  id: string;
  username: string;
  password: string;
  displayName: string;
  roles: UserRole[];
}

// ═══════════════════════════════════════════════════════════
// 工单相关类型
// ═══════════════════════════════════════════════════════════

/** 工单创建请求 */
export interface TicketCreate {
  title: string;
  description: string;
  categoryId: string;
  priority: Priority;
}

/** 工单更新请求 */
export interface TicketUpdate {
  title?: string;
  description?: string;
  priority?: Priority;
  category_id?: string;
}

/** 工单模型 */
export interface Ticket {
  id: string;
  org_id: string;
  requester_id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  category_id: string;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  first_response_at: string | null;
  tags: string[];
  suggestion: any | null;
}

/** 工单聚合（详情） */
export interface TicketAggregate extends Ticket {
  // 可能包含额外的聚合字段
  requester_name?: string;
  assignee_name?: string;
  category_name?: string;
}

/** 工单列表响应 */
export interface TicketPage {
  items: Ticket[];
  total: number;
  page: number;
  page_size: number;
}

// ═══════════════════════════════════════════════════════════
// 评论相关类型
// ═══════════════════════════════════════════════════════════

/** 评论创建请求 */
export interface CommentCreate {
  content: string;
  is_internal: boolean;
}

/** 评论模型 */
export interface Comment {
  id: string;
  ticket_id: string;
  author_id: string;
  author_name: string;
  content: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
}

/** 评论列表响应 */
export interface CommentPage {
  items: Comment[];
  total: number;
  page: number;
  page_size: number;
}

// ═══════════════════════════════════════════════════════════
// 状态流转类型
// ═══════════════════════════════════════════════════════════

/** 状态流转请求 */
export interface TransitionRequest {
  status: TicketStatus;
  comment?: string;
}

// ═══════════════════════════════════════════════════════════
// SLA 相关类型
// ═══════════════════════════════════════════════════════════

/** SLA 视图 */
export interface SlaView {
  ticket_id: string;
  first_response_target: string;
  first_response_remaining: number | null;
  resolution_target: string;
  resolution_remaining: number | null;
  business_hours_only: boolean;
}

// ═══════════════════════════════════════════════════════════
// Mock/API 通用类型
// ═══════════════════════════════════════════════════════════

/** API 错误响应 */
export interface ApiError {
  error: string;
  message: string;
  code?: string;
}

/** 列表查询参数 */
export interface ListParams {
  page?: number;
  page_size?: number;
  status?: string;
  priority?: string;
  category_id?: string;
  q?: string;
}

/** 测试数据上下文 */
export interface TestContext {
  user?: TestUser;
  ticket?: Ticket;
  comments?: Comment[];
  accessToken?: string;
}
