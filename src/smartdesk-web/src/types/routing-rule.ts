/**
 * 路由规则类型定义
 * 基于梁栋架构契约 v1.0（FROZEN）
 * 来源：migrations/0007_routing_rules.sql（PR #31 merged）
 * 
 * 关键变更（vs 陈川 Schema v1）：
 * - match_priority: P0-P3 → P1-P4（对齐 tickets.priority）
 * - to_group_id: 始终必填（技能组必填）
 * - target_user_id: 可选直派（命中即直派）
 * - order → sort: 规则优先级字段更名
 * - is_active → active: 布尔字段更名
 * - 新增 strategy: least_load/round_robin
 * - 移除 hit_count: 表无此列
 * - match_keyword/match_source: 预留字段（一期隐藏）
 */

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type Strategy = 'least_load' | 'round_robin';

/**
 * 路由规则完整类型（响应）
 */
export interface RoutingRule {
  id: string;                          // uuid, 只读
  org_id: string;                      // 多租户，后端注入
  name: string;                        // 规则名称（必填）
  
  // 匹配条件（NULL = 通配，AND 组合）
  match_category_id?: string | null;    // 分类匹配
  match_keyword?: string | null;        // 关键词匹配（预留，一期隐藏）
  match_source?: string | null;         // 来源匹配（预留，一期隐藏）
  match_priority?: Priority | null;     // 优先级匹配 P1-P4
  match_group_id?: string | null;       // 技能组匹配
  
  // 分派目标
  to_group_id: string;                  // 分派目标组（始终必填）
  target_user_id?: string | null;       // 可选直派到坐席
  strategy: Strategy;                   // 组内选坐席策略
  
  // 规则属性
  sort: number;                         // 规则优先级（越小越优先），默认 0
  active: boolean;                      // 启用状态，默认 true
  
  // 审计字段
  created_at: string;                   // ISO datetime
  updated_at: string;                   // ISO datetime
  deleted_at?: string | null;          // 软删除标记（不展示）
}

/**
 * 创建路由规则请求
 */
export interface RoutingRuleCreate {
  name: string;
  match_category_id?: string | null;
  match_keyword?: string | null;        // 预留，一期不传
  match_source?: string | null;         // 预留，一期不传
  match_priority?: Priority | null;
  match_group_id?: string | null;
  to_group_id: string;                 // 始终必填
  target_user_id?: string | null;       // 可选
  strategy: Strategy;                   // 默认 least_load
  sort: number;                          // 默认 0
  active?: boolean;                     // 默认 true
}

/**
 * 更新路由规则请求
 */
export interface RoutingRuleUpdate {
  name?: string;
  match_category_id?: string | null;
  match_keyword?: string | null;
  match_source?: string | null;
  match_priority?: Priority | null;
  match_group_id?: string | null;
  to_group_id?: string;
  target_user_id?: string | null;
  strategy?: Strategy;
  sort?: number;
  active?: boolean;
}

/**
 * 分页响应
 */
export interface RoutingRulePage {
  items: RoutingRule[];
  page: number;
  page_size: number;
  total: number;
}

/**
 * 路由规则查询参数
 */
export interface RoutingRuleQueryParams {
  page?: number;
  page_size?: number;
  active?: boolean;
  q?: string;                          // 按规则名称搜索
}

/**
 * 重新排序请求
 * 注意：后端需单事务原子重排，避免撞唯一索引
 */
export interface RoutingRuleReorderRequest {
  items: { id: string; sort: number }[];
}
