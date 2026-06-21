import { isAgentRole } from "./auth";
import type { Role } from "./types";

export type ShellNavItem = {
  readonly href: "/portal" | "/agent";
  readonly label: string;
  readonly description: string;
};

const PORTAL_NAV_ITEM: ShellNavItem = {
  href: "/portal",
  label: "报单门户",
  description: "我的请求",
} as const;

const AGENT_NAV_ITEM: ShellNavItem = {
  href: "/agent",
  label: "坐席工作台",
  description: "队列处理",
} as const;

export function navItemsForRoles(roles: readonly Role[]): readonly ShellNavItem[] {
  return isAgentRole([...roles]) ? [AGENT_NAV_ITEM, PORTAL_NAV_ITEM] : [PORTAL_NAV_ITEM];
}
