import { ACCESS_KEY, LEGACY_ROLES_COOKIE, SESSION_COOKIE } from "./constants";

function cookieFlags(): string {
  if (typeof window === "undefined") return "Path=/; SameSite=Strict";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  return `Path=/; SameSite=Strict${secure}`;
}

function setCookie(name: string, value: string, maxAge = 3600): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; ${cookieFlags()}; Max-Age=${maxAge}`;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; ${cookieFlags()}; Max-Age=0`;
}

export function markSessionCookie(): void {
  setCookie(SESSION_COOKIE, "1");
}

export function clearAuthCookies(): void {
  clearCookie(ACCESS_KEY);
  clearCookie(LEGACY_ROLES_COOKIE);
  clearCookie(SESSION_COOKIE);
}
