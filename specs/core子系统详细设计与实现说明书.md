# smartdesk-core 子系统详细设计与实现说明书

> 版本：v2.0（由系统详设 v1.0 向下派生）　|　日期：2026-06-14
> 编制：石磊（后端核心负责人 / 后端域 committer / Committer 委员会召集人）
> **派生自（唯一事实源）**：[`SmartDesk系统详细设计与实现说明书.md`](SmartDesk系统详细设计与实现说明书.md)（v1.0 已冻结 main@6eaf281）—— §2.2 服务边界、§3 配置归属、§4 数据模型、§6 事件、§9 降级、§12 模块/里程碑、§13 D1–D5。
> **接口唯一事实源**：[`src/openapi/core.yaml`](../src/openapi/core.yaml)（OpenAPI 3.1）。
>
> **定位**：本文是 smartdesk-core 服务的实现级详细设计，由系统详设 v1.0 **自顶向下派生**（非各模块自下而上合并）。在系统详设框架内细化 core 的内部架构、本模块归属的 DB schema、逐 path 的契约实现要点、组件划分、任务分解与里程碑、依赖关系。
> **边界纪律**：不扩权（职责严格取自系统详设 §2.2）、不破契约（接口以 core.yaml 为准，变更经梁栋批准、秦诺校验）。本文相对系统详设的任何改动均记入 §0 修订记录；与系统详设的冲突一律上交架构团队裁决，见 §9 标红开放项。
>
> **取代说明**：本文取代 v1.0-draft（其上游为旧《系统架构设计说明书》、自下而上口径、并自创 CORE-D 系列任务 ID）。v1.0-draft 与系统详设 v1.0 的差异已在 §0 逐条说明。

---

## 0. 修订记录（相对系统详设 v1.0 的偏差与理由）

> 派生原则：能不改就不改。下列每条均为「实现层细化」或「事实源内部口径对齐」，**无一处突破系统详设的边界/数据模型/契约/事件语义**。曾需架构裁决的事项（O1–O6）已于 2026-06-14 由梁栋定论，见 §9 裁决记录。

| # | 相对系统详设的改动 | 性质 | 为何改 / 依据 |
|---|---|---|---|
| R1 | 上游事实源由旧《系统架构设计说明书》切换为**系统详设 v1.0** | 口径对齐 | 系统详设 §0 已固化层级：系统详设为「系统级详设唯一事实源」，架构说明书重叠明细以系统详设为准。本文据此重锚。 |
| R2 | 任务 ID 全部回归系统详设 §12.1 的 **CORE-0/A1/A2/A3/B1/B2/B3/B4/C**，废止 v1.0-draft 自创的 CORE-D1/D2/D3 | 口径对齐 | v1.0-draft 把 watchers/csat、异步写回消费、集成校验另立 D 系列，与系统详设 §12.1 ID 不一致。本文把这些工作**并入既有 ID**（见 §7.1 归并表），不新增 ID。watchers/csat、写回消费、集成校验在 §12.1 的归属系统详设未显式点名 → 见 §9 O1（需架构确认）。 |
| R3 | 引入**事务性发件箱(outbox)** 模式投递事件，新增实现表 `outbox_events`、`idempotency_keys` | 实现细化 | 系统详设 §4.2 未枚举这两张表，§6.1 明确「事件 schema 与总线实现解耦」。outbox 是为兑现「落库与发事件原子、至少一次、降级不丢」(§9) 的实现手段，不改事件信封/主题/清单，不进契约。属 core 内部实现自由度。 |
| R4 | 状态机 action 名以 **core.yaml enum 为准**（`close`/`wait_user`/`resume` 单一化），而非系统详设 §4.3 示意图的 `confirm`/`wait`/`resume`(复用) 措辞 | 事实源内部对齐 | 系统详设 §0/§5 明定「接口唯一事实源 = OpenAPI」。core.yaml `/transitions` 已由梁栋裁决 `resume` 仅 `suspended→in_progress`、`pending_user→in_progress` 走系统 `user_reply` 或坐席 `start`。这是**示意图 vs 契约的措辞差异，非语义冲突**；建议系统详设 §4.3 示意图回填同步措辞 → 见 §9 O2（已知不一致，交架构）。 |
| R5 | M2/M3/M4 排期：core **M2 = 0/A1/A2/A3/B1/B2/B3/C**，B4/写回消费归 **M3** | 口径对齐 | O3 架构裁决（梁栋，2026-06-14）：SLA(A3)/附件(B2) 属 MVP 闭环（PRD §3.1/US-2.5/US-2.7），系统详设 §12.2 已回填补齐；B4/写回消费归 M3。原 R5「排在 M2 之后」的遗留疑点已消解 → 见 §9 裁决记录 O3。 |
| R6 | 明确 core 技术栈（Go 1.22+/chi/oapi-codegen/pgx+sqlc/golang-migrate/nats.go/slog/OTel） | 实现细化 | 系统详设 §2.2 仅定 core=Go。具体库为 core 团队实现决策，不影响任何对外约定。 |
| R7 | 合入前收尾：O1–O6 转为「已裁决」、应用 PR #27（系统详设 §4.3/§12 + `core.yaml` 1.0.0 冻结）、`internal/config`(envconfig) 改名 `internal/appconfig`、`roles` 全局枚举说明 | 评审收口 | 落实架构（梁栋）与资料团队（文澜）评审意见：§9 转裁决记录、§7/§8 里程碑与版本回填（O3/O5）、m1 Go 包冲突、m2 roles org_id 例外说明。无破边界/破契约。 |

---

## 目录
1. [范围与职责边界](#1-范围与职责边界)
2. [模块架构与分层](#2-模块架构与分层)
3. [数据/存储（core 归属部分）](#3-数据存储core-归属部分)
4. [API/契约对齐（逐 path 对照 core.yaml）](#4-api契约对齐逐-path-对照-coreyaml)
5. [跨服务交互（事件/同步调用/降级）](#5-跨服务交互事件同步调用降级)
6. [内部组件划分](#6-内部组件划分)
7. [任务分解与里程碑](#7-任务分解与里程碑)
8. [依赖与阻塞](#8-依赖与阻塞)
9. [开放事项（须交架构裁决，标红）](#9-开放事项须交架构裁决标红)

---

## 1. 范围与职责边界

> 严格引用系统详设 §2.2 服务边界表与 §3 配置归属，**不得扩权**。

### 1.1 职责（系统详设 §2.2，core 行）

core **负责**：工单 CRUD/状态机/分派/评论备注/附件元数据/关联合并/SLA 计时/时间线审计；**权威配置**：分类树（taxonomy）、SLA 策略、用户与角色目录；发布领域事件；消费 insight 的 `insight.classification_suggested` 异步写回（落「建议态」）。

core **不负责**（系统详设 §2.2「不负责」列，红线）：① 不发通知（insight）；② 不做 AI 计算（insight）；③ 不直面浏览器（仅经 gateway，仅监听内网）；④ 不持认证凭证/会话/令牌、不二次鉴权用户身份（gateway 收口）。

**关键边界规则**（系统详设 §2.2 末）：后端仅监听内网、外部不可达；insight 永远「只建议」，工单权威状态只在 core。

### 1.2 配置数据归属（系统详设 §3，core 持有部分）

| 配置 | 归属 | core 实现位置 |
|---|---|---|
| 分类体系 taxonomy 树 | **core**（强一致，驱动建单/分派/校验） | `config` 包 + `categories` 表 |
| SLA 策略（优先级→时限，可配/可暂停语义） | **core**（策略与执行同归，SLA 计时在 core） | `config`+`sla` 包 + `sla_policies`/`sla_policy_targets` |
| 用户/角色/权限**主数据**（角色目录） | **core**（业务主数据）；凭证/会话/令牌在 gateway | `config` 包 + `users`/`roles`/`user_roles`；core 仅存 `credential_ref` |
| 通知策略 | **insight**（不归 core） | —（core 不实现） |

### 1.3 设计原则（贯穿，对齐系统详设 §1 + 宪法）

- **契约先行**：对外接口以 core.yaml 为准；`oapi-codegen` 生成类型/路由桩，CI 跑 `api-contract-check` 阻止漂移。
- **领域级纵深防御**：鉴权在 gateway 收口；core 信任 `serviceAuth`(service-jwt, aud=core) 中已验签的 `sub/roles/org_id` claims，**仅做数据可见性过滤**（内部备注、本组范围、附件越权），不重做用户认证（系统详设 §7/§8）。
- **事务一致 + 事件最终一致**：核心写在单 PG 事务内落「业务表 + timeline + outbox」；事件经事务性发件箱投递 NATS（R3），保证落库与发事件原子、至少一次、可重放、降级不丢。
- **幂等可审计**：写操作支持 `Idempotency-Key`；时间线只追加、不暴露 update/delete。
- **多租户预留（OQ-7）**：全表 `org_id NOT NULL DEFAULT 'default'`，索引/外键带 `org_id`；一期不实现隔离逻辑（系统详设 §4.1）。

---

## 2. 模块架构与分层

### 2.1 六边形（端口-适配器）分层

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

依赖方向：入站 → 应用/领域 → 出站端口（接口），适配器实现端口。领域层不 import 框架/驱动，便于单测 mock 端口。

### 2.2 建单请求处理链（落地系统详设 §9 主流程 step 2）

```
POST /v1/tickets  (Idempotency-Key)
 1. recover → requestID(透传 X-Request-Id) → serviceAuth(校验 service-jwt 签名 + aud=core)
 2. userCtx：解析 X-User-Id / X-User-Roles / X-Org-Id 注入 context
 3. handler 桩 → TicketCreate DTO 校验（title≤200、description 必填）
 4. TicketService.Create 单事务：
      a. 幂等检查（idempotency_keys 命中 → 返回首次结果）
      b. 生成 number（org 内流水 SD-2026-000123）+ 落 tickets(status=new)
      c. SlaEngine.Start：按 priority 选 sla_policy_targets，落 sla_timers
      d. TimelineService.Append(ticket_created)
      e. Outbox.Enqueue(ticket.created)            ← 与上同一事务
      f. commit
 5. 返回 201 Ticket（不等待 AI；分类/定级为后续异步写回 —— 降级红线，系统详设 §9 step2★）
 6. 后台 Outbox Relay 异步发 ticket.created → NATS → insight 消费
```

### 2.3 部署形态

- 单可执行文件 `smartdesk-core`，内置 HTTP server + outbox relay + JetStream consumer（同进程 goroutine，可经配置拆分独立进程）。
- 仅监听内网端口（系统详设 §2.2/§7：外部不可达）；`/healthz`(liveness)、`/readyz`(readiness，探测 DB+NATS)。
- 无状态、可水平扩；流水号生成与 outbox relay 用 `FOR UPDATE SKIP LOCKED` 保证多副本安全。

---

## 3. 数据/存储（core 归属部分）

> 仅本模块归属。约定（系统详设 §4）：snake_case；主键 UUID v7（应用层生成）；全业务表含 `org_id NOT NULL DEFAULT 'default'`、`created_at`、`updated_at`；可软删表加 `deleted_at`；时间 `timestamptz`(UTC)；时长用整数分钟/秒。迁移 `migrations/NNNN_<name>.{up,down}.sql`（`db-migration` 技能生成执行）。

### 3.1 实体清单（对照系统详设 §4.2 core OLTP）

系统详设 §4.2 列举的 core OLTP 实体本文全部覆盖：`users / roles / user_roles`、`categories`、`sla_policies / sla_policy_targets`、`tickets`、`ticket_status_history`、`ticket_timeline`、`assignments`、`comments`、`attachments`、`ticket_links`、`sla_timers`、`watchers`、`csat_ratings`、`processed_events`。

**实现增表（R3，系统详设 §4.2 未枚举）**：`outbox_events`、`idempotency_keys` —— 纯实现支撑，不进契约、不改数据模型事实源。

| 迁移 | 表 | 归属任务 |
|---|---|---|
| 0001_init | `roles, users, user_roles, categories, sla_policies, sla_policy_targets` | CORE-0 / CORE-C |
| 0002_tickets | `tickets, ticket_status_history, ticket_timeline` | CORE-0 / CORE-A1 |
| 0003_workflow | `assignments, comments, attachments, ticket_links, sla_timers, watchers, csat_ratings` | CORE-A/B |
| 0004_infra | `idempotency_keys, outbox_events, processed_events` | CORE-0 |
| 0005_seed | 角色枚举、SLA v1 基线策略、分类初始集 | CORE-C |

### 3.2 关键 DDL（节选）

```sql
-- 角色目录 / RBAC 主数据（凭证不落 core，仅 credential_ref）
-- 注：roles 为**全局固定枚举**（core.yaml RoleCode），故**不含 org_id**——「全业务表含 org_id」
--     约束针对业务实体表，roles/user_roles 作为权限枚举属例外；多租户角色定制留待二期再评估（m2）。
CREATE TABLE roles (
  code TEXT PRIMARY KEY,             -- requester|agent|lead|manager|admin（core.yaml RoleCode，全局枚举）
  name TEXT NOT NULL
);
CREATE TABLE users (
  id            UUID PRIMARY KEY,
  org_id        TEXT NOT NULL DEFAULT 'default',
  username      TEXT NOT NULL,
  email         TEXT,
  display_name  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',  -- active|disabled
  credential_ref TEXT,               -- 指向 gateway 凭证；core 不存密码/哈希（系统详设 §8）
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

-- SLA 策略（策略与执行同归 core，系统详设 §3）
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
  priority         TEXT NOT NULL,    -- P1..P4（core.yaml Priority）
  response_minutes INT NOT NULL,
  resolve_minutes  INT NOT NULL,
  PRIMARY KEY (policy_id, priority)
);

-- 工单主表（八态，系统详设 §4.3）
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
  status       TEXT NOT NULL DEFAULT 'new',  -- new|accepted|in_progress|pending_user|resolved|closed|suspended|cancelled
  source       TEXT NOT NULL DEFAULT 'web',
  reopen_count INT NOT NULL DEFAULT 0,
  closed_at    TIMESTAMPTZ,
  csat_score   SMALLINT,             -- 1..5
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (org_id, number)
);
-- 读路径索引（NFR 列表/详情 P95<500ms，系统详设 §10）
CREATE INDEX idx_tickets_org_status ON tickets(org_id, status);
CREATE INDEX idx_tickets_assignee   ON tickets(org_id, assignee_id);
CREATE INDEX idx_tickets_category   ON tickets(org_id, category_id);
CREATE INDEX idx_tickets_requester  ON tickets(org_id, requester_id);
CREATE INDEX idx_tickets_created    ON tickets(org_id, created_at DESC);
-- q 关键词：一期 PG 全文（中文分词），契约不绑实现（OQ-5 前向兼容）
CREATE INDEX idx_tickets_fts ON tickets USING gin (to_tsvector('simple', coalesce(title,'')||' '||coalesce(description,'')));

CREATE TABLE ticket_status_history (
  id UUID PRIMARY KEY, ticket_id UUID NOT NULL REFERENCES tickets(id),
  from_status TEXT, to_status TEXT NOT NULL, actor_id UUID, reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ticket_timeline (    -- 只追加，正序，审计不可篡改
  id UUID PRIMARY KEY, ticket_id UUID NOT NULL REFERENCES tickets(id),
  event_type TEXT NOT NULL,        -- ticket_created|status_changed|assigned|commented|sla_*|merged...
  actor_id UUID, payload_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_timeline_ticket ON ticket_timeline(ticket_id, created_at);

CREATE TABLE assignments (
  id UUID PRIMARY KEY, ticket_id UUID NOT NULL REFERENCES tickets(id),
  from_user_id UUID, to_user_id UUID, to_group_id UUID,
  kind TEXT NOT NULL,              -- manual|auto|reassign|escalate
  reason TEXT, actor_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assignments_ticket ON assignments(ticket_id, created_at);

CREATE TABLE comments (
  id UUID PRIMARY KEY, ticket_id UUID NOT NULL REFERENCES tickets(id),
  author_id UUID NOT NULL, body TEXT NOT NULL,
  visibility TEXT NOT NULL,        -- public|internal（接口层按角色过滤）
  mentions_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_comments_ticket ON comments(ticket_id, created_at);

CREATE TABLE attachments (
  id UUID PRIMARY KEY, ticket_id UUID NOT NULL REFERENCES tickets(id),
  comment_id UUID REFERENCES comments(id), uploader_id UUID NOT NULL,
  filename TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes BIGINT NOT NULL,
  object_key TEXT NOT NULL, checksum TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ticket_links (
  id UUID PRIMARY KEY, ticket_id UUID NOT NULL REFERENCES tickets(id),
  linked_ticket_id UUID NOT NULL REFERENCES tickets(id),
  relation TEXT NOT NULL,          -- related|duplicate|merged_into
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SLA 计时实例（priority/policy 快照，策略变更不回改历史）
CREATE TABLE sla_timers (
  id UUID PRIMARY KEY, ticket_id UUID NOT NULL REFERENCES tickets(id),
  policy_id UUID NOT NULL, priority TEXT NOT NULL,
  response_due_at TIMESTAMPTZ NOT NULL, resolve_due_at TIMESTAMPTZ NOT NULL,
  response_met BOOLEAN NOT NULL DEFAULT false, resolve_met BOOLEAN NOT NULL DEFAULT false,
  paused BOOLEAN NOT NULL DEFAULT false, paused_at TIMESTAMPTZ,
  paused_total_seconds INT NOT NULL DEFAULT 0, breached BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_sla_timer_ticket ON sla_timers(ticket_id);
CREATE INDEX idx_sla_due ON sla_timers(resolve_due_at) WHERE NOT resolve_met AND NOT paused;

CREATE TABLE watchers (
  ticket_id UUID NOT NULL REFERENCES tickets(id), user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (ticket_id, user_id)
);
CREATE TABLE csat_ratings (
  ticket_id UUID PRIMARY KEY REFERENCES tickets(id), requester_id UUID NOT NULL,
  score SMALLINT NOT NULL,         -- 1..5（OQ-12）
  comment TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 基础设施表（R3 实现增表 + processed_events 系统详设 §6）
CREATE TABLE idempotency_keys (
  org_id TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL,
  response_json JSONB, status_code INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,             -- = event_id（事件信封 event_id）
  subject TEXT NOT NULL,           -- smartdesk.<domain>.<event>
  event_type TEXT NOT NULL, org_id TEXT NOT NULL, ticket_id UUID,
  payload_json JSONB NOT NULL, published_at TIMESTAMPTZ,  -- NULL=待发
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_unpublished ON outbox_events(created_at) WHERE published_at IS NULL;
CREATE TABLE processed_events (    -- 消费幂等（insight.classification_suggested）
  event_id UUID PRIMARY KEY, processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.3 种子数据（0005_seed，CORE-C）

- `roles`：`requester|agent|lead|manager|admin`。
- SLA v1 基线（OQ-1 / core.yaml SlaPolicy 描述）：P1 15m/4h；P2 60m/1bd；P3 240m/3bd；P4 1bd/5bd。「bd（工作日）」一期按固定 8h/日折算为整数分钟入库（工作日历见 §9 O4）。
- `categories` 初始集：IT / 账号权限 / 办公行政 / 人事 / 财务 / 其他（M2 由产品+admin 细化）。

### 3.4 ER 要点

- `tickets` 1—N `comments / attachments / ticket_timeline / assignments / ticket_links / sla_timers / csat_ratings / watchers`。
- `tickets.category_id→categories.id`；`assignee_id/requester_id→users.id`。
- `sla_timers` 快照 `priority/policy_id`，策略变更不回改历史计时。
- insight 读模型独立 schema、只读投影，**不与 core 共享事务**，以事件为唯一同步通道（系统详设 §4.1/§6）。

---

## 4. API/契约对齐（逐 path 对照 core.yaml）

> 路径/schema/状态码全部以 core.yaml 为准，本节只补**实现语义**，不引入契约外字段。全部 `/v1` 前缀，`security: serviceAuth`（`/healthz`、`/readyz` 除外）。错误统一 `Error{code,message,details?,trace_id}`；HTTP 语义：400/401/403/404/409/413/422（系统详设 §5.2）。

### 4.1 逐 path 对照表（core.yaml `paths` 全量）

| core.yaml path / method | 服务 | 实现要点 / 验收锚点 |
|---|---|---|
| `POST /tickets` | TicketService | 事务落库 new→启 SLA→写时间线→outbox `ticket.created`；幂等键；AI 无关降级（US-2.1 AC4 / 系统详设 §9）。201 Ticket |
| `GET /tickets` | TicketService | 过滤 `status/priority/assignee_id/requester_id/group_id/category_id/q/sla_state`+`sort`+分页(`page_size`≤100)；`q` 走 FTS；返回 `TicketPage` |
| `GET /tickets/{id}` | TicketService | `TicketDetail`(含 `sla`/`suggestion`/`links`)；可见性过滤；403/404 |
| `PATCH /tickets/{id}` | TicketService | 改 `title/description/category_id/priority`；**priority 变更触发 SlaEngine.Recalc**；422 业务校验。返回 Ticket |
| `POST /tickets/{id}/transitions` | TransitionService | 状态机表校验，非法跃迁 **409**；写 history+timeline；幂等键；SLA 暂停/恢复联动；action enum 见 §4.2（US-2.2） |
| `POST /tickets/{id}/assignments` | AssignmentService | `kind∈{manual,auto,reassign,escalate}`；写 assignments+timeline→outbox `ticket.assigned`/`ticket.reassigned`；201 Assignment（US-2.3/5.1） |
| `GET /tickets/{id}/comments` | CommentService | **internal 按 service-jwt roles claim 过滤**：requester 不返回 internal（US-2.4 AC2）；分页 `CommentPage` |
| `POST /tickets/{id}/comments` | CommentService | `visibility∈{public,internal}`+`mentions`；写 timeline→outbox `ticket.commented`；requester 回复 public 时内部触发 `user_reply` 流转（见 §4.2）。201 Comment |
| `GET /tickets/{id}/attachments` | AttachmentService | 元数据数组 `Attachment[]` |
| `POST /tickets/{id}/attachments` | AttachmentService | `AttachmentInit`：`size_bytes`≤20MB（超限 **413**）+ 类型白名单（非白名单 **422**）→签发**上传**预签名 `AttachmentUpload`（OQ-9） |
| `GET /attachments/{attId}/download-url` | AttachmentService | 鉴权后签发短时**下载** URL；越权 **403**（US-2.7 AC2）；返回 `AttachmentUpload` |
| `POST /tickets/{id}/links` | LinkService | `relation∈{related,duplicate,merged_into}`；合并：子单 merged_into 主单+状态同步+outbox `ticket.merged`；冲突 **409**（US-2.6）。201 TicketLink |
| `GET /tickets/{id}/sla` | SlaEngine | 返回 `SlaTimer`（response/resolve due、paused、breached）（US-2.5）；404 |
| `GET /tickets/{id}/timeline` | TimelineService | 正序、只读追加、分页 `TimelinePage`（US-2.8） |
| `POST /tickets/{id}/watchers` | TicketService | body `{watch:bool}` 关注/取关；**204**（US-5.3） |
| `POST /tickets/{id}/csat` | TicketService | `CsatCreate{score 1..5, comment?}`；仅 resolved/closed 可评，否则 **409**（OQ-12/US-6.3）。201 |
| `GET /config/categories` | ConfigService | taxonomy 树查询 `Category[]`（OQ-4/US-7.3 AC1） |
| `POST /config/categories` | ConfigService | 新增节点（admin）；201 Category；403 |
| `PATCH /config/categories/{catId}` | ConfigService | 改名/启停/排序/移动父节点；200 Category |
| `DELETE /config/categories/{catId}` | ConfigService | 删除/停用；**被引用 409**；204 |
| `GET /config/sla-policies` | ConfigService | SLA 策略查询 `SlaPolicy[]`（OQ-1/US-7.3 AC2） |
| `PUT /config/sla-policies` | ConfigService | 配置策略（admin，改数值不改契约形态）；200 SlaPolicy |
| `GET /config/users` | ConfigService | 用户目录分页 `UserPage`（RBAC 主数据，US-7.3 AC3） |
| `POST /config/users` | ConfigService | 建用户并授角色（admin）；201 User |
| `PUT /config/users/{userId}/roles` | ConfigService | body `{roles:RoleCode[]}` 设角色（admin，一账号可兼多角色）；200 User |
| `GET /healthz` / `GET /readyz` | platform | liveness / readiness（探测 DB+NATS）；`security:[]` |

> **契约面缺口确认**：core.yaml 当前**无** insight 写回的同步 POST 端点（D1 裁定：纯事件写回，写 `Ticket.suggestion` 字段，不新增 core 端点）。本文 §5 据此实现，不擅自增端点。

### 4.2 状态机（实现自 core.yaml `/transitions` 描述表，R4 已对齐契约口径）

显式映射 `action → from → to`，非法跃迁 **409**，每次写 history+timeline（操作人/时间/前后状态）。终态 `closed`/`cancelled`。**action 名以 core.yaml `TransitionRequest.action` enum 为准**（见 R4 / §9 O2）。

| action | from | to | 触发方 | SLA 联动 |
|---|---|---|---|---|
| `accept` | new | accepted | 坐席 | response_met 判定 |
| `start` | accepted, pending_user | in_progress | 坐席 | pending_user→in_progress 的手工恢复路径，**SLA 恢复顺延** |
| `wait_user` | in_progress | pending_user | 坐席 | **SLA 暂停**（paused=true, paused_at=now） |
| `user_reply`（系统自动，非客户端 action） | pending_user | in_progress | 系统 | 报单人回复 public 评论时由 CommentService 内部触发 TransitionService（US-2.2 AC2），**SLA 恢复** |
| `resolve` | in_progress | resolved | 坐席 | resolve_met 判定；outbox `ticket.resolved` |
| `close` | resolved | closed | 报单人/坐席 | 终态，写 closed_at；pending_user 超时仅提醒不自动关（OQ-8） |
| `reopen` | closed | in_progress | 报单人 | **仅 closed 后 7 天内**（OQ-13），reopen_count+1 |
| `suspend` | in_progress | suspended | 坐席/lead | 内部挂起（区别于待用户） |
| `resume` | suspended | in_progress | 坐席/lead | **仅**解挂起；不承担 pending_user 恢复 |
| `cancel` | new, accepted, in_progress, pending_user, suspended | cancelled | 坐席/lead | 终态 |

> 梁栋裁决（已固化进 core.yaml）：`resume` 语义单一化（仅 `suspended→in_progress`）；`pending_user→in_progress` 走系统 `user_reply` 或坐席 `start`，**不复用 resume**；enum 不变。系统详设 §4.3 示意图措辞（`confirm`/`wait`/复用 `resume`）建议回填同步 → §9 O2。

---

## 5. 跨服务交互（事件/同步调用/降级）

### 5.1 服务间信任（系统详设 §7）

- 入站：仅信任 gateway 的 `serviceAuth`(service-jwt，校验签名 + `aud=core`)，mTLS 通道；解析透传头 `X-User-Id/X-User-Roles/X-Org-Id/X-Request-Id`。
- core **不二次鉴权用户身份**，但用 `X-User-*` 做领域级数据过滤（内部备注、本组范围、附件越权）——纵深防御。
- `X-Request-Id`/`trace_id` 全链路透传，落日志与时间线。

### 5.2 事件发布（系统详设 §6，作为发布者）

- 信封：`{event_id, event_type, occurred_at, org_id, ticket_id, actor_id, version, payload}`；主题 `smartdesk.<domain>.<event>`；Stream `SMARTDESK_EVENTS`。
- **outbox relay**（R3）：单事务写 `outbox_events`；relay 以 `FOR UPDATE SKIP LOCKED` 取未发事件→publish→置 `published_at`，多副本安全、至少一次。
- core 发布的事件（系统详设 §6.3）：`ticket.created`、`ticket.assigned`/`ticket.reassigned`、`ticket.status_changed`、`ticket.commented`、`ticket.sla_warning`/`ticket.sla_breached`、`ticket.resolved`/`ticket.closed`/`ticket.reopened`、`ticket.merged`。
- 顺序（D3）：按 `ticket_id` 一致性哈希分区，单工单按 `occurred_at` 有序；跨工单不保证全局序。

### 5.3 异步写回消费（系统详设 §6.3 / D1，作为消费者）

- 订阅 `insight.classification_suggested`（JetStream 持久消费者），按 `event_id` 去重（`processed_events`）。
- 落 `TicketDetail.suggestion`（建议态）。一期**不自动改**分类/优先级；**仅当 confidence≥0.85 且开启自动填充开关**时填充（OQ-4，开关入 config，`ClassificationSuggestion.applied=true`）。
- **守红线**：不开 core 同步写回端点（D1-B），契约面最小，AI 异步写回不阻塞主流程。
- 人工采纳/纠偏（D1 路径3）：gateway `POST /tickets/{id}/suggestion` → core 走工单分类更新路径（即 `PATCH /tickets/{id}` 的 category/priority），属人触发同步动作，非 AI 写回。

### 5.4 降级（系统详设 §9）

insight / NATS / 对象存储任一不可用，**建单/流转/评论/查询主流程不受影响**：事件先入 outbox 待补投；`suggestion` 为空、相似/附件功能局部降级。这是 core 对外的核心可靠性承诺（US-2.1 AC4 / SC-002）。

---

## 6. 内部组件划分

> 对应系统详设 §12.1 的 CORE-* 到代码包。Go 包布局：

```
smartdesk-core/
├─ cmd/smartdesk-core/main.go        # 装配：appconfig→db→nats→server→relay→consumer
├─ internal/
│  ├─ appconfig/                     # 环境/启动配置加载（envconfig）              (CORE-0)
│  ├─ httpapi/
│  │   ├─ gen/                       # oapi-codegen 生成（types/server）           (CORE-0)
│  │   └─ middleware/                # recover/requestID/serviceAuth/userCtx/metrics(CORE-0)
│  ├─ domain/                        # 纯领域：实体/状态机表/SLA 计算/可见性/错误码
│  ├─ ticket/        (CORE-A1)       # 建单/查询/详情/更新 + watcher/csat（见 R2）
│  ├─ transition/    (CORE-A1)       # 状态机执行 + history
│  ├─ assignment/    (CORE-A2)       # 分派/改派/升级/规则自动分派
│  ├─ sla/           (CORE-A3)       # SlaEngine：start/pause/resume/recalc + 扫描器
│  ├─ comment/       (CORE-B1)       # 评论/内部备注/可见性过滤/@提及/触发 user_reply
│  ├─ attachment/    (CORE-B2)       # 元数据 + OSS 预签名 + 下载授权
│  ├─ link/          (CORE-B4)       # 关联/合并
│  ├─ timeline/      (CORE-B3)       # 时间线追加/查询 + 列表/过滤（与 ticket 协作）
│  ├─ config/        (CORE-C)        # taxonomy / sla 策略 / 用户角色 目录
│  ├─ repository/    (CORE-0)        # pgx+sqlc 实现各 domain port；Tx 管理；queries/*.sql
│  ├─ events/        (CORE-0)        # 事件信封/outbox 写入/relay(→NATS)/consumer
│  ├─ objstore/      (CORE-B2)       # S3/MinIO 客户端、预签名
│  └─ platform/      (CORE-0)        # db pool/nats conn/slog/otel/健康检查
├─ migrations/                       # golang-migrate up/down                       (CORE-0)
└─ test/                             # testcontainers 集成测试
```

**集成纪律**（石磊把守）：模块 A（陈川）/模块 B（连城）通过 `domain` 端口与 `repository`/`events` 协作，不直接互相 import；跨模块拼装（如 `TicketDetail` 聚合 sla+suggestion+links）在 `ticket` 包按只读端口组合。

### 6.1 横切关注点

- **事务**：核心写在单 pgx 事务内三写「业务表 + timeline + outbox」；事件不在事务内直发 NATS（R3）。
- **幂等**：写操作读 `Idempotency-Key`；命中 `idempotency_keys`(org_id+key) 且 `request_hash` 一致→返回首次响应，不一致→409。
- **可见性/领域授权**：规则集中在 `domain`；requester 仅见本人工单与 public 评论；附件下载越权 403；本组范围按 `group_id`/scope。
- **可观测性**（系统详设 §10）：`slog` 结构化 JSON（统一 `trace_id/request_id/org_id/actor_id`）；`/metrics`（P95/P99、SLA 计时准确性、outbox lag、消费 lag）；OTel trace；`/healthz`、`/readyz`。

### 6.2 SUP-267 协作能力实现状态（2026-06-17）

| 范围 | 状态 | 代码/测试锚点 | 说明 |
|---|---|---|---|
| 评论/内部备注 | done | `src/smartdesk-core/internal/httpapi/collaboration.go`、`src/smartdesk-core/internal/httpapi/server_test.go`、`src/smartdesk-core/internal/store/postgres_sla.go` | `GET/POST /tickets/{id}/comments` 已实现；requester 看不到 internal；requester public 回复 `pending_user` 工单会触发 `user_reply` 并通过 `PutSla` 持久化 SLA 恢复。 |
| 附件元数据/下载授权 | done | `src/smartdesk-core/internal/httpapi/attachments.go`、`src/smartdesk-core/internal/httpapi/attachment_test.go`、`src/smartdesk-core/migrations/0003_attachments.sql` | `GET/POST /tickets/{id}/attachments`、`GET /attachments/{attId}/download-url` 已实现；覆盖 20MB 超限 413、非白名单 422、跨 org 下载 403、`comment_id` 必须属于同一工单；Postgres 组合外键兜底。 |
| 查询/筛选/分页 | partial/gap | `src/smartdesk-core/internal/httpapi/ticket_handlers.go`、`src/smartdesk-core/internal/store/{memory,postgres}.go` | 已支持 status/priority/assignee_id/requester_id/group_id/category_id/q/sort/page/page_size 与 org scope；缺 `sla_state` 过滤，Postgres `q` 仍为 `LIKE`，未达到设计里的 FTS；`page_size>100` 目前被截断到 100，尚未按契约明确返回 400/422；`sort=-created_at` 依赖默认排序，尚未显式分支。 |
| OSS 预签名 | gap | `src/smartdesk-core/internal/httpapi/attachments.go` | 当前为 core 内置短时 URL 形态，尚未接 `internal/objstore` 的 S3/MinIO SDK、bucket/endpoint 配置与真实签名。 |
| requester 工单范围过滤 | gap（H-3） | `src/smartdesk-core/internal/httpapi/server.go` | 详设要求 requester 仅见本人工单；当前实现按 org scope 过滤，requester 与坐席在同 org 下的详情/列表授权未区分。已转 [SUP-285](mention://issue/1af7a39e-3ce7-4003-9bda-a05c8bbbd503) H-3 requester 领域授权 gap，不阻塞 SUP-267 代码侧合入。 |

---

## 7. 任务分解与里程碑

> 任务 ID 对齐系统详设 §12.1，里程碑对齐 §12.2（R2/R5）。**契约冻结前所有开发 Issue 置 blocked**，冻结后由石磊解阻塞并路由。

### 7.0 实现状态快照（SUP-266，2026-06-17）

本节同步 P4 查漏补缺结论；逐项清单见 [`specs/core/lifecycle-done-gap-drift.md`](core/lifecycle-done-gap-drift.md)。

当前 `src/smartdesk-core/` 已形成轻量 MVP：`net/http` 路由 + `domain` 领域规则 + `store` 内存/Postgres 双实现，覆盖建单、列表/详情/更新、状态机、分派、评论触发 `user_reply`、SLA 启动/暂停/恢复/查询、配置种子与 service-jwt claims 身份收口。状态机非法流转返回 409，`resume` 仅用于 `suspended→in_progress`，`pending_user→in_progress` 走坐席 `start` 或系统 `user_reply`。

仍未闭环的生命周期关键项：Idempotency-Key 未保存 request hash 且不同请求体不返回 409；未落 `ticket_status_history`；SLA warning/breached 后台扫描、超时升级与 outbox/NATS 投递未实现；自动分派规则仍是占位；`oapi-codegen`/`api-contract-check` 未接入。上述项涉及 schema、store、事件与调度边界，按关键代码门禁应拆分后续实现并集体检视。

需架构/资料裁决的漂移：当前 OpenAPI 为 `1.1.0`，身份来源已从旧 `X-User-* / X-Org-Id` 明文头改为 gateway 签发的 service-jwt claims；本文和 `specs/core/tasks.md` 仍有 `1.0.0/1.0.1` 与旧透传头表述，应以契约和现代码为准刷新，或明确要求代码回退。

### 7.1 任务清单（CORE-* 归并，废止 D 系列）

| ID（系统详设 §12.1） | 任务 | 负责人 | 依赖 | 里程碑（§12.2） | 主要交付 |
|---|---|---|---|---|---|
| **CORE-0** | 骨架：schema/迁移(0001/0002/0004)、事件客户端(outbox+relay+consumer)、健康检查/指标、appconfig/platform/middleware、oapi-codegen 接入 | 石磊 | 契约冻结 | M2 | 可启动空服务，`/healthz`/`/readyz`，契约桩，`ticket.created` 可投递+消费去重 |
| **CORE-A1** | 状态机：建单/八态流转/非法跃迁 409/幂等 + 查询详情更新；**+ watcher/csat**（R2 归并） | 陈川 | CORE-0 | M2 | `/tickets` POST/GET/{id} GET/PATCH、`/transitions`、`/watchers`、`/csat` |
| **CORE-A2** | 分派/改派/规则自动分派/升级 | 陈川 | A1 | M2 | `/tickets/{id}/assignments` |
| **CORE-A3** | SLA 引擎：启动/暂停/恢复/重算 + 扫描器（warning/breached 事件） | 陈川 | A1、CORE-C(策略) | **M2**（O3 裁决） | `/tickets/{id}/sla` + 后台扫描 |
| **CORE-B1** | 评论/内部备注（可见性过滤）+ @提及 + user_reply 自动流转 | 连城 | A1 | M2 | `/tickets/{id}/comments` GET/POST |
| **CORE-B2** | 附件元数据 + OSS 集成 + 下载授权（预签名 ≤20MB/白名单） | 连城 | A1、OSS 就绪 | **M2**（O3 裁决） | `/attachments`、`/download-url` |
| **CORE-B3** | 查询/列表/过滤/分页 + 时间线/审计 | 连城 | A1 | M2 | `/tickets` 过滤增强、`/timeline` |
| **CORE-B4** | 关联/合并 | 连城 | A1 | **M3**（O3 裁决） | `/tickets/{id}/links` |
| **CORE-C** | 配置：taxonomy 树 + SLA 策略 + 用户/角色目录 + 0005_seed | 石磊/陈川 | CORE-0(schema) | M2 | `/config/*` 全量 |
| **CORE-0（写回消费）** | `insight.classification_suggested`→建议态（OQ-4 阈值/开关） | 石磊 | CORE-0(consumer) | **M3**（O3 裁决） | suggestion 落库 + 自动填充开关 |
| **集成/契约校验（石磊职责，非 §12.1 编号）** | `api-contract-check` 接 CI、跨模块联调、性能基线 P95<500ms、越权红线 | 石磊 | A/B/C | M2/M4 | CI 绿、性能/安全验证 |

> 里程碑已按 O3 架构裁决（梁栋，2026-06-14；回填见系统详设 §12.2 / PR #27）定稿：A3(SLA)/B2(附件) 进 **M2 MVP 闭环**；B4(合并)/写回消费归 **M3**。原标星「待确认」状态已消解。

### 7.2 里程碑映射（系统详设 §12.2）

- **M2 MVP**（O3 裁决回填后：core = **CORE-0/A1/A2/A3/B1/B2/B3/C**）→ 提单→处理→关闭闭环（含 SLA 计时/暂停/预警事件、附件上传下载），支撑 GW-3 聚合与 WEB-1/2，并产出 `ticket.created` 供 INS-1/6 通知。
- **M3 智能增强**：core = **CORE-0(`classification_suggested` 写回消费) + CORE-B4(关联/合并)**，配合 INS-2/3 与 M3 看板/通知（对齐系统详设 §12.2 / PR #27）。
- **M4 加固/发布**：NFR/安全/性能加固、越权红线、OQ-10 软删除/审计/导出预留闭环。

### 7.3 验收门禁（组织 §11 / 系统详设 §14 / Agent Identity）

- 本域代码由石磊审视合入（in_review→done）。
- 关键代码（**DB 迁移、契约变更、跨服务集成、SLA/状态机核心、安全相关**）须发起集体检视（≥2 名开发、累计 ≥3 分，含 committer 1 分）后合入。
- 越权/状态机/幂等用例为必过红线（功能 + 安全测试）。

---

## 8. 依赖与阻塞

### 8.1 任务级 DAG

```
契约冻结
   └─▶ CORE-0 骨架(schema/事件/平台) ─┬─▶ CORE-A1 状态机(+watcher/csat) ─┬─▶ A2 分派
                                      │                                  ├─▶ A3 SLA（取 CORE-C 策略）
                                      │                                  ├─▶ B1 评论(含 user_reply)
                                      │                                  ├─▶ B3 查询/时间线
                                      │                                  ├─▶ B2 附件
                                      │                                  └─▶ B4 合并
   CORE-0(consumer) ─▶ 写回消费(suggestion 落库)
   全部 ─▶ 集成/契约校验/性能（石磊）
```

### 8.2 跨服务/外部依赖

| 依赖 | 类型 | 说明 / 阻塞点 |
|---|---|---|
| **契约冻结**（梁栋） | 前置门禁 | 系统详设 §12.3：冻结前不得编码；core 详设可在框架内并行准备。**`core.yaml info.version=1.0.0` 已冻结**（O5 裁决，PR #27 去 `-draft`），开发 Issue 可解阻塞 |
| `src/openapi/core.yaml` | 契约 | 接口唯一事实源；变更经梁栋批准、秦诺 `api-contract-check` 校验 |
| **gateway**（GW-5/GW-3） | 上游调用方 | service-jwt + mTLS + 透传 `X-User-*`；core 只信任 gateway。GW-3 聚合 BFF 依赖 core 契约就绪 |
| **insight**（INS-1/2/3/6） | 事件对端 | core 发 `ticket.*` 供 insight 消费；core 消费 `insight.classification_suggested`。**core 事件 schema(§5) 是 insight 消费前置**（系统详设 §12.3） |
| **PostgreSQL** | 存储 | core OLTP 独享库；golang-migrate |
| **NATS JetStream** | 事件总线 | Stream `SMARTDESK_EVENTS`；不可用时 outbox 兜底，主流程不阻塞 |
| **对象存储 S3/MinIO** | 附件 | CORE-B2 预签名；不可用仅影响附件 |
| 技能 `db-migration`/`api-contract-check`/`service-scaffold` | 工具 | 生成迁移、校验契约、脚手架 |

---

## 9. 开放事项裁决记录（O1–O6 已定论）

> O1–O6 已由架构团队（梁栋）于 2026-06-14 裁决，事实源回填见 **PR #27**（系统详设 §4.3/§12 + `core.yaml` 1.0.0 冻结）。本节由「开放事项」转为**裁决记录**，本文 §7/§8/§4.2 已据此收敛，无残留标红开放项。

| # | 原议题 | 裁决结果（梁栋，2026-06-14） | 本文落地处 |
|---|---|---|---|
| **O1** | 系统详设 §12.1 未显式点名 watchers/csat、异步写回消费、集成/契约校验 的模块归属 | ✅ 维持本文归并：watchers/csat → CORE-A1；写回消费 → CORE-0(consumer)；集成/契约校验为石磊跨切职责，不新增 CORE-ID。系统详设 §12.1 已回填同口径 | §6 包布局、§7.1 任务表 |
| **O2** | 系统详设 §4.3 状态机示意图措辞与 core.yaml `action` enum 不一致 | ✅ 接口以 `core.yaml` 为准：`confirm→close`、`wait→wait_user`；`pending_user→in_progress` 标注 `(auto user_reply | start)`，不复用 `resume`。系统详设 §4.3 示意图已回填 | §4.2 状态机表 |
| **O3** | A3(SLA)/B2(附件)/B4(合并)/写回消费 未归位里程碑 | ✅ A3/B2 进 **M2 MVP 闭环**（PRD §3.1/US-2.5/US-2.7）；B4/写回消费归 **M3**。系统详设 §12.2 已回填 | §7.1/§7.2 里程碑 |
| **O4** | SLA「工作日(bd)」换算是否引入工作日历 | ✅ 一期固定 8h/日折算整数分钟；工作日历列 M3 可配增强，契约 `*_minutes` 不变 | §3 种子/§5 |
| **O5** | core.yaml `info.version` 为 `1.0.0-draft` | ✅ 去 `-draft`，冻结为 **`1.0.0`**（PR #27） | §8.2 依赖表 |
| **O6** | 流水号唯一/连续、`q` 中文分词、OQ-10 软删除/导出闭环 | ✅ 编码类自决：`number` sequence + 行锁；`q` 部署期定分词器（契约不绑实现，OQ-5）；OQ-10 软删除已预留、导出/删除接口 M4 补，合规由人类在 GA 前闭环 | §3.2/§6.1 |

> 处置路由（Agent Identity）：编码类争议由后端 Leader（石磊）裁剪；契约/跨服务/里程碑分歧交架构（梁栋）；跨域合入分歧由 Committer 委员会裁定；触及人类决策（OQ-10 合规）先提交人类。
