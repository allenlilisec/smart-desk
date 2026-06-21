"use client";

import { useAuth } from "@/components/AuthProvider";
import { can, canAny, type Role } from "@/lib/rbac";

export function usePermission(requiredRole: Role) {
  const { me } = useAuth();
  const allowed = me ? can(me.roles, requiredRole) : false;
  return { allowed, roles: me?.roles ?? [] };
}

export function usePermissionAny(requiredRoles: Role[]) {
  const { me } = useAuth();
  const allowed = me ? canAny(me.roles, requiredRoles) : false;
  return { allowed, roles: me?.roles ?? [] };
}
