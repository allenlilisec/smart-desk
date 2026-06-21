# 工单自动分派路由引擎 — 契约与数据模型定稿（FROZEN）

**裁决人**: 梁栋（首席架构）　**日期**: 2026-06-21　**关联**: SUP-471 / SUP-473（后端实现）/ SUP-472（前端配置）
**状态**: **FROZEN** — 本文为系统级详设，先于模块详设。冻结后契约变更须经本人复核。

> 约定沿用 data-model.md：snake_case；主键 UUID v7；业务表含 `org_id`(非空)、`created_at`、`updated_at`、软删 `deleted_at`。core=OLTP 权威。

## 0. 背景

US-2.3 AC2 要求"按分类 / 技能组自动分派（规则可配置）"。现状（core/tasks.md Phase 5、core 详设 §7.2）：`POST /tickets/{id}/assignments` 端点已落，但 `kind=auto` 仅记录 kind、未做真实路由匹配。本文冻结自动分派的触发模型、契约、数据模型与兜底语义，解阻塞 SUP-473 / SUP-472。

## 1. 触发模型

- **auto 主路径 = 服务端反应，非客户端强制**：`auto` 分派由 core 消费 `ticket.created`（及 `ticket.category_changed`）事件后触发，**不要求**客户端在请求体提供 `to_user_id`。
- `POST /tickets/{id}/assignments?kind=auto` 作为"立即重路由"的管理动作保留（同一套引擎逻辑）。
- `escalate` = 升级：按规则路由到上级组 / 组长，目标亦由引擎解析（本期与 SLA 超时联动仍为独立 gap，不在本契约范围）。
- `manual` / `reassign` 维持现状：必须显式 `to_user_id`。

## 2. 契约定稿（已落 redline）

`AssignmentRequest`（core.yaml / gateway.yaml 已同步）：
- `required: [kind]`（**移除 to_user_id 无条件必填**）。
- `to_user_id`：**条件必填** —— `kind∈{manual,reassign}` 必填；`kind∈{auto,escalate}` 可省略，引擎解析。`nullable: true`。
- `to_group_id`：可选；指定后引擎在该组内按策略选坐席。
- 校验责任：服务端按 kind 做条件校验（manual/reassign 缺 to_user_id → 422）。

## 3. 数据模型增补（data-model.md A. core 增补三表）

```
groups(id, org_id, code, name, active, sort, created_at, updated_at, deleted_at)
  -- 坐席组/技能组。替代 user_roles.scope 占位；tickets.group_id 外键指向本表。

group_members(group_id, user_id, skills_tags text[]?, active, created_at)
  -- user↔group 多对多；skills_tags 预留技能标签匹配（一期可空）。PK(group_id,user_id)。

routing_rules(id, org_id, sort, active,
              match_category_id uuid?, match_keyword text?, match_source text?, match_priority text?,
              match_group_id uuid?,        -- [架构裁决 2026-06-21] 可选：组过滤匹配条件（用于重路由场景）
              to_group_id uuid NOT NULL,
              target_user_id uuid?,        -- [架构裁决 2026-06-21] 可选直派；命中即直派，用户停用时回退组内按 strategy 选坐席（非默认队列）
              strategy text[least_load|round_robin] default 'least_load',
              created_at, updated_at, deleted_at)
  -- org 内有序规则；多条件 AND（为空的条件视为不约束）；按 sort 升序首条命中即停。
```

外键：`routing_rules.to_group_id→groups.id`、`group_members.group_id→groups.id`、`tickets.group_id→groups.id`。

## 4. 引擎语义（实现须满足）

1. **匹配**：按 `sort` 升序遍历 active 规则，所有非空 match_* 条件 AND 命中即选中，**首条命中即停**。
2. **组内选坐席**：命中规则的 `to_group_id` 组内，按 `strategy` 选坐席 —— `least_load`（该坐席当前未关闭工单数最少）优先；并列或负载数据不可得时回退 `round_robin`。仅在 active 的 group_members 中选。
3. **兜底（硬约束，不可违背）**：无规则命中 / 命中组无可用坐席时 —— 工单进**默认队列**（assignee 留空、group 置默认组或留空），且**必须在全量工作台可见 + 进组长待办**。**永不出现"工单无人可见"**。这是 SUP-471 现象要根除的根本约束。
4. **写回与事件**：选中后写 `assignments`（kind=auto/escalate）+ `ticket_timeline`，回写 `tickets.assignee_id/group_id`，发布 `ticket.assigned`。
5. **幂等**：消费 `ticket.created` 的 auto 分派经 `processed_events` 去重；事件重放不得重复分派。

## 5. 范围边界（不在本契约内）

- **工作台可见性 / create 阶段客户·分类·SLA 归因**：属 SUP-471 (B) 回归核查，与本引擎独立，单独闭环。
- **escalate × SLA 超时联动**：维持原 gap，另行立项。
- **routing_rules CRUD 端点与前端配置 UI 的字段级详设**：由模块详设承接（后端 SUP-473 委派初稿 / 前端 SUP-472），须遵循本文实体与语义。

## 6. 验收锚点（SUP-473）

- [ ] 新建工单经 `ticket.created` 自动触发路由，命中规则→写 assignments(kind=auto)+回写 ticket+发 `ticket.assigned`。
- [ ] 组内 least-load / round-robin 选坐席，单测覆盖。
- [ ] 无匹配 fallback：工单默认队列且全量工作台可见（**回归断言**）。
- [ ] 事件重放幂等（processed_events）。
- [ ] `AssignmentRequest` 条件校验：manual/reassign 缺 to_user_id → 422；auto/escalate 省略合法。
