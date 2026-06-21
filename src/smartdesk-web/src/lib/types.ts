export type Role = "requester" | "agent" | "lead" | "manager" | "admin";

export type TicketStatus =
  | "new"
  | "accepted"
  | "in_progress"
  | "pending_user"
  | "resolved"
  | "closed"
  | "suspended"
  | "cancelled";

export type Priority = "P1" | "P2" | "P3" | "P4";

export type TransitionAction =
  | "accept"
  | "start"
  | "wait_user"
  | "resolve"
  | "close"
  | "reopen"
  | "suspend"
  | "resume"
  | "cancel";

export type CommentVisibility = "public" | "internal";

export interface Me {
  user_id: string;
  username: string;
  display_name: string;
  org_id: string;
  roles: Role[];
}

export interface TokenPair {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Ticket {
  id: string;
  number: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
  assignee_id: string | null;
  category_id: string | null;
  created_at: string;
}

export interface TicketAggregate extends Ticket {
  description: string;
  comments_count?: number;
}

export interface TicketPage {
  items: Ticket[];
  page: number;
  page_size: number;
  total: number;
}

export interface Comment {
  id: string;
  body: string;
  visibility: CommentVisibility;
  author_id: string;
  created_at: string;
}

export interface CommentPage {
  items: Comment[];
  page: number;
  page_size: number;
  total: number;
}

export interface TimelineEntry {
  id: string;
  event_type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TimelinePage {
  items: TimelineEntry[];
  page: number;
  page_size: number;
  total: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: object[];
  trace_id?: string;
}

// Admin types from gateway OpenAPI
export interface Category {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  active: boolean;
  sort: number;
}

export interface SlaPolicy {
  id: string;
  name: string;
  active: boolean;
  targets: SlaTarget[];
}

export interface SlaTarget {
  priority: Priority;
  response_minutes: number;
  resolve_minutes: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  status: "active" | "disabled";
  roles: Role[];
}

export interface UserPage {
  items: User[];
  page: number;
  page_size: number;
  total: number;
}

export interface NotificationPolicy {
  role: Role;
  event_type: string;
  channel: "inapp" | "email";
  enabled: boolean;
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  new: "新建",
  accepted: "已受理",
  in_progress: "处理中",
  pending_user: "待用户",
  resolved: "已解决",
  closed: "已关闭",
  suspended: "挂起",
  cancelled: "已取消",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  P1: "紧急",
  P2: "高",
  P3: "中",
  P4: "低",
};

export const STATUS_COLORS: Record<TicketStatus, string> = {
  new: "border-blue-200 bg-blue-50 text-blue-700",
  accepted: "border-sky-200 bg-sky-50 text-sky-700",
  in_progress: "border-amber-200 bg-amber-50 text-amber-800",
  pending_user: "border-cyan-200 bg-cyan-50 text-cyan-700",
  resolved: "border-green-200 bg-green-50 text-green-700",
  closed: "border-slate-200 bg-slate-50 text-slate-600",
  suspended: "border-amber-200 bg-amber-50 text-amber-800",
  cancelled: "border-red-200 bg-red-50 text-red-700",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  P1: "border-red-200 bg-red-50 text-red-700",
  P2: "border-amber-200 bg-amber-50 text-amber-800",
  P3: "border-blue-200 bg-blue-50 text-blue-700",
  P4: "border-slate-200 bg-slate-50 text-slate-600",
};
