# 路由规则引擎模块详设（对齐 FROZEN 契约）

> 版本：v0.2（对齐 FROZEN 契约）　|　日期：2026-06-21
> 编制：陈川（核心后端）
> FROZEN 契约：`specs/core/routing-engine-contract.md`（梁栋，PR #136）
> 状态：待架构复核

---

## 0. 对齐说明

本模块详设严格对齐 FROZEN 契约（`routing-engine-contract.md`）：
- **字段名对齐**：`priority` → `sort`，`target_*` → `to_group_id` + 可选 `target_user_id`
- **match 维度对齐**：category/keyword/source/priority + 可选 match_group_id
- **strategy 字段**：least_load | round_robin
- **fallback 语义**：无命中 → 默认队列（全量工作台可见 + 进组长待办），不是 `assignment_failed`

---

## 1. 数据模型（对齐 FROZEN 契约 §3）

### 1.1 routing_rules 表

```sql
routing_rules(id, org_id, sort, active,
              match_category_id uuid?, match_keyword text?, match_source text?, match_priority text?,
              match_group_id uuid?,  -- 可选追加
              to_group_id uuid NOT NULL,
              target_user_id uuid?,  -- 可选：命中即直派
              strategy text[least_load|round_robin] default 'least_load',
              created_at, updated_at, deleted_at)
```

**关键对齐点**：
- `sort`（而非 `priority`）：与工单 P0-P3 解耦
- `to_group_id` 必填，`target_user_id` 可选
- `strategy` 字段：least_load / round_robin
- 外键 `ON DELETE RESTRICT`（防止删分类静默放宽规则）

### 1.2 groups 表

```sql
groups(id, org_id, code, name, active, sort, created_at, updated_at, deleted_at)
```

### 1.3 group_members 表

```sql
group_members(group_id, user_id, skills_tags text[]?, active, created_at)
```

---

## 2. OpenAPI 契约增量（对齐 FROZEN）

### 2.1 RoutingRule Schema

```yaml
RoutingRule:
  properties:
    sort: { type: integer, description: 求值顺序（越小越优先） }
    to_group_id: { type: string, format: uuid, description: 分派到组（必填） }
    target_user_id: { type: string, format: uuid, nullable: true, description: 可选：直派到用户 }
    strategy: { type: string, enum: [least_load, round_robin], default: least_load }
    match_keyword: { type: string, nullable: true }
    match_source: { type: string, nullable: true }
    match_group_id: { type: string, format: uuid, nullable: true }
```

### 2.2 API 端点

- `/config/routing-rules`：CRUD（admin）
- `/config/groups`：CRUD（admin）
- `/config/groups/{groupId}/members`：组成员管理

---

## 3. 路由匹配引擎伪代码（对齐 FROZEN §4）

### 3.1 核心流程

```go
func RouteTicket(ctx context.Context, ticketID uuid.UUID) error {
    // 1. 幂等：processed_events 去重
    if store.IsProcessedEvent(ctx, eventID) {
        return nil  // 已处理，跳过
    }
    
    // 2. 查询工单
    ticket, err := store.GetTicket(ctx, ticketID)
    
    // 3. 按 sort ASC 遍历 active 规则
    rules, err := store.GetActiveRules(ctx, ticket.OrgID)
    // SQL: SELECT * FROM routing_rules
    //      WHERE org_id = ? AND active = true AND deleted_at IS NULL
    //      ORDER BY sort ASC
    
    // 4. 逐条匹配（NULL = 通配，AND 组合）
    for _, rule := range rules {
        if matchRule(ticket, rule) {
            // 5. 首条命中即停
            return assignTicket(ctx, ticket, rule)
        }
    }
    
    // 6. fallback：进默认队列（全量工作台可见）
    // 写入默认组（或 assignee 留空）
    store.UpdateTicketGroup(ctx, ticket.ID, DefaultGroupID)
    // 发布可观测事件（用于监控 SUP-471 式隐身复发）
    event.Publish("ticket.routing_unmatched", {
        ticket_id: ticketID,
        org_id: ticket.OrgID,
        fallback: "default_queue"
    })
    return nil
}
```

### 3.2 规则匹配（对齐 FROZEN）

```go
func matchRule(ticket *Ticket, rule *RoutingRule) bool {
    // AND 组合，NULL = 通配
    if rule.MatchCategoryID != nil && *rule.MatchCategoryID != ticket.CategoryID {
        return false
    }
    if rule.MatchKeyword != nil && !matchKeyword(ticket.Title, *rule.MatchKeyword) {
        return false  // 关键词匹配（预留）
    }
    if rule.MatchSource != nil && *rule.MatchSource != ticket.Source {
        return false  // 来源匹配（预留）
    }
    if rule.MatchPriority != nil && *rule.MatchPriority != ticket.Priority {
        return false
    }
    if rule.MatchGroupID != nil && *rule.MatchGroupID != ticket.GroupID {
        return false  // 可选：技能组匹配
    }
    return true
}
```

### 3.3 组内选坐席（对齐 FROZEN strategy）

```go
func assignTicket(ctx context.Context, ticket *Ticket, rule *RoutingRule) error {
    // 优先直派（target_user_id）
    if rule.TargetUserID != nil {
        user, err := store.GetUser(ctx, *rule.TargetUserID)
        if user.Active {
            return assignToUser(ctx, ticket, *rule.TargetUserID)
        }
        // 用户停用：走兜底
    }
    
    // 组内选坐席（strategy）
    member, err := selectGroupMember(ctx, rule.ToGroupID, rule.Strategy)
    if err != nil {
        // 组无可用坐席：fallback 到默认队列
        return fallbackToDefaultQueue(ctx, ticket)
    }
    
    return assignToUser(ctx, ticket, member.UserID)
}

func selectGroupMember(ctx context.Context, groupID uuid.UUID, strategy string) (*GroupMember, error) {
    // 获取候选池：active 成员
    members, err := store.GetActiveGroupMembers(ctx, groupID)
    
    if len(members) == 0 {
        return nil, errors.New("no_active_members")
    }
    
    switch strategy {
    case "least_load":
        // 负载最小：status IN (new, accepted, in_progress)
        return selectLeastLoadedMember(ctx, members)
    case "round_robin":
        // 轮询：最久未分派优先
        return selectRoundRobinMember(ctx, members)
    default:
        return selectLeastLoadedMember(ctx, members)  // 默认
    }
}

func selectLeastLoadedMember(ctx context.Context, members []*GroupMember) (*GroupMember, error) {
    for i, m := range members {
        count := store.CountUserTickets(ctx, m.UserID, 
            []string{"new", "accepted", "in_progress"})
        members[i].Load = count
    }
    
    // 负载升序
    sort.Slice(members, func(i, j int) bool {
        return members[i].Load < members[j].Load
    })
    
    return members[0], nil
}
```

### 3.4 fallback 语义（对齐 FROZEN §4.3）

```go
func fallbackToDefaultQueue(ctx context.Context, ticket *Ticket) error {
    // 硬约束：必须全量工作台可见 + 进组长待办
    // assignee 留空，group 置默认组（或留空）
    store.UpdateTicketGroup(ctx, ticket.ID, DefaultGroupID)
    
    // 发布可观测事件（不是 assignment_failed）
    event.Publish("ticket.routing_unmatched", {
        ticket_id: ticket.ID,
        org_id: ticket.OrgID,
        fallback: "default_queue",
        reason: "no_matching_rule_or_no_active_members"
    })
    
    // 写时间线
    store.PutTimeline(ctx, &TimelineEntry{
        TicketID:  ticket.ID,
        EventType: "routing_unmatched",
        Payload:   json.RawMessage(`{"fallback":"default_queue"}`),
    })
    
    return nil
}
```

---

## 4. 验收标准（对齐 FROZEN §6）

- [ ] 新建工单经 `ticket.created` 自动触发路由
- [ ] 组内 least-load / round-robin 选坐席，单测覆盖
- [ ] **无匹配 fallback：工单默认队列且全量工作台可见（回归断言）**
- [ ] 事件重放幂等（processed_events）
- [ ] `AssignmentRequest` 条件校验：manual/reassign 缺 to_user_id → 422

---

## 5. 与 FROZEN 契约的差异点

| 维度 | FROZEN 契约 | 模块详设增补 | 说明 |
|------|------------|------------|------|
| match 维度 | category/keyword/source/priority | + `match_group_id`（可选） | 额外条件，不影响 FROZEN 基线 |
| 直派字段 | 无 | + `target_user_id`（可选） | 额外功能，需梁栋复核 |

---

## 6. 下一步

- commit + push + 开 PR 关联 SUP-473
- 梁栋在 PR 上复核确认
- 冻结后通知关山解阻塞 SUP-472