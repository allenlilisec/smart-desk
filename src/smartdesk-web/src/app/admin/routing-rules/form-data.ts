import type { Priority, RoutingRule, Strategy } from "@/types/routing-rule";

export type RoutingRuleField =
  | "name"
  | "match_category_id"
  | "match_group_id"
  | "match_priority"
  | "to_group_id"
  | "target_user_id"
  | "strategy"
  | "sort"
  | "active";

export type RoutingRuleFieldValue = string | number | boolean | null;

export const categories = [
  { id: "cat-1", name: "技术支持" },
  { id: "cat-2", name: "产品咨询" },
  { id: "cat-3", name: "投诉建议" },
] as const;

export const groups = [
  { id: "group-1", name: "高级技术支持组" },
  { id: "group-2", name: "普通支持组" },
  { id: "group-3", name: "客服组" },
] as const;

export const users = [
  { id: "user-1", display_name: "张三" },
  { id: "user-2", display_name: "李四" },
  { id: "user-3", display_name: "王五" },
] as const;

export const priorities = ["P1", "P2", "P3", "P4"] as const satisfies readonly Priority[];

export const strategies = [
  { value: "least_load", label: "最少负载" },
  { value: "round_robin", label: "轮询" },
] as const satisfies readonly { readonly value: Strategy; readonly label: string }[];

export const mockRules: readonly RoutingRule[] = [
  {
    id: "1",
    org_id: "default",
    name: "P1紧急工单自动分配",
    match_priority: "P1",
    to_group_id: "group-1",
    strategy: "least_load",
    sort: 10,
    active: true,
    created_at: "2024-01-15T08:00:00Z",
    updated_at: "2024-06-20T10:30:00Z",
  },
];

export function parsePriority(value: string): Priority | null {
  switch (value) {
    case "P1":
    case "P2":
    case "P3":
    case "P4":
      return value;
    default:
      return null;
  }
}

export function parseStrategy(value: string): Strategy {
  switch (value) {
    case "round_robin":
      return "round_robin";
    case "least_load":
    default:
      return "least_load";
  }
}
