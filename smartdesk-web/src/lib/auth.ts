import type { Me, TokenPair } from "./types";

const ACCESS_KEY = "sd_access_token";
const REFRESH_KEY = "sd_refresh_token";
const ME_KEY = "sd_me";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredMe(): Me | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Me;
  } catch {
    return null;
  }
}

export function saveSession(tokens: TokenPair, me: Me): void {
  localStorage.setItem(ACCESS_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  localStorage.setItem(ME_KEY, JSON.stringify(me));
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(ME_KEY);
}

export function isAgentRole(roles: string[]): boolean {
  return roles.some((r) => ["agent", "lead", "manager", "admin"].includes(r));
}

export function homePathForRoles(roles: string[]): string {
  return isAgentRole(roles) ? "/agent" : "/portal";
}
