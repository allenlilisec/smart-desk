# SmartDesk Core 事件总线事务性 Outbox + NATS Relay 设计文档

> **状态**：设计初稿 v0.2（待架构审视）
> **编制**：石磊（核心后端 Leader）
> **日期**：2026-06-21
> **触发**：SUP-296 / CTO 裁决 / 梁栋 D-3 drift 裁定
> **版本**：v0.2（补充评审验收清单 A-F）

---

## 1. 背景

### 1.1 现状

- 当前事件发布为 **in-memory best-effort**（梁栋 D-3 裁定：MVP 接受，生产前升级）
- 事件发布接口已固化：`internal/event/event.go`，信封符合 `insight.yaml` 的 `DomainEvent` schema
- NATS JetStream 已部署：Stream `SMARTDESK_EVENTS`，主题 `smartdesk.<domain>.<event>`
- NATS 鉴权已冻结：core 用户密码 `NATS_CORE_PASSWORD`，权限 `publish: smartdesk.>`

### 1.2 目标

- **事务性保证**：业务写操作与 outbox 写入在同一数据库事务内，事务提交成功后事件不丢失
- **可靠性保证**：服务崩溃重启后 relay 仍能补发；NATS 不可用时事件不丢失，恢复后自动补齐
- **接口兼容**：保持现有事件发布接口，业务代码改动最小化

---

## 2. DB Schema 设计

### 2.1 `outbox_events` 表

```sql
-- migrations/0004_outbox_events.sql
CREATE TABLE outbox_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL UNIQUE,          -- DomainEvent.event_id（幂等去重键）
    event_type      VARCHAR(100) NOT NULL,         -- DomainEvent.event_type
    topic           VARCHAR(255) NOT NULL,         -- NATS subject: smartdesk.<domain>.<event>
    payload         JSONB NOT NULL,                -- DomainEvent payload（已序列化）
    headers         JSONB DEFAULT '{}',            -- 扩展 headers（预留）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    retry_count     INTEGER NOT NULL DEFAULT 0,
    max_retries     INTEGER NOT NULL DEFAULT 5,    -- 最大重试次数
    next_retry_at   TIMESTAMPTZ,                   -- 下次重试时间（指数退避）
    published_at    TIMESTAMPTZ,                   -- 成功发布时间（NULL 表示未发布）
    error           TEXT,                          -- 最后一次失败原因
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'published', 'failed', 'dead_letter'))
);

CREATE INDEX idx_outbox_events_pending ON outbox_events (next_retry_at)
    WHERE status = 'pending' AND published_at IS NULL;

CREATE INDEX idx_outbox_events_created ON outbox_events (created_at);
```

### 2.2 `outbox_dead_letter` 表

```sql
-- migrations/0005_outbox_dead_letter.sql
CREATE TABLE outbox_dead_letter (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_id     UUID NOT NULL REFERENCES outbox_events(id),
    event_id        UUID NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    topic           VARCHAR(255) NOT NULL,
    payload         JSONB NOT NULL,
    headers         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL,
    failed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    retry_count     INTEGER NOT NULL,
    last_error      TEXT,
    migrated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_dead_letter_event_id ON outbox_dead_letter (event_id);
CREATE INDEX idx_outbox_dead_letter_failed_at ON outbox_dead_letter (failed_at);
```

---

## 3. 事务写入机制

### 3.1 核心原则

- **业务写 + outbox 写 = 单一 DB 事务**
- outbox 写入必须发生在业务写成功后、事务提交前
- 事务回滚时 outbox 记录一并回滚（无残留）

### 3.2 接口设计

```go
// internal/event/outbox.go

type OutboxWriter interface {
    // WriteEvent 在当前事务内写入 outbox 记录
    // 必须在业务写完成后调用，事务提交前执行
    WriteEvent(ctx context.Context, tx *sql.Tx, event *DomainEvent) error
}

type DomainEvent struct {
    EventID    uuid.UUID
    EventType  string
    OccurredAt time.Time
    OrgID      string
    TicketID   uuid.UUID
    ActorID    *uuid.UUID
    Version    int
    Payload    any // 已序列化为 JSON 的 payload
}

// 序列化 topic
func (e *DomainEvent) Topic() string {
    // event_type: "ticket.created" → topic: "smartdesk.ticket.created"
    return "smartdesk." + e.EventType
}
```

### 3.3 事务写入流程

```
业务操作流程：
  1. 开启 DB 事务 tx
  2. 执行业务写（INSERT/UPDATE tickets, assignments, comments...）
  3. 成功后调用 outbox.WriteEvent(ctx, tx, event)
  4. 提交事务 tx.Commit()
  5. 事务提交成功后事件进入 outbox（等待 relay 发布）

失败路径：
  - 业务写失败 → 回滚事务 → 无 outbox 记录
  - outbox 写入失败 → 回滚事务 → 业务写一并回滚（无残留）
  - 事务提交失败 → 自动回滚 → 无 outbox 记录
```

### 3.4 与现有接口兼容

```go
// 保持现有 Publisher 接口不变
type Publisher interface {
    Publish(ctx context.Context, event *DomainEvent) error
}

// MVP 实现：直接发布到内存/NATS（已存在）
type MemoryPublisher struct { ... }

// 生产实现：写入 outbox
type OutboxPublisher struct {
    db    *sql.DB
    writer OutboxWriter
}

func (p *OutboxPublisher) Publish(ctx context.Context, event *DomainEvent) error {
    // 问题：Publish 无 tx 参数，需改造调用链
    // 方案 A：传入 ctx 内含 tx（context.Value，不推荐）
    // 方案 B：调用方显式调用 outbox.WriteEvent
    // 选型：方案 B（显式事务传递，更清晰）
}
```

**业务代码改动最小化策略**：
- 现有 `Publisher.Publish` 保留，仅在事务外调用（无事务保证场景）
- 事务内发布改为调用 `outbox.WriteEvent(ctx, tx, event)`
- 业务层需感知事务边界，但接口改动可控

---

## 4. Relay Worker 设计

### 4.1 核心职责

- 从 `outbox_events` 拉取未发布事件（`status=pending`）
- 发布到 NATS JetStream
- 成功后标记 `published_at`、`status=published`
- 失败后更新 `retry_count`、`next_retry_at`（指数退避）

### 4.2 拉取策略

```go
// internal/event/relay.go

type RelayWorker struct {
    db         *sql.DB
    natsConn   *nats.Conn
    jetstream  nats.JetStreamContext
    pollInterval time.Duration    // 默认 1s
    batchSize   int                // 默认 100
}

func (w *RelayWorker) pollPendingEvents(ctx context.Context) ([]OutboxEvent, error) {
    // 查询条件：status='pending' AND (next_retry_at IS NULL OR next_retry_at <= now())
    // ORDER BY created_at ASC
    // LIMIT batchSize
    // FOR UPDATE SKIP LOCKED（Postgres 并发安全）
    
    query := `
        SELECT id, event_id, event_type, topic, payload, headers, created_at,
               retry_count, max_retries, next_retry_at
        FROM outbox_events
        WHERE status = 'pending'
          AND (next_retry_at IS NULL OR next_retry_at <= now())
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
    `
    // ...
}

func (w *RelayWorker) publishToNATS(ctx context.Context, event *OutboxEvent) error {
    // 1. 序列化完整 DomainEvent 信封
    envelope := DomainEvent{
        EventID:    event.EventID,
        EventType:  event.EventType,
        OccurredAt: event.CreatedAt,
        OrgID:      event.Headers["org_id"],
        TicketID:   event.Headers["ticket_id"],
        ActorID:    event.Headers["actor_id"],
        Version:    event.Headers["version"],
        Payload:    event.Payload,
    }
    data, err := json.Marshal(envelope)
    
    // 2. 发布到 NATS JetStream
    msg := nats.NewMsg(event.Topic)
    msg.Data = data
    msg.Header.Set("Nats-Msg-Id", event.EventID.String()) // NATS 消息去重
    
    ack, err := w.jetstream.PublishMsg(msg, nats.MsgId(event.EventID.String()))
    if err != nil {
        return err
    }
    
    // 3. 等待 ACK（可选：同步确认）
    // JetStream 默认持久化，ack 表示成功入库 Stream
    return nil
}
```

### 4.3 发布后处理

```go
func (w *RelayWorker) markPublished(ctx context.Context, eventID uuid.UUID) error {
    // UPDATE outbox_events
    // SET status = 'published', published_at = now()
    // WHERE id = $1
}

func (w *RelayWorker) markFailed(ctx context.Context, eventID uuid.UUID, err error) error {
    // UPDATE outbox_events
    // SET retry_count = retry_count + 1,
    //     error = $err,
    //     next_retry_at = now() + exponential_backoff(retry_count),
    //     status = CASE WHEN retry_count >= max_retries THEN 'dead_letter' ELSE 'pending' END
    // WHERE id = $1
    
    // 若 retry_count >= max_retries，触发死信迁移
}
```

### 4.4 死信迁移

```go
func (w *RelayWorker) migrateToDeadLetter(ctx context.Context, event *OutboxEvent) error {
    // 1. INSERT INTO outbox_dead_letter (original_id, event_id, ...)
    // 2. UPDATE outbox_events SET status = 'dead_letter'
    // 3. 触发告警（可选：发送到 Slack/邮件）
}
```

---

## 5. 重试/死信机制

### 5.1 指数退避策略

```go
func exponentialBackoff(retryCount int) time.Duration {
    // 退避序列：1s, 2s, 4s, 8s, 16s, 32s, ...
    // 上限：5 分钟（避免过长等待）
    base := time.Second
    max  := 5 * time.Minute
    delay := base * time.Duration(math.Pow(2, float64(retryCount)))
    if delay > max {
        delay = max
    }
    return delay
}
```

### 5.2 最大重试次数

- 默认 `max_retries = 5`
- 重试序列：立即 → 1s → 2s → 4s → 8s → 16s（约 31 秒后达到上限）
- 5 次失败后转死信

### 5.3 死信处理

- 死信事件迁移到 `outbox_dead_letter` 表
- 保留原始 payload、错误信息、重试次数
- 可通过手动/脚本重新发布或丢弃
- 触发告警通知运维团队

---

## 6. 启动与生命周期

### 6.1 Relay Worker 启动时机

- 服务启动时启动 relay worker（后台 goroutine）
- 依赖 DB 连接、NATS 连接已就绪
- `/readyz` 检查 relay worker 运行状态（可选）

### 6.2 服务崩溃恢复

- 服务崩溃 → outbox 中未发布记录保留
- 重启后 relay worker 自动拉取未发布事件并发布
- 无事件丢失

### 6.3 NATS 不可用场景

- NATS 连接失败 → relay worker 停止拉取（等待恢复）
- 事件保留在 outbox，等待 NATS 恢复
- NATS 恢复后 relay 重试并补发

---

## 7. 测试覆盖

### 7.1 单元测试

- `outbox.WriteEvent`：事务回滚无残留
- `exponentialBackoff`：退避序列正确
- `DomainEvent.Topic`：topic 序列化正确

### 7.2 集成测试

| 测试场景 | 验收标准 |
|----------|----------|
| 事务回滚不丢事件 | 业务写失败 → outbox 无记录 |
| relay 重试 | NATS 失败 → retry_count 增加、next_retry_at 设置 |
| NATS 不可用补发 | NATS 恢复后 relay 补发未发布事件 |
| 死信场景 | 5 次重试失败 → 迁移到 dead_letter 表 |
| 幂等去重 | 重复发布相同 event_id → NATS 去重、无重复消费 |

### 7.3 性能测试

- outbox 写入延迟：< 1ms（额外一次 INSERT）
- relay 发布吞吐：> 1000 events/s（批量拉取）
- outbox 表增长：正常情况 < 1000 pending（relay 及时消费）

---

## 8. 迁移路径

### 8.1 阶段 1：Schema Migration

- 创建 `outbox_events` 表（0004_outbox_events.sql）
- 创建 `outbox_dead_letter` 表（0005_outbox_dead_letter.sql）

### 8.2 阶段 2：代码实现

- `internal/event/outbox.go`：OutboxWriter 实现
- `internal/event/relay.go`：RelayWorker 实现
- 改造业务层：事务内调用 `outbox.WriteEvent`

### 8.3 阶段 3：切换与验证

- 切换 Publisher：Memory → Outbox
- 集成测试覆盖关键场景
- 观察日志与 metrics

---

## 9. 可观测性

### 9.1 Metrics

- `outbox_pending_count`：未发布事件数（status='pending'）
- `outbox_published_count`：成功发布事件数
- `outbox_retry_count`：重试事件数
- `outbox_dead_letter_count`：死信事件数
- `relay_publish_latency_ms`：发布延迟

### 9.2 日志

- relay 拉取批次：batch size、拉取间隔
- 发布成功/失败：event_id、topic、error
- 死信迁移：event_id、错误摘要

---

## 10. 子任务拆分

按 CTO 裁决拆分为以下子任务（先建 backlog）：

| 子任务 | 描述 | 依赖 |
|--------|------|------|
| T013-1 | Schema/migration：outbox_events + outbox_dead_letter | 无 |
| T013-2 | 事务写入：OutboxWriter 实现 + 业务层改造 | T013-1 |
| T013-3 | Relay worker：拉取 + 发布 + 标记 | T013-1 |
| T013-4 | 重试/死信：指数退避 + 死信迁移 + 告警 | T013-3 |
| T013-5 | 测试覆盖：单元 + 集成 + 性能 | T013-2, T013-3, T013-4 |

---

## 11. 待架构审视确认项

1. **outbox_events 表字段设计**：是否符合 D-5 独立 migration 规范
2. **事务写入接口**：显式传递 tx vs ctx 内含 tx，哪种更符合现有架构
3. **Relay 拉取策略**：FOR UPDATE SKIP LOCKED 是否适配现有 Postgres 版本
4. **死信处理**：告警渠道（Slack/邮件/站内通知）选型
5. **与现有事件发布接口兼容**：业务层改动范围是否可接受

---

## 附录：与现有架构对齐

- **契约对齐**：`DomainEvent` schema 来自 `insight.yaml`，字段名遵循 §3.1 权威列名
- **NATS 配置对齐**：使用现有 NATS JetStream、TLS、鉴权（SUP-249 收口）
- **Migration 规范对齐**：独立编号（0004/0005），禁止向 0001 追加（D-5 裁定）
- **接口兼容**：保持现有 `Publisher` 接口，业务层改动最小化

---

## 12. 评审验收清单响应（A-F）

### A. 事务原子性

**落地方式**：
- 使用同一 `*sql.Tx` 对象管理事务
- 业务写与 outbox 写通过同一个 `tx.Exec()` 执行
- 事务提交前禁止异步写 outbox

```go
func (s *TicketService) CreateTicket(ctx context.Context, req *TicketCreate) (*Ticket, error) {
    tx, err := s.db.BeginTx(ctx, nil)
    if err != nil { return nil, err }
    defer tx.Rollback() // 自动回滚
    
    // 1. 业务写
    ticket, err := s.insertTicket(ctx, tx, req)
    if err != nil { return nil, err }
    
    // 2. 启动 SLA（同一事务）
    err = s.slaEngine.Start(ctx, tx, ticket.ID)
    if err != nil { return nil, err }
    
    // 3. 写 outbox（同一事务）
    event := &DomainEvent{...}
    err = s.outbox.WriteEvent(ctx, tx, event)
    if err != nil { return nil, err }
    
    // 4. 提交事务（成功后事件进入 outbox）
    err = tx.Commit()
    if err != nil { return nil, err }
    
    return ticket, nil
}
```

**反模式禁止**：
- 禁止"先提交业务再异步写 outbox"——事务提交后若 outbox 写失败，事件丢失
- 禁止使用异步 goroutine 写 outbox——无法保证原子性

---

### B. relay 补发与崩溃恢复

**投递语义**：**at-least-once**

**强制下游消费者幂等**：
- 事件带稳定 `event_id`（UUID）
- 消费侧按 `event_id` 去重（写入 `processed_events` 表）
- 契约已冻结：`insight.yaml` 的 `DomainEvent` 要求 `event_id` 去重

```go
// insight 消费侧幂等去重
func (c *Consumer) handleMessage(msg *nats.Msg) error {
    event := parseDomainEvent(msg.Data)
    
    // 幂等检查：processed_events 表
    if c.isProcessed(event.EventID) {
        return nil // 已处理，跳过
    }
    
    // 处理事件...
    err := c.processEvent(event)
    if err != nil { return err }
    
    // 记录已处理
    c.markProcessed(event.EventID)
    return nil
}
```

**崩溃恢复**：
- relay 重启后从 outbox 拉取 `status='pending'` 的事件
- `published_at` 标记表示成功发布
- **"已发 NATS 但标记前崩溃"窗口**：使用 NATS JetStream 的 `Nats-Msg-Id` 去重
  - NATS 收到消息后，即使 relay 未标记 `published_at`，NATS 也会基于 `Nats-Msg-Id` 去重
  - relay 重试时，相同 `event_id` 的消息不会重复入库 Stream

```go
// NATS JetStream 去重
msg := nats.NewMsg(event.Topic)
msg.Data = data
msg.Header.Set("Nats-Msg-Id", event.EventID.String()) // NATS 自动去重
```

**拉取并发/防重**：
- 使用 `FOR UPDATE SKIP LOCKED` 防止多 relay 实例重复投递
- 多实例场景：每个实例独立拉取，SKIP LOCKED 保证同一条记录只被一个实例锁定

---

### C. 顺序性

**明确声明**：**全局无序可接受**

- 跨工单事件不保证全局序（梁栋 D-3 裁定）
- 单工单事件按 `ticket_id` 分区，由 NATS JetStream 保证分区有序（Stream 配置）
- 当前 MVP 阶段不要求严格分区有序，消费者幂等去重替代顺序保证

**未来扩展（可选）**：
- 若需要分区有序，可配置 NATS Stream 以 `ticket_id` 为分区键
- 当前设计预留 `headers["ticket_id"]`，未来可扩展分区策略

---

### D. 重试/死信/告警

**指数退避参数**：
- 基数：1 秒
- 抖动：±10%（避免惊群效应）
- 上限：5 分钟

```go
func exponentialBackoffWithJitter(retryCount int) time.Duration {
    base := time.Second
    max := 5 * time.Minute
    delay := base * time.Duration(math.Pow(2, float64(retryCount)))
    if delay > max { delay = max }
    
    // 添加 ±10% 抖动
    jitter := float64(delay) * (0.9 + 0.2 * rand.Float64())
    return time.Duration(jitter)
}
```

**retry_count 阈值**：
- `max_retries = 5`
- 重试序列：立即 → 1s±10% → 2s±10% → 4s±10% → 8s±10% → 16s±10%
- 5 次失败后转死信

**死信表结构**：见 §2.2 `outbox_dead_letter`

**告警触发点与接收方**：
- 触发点：事件迁移到 `outbox_dead_letter` 时
- 接收方：运维团队（默认：白帆/万全）
- 通道：
  1. 日志：slog 记录 `event_id`、`last_error`
  2. Metrics：`outbox_dead_letter_count` 增加
  3. 可选：Slack 通知（需配置 webhook）

**死信重放（replay）运维手段**：
```sql
-- 查询死信事件
SELECT * FROM outbox_dead_letter ORDER BY failed_at DESC LIMIT 100;

-- 重放：手动重新发布
-- 1. 将死信记录复制回 outbox_events（status=pending）
INSERT INTO outbox_events (event_id, event_type, topic, payload, headers, created_at)
SELECT event_id, event_type, topic, payload, headers, created_at
FROM outbox_dead_letter WHERE id = 'xxx';

-- 2. Relay 自动拉取并重新发布
```

---

### E. 接口兼容性

**现有事件发布接口**：保持不变

```go
// 现有接口（MVP）：MemoryPublisher（in-memory best-effort）
type MemoryPublisher struct { ... }
func (p *MemoryPublisher) Publish(ctx context.Context, event *DomainEvent) error { ... }

// 新接口（生产）：OutboxPublisher（事务性）
type OutboxPublisher struct { ... }
func (p *OutboxPublisher) Publish(ctx context.Context, event *DomainEvent) error { ... }
```

**切换策略**：
- 配置开关：`EVENT_PUBLISHER_MODE = "memory" | "outbox"`
- 默认：MVP 阶段使用 `memory`，生产切换为 `outbox`

**灰度开关（双写/切换/回退路径）**：
- **双写阶段**（可选）：同时写入 memory 和 outbox，验证 outbox 可用性
  ```go
  if config.DoubleWrite {
      memoryPublisher.Publish(ctx, event)
      outbox.WriteEvent(ctx, tx, event)
  }
  ```
- **切换阶段**：关闭 memory，仅使用 outbox
- **回退路径**：若 outbox 出现问题，快速切换回 memory（配置开关）

**业务层改动**：
- 事务内发布：调用 `outbox.WriteEvent(ctx, tx, event)`（需传递 `tx`）
- 事务外发布：调用 `publisher.Publish(ctx, event)`（无改动）

---

### F. 迁移

**与 D-5 协同口径**：
- 独立编号 migration：`0004_outbox_events.sql`、`0005_outbox_dead_letter.sql`
- 幂等可回滚：
  ```sql
  -- 0004_outbox_events.sql
  CREATE TABLE IF NOT EXISTS outbox_events (...);
  CREATE INDEX IF NOT EXISTS idx_outbox_events_pending ON outbox_events (...);
  
  -- 回滚脚本：0004_outbox_events_down.sql
  DROP TABLE IF EXISTS outbox_events;
  ```
- 禁止向 `0001_init.sql` 追加（D-5 裁定）

**迁移顺序**：
1. 先执行 `0004_outbox_events.sql`（创建 outbox_events）
2. 后执行 `0005_outbox_dead_letter.sql`（创建 outbox_dead_letter）
3. 依赖：无（可独立执行）

---

**下一步**：提交架构审视（梁栋），审视通过后创建子任务 issue。