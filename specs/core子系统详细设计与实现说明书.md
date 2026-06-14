# smartdesk-core 模块实现设计与任务分解说明书（M1 详细设计）

> 版本：v1.0-draft　|　日期：2026-06-14
> 编制：石磊（后端核心负责人 / 后端域 committer）
> 上游依据：
> - [《系统架构设计说明书》](SmartDesk系统架构设计说明书.md)（§2 服务边界、§3 数据模型、§5 事件、§6 服务间信任、§8 主流程、§11 模块划分）
> - [`openapi/core.yaml`](../openapi/core.yaml)（core 内部契约，唯一接口事实源）
> - [《产品需求说明书 PRD》](SmartDesk产品需求说明书PRD.md)、[《用户故事与验收标准》](SmartDesk用户故事与验收标准.md)
>
> **定位**：本文是 smartdesk-core 服务的**实现级详细设计**，在大设计框架内细化 core 的内部架构、DB schema/迁移、与契约对齐的接口实现要点、组件划分、任务分解与里程碑、依赖关系。**不突破契约**（契约变更须经梁栋批准，秦诺校验）；契约冻结后据此并行开发。

---

## 目录

1. [范围与设计原则](#1-范围与设计原则)
2. [模块架构设计](#2-模块架构设计)
3. [数据库 schema 设计](#3-数据库-schema-设计)
4. [API 接口设计（与 core.yaml 对齐）](#4-api-接口设计与-coreyaml-对齐)
5. [模块内部组件划分](#5-模块内部组件划分)
6. [横切关注点（事务/幂等/事件/可观测性）](#6-横切关注点)
7. [任务分解与里程碑](#7-任务分解与里程碑)
8. [依赖关系说明](#8-依赖关系说明)
9. [开放事项与风险](#9-开放事项与风险)

---

## 1. 范围与设计原则

### 1.1 职责边界（取自架构 §2.2，最终边界）

core **负责**：工单 CRUD/状态机/分派/评论备注/附件元数据/关联合并/SLA 计时/时间线审计；**权威配置**：分类树（taxonomy）、SLA 策略、用户与角色目录（账号/RBAC 主数据）；发布领域事件；消费 insight 的分类建议异步写回。

core **不负责**：发通知（insight）；AI 计算（insight）；直接面向浏览器（仅经 gateway，监听内网）；认证凭证/会话/令牌（gateway）。

### 1.2 设计原则

- **契约先行**：所有对外接口以 `openapi/core.yaml` 为准；实现用 `oapi-codegen` 生成类型/路由桩，CI 跑 `api-contract-check` 阻止漂移。
- **领域级纵深防御**：鉴权已在 gateway 收口；core 信任 `serviceAuth`(service-jwt, aud=core) + 透传的 `X-User-*` 头，仅做**数据可见性过滤**（内部备注、本组范围、附件越权），不重做认证。
- **事务一致 + 事件最终一致**：核心写操作（建单/流转/分派/评论）在单 PostgreSQL 事务内落库；领域事件经 **事务性发件箱（outbox）** 投递 NATS JetStream，保证「落库与发事件」原子、至少一次、可重放。
- **降级**：NATS / insight 不可用时，core 主流程（建单/流转/评论/查询）不受影响——事件先入 outbox，由后台 relay 补投。
- **幂等可审计**：写操作支持 `Idempotency-Key`；时间线只追加、不暴露 update/delete 给非系统角色。
- **多租户预留（OQ-7）**：全表 `org_id` 非空（一期固定 `default`），索引/外键带 `org_id`；一期不实现隔离逻辑。

### 1.3 技术选型

| 关注点 | 选型 | 理由 |
|---|---|---|
| 语言/运行时 | Go 1.22+ | 架构红线指定 core 用 Go；并发与内网服务契合 |
| HTTP 路由 | `chi` v5 | 轻量、`net/http` 原生中间件链、契约桩可挂载 |
| 契约代码生成 | `oapi-codegen`（types + chi-server + spec embed） | 与 core.yaml 强绑定，编译期保证契约一致 |
| DB 驱动/访问 | `pgx` v5 + `sqlc` 生成查询 | 类型安全、无 ORM 魔法、可读 SQL |
| 迁移 | `golang-migrate`（`migrations/*.sql`，up/down 成对） | 与 `db-migration` 技能一致，可重复执行 |
| 事件总线 | NATS JetStream（`nats.go`） | 架构 §5.1 选定；Stream `SMARTDESK_EVENTS` |
| 配置 | 环境变量 + `envconfig`，`.env` 本地 | 12-factor |
| 日志 | `slog`（结构化 JSON，注入 trace_id/request_id/org_id/actor_id） | 架构 §9 三支柱 |
| 指标/追踪 | Prometheus `/metrics` + OpenTelemetry | 架构 §9 |
| 主键 | UUID v7（应用层生成，时序友好） | 架构 §3.2 |
| 测试 | `testify` + `testcontainers-go`(PG/NATS) | 集成测试真实依赖 |

---

## 2. 模块架构设计

### 2.1 分层（六边形 / 端口-适配器）

```
                ┌──────────────────────────── 入站适配器 (inbound) ────────────────────────────┐
   gateway ──▶  │  HTTP Server (chi)  │  中间件链  │  事件消费者 (insight.classification_suggested) │
   (svc-jwt +   │  · oapi handler 桩  │  recover / requestID / serviceAuth / userCtx / metrics    │
    X-User-*)   └─────────────┬───────────────────────────────────────┬─────────────────────────┘
                              ▼                                         ▼
                ┌──────────────────────── 应用/领域层 (core domain) ────────────────────────────┐
                │  TicketService · TransitionService(状态机) · AssignmentService · CommentService │
                │  AttachmentService · LinkService · SlaEngine · TimelineService · ConfigService  │
                │  领域不可变规则：状态机表 / SLA 计算 / 可见性过滤 / 校验                          │
                └─────────────┬───────────────────────────────────────┬─────────────────────────┘
                              ▼ (ports: Repository / EventPublisher / ObjectStore / Clock)
                ┌──────────────────────── 出站适配器 (outbound) ───────────────────────────────┐
                │  PG Repository (pgx+sqlc)  │  Outbox→NATS Relay  │  S3/MinIO 预签名  │  Clock   │
                └──────────────┬─────────────────────┬────────────────────┬─────────────────────┘
                               ▼                     ▼                    ▼
                         PostgreSQL            NATS JetStream         对象存储(S3/MinIO)
```

**依赖方向**：入站 → 应用/领域 → 出站端口（接口），适配器实现端口。领域层不 import 框架/驱动；便于单测（mock 端口）。

### 2.2 请求处理链（以「建单」为例，落地架构 §8）

```
POST /v1/tickets  (Idempotency-Key)
 1. recover → requestID(透传 X-Request-Id) → serviceAuth(校验 service-jwt 签名+aud=core)
 2. userCtx 中间件：解析 X-User-Id / X-User-Roles / X-Org-Id 注入 context
 3. handler 桩 → TicketCreate DTO 校验（title≤200、description 必填）
 4. TicketService.Create 单事务：
      a. 幂等检查（idempotency_keys 命中则返回首次结果）
      b. 生成 number（org 内流水：SD-2026-000123）+ 落 tickets(status=new)
      c. SlaEngine.Start：按 priority 选 sla_policy_targets，落 sla_timers(response/resolve due)
      d. TimelineService.Append(event_type=ticket_created)
      e. Outbox.Enqueue(ticket.created)            ← 与上同一事务
      f. commit
 5. 返回 201 Ticket（不等待 AI；分类/定级为后续异步写回）
 6. 后台 Outbox Relay 异步发 ticket.created → NATS → insight 消费
```

### 2.3 部署形态

- 单可执行文件 `smartdesk-core`，内置 HTTP server + outbox relay + JS consumer（同进程 goroutine，可经配置拆分独立进程）。
- 仅监听内网端口（架构 §6：外部不可达）；`/healthz`(liveness)、`/readyz`(readiness，探测 DB+NATS)。
- 无状态、可水平扩；流水号生成与 outbox relay 用行级锁 / `FOR UPDATE SKIP LOCKED` 保证多副本安全。

---

## 3. 数据库 schema 设计

> 命名 snake_case；主键 `uuid`（v7，应用生成）；所有业务表含 `org_id NOT NULL DEFAULT 'default'`、`created_at`、`updated_at`；可软删表加 `deleted_at`。时间一律 `timestamptz`（UTC）。迁移文件 `migrations/NNNN_<name>.up.sql` / `.down.sql`，由 `db-migration` 技能生成执行。

### 3.1 实体清单与迁移划分

| 迁移 | 表 | 归属任务 |
|---|---|---|
| 0001_init | `users, roles, user_roles` | CORE-0 / CORE-C |
| 0001_init | `categories` | CORE-0 / CORE-C |
| 0001_init | `sla_policies, sla_policy_targets` | CORE-0 / CORE-C |
| 0002_tickets | `tickets, ticket_status_history, ticket_timeline` | CORE-0 / CORE-A1 |
| 0003_workflow | `assignments, comments, attachments, ticket_links, sla_timers, watchers, csat_ratings` | CORE-A/B |
| 0004_infra | `idempotency_keys, outbox_events, processed_events` | CORE-0 |
| 0005_seed | 角色枚举、SLA v1 基线策略、分类初始集 | CORE-C |

### 3.2 核心 DDL（关键表，节选）

```sql
-- 角色目录 / RBAC 主数据
CREATE TABLE roles (
  code TEXT PRIMARY KEY,             -- requester|agent|lead|manager|admin
  name TEXT NOT NULL
);
CREATE TABLE users (
  id            UUID PRIMARY KEY,
  org_id        TEXT NOT NULL DEFAULT 'default',
  username      TEXT NOT NULL,
  email         TEXT,
  display_name  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',  -- active|disabled
  credential_ref TEXT,               -- 指向 gateway 凭证；core 不存密码/哈希
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (org_id, username)
);
CREATE TABLE user_roles (
  user_id   UUID NOT NULL REFERENCES users(id),
  role_code TEXT NOT NULL REFERENCES roles(code),
  scope     TEXT,                    -- 预留坐席组维度（lead 管本组）
  PRIMARY KEY (user_id, role_code)
);

-- 分类树（taxonomy，自引用）
CREATE TABLE categories (
  id        UUID PRIMARY KEY,
  org_id    TEXT NOT NULL DEFAULT 'default',
  parent_id UUID REFERENCES categories(id),
  code      TEXT,
  name      TEXT NOT NULL,
  active    BOOLEAN NOT NULL DEFAULT true,
  sort      INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_categories_parent ON categories(org_id, parent_id);

-- SLA 策略
CREATE TABLE sla_policies (
  id     UUID PRIMARY KEY,
  org_id TEXT NOT NULL DEFAULT 'default',
  name   TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sla_policy_targets (
  policy_id        UUID NOT NULL REFERENCES sla_policies(id) ON DELETE CASCADE,
  priority         TEXT NOT NULL,    -- P1..P4
  response_minutes INT NOT NULL,
  resolve_minutes  INT NOT NULL,
  PRIMARY KEY (policy_id, priority)
);

-- 工单主表
CREATE TABLE tickets (
  id           UUID PRIMARY KEY,
  org_id       TEXT NOT NULL DEFAULT 'default',
  number       TEXT NOT NULL,        -- SD-2026-000123，org 内唯一
  title        TEXT NOT NULL,
  description  TEXT,
  requester_id UUID NOT NULL REFERENCES users(id),
  assignee_id  UUID REFERENCES users(id),
  group_id     UUID,
  category_id  UUID REFERENCES categories(id),
  priority     TEXT NOT NULL DEFAULT 'P3',   -- P1..P4
  status       TEXT NOT NULL DEFAULT 'new',  -- 八态
  source       TEXT NOT NULL DEFAULT 'web',
  reopen_count INT NOT NULL DEFAULT 0,
  closed_at    TIMESTAMPTZ,
  csat_score   SMALLINT,             -- 1..5
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (org_id, number)
);
-- 读路径索引（NFR 列表 P95<500ms，架构 §9）
CREATE INDEX idx_tickets_org_status   ON tickets(org_id, status);
CREATE INDEX idx_tickets_assignee     ON tickets(org_id, assignee_id);
CREATE INDEX idx_tickets_category     ON tickets(org_id, category_id);
CREATE INDEX idx_tickets_requester    ON tickets(org_id, requester_id);
CREATE INDEX idx_tickets_created      ON tickets(org_id, created_at DESC);
-- q 关键词：一期 PG 全文（中文分词），二期可换
CREATE INDEX idx_tickets_fts ON tickets USING gin (to_tsvector('simple', coalesce(title,'')||' '||coalesce(description,'')));

-- 状态历史（非法跃迁不写）
CREATE TABLE ticket_status_history (
  id         UUID PRIMARY KEY,
  ticket_id  UUID NOT NULL REFERENCES tickets(id),
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    UUID,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 时间线 / 审计（只追加，正序）
CREATE TABLE ticket_timeline (
  id          UUID PRIMARY KEY,
  ticket_id   UUID NOT NULL REFERENCES tickets(id),
  event_type  TEXT NOT NULL,         -- ticket_created|status_changed|assigned|commented|sla_*|merged...
  actor_id    UUID,
  payload_json JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_timeline_ticket ON ticket_timeline(ticket_id, created_at);

-- 分派记录
CREATE TABLE assignments (
  id           UUID PRIMARY KEY,
  ticket_id    UUID NOT NULL REFERENCES tickets(id),
  from_user_id UUID,
  to_user_id   UUID,
  to_group_id  UUID,
  kind         TEXT NOT NULL,        -- manual|auto|reassign|escalate
  reason       TEXT,
  actor_id     UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assignments_ticket ON assignments(ticket_id, created_at);

-- 评论 / 内部备注（internal 接口层过滤）
CREATE TABLE comments (
  id           UUID PRIMARY KEY,
  ticket_id    UUID NOT NULL REFERENCES tickets(id),
  author_id    UUID NOT NULL,
  body         TEXT NOT NULL,
  visibility   TEXT NOT NULL,        -- public|internal
  mentions_json JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX idx_comments_ticket ON comments(ticket_id, created_at);

-- 附件元数据（对象存 OSS）
CREATE TABLE attachments (
  id           UUID PRIMARY KEY,
  ticket_id    UUID NOT NULL REFERENCES tickets(id),
  comment_id   UUID REFERENCES comments(id),
  uploader_id  UUID NOT NULL,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  object_key   TEXT NOT NULL,        -- OSS key
  checksum     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 关联 / 合并
CREATE TABLE ticket_links (
  id               UUID PRIMARY KEY,
  ticket_id        UUID NOT NULL REFERENCES tickets(id),
  linked_ticket_id UUID NOT NULL REFERENCES tickets(id),
  relation         TEXT NOT NULL,    -- related|duplicate|merged_into
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SLA 计时实例（priority/policy 快照，策略变更不回改历史）
CREATE TABLE sla_timers (
  id                   UUID PRIMARY KEY,
  ticket_id            UUID NOT NULL REFERENCES tickets(id),
  policy_id            UUID NOT NULL,
  priority             TEXT NOT NULL,
  response_due_at      TIMESTAMPTZ NOT NULL,
  resolve_due_at       TIMESTAMPTZ NOT NULL,
  response_met         BOOLEAN NOT NULL DEFAULT false,
  resolve_met          BOOLEAN NOT NULL DEFAULT false,
  paused               BOOLEAN NOT NULL DEFAULT false,
  paused_at            TIMESTAMPTZ,
  paused_total_seconds INT NOT NULL DEFAULT 0,
  breached             BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_sla_timer_ticket ON sla_timers(ticket_id);
-- 扫描即将/已超时（warning/breached 事件）
CREATE INDEX idx_sla_due ON sla_timers(resolve_due_at) WHERE NOT resolve_met AND NOT paused;

CREATE TABLE watchers (
  ticket_id UUID NOT NULL REFERENCES tickets(id),
  user_id   UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);
CREATE TABLE csat_ratings (
  ticket_id    UUID PRIMARY KEY REFERENCES tickets(id),
  requester_id UUID NOT NULL,
  score        SMALLINT NOT NULL,   -- 1..5
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 基础设施表
CREATE TABLE idempotency_keys (
  org_id      TEXT NOT NULL,
  key         TEXT NOT NULL,
  request_hash TEXT NOT NULL,        -- 防同键不同体
  response_json JSONB,
  status_code INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);
CREATE TABLE outbox_events (
  id           UUID PRIMARY KEY,     -- = event_id
  subject      TEXT NOT NULL,        -- smartdesk.<domain>.<event>
  event_type   TEXT NOT NULL,
  org_id       TEXT NOT NULL,
  ticket_id    UUID,
  payload_json JSONB NOT NULL,
  published_at TIMESTAMPTZ,          -- NULL=待发
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_unpublished ON outbox_events(created_at) WHERE published_at IS NULL;
CREATE TABLE processed_events (    -- 消费幂等（insight.classification_suggested）
  event_id   UUID PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.3 种子数据（0005_seed，CORE-C）

- `roles`：`requester|agent|lead|manager|admin`。
- SLA v1 基线（架构 §3.2 / OQ-1）：P1 15m/4h；P2 60m/1bd；P3 240m/3bd；P4 1bd/5bd（"bd"换算为分钟按 8h 工作日入库；工作日历是否启用见 §9 开放项）。
- `categories` 初始集：IT / 账号权限 / 办公行政 / 人事 / 财务 / 其他（M2 由产品+admin 细化）。

### 3.4 ER 关系要点（取自架构 §3.4）

- `tickets` 1—N `comments / attachments / ticket_timeline / assignments / ticket_links / sla_timers / csat_ratings / watchers`。
- `tickets.category_id → categories.id`；`assignee_id/requester_id → users.id`。
- `sla_timers` 快照 `priority/policy_id`，策略变更不回改历史计时。
- insight 读模型只读投影，**不与 core 共享事务**，以事件为唯一同步通道。

---

## 4. API 接口设计（与 core.yaml 对齐）

> 接口形态、路径、schema 全部以 `openapi/core.yaml` 为准，**本节只补实现语义**，不引入契约外字段。所有路径前缀 `/v1`，`security: serviceAuth`（`/healthz`、`/readyz` 除外）。统一错误 `Error{code,message,details?,trace_id}`；HTTP 语义：400 校验 / 401 未认证 / 403 越权 / 404 不存在 / 409 状态冲突 / 413 附件超限 / 422 业务规则。

### 4.1 端点 → 服务 → 实现要点映射

| 方法 路径 | 服务 | 实现要点 / 验收锚点 |
|---|---|---|
| `POST /tickets` | TicketService | 事务落库 new→启 SLA→写时间线→outbox `ticket.created`；幂等键；US-2.1（AI 无关降级，AC4） |
| `GET /tickets` | TicketService | 过滤(status/priority/assignee/requester/group/category/q/sla_state)+排序+分页(≤100)；`q` 走 FTS；返回 `TicketPage` |
| `GET /tickets/{id}` | TicketService | `TicketDetail`（含 sla / suggestion / links）；可见性过滤；404/403 |
| `PATCH /tickets/{id}` | TicketService | 改 title/desc/category/priority；**priority 变更触发 SlaEngine.Recalc**；422 业务校验 |
| `POST /tickets/{id}/transitions` | TransitionService | 状态机表校验，非法跃迁 **409**；写 history+timeline；幂等键；SLA 暂停/恢复联动；US-2.2 |
| `POST /tickets/{id}/assignments` | AssignmentService | manual/auto/reassign/escalate；写 assignments+timeline→outbox `ticket.assigned/reassigned`；US-2.3/5.1 |
| `GET /tickets/{id}/comments` | CommentService | **internal 按 X-User-Roles 过滤**：requester 不返回 internal（US-2.4 AC2）；分页 |
| `POST /tickets/{id}/comments` | CommentService | public/internal + @提及；写 timeline→outbox `ticket.commented`；US-2.4/5.2 |
| `GET /tickets/{id}/attachments` | AttachmentService | 元数据列表 |
| `POST /tickets/{id}/attachments` | AttachmentService | 校验 ≤20MB + 类型白名单（超限 413 / 非白名单 422）→签发**上传**预签名 URL；OQ-9 |
| `GET /attachments/{attId}/download-url` | AttachmentService | 鉴权后签发短时**下载** URL；越权 **403**；US-2.7 AC2 |
| `POST /tickets/{id}/links` | LinkService | related/duplicate/merged_into；合并：子单 merged_into 主单+状态同步+outbox `ticket.merged`；冲突 409；US-2.6 |
| `GET /tickets/{id}/sla` | SlaEngine | 返回 `SlaTimer`（response/resolve due、paused、breached）；US-2.5 |
| `GET /tickets/{id}/timeline` | TimelineService | 正序、只读追加、分页；US-2.8 |
| `POST /tickets/{id}/watchers` | TicketService | watch=true/false 关注/取关；204；US-5.3 |
| `POST /tickets/{id}/csat` | TicketService | 仅 resolved/closed 可评（否则 409）；1..5；US-6.3/OQ-12 |
| `GET/POST /config/categories`、`PATCH/DELETE /config/categories/{catId}` | ConfigService | taxonomy 树 CRUD（admin）；删除时被引用 409；OQ-4 |
| `GET/PUT /config/sla-policies` | ConfigService | SLA 策略读/配（admin，改数值不改契约形态）；OQ-1 |
| `GET/POST /config/users`、`PUT /config/users/{userId}/roles` | ConfigService | 用户目录/角色（admin，RBAC 主数据）；US-7.3 |
| `GET /healthz` / `GET /readyz` | platform | liveness / readiness（探测 DB+NATS） |

### 4.2 状态机（实现自 core.yaml `/transitions` 描述表，梁栋裁决口径）

显式映射 `action → from → to`，非法跃迁拒绝 **409**，每次写 history+timeline（操作人/时间/前后状态）。终态 `closed`/`cancelled`。

| action | from | to | 触发方 | SLA 联动 |
|---|---|---|---|---|
| accept | new | accepted | 坐席 | response_met 判定 |
| start | accepted, pending_user | in_progress | 坐席 | pending_user→in_progress 手工恢复，**SLA 恢复顺延** |
| wait_user | in_progress | pending_user | 坐席 | **SLA 暂停**（paused=true, paused_at=now） |
| user_reply（系统自动，非客户端 action） | pending_user | in_progress | 系统 | 报单人回复时 core 自动触发（US-2.2 AC2），**SLA 恢复** |
| resolve | in_progress | resolved | 坐席 | resolve_met 判定；outbox `ticket.resolved` |
| close | resolved | closed | 报单人/坐席 | 终态，写 closed_at；pending_user 超时仅提醒不自动关（OQ-8） |
| reopen | closed | in_progress | 报单人 | **仅 closed 后 7 天内**（OQ-13），reopen_count+1 |
| suspend | in_progress | suspended | 坐席/lead | 内部挂起（区别于待用户） |
| resume | suspended | in_progress | 坐席/lead | **仅**解挂起，不承担 pending_user 恢复 |
| cancel | new, accepted, in_progress, pending_user, suspended | cancelled | 坐席/lead | 终态 |

> 关键裁决（梁栋，core.yaml 内）：`resume` 语义单一化——**仅** `suspended→in_progress`；`pending_user→in_progress` 走系统自动（user_reply）或坐席 `start`，**不复用 resume**。enum 不变。`user_reply` 不是客户端可调 action，由 CommentService 在 requester 回复时内部调用 TransitionService。

### 4.3 异步写回入口（消费侧，非 HTTP）

`insight.classification_suggested` 事件消费 → 落 `TicketDetail.suggestion`（建议态）；一期不自动改分类/优先级，**仅当 confidence≥0.85 且开启自动填充**时填充（OQ-4，开关为 config）。消费以 `event_id` 去重（`processed_events`）。

---

## 5. 模块内部组件划分

> 对应架构 §11 的 CORE-* 任务到代码包。Go 包布局：

```
smartdesk-core/
├─ cmd/smartdesk-core/main.go        # 装配：config→db→nats→server→relay→consumer
├─ openapi/core.yaml                 # 软链/同步自仓库根 openapi/（CI 校验源）
├─ internal/
│  ├─ config/                        # envconfig 加载
│  ├─ httpapi/                       # oapi-codegen 生成桩 + handler 适配 (DTO↔domain)
│  │   ├─ gen/                       #   生成代码（types_gen.go, server_gen.go）
│  │   └─ middleware/                #   recover/requestID/serviceAuth/userCtx/metrics
│  ├─ domain/                        # 纯领域：实体、状态机表、SLA 计算、可见性规则、错误码
│  ├─ ticket/        (CORE-A1)       # 建单/查询/详情/更新/watcher/csat
│  ├─ transition/    (CORE-A1)       # 状态机执行 + history
│  ├─ assignment/    (CORE-A2)       # 分派/改派/升级/规则自动分派
│  ├─ sla/           (CORE-A3)       # SlaEngine：start/pause/resume/recalc + 扫描器(warning/breached)
│  ├─ comment/       (CORE-B1)       # 评论/内部备注/可见性过滤/@提及/触发 user_reply
│  ├─ attachment/    (CORE-B2)       # 元数据 + OSS 预签名 + 下载授权
│  ├─ timeline/      (CORE-B3)       # 时间线追加/查询（被各服务复用）
│  ├─ link/          (CORE-B4)       # 关联/合并
│  ├─ config/        (CORE-C)        # taxonomy / sla 策略 / 用户角色 目录
│  ├─ repository/                    # pgx+sqlc 实现各 domain port；Tx 管理
│  │   └─ queries/*.sql              #   sqlc 源
│  ├─ events/                        # 事件信封、outbox 写入端口、relay(→NATS)、consumer
│  ├─ objstore/                      # S3/MinIO 客户端、预签名
│  └─ platform/                      # db pool、nats conn、logger(slog)、otel、健康检查
├─ migrations/                       # golang-migrate up/down
└─ test/                             # testcontainers 集成测试
```

### 5.1 组件职责与负责人（对齐架构 §11.1）

| 组件包 | 任务 | 负责人 | 职责 |
|---|---|---|---|
| `config`,`platform`,`httpapi/middleware`,`events`(outbox/relay/consumer),`repository`(Tx 框架),`migrations` 0001/0002/0004 | **CORE-0 骨架** | 石磊 | 脚手架、DB schema/迁移、事件发布客户端(outbox+relay)、配置、健康检查/指标；集成层与契约对齐 |
| `ticket`,`transition`,`domain`(状态机) | CORE-A1 | 陈川 | 建单/八态流转/非法跃迁拒绝/幂等/查询详情更新 |
| `assignment` | CORE-A2 | 陈川 | 分派/改派/规则自动分派/升级 |
| `sla` | CORE-A3 | 陈川 | SLA 计时引擎：启动/暂停/恢复/预警/超时事件 |
| `comment` | CORE-B1 | 连城 | 评论/内部备注（接口层可见性过滤）+ @提及 |
| `attachment`,`objstore` | CORE-B2 | 连城 | 附件元数据 + OSS 集成 + 下载授权 |
| `ticket`(list/filter),`timeline` | CORE-B3 | 连城 | 查询/列表/过滤/分页 + 时间线/审计 |
| `link` | CORE-B4 | 连城 | 关联/合并 |
| `config` + 0005_seed | CORE-C | 石磊 / 陈川分担 | taxonomy 树 + SLA 策略 + 用户/角色目录 |

> **集成与契约对齐**由石磊把守：模块 A（陈川）/模块 B（连城）通过 `domain` 端口与 `repository`/`events` 协作，避免直接互相 import；跨模块拼装（如 `TicketDetail` 聚合 sla+suggestion+links）在 `ticket` 包按只读端口组合。

---

## 6. 横切关注点

### 6.1 事务与一致性
- 核心写用例在单 pgx 事务内完成「业务表 + timeline + outbox」三写；`ticket.created` 等事件**不在事务里直接发 NATS**，而是写 `outbox_events`，由 relay 异步投递（事务性发件箱）——避免「库提交成功但消息丢失/发了但库回滚」。

### 6.2 幂等
- 写操作读 `Idempotency-Key` 头：命中 `idempotency_keys`（org_id+key）且 `request_hash` 一致 → 返回首次响应；不一致 → 409。状态流转/分派强制幂等（US-2.2 AC4）。

### 6.3 事件（架构 §5）
- 信封：`{event_id, event_type, occurred_at, org_id, ticket_id, actor_id, version, payload}`；subject `smartdesk.<domain>.<event>`；Stream `SMARTDESK_EVENTS`。
- relay：`FOR UPDATE SKIP LOCKED` 取未发事件 → publish → 置 `published_at`；多副本安全、至少一次。
- consumer：JetStream 持久消费者，按 `event_id` 去重（`processed_events`），仅订阅 `insight.classification_suggested`。
- 按 `ticket_id` 保单工单有序。

### 6.4 可见性 / 领域级授权（纵深防御）
- `serviceAuth` 校验 service-jwt 签名 + `aud=core`；`X-User-Id/Roles/Org-Id` 注入 context。
- 规则集中在 `domain`：requester 仅见本人工单与 public 评论（internal 接口层过滤）；附件下载越权 403；本组范围由 `group_id`/scope 过滤。**这是 core 的纵深防御，非重复鉴权**（鉴权在 gateway 收口）。

### 6.5 可观测性（架构 §9）
- `slog` 结构化 JSON，统一 `trace_id/request_id/org_id/actor_id`；审计走 timeline（不可篡改）。
- `/metrics`：接口 P95/P99、SLA 计时准确性、outbox lag、事件消费 lag。
- OTel trace 透传 `X-Request-Id`；`/healthz`、`/readyz`（DB+NATS）。

---

## 7. 任务分解与里程碑

> 颗粒度对齐架构 §11.1 的 CORE-* 与 §11.2 里程碑。**契约冻结前所有开发 Issue 置 blocked**，冻结后由石磊解阻塞并路由。

### 7.1 任务清单（建议拆为子 Issue）

| ID | 任务 | 负责人 | 依赖 | 里程碑 | 主要交付 |
|---|---|---|---|---|---|
| CORE-0a | 服务脚手架（config/platform/logger/健康检查/指标/HTTP 装配 + oapi-codegen 接入） | 石磊 | 契约冻结 | M2 | 可启动空服务，`/healthz`、`/readyz`、契约桩生成 |
| CORE-0b | DB schema + 迁移 0001/0002/0004（含 outbox/idempotency/processed） | 石磊 | — | M2 | `migrations/` + sqlc 生成基线 |
| CORE-0c | 事件骨架：outbox 写入端口 + relay + JetStream consumer | 石磊 | 0b、NATS 就绪 | M2 | `ticket.created` 可投递、消费去重 |
| CORE-A1 | 工单状态机：建单/八态流转/非法跃迁 409/幂等 + 查询详情更新 | 陈川 | 0a/0b/0c | M2 | `/tickets` POST/GET/{id} GET/PATCH、`/transitions` |
| CORE-A2 | 分派/改派/规则自动分派/升级 | 陈川 | A1 | M2 | `/tickets/{id}/assignments` |
| CORE-A3 | SLA 引擎：启动/暂停/恢复/重算 + 扫描器（warning/breached 事件） | 陈川 | A1 | M2 | `/tickets/{id}/sla` + 后台扫描 |
| CORE-B1 | 评论/内部备注（可见性过滤）+ @提及 + user_reply 自动流转 | 连城 | A1 | M2 | `/tickets/{id}/comments` GET/POST |
| CORE-B3 | 查询/列表/过滤/分页 + 时间线/审计 | 连城 | A1 | M2 | `/tickets` 过滤增强、`/timeline` |
| CORE-C | 配置：taxonomy 树 + SLA 策略 + 用户/角色目录 + 0005_seed | 石磊/陈川 | 0b | M2 | `/config/*` 全量 |
| CORE-B2 | 附件元数据 + OSS 集成 + 下载授权（预签名 ≤20MB/白名单） | 连城 | A1、OSS 就绪 | M2/M3 | `/attachments`、`/download-url` |
| CORE-B4 | 关联/合并 | 连城 | A1 | M3 | `/tickets/{id}/links` |
| CORE-D1 | watchers / csat | 连城 | A1 | M2/M3 | `/watchers`、`/csat` |
| CORE-D2 | 异步写回消费：`insight.classification_suggested`→建议态（OQ-4 阈值） | 石磊 | 0c | M3 | suggestion 落库 + 自动填充开关 |
| CORE-D3 | 集成与契约一致性：`api-contract-check` 接 CI、跨模块联调、性能基线 | 石磊 | A/B/C | M2/M4 | CI 绿、P95<500ms 验证 |

### 7.2 里程碑映射（架构 §11.2）

- **M2 MVP**（提单→处理→关闭闭环）：CORE-0(a/b/c) + A1 + A2 + B1 + B3 + C（+ B2 上传/下载、D1）。core 必须就绪以支撑 GW-3 聚合与 WEB-1/2，并产出 `ticket.created` 供 INS-1/6 通知。
- **M3 智能增强**：CORE-D2（消费分类建议写回）、B4 合并、B2 完善、`suggestion` 暴露给 `TicketDetail`，配合 INS-2/3/4。
- **M4 加固/发布**：CORE-D3 性能/安全加固、越权用例红线（武安）、OQ-10 软删除/审计/导出预留闭环。

### 7.3 验收门禁（组织 §11 / 架构 §7）
- 本域代码由石磊审视合入（in_review→done）。
- 关键代码（**DB 迁移、契约变更、跨服务集成、SLA/状态机核心、安全相关**）须发起集体检视（≥2 名开发、累计 ≥3 分，含 committer 1 分）后合入。
- 越权/状态机/幂等用例为必过红线（功能测试 + 安全测试）。

---

## 8. 依赖关系说明

### 8.1 任务级依赖（DAG）

```
契约冻结
   └─▶ CORE-0a 脚手架 ─┬─▶ CORE-A1 状态机 ─┬─▶ A2 分派
                       │                    ├─▶ A3 SLA
   CORE-0b schema ─────┤                    ├─▶ B1 评论(→含 user_reply)
   CORE-0c 事件骨架 ───┘                    ├─▶ B3 查询/时间线
                                            ├─▶ B2 附件   ├─▶ B4 合并
                                            └─▶ D1 watcher/csat
   CORE-0b ─▶ CORE-C 配置(分类/SLA策略/用户角色) ──(SLA 策略)──▶ A3 计时取策略
   CORE-0c ─▶ CORE-D2 写回消费
   全部 ─▶ CORE-D3 集成/契约校验/性能
```

### 8.2 跨服务/外部依赖

| 依赖 | 类型 | 说明 / 阻塞点 |
|---|---|---|
| **契约冻结**（梁栋/CTO/人类） | 前置门禁 | 架构 §12：冻结前不得编码；core 详设可在框架内并行准备 |
| `openapi/core.yaml` | 契约 | 接口唯一事实源；变更经梁栋批准、秦诺校验 |
| **gateway**（GW-5） | 上游调用方 | service-jwt 签发 + mTLS + 透传 `X-User-*`；core 只信任 gateway。GW-3 聚合 BFF 依赖 core 契约就绪 |
| **insight**（INS-1/2/3） | 事件对端 | core 发 `ticket.*` 供 insight 消费；core 消费 `insight.classification_suggested`。**core 事件 schema（§5）是 insight 消费前置** |
| **PostgreSQL** | 存储 | core OLTP 独享库；迁移用 golang-migrate |
| **NATS JetStream** | 事件总线 | Stream `SMARTDESK_EVENTS`；不可用时 outbox 兜底，主流程不阻塞 |
| **对象存储 S3/MinIO** | 附件 | CORE-B2 预签名上传/下载；不可用仅影响附件，不阻塞建单 |
| 技能 `db-migration`/`api-contract-check`/`service-scaffold` | 工具 | 生成迁移、校验契约一致、脚手架 |

### 8.3 降级与解耦保证（架构 §8）
- insight / NATS / OSS 任一不可用，**建单/流转/评论/查询主流程不受影响**：事件先入 outbox 待补投；建议为空、附件功能局部降级。这是 core 对外的核心可靠性承诺（US-2.1 AC4 / NFR）。

---

## 9. 开放事项与风险

| 项 | 说明 | 处置 |
|---|---|---|
| SLA "工作日(bd)"换算 | P2/P3/P4 含「1bd/3bd/5bd」，是否引入工作日历（节假日/工时窗口）影响 due 计算 | 一期按固定 8h/日折算为分钟入种子；工作日历作为 M3 可配增强，**契约不变**（`response_minutes/resolve_minutes` 已是整数分钟） |
| 流水号 `number` 生成 | 多副本下 org 内唯一且连续 | 用 `sequences` 或 `INSERT ... ON CONFLICT` + 行锁；避免应用层竞态 |
| `q` 中文全文检索 | PG `simple` 分词对中文较弱 | 一期可用 `pg_trgm`/`zhparser`（部署期定），契约 `q` 不绑实现（OQ-5 前向兼容） |
| 自动填充阈值（OQ-4） | confidence≥0.85 且开关开启才自动改分类/优先级 | 阈值与开关入 config，默认仅建议态 |
| reopen 7 天窗口（OQ-13） | 窗口期可配 | core 状态机校验 `now - closed_at ≤ 7d`，窗口入 config |
| OQ-10 合规 | 软删除/审计不可篡改/导出删除接口 | 表已留 `deleted_at`；导出/删除接口 M4 前补，法务闭环不阻塞 M1/M2 |

> 设计争议：编码类争议由后端 Leader（石磊）裁剪；契约/跨服务分歧交架构（梁栋），跨域合入分歧由 Committer 委员会裁定；触及人类决策先提交人类。
