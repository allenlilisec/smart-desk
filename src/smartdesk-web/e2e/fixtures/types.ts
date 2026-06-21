/**
 * E2E 测试类型定义
 * 
 * 对齐 gateway.yaml 契约定义
 */

// ═══════════════════════════════════════════════════════════
// 枚举类型
// ═══════════════════════════════════════════════════════════

/** 工单状态（对齐 gateway.yaml '#/components/schemas/Ticket.status'） */
export type TicketStatus =
  | 'new'            // 新工单
  | 'accepted'       // 已受理
  | 'in_progress'    // 处理中
  | 'pending_user'   // 待用户确认
  | 'resolved'       // 已解决
  | 'closed'         // 已关闭
  | 'suspended'      // 已挂起
  | 'cancelled';     // 已取消

/** 工单优先级 */
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

/** 用户角色 */
export type UserRole = 'requester' | 'agent' | 'lead' | 'manager' | 'admin';

/** 评论可见性（对齐 gateway.yaml '#/components/schemas/CommentCreate.visibility'） */
export type CommentVisibility = 'public' | 'internal';

/** 流转动作（对齐 gateway.yaml '#/components/schemas/TransitionRequest.action'） */
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

/** 工单模型（对齐 gateway.yaml '#/components/schemas/Ticket'） */
export interface Ticket {
  id: string;
  number?: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
  assignee_id: string | null;
  category_id: string | null;
  created_at: string;
  // 扩展字段：用于 Mock 与测试断言
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

/** 工单聚合（详情，对齐 gateway.yaml '#/components/schemas/TicketAggregate'） */
export interface TicketAggregate extends Ticket {
  requester?: {
    id: string;
    display_name: string;
    email?: string | null;
  };
  comments_count?: number;
}

/** 工单列表响应（对齐 gateway.yaml '#/components/schemas/TicketPage'） */
export interface TicketPage {
  items: Ticket[];
  total: number;
  page: number;
  page_size: number;
}

// ═══════════════════════════════════════════════════════════
// 评论相关类型
// ═══════════════════════════════════════════════════════════

/** 评论创建请求（对齐 gateway.yaml '#/components/schemas/CommentCreate'） */
export interface CommentCreate {
  body: string;
  visibility: CommentVisibility;
  mentions?: string[];
}

/** 评论模型（对齐 gateway.yaml '#/components/schemas/CommentPage.items'） */
export interface Comment {
  id: string;
  body: string;
  visibility: CommentVisibility;
  author_id: string;
  created_at: string;
  // 扩展字段：用于 Mock UI 展示
  author_name?: string;
  ticket_id?: string;
  updated_at?: string;
}

/** 评论列表响应（对齐 gateway.yaml '#/components/schemas/CommentPage'） */
export interface CommentPage {
  items: Comment[];
  total: number;
  page: number;
  page_size: number;
}

// ═══════════════════════════════════════════════════════════
// 状态流转类型
// ═══════════════════════════════════════════════════════════

/** 状态流转请求（对齐 gateway.yaml '#/components/schemas/TransitionRequest'） */
export interface TransitionRequest {
  action: TransitionAction;
  reason?: string;
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
