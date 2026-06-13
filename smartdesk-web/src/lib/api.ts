import { getAccessToken, getRefreshToken, clearSession } from "./auth";
import { mockApi } from "./mock";
import type {
  CommentPage,
  Me,
  Ticket,
  TicketAggregate,
  TicketPage,
  TimelineEntry,
  TokenPair,
  TransitionAction,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001/api/v1";
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, false);
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiClientError(401, "unauthorized", "请重新登录");
  }

  if (!res.ok) {
    let err = { code: "error", message: res.statusText };
    try {
      err = await res.json();
    } catch {
      /* empty */
    }
    throw new ApiClientError(res.status, err.code, err.message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const tokens = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    }).then((r) => (r.ok ? r.json() : null));
    if (!tokens) return false;
    localStorage.setItem("sd_access_token", tokens.access_token);
    localStorage.setItem("sd_refresh_token", tokens.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  isMock: USE_MOCK,

  async login(username: string, password: string): Promise<{ tokens: TokenPair; me: Me }> {
    if (USE_MOCK) return mockApi.login(username, password);
    const tokens = await request<TokenPair>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem("sd_access_token", tokens.access_token);
    localStorage.setItem("sd_refresh_token", tokens.refresh_token);
    const me = await request<Me>("/auth/me");
    return { tokens, me };
  },

  async getMe(): Promise<Me> {
    if (USE_MOCK) return mockApi.getMe();
    return request<Me>("/auth/me");
  },

  async logout(): Promise<void> {
    if (USE_MOCK) return mockApi.logout();
    await request<void>("/auth/logout", { method: "POST" });
    clearSession();
  },

  async listTickets(params?: {
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<TicketPage> {
    if (USE_MOCK) return mockApi.listTickets(params);
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.page_size) qs.set("page_size", String(params.page_size));
    const q = qs.toString();
    return request<TicketPage>(`/tickets${q ? `?${q}` : ""}`);
  },

  async getTicket(id: string): Promise<TicketAggregate> {
    if (USE_MOCK) return mockApi.getTicket(id);
    return request<TicketAggregate>(`/tickets/${id}`);
  },

  async createTicket(data: {
    title: string;
    description: string;
    priority?: string;
  }): Promise<Ticket> {
    if (USE_MOCK) return mockApi.createTicket(data);
    return request<Ticket>("/tickets", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
  },

  async transition(
    id: string,
    action: TransitionAction,
    reason?: string
  ): Promise<Ticket> {
    if (USE_MOCK) return mockApi.transition(id, action, reason);
    return request<Ticket>(`/tickets/${id}/transitions`, {
      method: "POST",
      body: JSON.stringify({ action, reason }),
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
  },

  async listComments(ticketId: string, includeInternal = false): Promise<CommentPage> {
    if (USE_MOCK) return mockApi.listComments(ticketId, includeInternal);
    return request<CommentPage>(`/tickets/${ticketId}/comments`);
  },

  async addComment(
    ticketId: string,
    body: string,
    visibility: "public" | "internal"
  ): Promise<void> {
    if (USE_MOCK) return mockApi.addComment(ticketId, body, visibility);
    await request<void>(`/tickets/${ticketId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body, visibility }),
    });
  },

  async getTimeline(ticketId: string): Promise<{ items: TimelineEntry[] }> {
    if (USE_MOCK) return mockApi.getTimeline(ticketId);
    return request<{ items: TimelineEntry[] }>(`/tickets/${ticketId}/timeline`);
  },
};

export { ApiClientError };
