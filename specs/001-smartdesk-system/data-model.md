# Phase 1 Data Model: SmartDesk

**Date**: 2026-06-14 | **Plan**: [plan.md](./plan.md)
> 约定：snake_case；主键 UUID v7；所有业务表含 `org_id`(非空,一期`default`)、`created_at`、`updated_at`；软删除 `deleted_at`（OQ-10 预留）。core=OLTP 权威；insight=只读投影（事件同步，最终一致，不共享事务）。

## A. core 实体（PostgreSQL, OLTP）

### 账号与 RBAC
- **users**(id, org_id, username, email, display_name, status, credential_ref, created_at, updated_at, deleted_at) — `credential_ref` 指向 gateway 持有的凭证；**core 不存密码哈希/明文**。
- **roles**(code PK, name) — 固定枚举 `requester|agent|lead|manager|admin`。
- **user_roles**(user_id, role_code, scope) — `scope` 预留坐席组（lead 管本组）。

### 配置（权威）
- **categories**(id, org_id, parent_id, code, name, active, sort, …) — 自引用分类树（OQ-4，admin 维护）。
- **sla_policies**(id, org_id, name, active, …)
- **sla_policy_targets**(policy_id, priority, response_minutes, resolve_minutes) — OQ-1 v1 基线入种子（P1 15m/4h…）。

### 工单域
- **tickets**(id, org_id, number, title, description, requester_id, assignee_id, group_id, category_id, priority, status, source, reopen_count, closed_at, csat_score, created_at, updated_at, deleted_at)
  - `status ∈ {new, accepted, in_progress, pending_user, resolved, closed, suspended, cancelled}`
  - `priority ∈ {P1,P2,P3,P4}`；`number` org 内唯一人类可读流水号。
- **ticket_status_history**(id, ticket_id, from_status, to_status, actor_id, reason, created_at) — 非法跃迁不写。
- **ticket_timeline**(id, ticket_id, event_type, actor_id, payload_json, created_at) — 全量时间线，**仅追加**，非系统角色无 update/delete 接口（审计不可篡改）。
- **assignments**(id, ticket_id, from_user_id, to_user_id, to_group_id, kind[manual|auto|reassign|escalate], reason, actor_id, created_at)
- **comments**(id, ticket_id, author_id, body, visibility[public|internal], mentions_json, created_at, deleted_at) — `internal` 对 requester **接口层过滤**。
- **attachments**(id, ticket_id, comment_id?, uploader_id, filename, content_type, size_bytes, object_key, checksum, created_at) — 对象存 OSS，下载经鉴权（OQ-9）。
- **ticket_links**(id, ticket_id, linked_ticket_id, relation[related|duplicate|merged_into], created_at)
- **sla_timers**(id, ticket_id, policy_id, priority, response_due_at, resolve_due_at, response_met, resolve_met, paused, paused_total_seconds, paused_at, breached, …) — `pending_user` 期间 `paused=true` 累计，恢复顺延 due_at；快照 priority/policy（策略变更不回改历史）。
- **watchers**(ticket_id, user_id, created_at)
- **csat_ratings**(ticket_id, requester_id, score[1..5], comment, created_at) — OQ-12。
- **processed_events**(event_id PK, consumer, processed_at) — 写回/消费幂等去重（core 侧）。

## B. insight 读模型（PostgreSQL 独立 schema，事件投影）
- **classification_feedback**(id, org_id, ticket_id, predicted_category_id, confidence, accepted, corrected_category_id, actor_id, created_at) — 纠偏回流（OQ-4）。
- **similarity_index**(ticket_id, org_id, title_norm, category_id, keywords_tsv, embedding?[预留], updated_at) — 一期全文+标题/分类；向量预留（OQ-5）。
- **notifications**(id, org_id, user_id, ticket_id, type, channel[inapp|email], title, body, read_at, dedupe_key, status, created_at) — `dedupe_key` 幂等、至少一次。
- **notification_policies**(id, org_id, role, event_type, channel, enabled) — admin 可配（US-4.4）。
- **stats_***：按 时间/分类/坐席/优先级 的出量、SLA 达成、时长聚合物化表/视图；事件投影近实时。
- **processed_events**(event_id PK, …) — insight 消费幂等去重。

## C. 工单状态机（OQ-8）

```
new ──accept──▶ accepted ──start──▶ in_progress ──resolve──▶ resolved ──confirm──▶ closed(终态)
                                   ◀─resume(待用户回复)─┐         ▲
                                                       │         │ reopen(≤7天, OQ-13)
                          in_progress ──wait──▶ pending_user ────┘  closed ──reopen──▶ in_progress
任意非终态 ──suspend──▶ suspended ──resume──▶ 原状态
任意非终态 ──cancel──▶ cancelled(终态)
```
- 终态：`closed`、`cancelled`。
- `pending_user` 超时 v1 仅提醒（3 天/7 天），**不自动关闭**。
- 非法跃迁拒绝（409）；状态变更幂等（`Idempotency-Key`）；每次写 timeline + status_history。

## D. ER 关系要点
- `tickets` 1—N `comments / attachments / ticket_timeline / assignments / ticket_links / sla_timers / csat_ratings / watchers / ticket_status_history`。
- `tickets.category_id → categories.id`；`assignee_id/requester_id → users.id`；`sla_timers.policy_id → sla_policies.id`。
- insight 读模型仅由领域事件投影，不与 core OLTP 共享事务。

## E. 领域事件信封（统一 schema）
```jsonc
{ "event_id":"uuidv7", "event_type":"ticket.created", "occurred_at":"RFC3339",
  "org_id":"default", "ticket_id":"uuid", "actor_id":"uuid|null", "version":1, "payload":{} }
```
主题 `smartdesk.<domain>.<event>`，JetStream Stream `SMARTDESK_EVENTS`，按 `ticket_id` 分区保序。事件清单见系统详设 §事件模型。
