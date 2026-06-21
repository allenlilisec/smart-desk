# smartdesk-core 六边形/sqlc/oapi-codegen 分层设计（已归档）

> ⚠️ **已归档，非当前事实源**。
>
> 本文原为 `specs/core子系统详细设计与实现说明书.md` v2.0 中的分层与实现规划。经架构团队 Leader 梁栋于 2026-06-17 裁决（[SUP-256](mention://issue/6dc94180-4236-4a26-83f3-aa8770cb73ed) D-2），该规划被降级为**长期技术债**，当前 MVP 以 `httpapi/domain/store` 轻量实现为新事实源。
>
> 保留本文仅供追溯历史设计决策，任何新开发须以当前 [`specs/core子系统详细设计与实现说明书.md`](core子系统详细设计与实现说明书.md) 和 `src/smartdesk-core/` 代码为准。

---

## 1. 设计目标

- **契约先行**：用 `oapi-codegen` 从 `src/openapi/core.yaml` 生成 types + chi server 桩，CI 跑 `api-contract-check` 阻止实现与契约漂移。
- **领域纯净**：`internal/domain` 只含实体与纯业务规则，不 import 框架/驱动，便于单测 mock。
- **端口-适配器（六边形）分层**：入站/出站通过端口解耦，未来可替换 HTTP 框架、存储驱动、事件总线。
- **事务性事件**：核心写在单 PG 事务内落「业务表 + timeline + outbox」；后台 outbox relay 投递 NATS，保证落库与发事件原子、至少一次、降级不丢。

---

## 2. 六边形分层（v2.0 规划）

```
            ┌──────────────────────── 入站适配器 (inbound) ─────────────────────────┐
 gateway ─▶ │ HTTP Server(chi) · oapi handler 桩 │ 事件消费者(insight.classification_suggested) │
 (svc-jwt + │ 中间件链: recover/requestID/serviceAuth/userCtx/metrics                   │
  X-User-*) └───────────────┬──────────────────────────────────┬────────────────────┘
                            ▼                                    ▼
            ┌──────────────────── 应用/领域层 (core domain) ────────────────────────┐
            │ TicketService · TransitionService(状态机) · AssignmentService           │
            │ CommentService · AttachmentService · LinkService · SlaEngine            │
            │ TimelineService · ConfigService                                         │
            │ 领域不可变规则：状态机表 / SLA 计算 / 可见性过滤 / 校验                   │
            └───────────────┬──────────────────────────────────┬────────────────────┘
                            ▼ ports: Repository/EventPublisher/ObjectStore/Clock
            ┌──────────────────── 出站适配器 (outbound) ───────────────────────────┐
            │ PG Repository(pgx+sqlc) │ Outbox→NATS Relay │ S3/MinIO 预签名 │ Clock    │
            └──────────────┬─────────────────┬──────────────────┬────────────────────┘
                           ▼                 ▼                  ▼
                      PostgreSQL        NATS JetStream      对象存储(S3/MinIO)
```

依赖方向：入站 → 应用/领域 → 出站端口（接口），适配器实现端口。

---

## 3. 原规划包布局

```
smartdesk-core/
├─ cmd/smartdesk-core/main.go        # 装配：appconfig→db→nats→server→relay→consumer
├─ internal/
│  ├─ appconfig/                     # 环境/启动配置加载（envconfig）              (CORE-0)
│  ├─ httpapi/
│  │   ├─ gen/                       # oapi-codegen 生成（types/server）           (CORE-0)
│  │   └─ middleware/                # recover/requestID/serviceAuth/userCtx/metrics(CORE-0)
│  ├─ domain/                        # 纯领域：实体/状态机表/SLA 计算/可见性/错误码
│  ├─ ticket/        (CORE-A1)       # 建单/查询/详情/更新 + watcher/csat
│  ├─ transition/    (CORE-A1)       # 状态机执行 + history
│  ├─ assignment/    (CORE-A2)       # 分派/改派/升级/规则自动分派
│  ├─ sla/           (CORE-A3)       # SlaEngine：start/pause/resume/recalc + 扫描器
│  ├─ comment/       (CORE-B1)       # 评论/内部备注/可见性过滤/@提及/触发 user_reply
│  ├─ attachment/    (CORE-B2)       # 元数据 + OSS 预签名 + 下载授权
│  ├─ link/          (CORE-B4)       # 关联/合并
│  ├─ timeline/      (CORE-B3)       # 时间线追加/查询 + 列表/过滤
│  ├─ config/        (CORE-C)        # taxonomy / sla 策略 / 用户角色 目录
│  ├─ repository/    (CORE-0)        # pgx+sqlc 实现各 domain port；Tx 管理；queries/*.sql
│  ├─ events/        (CORE-0)        # 事件信封/outbox 写入/relay(→NATS)/consumer
│  ├─ objstore/      (CORE-B2)       # S3/MinIO 客户端、预签名
│  └─ platform/      (CORE-0)        # db pool/nats conn/slog/otel/健康检查
├─ migrations/                       # golang-migrate up/down（0001–0005）
└─ test/                             # testcontainers 集成测试
```

---

## 4. 原规划技术栈

- Go 1.22+
- HTTP 路由：chi
- OpenAPI 生成：`oapi-codegen`
- DB 驱动：`pgx/v5` + `sqlc`
- 迁移：`golang-migrate`
- 事件总线：`nats.go`（JetStream）
- 日志：`slog`
- 可观测性：OTel

---

## 5. 原规划数据模型亮点

### 5.1 拆分迁移

| 迁移 | 表 | 归属任务 |
|---|---|---|
| 0001_init | `roles, users, user_roles, categories, sla_policies, sla_policy_targets` | CORE-0 / CORE-C |
| 0002_tickets | `tickets, ticket_status_history, ticket_timeline` | CORE-0 / CORE-A1 |
| 0003_workflow | `assignments, comments, attachments, ticket_links, sla_timers, watchers, csat_ratings` | CORE-A/B |
| 0004_infra | `idempotency_keys, outbox_events, processed_events` | CORE-0 |
| 0005_seed | 角色枚举、SLA v1 基线策略、分类初始集 | CORE-C |

### 5.2 outbox_events（事务性发件箱）

```sql
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,             -- = event_id
  subject TEXT NOT NULL,           -- smartdesk.<domain>.<event>
  event_type TEXT NOT NULL, org_id TEXT NOT NULL, ticket_id UUID,
  payload_json JSONB NOT NULL, published_at TIMESTAMPTZ,  -- NULL=待发
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_unpublished ON outbox_events(created_at) WHERE published_at IS NULL;
```

后台 relay 以 `FOR UPDATE SKIP LOCKED` 取未发事件 → publish → 置 `published_at`，多副本安全、至少一次。

### 5.3 健康探测旧语义

`/readyz` 探测 DB + NATS；任一不可用则 readiness 失败，阻止流量进入。

---

## 6. 原规划身份传递方式

- 入站：gateway 签发 service-jwt，同时透传 `X-User-Id / X-User-Roles / X-Org-Id / X-Request-Id`。
- core 校验 service-jwt 后，从 `X-User-*` 头解析最终用户身份做领域级过滤。

> 该方式在后续实现中被 service-jwt claims 替代（SUP-194），旧透传头已移除。

---

## 7. 归档原因

| 维度 | 原规划 | 当前 MVP 事实源 | 裁决 |
|---|---|---|---|
| 分层 | 六边形 + 多细粒度 service 包 | `httpapi/domain/store` 三层 | D-2 接受轻量 MVP |
| 契约生成 | `oapi-codegen` + chi | 手写 `net/http` handler | D-2 接受轻量 MVP |
| 存储访问 | `pgx+sqlc` repository | `database/sql + lib/pq` 直接 SQL | D-2 接受轻量 MVP |
| 事件 | 事务性 outbox + NATS relay | in-memory best-effort | D-3 MVP 接受，后续升级 |
| readyz | 探测 DB+NATS | 仅服务本身就绪 | D-4 接受新语义 |
| schema | 0001–0004 拆分迁移 | 压缩 `0001_init.sql` 基线 | D-5 接受 |

---

> 长期重构任务由 [SUP-298](mention://issue/c7b6eec2-990f-4491-ad9b-33cb47ac8151) 跟踪，不占用当前 Sprint。
