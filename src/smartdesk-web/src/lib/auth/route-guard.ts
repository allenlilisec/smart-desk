import type { Role } from "@/lib/rbac";
import { SESSION_COOKIE } from "./constants";

export const PUBLIC_PATH_PREFIXES = ["/login", "/api/healthz"] as const;

export const ROUTE_ROLE_REQUIREMENTS: { prefix: string; role: Role }[] = [
  { prefix: "/admin", role: "admin" },
  { prefix: "/dashboard", role: "manager" },
  { prefix: "/agent", role: "agent" },
  { prefix: "/portal", role: "requester" },
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function requiredRoleForPath(pathname: string): Role | null {
  const match = ROUTE_ROLE_REQUIREMENTS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  return match?.role ?? null;
}

export interface RequestAuth {
  readonly hasSession: boolean;
}

export function getRequestAuth(
  getCookie: (name: string) => string | undefined,
  authorizationHeader?: string | null
): RequestAuth {
  return {
    hasSession:
      authorizationHeader?.startsWith("Bearer ") === true || getCookie(SESSION_COOKIE) === "1",
  };
}

export function evaluateRouteAccess(
  pathname: string,
  auth: RequestAuth
): "allow" | "login" | "forbidden" {
  if (isPublicPath(pathname) || pathname.startsWith("/_next")) return "allow";
  return auth.hasSession ? "allow" : "login";
}
