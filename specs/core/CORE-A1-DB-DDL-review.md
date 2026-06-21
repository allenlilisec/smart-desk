# CORE-A1 相关 DB 迁移检视意见（基于详设 §3.2 DDL）

> 对应任务：SUP-172「[P4][core][CORE-A] 工单生命周期实现（陈川）」立即可开工项之「DB 迁移检视准备」。
> 检视范围：详设 §3.2 中 `0002_tickets`（tickets / ticket_status_history / ticket_timeline）与 `0003_workflow`（assignments / comments / attachments / ticket_links / sla_timers / watchers / csat_ratings）。
> 事实源：
> - `specs/core子系统详细设计与实现说明书.md` v3.0 §3（轻量 MVP 事实源）
> - `src/openapi/core.yaml` v1.1.0
> - `specs/SmartDesk系统详细设计与实现说明书.md` §4.2 / §4.3
>
> 说明：石磊正在落 `0002_tickets` / `0003_workflow` 迁移，本意见作为集体检视输入，供后续评审会议逐项确认。

---

## 1. 总体结论

DDL 整体与系统详设/契约一致，覆盖八态工单、时间线、分派、评论、附件、SLA、关注、CSAT 等实体。以下列出**必须确认**、**建议优化**、**待集体检视确认**三类意见，无结构性推翻。

---

## 2. 必须确认（迁移落库前建议澄清）

### M-1 工单流水号 `number` 的生成机制在 DDL 中未体现

**现状**：`tickets` 表仅声明 `number TEXT NOT NULL` + `UNIQUE (org_id, number)`，未提供 per-org 序列或计数器表。

**风险**：详设 §2.2 / §6.1 要求生成 `SD-YYYY-NNNNNN` 且用 `FOR UPDATE` 行锁保证多副本安全。若仅靠应用层 `SELECT max(number)` 易出现幻读/冲突。

**建议**：在 `0002_tickets` 中增加一张轻量序列表（或在应用层用 advisory lock + 序列）。推荐方案：

```sql
CREATE TABLE ticket_sequences (
  org_id TEXT PRIMARY KEY DEFAULT 'default',
  year   INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  seq    BIGINT NOT NULL DEFAULT 0
);
-- 应用层生成 number 时：
-- INSERT INTO ticket_sequences(org_id,year,seq) VALUES('default',2026,1)
--   ON CONFLICT (org_id) DO UPDATE SET seq=ticket_sequences.seq+1
--   WHERE EXCLUDED.year=ticket_sequences.year
--   RETURNING seq;  -- 跨年度需处理 year 翻转
```

或显式使用 PostgreSQL `SEQUENCE` 对象：`CREATE SEQUENCE ticket_number_seq_2026;`。无论哪种，**迁移文件应包含该机制**，否则 T023 实现时自行临时补齐会导致迁移与代码不同源。

### M-2 `sla_timers.policy_id` 与 `tickets.category_id` 是否加外键

**现状**：`sla_timers.policy_id UUID NOT NULL` 无外键；`tickets.category_id UUID` 有外键；`sla_policies.id` 存在。

**风险**：缺少 FK 时可能出现 orphan SLA timer；但删除 policy 是低频 admin 操作，若删除 policy 后历史 timer 仍要可读，则不应级联删除。

**建议**：至少加 `REFERENCES sla_policies(id) ON DELETE RESTRICT` 或 `NO ACTION`，禁止误删正在使用的策略；同时 `sla_timers.priority` 为快照，不引用 `sla_policy_targets` 复合键，设计意图正确。

### M-3 `ticket_status_history` 是否缺少 `ticket_id` 索引

**现状**：`ticket_status_history` 仅主键 `id UUID PRIMARY KEY`。

**风险**：按 ticket 查询状态历史是高频读路径（详情页/时间线），全表扫描不可接受。

**建议**：增加 `CREATE INDEX idx_status_history_ticket ON ticket_status_history(ticket_id, created_at);`。

---

## 3. 建议优化（不影响 M2 MVP，但提升数据质量）

### S-1 `assignments` / `comments` / `attachments` 中用户引用的外键完整性

| 表 | 字段 | 现状 | 建议 |
|---|---|---|---|
| assignments | from_user_id / to_user_id | 无 FK | `REFERENCES users(id) ON DELETE SET NULL` |
| comments | author_id | 无 FK | `REFERENCES users(id)` |
| attachments | uploader_id | 无 FK | `REFERENCES users(id)` |

**理由**：core 作为 RBAC 主数据持有方，用户删除应受控；保留历史记录可用 `SET NULL`，确保数据一致性。

### S-2 `ticket_links` 唯一性约束

**现状**：无 unique / 排除约束。

**风险**：同一对 ticket 可反复建立 `related`，甚至同时存在 `related` 与 `merged_into`，导致合并逻辑歧义。

**建议**：

```sql
-- 每对 ticket 同一 relation 只能有一条
CREATE UNIQUE INDEX idx_ticket_links_unique_relation
  ON ticket_links(LEAST(ticket_id, linked_ticket_id), GREATEST(ticket_id, linked_ticket_id), relation);
-- 或至少对 merged_into 做互斥：一个 ticket 不能被多个主单合并
CREATE UNIQUE INDEX idx_ticket_links_merged_once
  ON ticket_links(linked_ticket_id) WHERE relation='merged_into';
```

### S-3 `attachments.comment_id` 与 comment 删除

**现状**：`attachments.comment_id UUID REFERENCES comments(id)`，未指定 `ON DELETE`。

**风险**：comment 软删除（`deleted_at`）不会触发 FK；物理删除或归档时可能误删附件引用。

**建议**：comment 采用软删除，不物理删除；若未来需要物理清理，应先迁移 `comment_id` 为 NULL 或保留审计。

### S-4 `idempotency_keys` 缺少 TTL / 清理机制

**现状**：主键 `(org_id, key)`，无 `expires_at` 或分区策略。

**风险**：幂等键理论上应长期保存，但无界增长会影响性能与存储。

**建议**：增加 `expires_at TIMESTAMPTZ` 字段，并配套后台 cleanup job（或 PG partition by range）。首期可保守设 7 天/30 天，并在实现文档中明确。

### S-5 `outbox_events` 索引补充

**现状**：仅有 `idx_outbox_unpublished(created_at) WHERE published_at IS NULL`。

**风险**：relay 按 `created_at` 取未发事件 OK，但排查/监控常按 `ticket_id`、`subject` 过滤。

**建议**：增加 `CREATE INDEX idx_outbox_ticket ON outbox_events(ticket_id, created_at);` 与 `CREATE INDEX idx_outbox_subject ON outbox_events(subject, created_at);`。

### S-6 `categories.code` 是否唯一

**现状**：`code TEXT` 无唯一约束。

**风险**：分类 code 可能被 insight 只读引用（详设 §1.2 / §4.1），重复 code 会导致引用歧义。

**建议**：增加 `UNIQUE (org_id, code)`（允许不同 org 重名 code，一期 org 隔离未启用但不伤扩展）。

---

## 4. 待集体检视确认（需要架构/实现团队一起拍板）

### C-1 `roles` 表不含 `org_id` 的例外是否写入迁移注释

详设 §3.2 已说明 `roles` 为全局固定枚举、不含 `org_id` 是例外。建议在 `0001_init` 迁移中加注释或 README，避免后续维护者误加 `org_id`。

### C-2 `tickets.closed_at` 与 `status=closed` 的同步由谁保证

DDL 未加 `CHECK` 约束。建议应用层保证：close 时写入 `closed_at`；终态 closed/cancelled 的 `closed_at` 语义需文档化（cancelled 是否也写 `closed_at`？详设 §4.2 只提到 close 写 closed_at）。

### C-3 `sla_timers` 的 `paused_total_seconds` 精度与边界

`paused_total_seconds INT` 可满足秒级精度；但 SLA 策略以分钟为单位，是否统一为秒存储？建议明确：策略 `*_minutes` 入库时换算为秒还是分钟？`response_due_at`/`resolve_due_at` 为绝对时间，与 `paused_total_seconds` 计算口径需一致，避免累计误差。

### C-4 `csat_ratings.requester_id` 是否应加 FK

现状 `requester_id UUID NOT NULL` 无外键。建议加 `REFERENCES users(id)`，保证 CSAT 回填 `tickets.csat_score` 时 requester 一致。

### C-5 `users.email` 是否唯一

现状 `email TEXT` 无唯一。系统详设未强制要求 email 唯一，但产品层面通常要求。若 gateway 侧以 email 登录，则 core 的 `users` 表至少应 `UNIQUE (org_id, email)`。建议与 gateway 团队对齐。

---

## 5. 与 T021/T022 测试的关联

| 检视点 | 对应测试用例 | 说明 |
|---|---|---|
| M-1 number 生成 | T021-T01 / IT-A1-001 | 高并发幂等建单依赖 number 唯一且不冲突 |
| M-3 status_history 索引 | T021-T29~T39 | 状态历史查询性能 |
| S-2 ticket_links 唯一性 | T041/T042（M3） | 合并冲突 409 的 DB 基础 |
| C-2 closed_at 语义 | T021-T33 / IT-A1-005 | reopen 7 天窗口依赖 `closed_at` 准确写入 |
| C-3 SLA 精度 | IT-A1-006 / T030（A3） | SLA 计时与暂停精度 |

---

## 6. 建议评审会议议程

1. 确认 M-1 工单流水号方案（迁移文件是否补充序列表/SEQUENCE）。
2. 确认 M-2 / S-1 外键策略（RESTRICT vs SET NULL vs 不加）。
3. 确认 S-2 `ticket_links` 唯一性约束口径。
4. 确认 C-2 `closed_at` 与 cancelled 终态的语义。
5. 确认 C-5 `users.email` 是否加唯一约束（需 gateway 对齐）。

待以上确认后，本意见可转为迁移文件的具体修改清单。
