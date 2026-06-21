import type { Role } from "@/lib/types";

export type { Role };

export const ROLE_HIERARCHY: Role[] = ["requester", "agent", "lead", "manager", "admin"];

export function roleLevel(role: Role): number {
  const idx = ROLE_HIERARCHY.indexOf(role);
  return idx >= 0 ? idx : -1;
}

export function isAtLeast(userRole: Role, requiredRole: Role): boolean {
  return roleLevel(userRole) >= roleLevel(requiredRole);
}

export function can(roles: Role[], requiredRole: Role): boolean {
  return roles.some((r) => isAtLeast(r, requiredRole));
}

export function canAny(roles: Role[], requiredRoles: Role[]): boolean {
  return requiredRoles.some((required) => can(roles, required));
}
