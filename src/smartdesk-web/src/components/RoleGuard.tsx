"use client";

import { useAuth } from "@/components/AuthProvider";
import { can, type Role } from "@/lib/rbac";

interface RoleGuardProps {
  requiredRole: Role;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({ requiredRole, children, fallback = null }: RoleGuardProps) {
  const { me } = useAuth();
  if (!me || !can(me.roles, requiredRole)) return fallback;
  return children;
}
