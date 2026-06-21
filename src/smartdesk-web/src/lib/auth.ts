import type { Me, TokenPair } from "./types";
import { ACCESS_KEY, ME_KEY } from "./auth/constants";
import { clearAuthCookies, markSessionCookie } from "./auth/cookies";

export { ACCESS_KEY, ME_KEY } from "./auth/constants";

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return accessToken;
}

export function getStoredMe(): Me | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(ME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Me;
  } catch {
    return null;
  }
}

export function saveAccessToken(token: string): void {
  accessToken = token;
  markSessionCookie();
}

export function saveSession(tokens: TokenPair, me: Me): void {
  accessToken = tokens.access_token;
  sessionStorage.setItem(ME_KEY, JSON.stringify(me));
  markSessionCookie();
}

export function clearSession(): void {
  accessToken = null;
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(ME_KEY);
  localStorage.removeItem(ME_KEY);
  clearAuthCookies();
  // refresh_token is an HttpOnly Cookie cleared by gateway via Set-Cookie Max-Age=0
}

export function isAgentRole(roles: string[]): boolean {
  return roles.some((r) => ["agent", "lead", "manager", "admin"].includes(r));
}

export function homePathForRoles(roles: string[]): string {
  return isAgentRole(roles) ? "/agent" : "/portal";
}
