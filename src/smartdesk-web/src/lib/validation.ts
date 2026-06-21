import { RoutingRuleCreate, RoutingRuleUpdate, Priority, Strategy } from "@/types/routing-rule";

/**
 * 路由规则表单校验
 * 基于梁栋架构契约 v1.0（FROZEN）
 * 
 * 关键约束变更：
 * - to_group_id: 始终必填（技能组必填）
 * - target_user_id: 可选直派（命中即直派）
 * - 分派目标不再是「技能组/坐席至少一项」，而是「技能组必填 + 坐席可选」
 */

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * 校验规则名称
 */
export function validateName(name?: string): ValidationError | null {
  if (!name || name.trim().length === 0) {
    return {
      field: "name",
      message: "规则名称不能为空",
    };
  }
  if (name.length > 255) {
    return {
      field: "name",
      message: "规则名称不能超过255个字符",
    };
  }
  return null;
}

/**
 * 校验分派目标组（始终必填）
 */
export function validateToGroup(toGroupId?: string): ValidationError | null {
  if (!toGroupId || toGroupId.trim().length === 0) {
    return {
      field: "to_group_id",
      message: "分派目标组不能为空",
    };
  }
  return null;
}

/**
 * 校验策略
 */
export function validateStrategy(strategy?: Strategy): ValidationError | null {
  if (!strategy) {
    return {
      field: "strategy",
      message: "分派策略不能为空",
    };
  }
  if (!['least_load', 'round_robin'].includes(strategy)) {
    return {
      field: "strategy",
      message: "分派策略必须是 least_load 或 round_robin",
    };
  }
  return null;
}

/**
 * 校验排序值
 */
export function validateSort(sort?: number): ValidationError | null {
  if (sort === undefined || sort === null) {
    return {
      field: "sort",
      message: "规则优先级不能为空",
    };
  }
  if (!Number.isInteger(sort)) {
    return {
      field: "sort",
      message: "规则优先级必须为整数",
    };
  }
  if (sort < 0) {
    return {
      field: "sort",
      message: "规则优先级不能为负数",
    };
  }
  return null;
}

/**
 * 完整表单校验（创建）
 */
export function validateRoutingRuleCreate(rule: RoutingRuleCreate): ValidationResult {
  const errors: ValidationError[] = [];
  
  // 名称校验
  const nameError = validateName(rule.name);
  if (nameError) errors.push(nameError);
  
  // 分派目标组校验（始终必填）
  const toGroupError = validateToGroup(rule.to_group_id);
  if (toGroupError) errors.push(toGroupError);
  
  // 策略校验
  const strategyError = validateStrategy(rule.strategy);
  if (strategyError) errors.push(strategyError);
  
  // 排序值校验
  const sortError = validateSort(rule.sort);
  if (sortError) errors.push(sortError);
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 完整表单校验（更新）
 */
export function validateRoutingRuleUpdate(rule: RoutingRuleUpdate): ValidationResult {
  const errors: ValidationError[] = [];
  
  // 名称校验（如果提供了）
  if (rule.name !== undefined) {
    const nameError = validateName(rule.name);
    if (nameError) errors.push(nameError);
  }
  
  // 分派目标组校验（如果提供了）
  if (rule.to_group_id !== undefined) {
    const toGroupError = validateToGroup(rule.to_group_id);
    if (toGroupError) errors.push(toGroupError);
  }
  
  // 策略校验（如果提供了）
  if (rule.strategy !== undefined) {
    const strategyError = validateStrategy(rule.strategy);
    if (strategyError) errors.push(strategyError);
  }
  
  // 排序值校验（如果提供了）
  if (rule.sort !== undefined) {
    const sortError = validateSort(rule.sort);
    if (sortError) errors.push(sortError);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 获取匹配条件显示文本
 */
export function getMatchConditionDisplay(
  matchCategoryId?: string | null,
  matchGroupId?: string | null,
  matchPriority?: Priority | null,
  categories?: readonly { readonly id: string; readonly name: string }[],
  groups?: readonly { readonly id: string; readonly name: string }[]
): string {
  const conditions: string[] = [];
  
  if (matchCategoryId && categories) {
    const cat = categories.find(c => c.id === matchCategoryId);
    if (cat) conditions.push(`分类: ${cat.name}`);
    else conditions.push('指定分类');
  } else if (matchCategoryId) {
    conditions.push('指定分类');
  }
  
  if (matchGroupId && groups) {
    const grp = groups.find(g => g.id === matchGroupId);
    if (grp) conditions.push(`技能组: ${grp.name}`);
    else conditions.push('指定技能组');
  } else if (matchGroupId) {
    conditions.push('指定技能组');
  }
  
  if (matchPriority) {
    conditions.push(`优先级: ${matchPriority}`);
  }
  
  return conditions.length > 0 ? conditions.join(' + ') : '全部匹配（通配）';
}

/**
 * 获取分派目标显示文本
 */
export function getTargetDisplay(
  toGroupId: string,
  targetUserId?: string | null,
  groups?: readonly { readonly id: string; readonly name: string }[],
  users?: readonly { readonly id: string; readonly display_name: string }[]
): string {
  let result = '';
  
  // 技能组（必填）
  if (groups) {
    const grp = groups.find(g => g.id === toGroupId);
    result = grp ? `技能组: ${grp.name}` : '指定技能组';
  } else {
    result = '指定技能组';
  }
  
  // 直派坐席（可选）
  if (targetUserId) {
    if (users) {
      const user = users.find(u => u.id === targetUserId);
      if (user) result += ` → 直派: ${user.display_name}`;
      else result += ' → 直派坐席';
    } else {
      result += ' → 直派坐席';
    }
  }
  
  return result;
}

/**
 * 获取策略显示文本
 */
export function getStrategyDisplay(strategy: Strategy): string {
  switch (strategy) {
    case 'least_load':
      return '最少负载';
    case 'round_robin':
      return '轮询';
    default:
      return strategy;
  }
}
