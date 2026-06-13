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
  refresh_token: string;
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
  sla?: SlaView;
  suggestion?: object;
  similar?: object[];
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

export interface SlaView {
  priority: Priority;
  response_due_at: string;
  resolve_due_at: string;
  response_met: boolean;
  resolve_met: boolean;
  paused: boolean;
  breached: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: object[];
  trace_id?: string;
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
  new: "bg-blue-100 text-blue-800",
  accepted: "bg-indigo-100 text-indigo-800",
  in_progress: "bg-amber-100 text-amber-800",
  pending_user: "bg-purple-100 text-purple-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
  suspended: "bg-orange-100 text-orange-800",
  cancelled: "bg-red-100 text-red-800",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  P1: "bg-red-100 text-red-800",
  P2: "bg-orange-100 text-orange-800",
  P3: "bg-yellow-100 text-yellow-800",
  P4: "bg-gray-100 text-gray-600",
};
