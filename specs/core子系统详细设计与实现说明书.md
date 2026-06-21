# smartdesk-core 子系统详细设计与实现说明书

> 版本：v3.0（轻量 MVP 事实源，2026-06-17）　|　日期：2026-06-17
> 编制：秦诺（契约设计 / 架构设计团队）
> **上游事实源**：[`SmartDesk系统详细设计与实现说明书.md`](SmartDesk系统详细设计与实现说明书.md)（v1.0 已冻结）—— §2.2 服务边界、§3 配置归属、§4 数据模型、§6 事件、§9 降级。
> **接口唯一事实源**：[`src/openapi/core.yaml`](../src/openapi/core.yaml)（OpenAPI 3.1，**v1.1.0**）。
> **代码唯一事实源**：[`src/smartdesk-core/`](../src/smartdesk-core/)。
>
> **定位**：本文是 smartdesk-core 服务的实现级详细设计。自 v2.0 起，经架构团队 Leader 梁栋于 2026-06-17 裁决（[SUP-256](mention://issue/6dc94180-4236-4a26-83f3-aa8770cb73ed) D-2），当前实现采用的 **`httpapi/domain/store` 轻量 MVP** 被接受为 core 模块**新事实源**。原 v2.0 中规划的六边形/sqlc/oapi-codegen/NATS outbox 分层目标已降级为长期技术债，归档于 [`specs/core/archived-hexagonal-design.md`](archived-hexagonal-design.md)，不阻塞当前 MVP 交付。
>
> **边界纪律**：不扩权（职责严格取自系统详设 §2.2）、不破契约（接口以 core.yaml v1.1.0 为准，变更经梁栋批准、秦诺校验）。本文相对系统详设的任何改动均记入 §0 修订记录；与系统详设的冲突一律上交架构团队裁决。

---

## 0. 修订记录

| # | 相对 v2.0 / 系统详设的改动 | 性质 | 依据 |
|---|---|---|---|
| R1 | 接受当前实现 **`httpapi/domain/store` 轻量 MVP** 为新事实源；废止 v2.0 六边形端口-适配器、sqlc、oapi-codegen、NATS outbox relay 等实现目标作为当前交付约束 | 架构漂移裁决落地 | 梁栋 2026-06-17 对 [SUP-256](mention://issue/6dc94180-4236-4a26-83f3-aa8770cb73ed) D-2 的裁决；旧设计归档于 `archived-hexagonal-design.md` |
| R2 | 身份来源统一为 **service-jwt claims**（`sub`/`roles`/`org_id`），清除 v2.0 与系统详设中旧 `X-User-* / X-Org-Id` 明文透传头表述 | 事实源对齐 | core.yaml v1.1.0 描述、`internal/httpapi/auth.go` 实现、SUP-194 收口 |
| R3 | `/readyz` 语义刷新为**仅反映服务本身就绪**，不强制探测 DB/NATS；总线不可用不再使 readiness 失败 | 架构漂移裁决落地 | 梁栋 2026-06-17 对 SUP-256 D-4 的裁决；见 §2.3 |
| R4 | 事件发布刷新为 **in-memory best-effort Publisher**；`outbox_events` 表暂不存在，事务性 outbox + NATS relay 降级为长期技术债 | 架构漂移裁决落地 | 梁栋 2026-06-17 对 SUP-256 D-3 的裁决；后续由 [SUP-296](mention://issue/c8498d4e-a331-4a39-8e43-f9944149b12c) 在 MVP 稳定后提升 |
| R5 | Schema 迁移以压缩后的 **`migrations/0001_init.sql`** 为 MVP 基线；缺失的 `roles/user_roles/sla_policy_targets/outbox_events/ticket_status_history/watchers/csat_ratings` 等独立表随后续 gap 任务以独立编号 migration 补齐，禁止再向 `0001_init.sql` 追加 | 架构漂移裁决落地 | 梁栋 2026-06-17 对 SUP-256 D-5 的裁决；见 §3 |
| R6 | 技术栈刷新为：**Go 1.22+、`net/http` 标准路由、`database/sql` + `lib/pq`、无 sqlc/oapi-codegen、无 NATS SDK（MVP）** | 实现对齐 | 当前代码事实源 |

---

## 目录
1. [范围与职责边界](#1-范围与职责边界)
2. [模块架构与分层](#2-模块架构与分层)
3. [数据/存储（core 归属部分）](#3-数据存储core-归属部分)
4. [API/契约对齐（逐 path 对照 core.yaml v1.1.0）](#4-api契约对齐逐-path-对照-coreyaml-v110)
5. [跨服务交互（事件/同步调用/降级）](#5-跨服务交互事件同步调用降级)
6. [内部组件划分](#6-内部组件划分)
7. [任务分解与里程碑](#7-任务分解与里程碑)
8. [依赖与阻塞](#8-依赖与阻塞)
9. [开放事项与归档说明](#9-开放事项与归档说明)

---

## 1. 范围与职责边界

> 严格引用系统详设 §2.2 服务边界表与 §3 配置归属，**不得扩权**。

### 1.1 职责（系统详设 §2.2，core 行）

core **负责**：工单 CRUD/状态机/分派/评论备注/附件元数据/关联合并/SLA 计时/时间线审计；**权威配置**：分类树（taxonomy）、SLA 策略、用户与角色目录；发布领域事件；消费 insight 的 `insight.classification_suggested` 异步写回（落「建议态」）。

core **不负责**：① 不发通知（insight）；② 不做 AI 计算（insight）；③ 不直面浏览器（仅经 gateway，仅监听内网）；④ 不持认证凭证/会话/令牌、不二次鉴权用户身份（gateway 收口）。

**关键边界规则**：后端仅监听内网、外部不可达；insight 永远「只建议」，工单权威状态只在 core。

### 1.2 配置数据归属（系统详设 §3，core 持有部分）

| 配置 | 归属 | core 实现位置 |
|---|---|---|
| 分类体系 taxonomy 树 | **core**（强一致，驱动建单/分派/校验） | `internal/config` + `categories` 表 |
| SLA 策略（优先级→时限，可配/可暂停语义） | **core**（策略与执行同归，SLA 计时在 core） | `internal/domain/sla.go` + `sla_policies` 表（targets 以 JSONB 存储） |
| 用户/角色/权限**主数据**（角色目录） | **core**（业务主数据）；凭证/会话/令牌在 gateway | `internal/domain/ticket.go` 类型 + `users` 表（`roles TEXT[]`）；core 不存密码/哈希 |
| 通知策略 | **insight**（不归 core） | —（core 不实现） |

### 1.3 设计原则

- **契约先行**：对外接口以 `core.yaml` v1.1.0 为准；当前为手写 `net/http` handler，未接入 `oapi-codegen`，未来如接入不改变契约。
- **领域级纵深防御**：鉴权在 gateway 收口；core 信任 `serviceAuth`（service-jwt，校验签名 + `aud=core`）中已验签的 `sub/roles/org_id` claims，**仅做数据可见性过滤**（内部备注、本组范围、附件越权），不重做用户认证。
- **写路径本地优先**：核心写操作在 `internal/store` 中落业务表 + 时间线；事件由 `internal/event.InMemory` 在内存中发布，MVP 阶段不保证跨进程投递，不阻塞主流程。
- **幂等可审计**：写操作支持 `Idempotency-Key`；时间线只追加、不暴露 update/delete。
- **多租户预留（OQ-7）**：业务表含 `org_id`，一期按 org scope 过滤，不实现跨 org 隔离逻辑。

---

## 2. 模块架构与分层

### 2.1 当前轻量 MVP 分层

```
            ┌──────────────────────── 入站层 (internal/httpapi) ────────────────────────┐
 gateway ─▶ │ Server (net/http 1.22+ method+path patterns)                                │
 (service- │ · authenticate 中间件：校验 service-jwt 签名 + aud=core，claims 注入 context  │
  jwt)     │ · handlers：createTicket / listTickets / transition / assign / comments …   │
            └───────────────────────────────┬───────────────────────────────────────────┘
                                            │ 调用
            ┌──────────────────── 领域层 (internal/domain) ─────────────────────────────┐
            │ 纯 Go 结构体 + 业务规则：状态机表、SLA 计算、可见性规则、错误码              │
            │ 无 I/O 依赖，可直接单元测试                                               │
            └───────────────────────────────┬───────────────────────────────────────────┘
                                            │ 调用
            ┌──────────────────── 存储层 (internal/store) ──────────────────────────────┐
            │ Store 接口；Memory 实现（dev/CI/test）；Postgres 实现（production）          │
            │ 目标 schema：migrations/0001_init.sql                                     │
            └───────────────────────────────────────────────────────────────────────────┘
```

依赖方向：`httpapi` → `domain` → `store`。`domain` 不 import 框架/驱动；`store` 可 import `domain` 类型。

### 2.2 建单请求处理链（落地系统详设 §9 主流程 step 2）

```
POST /v1/tickets  (Idempotency-Key)
 1. authenticate 中间件校验 service-jwt；claims 注入 context
 2. handler 解码 TicketCreate，做基础校验
 3. Server.createTicket → store.NextNumber → store.PutTicket + store.PutSla
 4. 写 timeline(ticket_created)
 5. pub.Publish(ticket.created)            // in-memory best-effort
 6. 返回 201 Ticket（不等待 AI）
```

> 与 v2.0 差异：无 outbox 事务、无 NATS relay、无 `idempotency_keys` 表持久化 request hash（当前按 key 去重并返回首次 ticket，见 §3 / §7）。

### 2.3 部署形态

- 单可执行文件 `cmd/smartdesk-core/main.go`，内置 HTTP server + in-memory 事件发布器。
- 仅监听内网端口（默认 `127.0.0.1:8081`），外部不可达；`/healthz`（liveness）、`/readyz`（readiness，仅服务本身健康）。
- `/readyz` 在 MVP 阶段**不强制探测 DB/NATS**：总线 best-effort， readiness 失败会阻断核心写路径，与降级原则冲突。DB 可用性由写操作错误码暴露。
- 存储可按 `CORE_DATABASE_URL` 切换：空值用内存 store（本地/CI），非空用 Postgres（生产）。

---

## 3. 数据/存储（core 归属部分）

> 当前事实源：`src/smartdesk-core/migrations/0001_init.sql` + `0002_ticket_counter.sql` + `0003_attachments.sql` + `0005_seed.sql`。后续所有新表必须走独立编号 migration，禁止向 `0001_init.sql` 追加（D-5 裁决）。

### 3.1 当前 MVP 实体清单

当前已实现表（`0001_init.sql`）：`categories`、`sla_policies`、`users`、`tickets`、`sla_timers`、`assignments`、`comments`、`ticket_timeline`、`ticket_links`、`idempotency_keys`、`processed_events`。

`0002_ticket_counter.sql`：工单号计数器。

`0003_attachments.sql`：`attachments` 表及 `comment_id` 组合外键。

`0005_seed.sql`：角色枚举、SLA v1 基线策略、分类初始集。

### 3.2 与 v2.0 设计差异（按 D-5 裁决需后续补齐）

| v2.0 设计表 | 当前 MVP 状态 | 补齐方式 |
|---|---|---|
| `roles`（全局枚举） | 未独立建表，角色以 `users.roles TEXT[]` 和 seed 枚举表达 | 如需独立角色目录，后续新建 migration |
| `user_roles` | 未独立建表 | 同上 |
| `sla_policy_targets` | 未独立建表，`sla_policies.targets JSONB` 表达 | 如需范式化，后续新建 migration |
| `ticket_status_history` | 未建表；状态变更仅写入 `ticket_timeline` | 后续新建 migration + store 写入 |
| `watchers` | 未建表；core.yaml 端点未挂载 | 后续新建 migration |
| `csat_ratings` | 未建表；`tickets.csat_score` 已预留，core.yaml 端点未挂载 | 后续新建 migration |
| `outbox_events` | 未建表；事件为 in-memory best-effort | 由 [SUP-296](mention://issue/c8498d4e-a331-4a39-8e43-f9944149b12c) 在 MVP 稳定后补齐 |

### 3.3 关键 DDL（当前事实源节选）

```sql
-- 分类树
categories (id UUID PK, parent_id UUID FK, code TEXT, name TEXT NOT NULL, active BOOL, sort INT)

-- SLA 策略（JSONB 存储 targets）
sla_policies (id UUID PK, name TEXT, active BOOL, targets JSONB)

-- 用户目录（roles 以 TEXT[] 内联）
users (id UUID PK, username TEXT UNIQUE, email TEXT, display_name TEXT,
       status TEXT, roles TEXT[], created_at, updated_at)

-- 工单主表（八态）
tickets (id UUID PK, org_id TEXT, number TEXT UNIQUE, title TEXT, description TEXT,
         requester_id UUID, assignee_id UUID, group_id UUID, category_id UUID FK,
         priority TEXT, status TEXT, source TEXT, reopen_count INT,
         csat_score SMALLINT, closed_at TIMESTAMPTZ, created_at, updated_at)

-- SLA 计时实例
sla_timers (ticket_id UUID PK FK, policy_id UUID, priority TEXT,
            response_due_at, resolve_due_at, response_met, resolve_met,
            paused_at, paused_seconds INT)

-- 分派记录
assignments (id UUID PK, ticket_id UUID FK, kind TEXT, to_user_id, to_group_id, reason, actor_id, created_at)

-- 评论/内部备注
comments (id UUID PK, ticket_id UUID FK, author_id UUID, body TEXT,
          visibility TEXT, mentions UUID[], created_at)

-- 只追加时间线
ticket_timeline (id UUID PK, ticket_id UUID FK, event_type TEXT, actor_id UUID, payload JSONB, created_at)

-- 关联/合并
ticket_links (id UUID PK, ticket_id UUID FK, linked_ticket_id UUID FK, relation TEXT, created_at)

-- idempotency（当前仅按 key→ticket_id 映射）
idempotency_keys (key TEXT PK, ticket_id UUID, created_at)

-- 消费幂等
processed_events (event_id UUID PK, processed_at)
```

### 3.4 ER 要点

- `tickets` 1—N `comments/attachments/ticket_timeline/assignments/ticket_links/sla_timers`。
- `sla_timers` 快照 `priority/policy_id`，策略变更不回改历史计时。
- insight 读模型独立 schema、只读投影，不与 core 共享事务。

---

## 4. API/契约对齐（逐 path 对照 core.yaml v1.1.0）

> 路径/schema/状态码全部以 `core.yaml` v1.1.0 为准。security 统一为 `serviceAuth`；`/healthz`、`/readyz` 免鉴权。错误统一 `Error{code,message}`。

### 4.1 已挂载路由与实现状态

| core.yaml path / method | 归属 handler | 当前状态 | 实现要点 / 代码锚点 |
|---|---|---|---|
| `POST /tickets` | `createTicket` | done | 生成 number、落 tickets(new)、启动 SLA、写 timeline、发布 `ticket.created` |
| `GET /tickets` | `listTickets` | done | 过滤 status/priority/assignee_id/requester_id/group_id/category_id/q/sort/page/page_size |
| `GET /tickets/{id}` | `getTicket` | done | 聚合 SLA；org scope 校验 |
| `PATCH /tickets/{id}` | `patchTicket` | done | 改 title/description/category_id/priority；priority 变更触发 SLA 重算 |
| `POST /tickets/{id}/transitions` | `transition` | done | 状态机表校验，非法跃迁 409；写 timeline；`resume` 仅 `suspended→in_progress` |
| `POST /tickets/{id}/assignments` | `assign` | done | kind∈{manual,auto,reassign,escalate}；写 assignments+timeline+事件；回写 ticket assignee/group |
| `GET/POST /tickets/{id}/comments` | `listComments`/`addComment` | done | internal 按 roles claim 过滤；requester public 回复触发 `user_reply` + SLA 恢复 |
| `GET/POST /tickets/{id}/attachments` | `attachments.go` | done | 20MB 413、白名单 422、`comment_id` 同 ticket 校验 |
| `GET /attachments/{attId}/download-url` | `attachments.go` | done | 越权 403；当前为内置短时 URL，未接真实 S3/MinIO SDK |
| `GET /tickets/{id}/sla` | `getSla` | done | 返回 SlaTimer，含 response/resolve due、paused、breached |
| `GET /tickets/{id}/timeline` | `timeline` | done | 正序、只读追加、分页 |
| `GET /config/categories` | `listCategories` | done | taxonomy 树 |
| `POST/PATCH/DELETE /config/categories/{catId}` | `addCategory`/`patchCategory`/`deleteCategory` | done | 被引用删除 409 |
| `GET /config/sla-policies` | `listPolicies` | done | 返回当前激活策略 |
| `PUT /config/sla-policies` | `putPolicy` | done | admin 改策略数值 |
| `GET /config/users` | `listUsers` | done | 用户目录分页 |
| `POST /config/users` | `addUser` | done | 建用户并授 roles |
| `PUT /config/users/{userId}/roles` | `setUserRoles` | done | 设置 roles 数组 |
| `GET /healthz` / `GET /readyz` | `healthz`/`readyz` | done | liveness / readiness（仅服务本身） |
| `POST /tickets/{id}/watchers` | — | **gap** | 路由未挂载，表未建 |
| `POST /tickets/{id}/csat` | — | **gap** | 路由未挂载，表未建 |
| `POST /tickets/{id}/links` | — | **gap** | 路由未挂载 |

### 4.2 状态机（实现自 core.yaml `/transitions`）

非法跃迁返回 409；每次状态变更写 timeline；`user_reply` 为系统内部动作，API 边界拒绝。

| action | from | to | 触发方 | SLA 联动 |
|---|---|---|---|---|
| `accept` | new | accepted | 坐席 | response_met 判定 |
| `start` | accepted, pending_user | in_progress | 坐席 | pending_user→in_progress 手工恢复，SLA 恢复 |
| `wait_user` | in_progress | pending_user | 坐席 | SLA 暂停 |
| `user_reply`（系统） | pending_user | in_progress | 系统 | requester public 回复触发，SLA 恢复 |
| `resolve` | in_progress | resolved | 坐席 | resolve_met 判定 |
| `close` | resolved | closed | 报单人/坐席 | 终态，写 closed_at |
| `reopen` | closed | in_progress | 报单人 | 仅 closed 后 7 天内，reopen_count+1 |
| `suspend` | in_progress | suspended | 坐席/lead | 内部挂起 |
| `resume` | suspended | in_progress | 坐席/lead | 仅解挂起 |
| `cancel` | new, accepted, in_progress, pending_user, suspended | cancelled | 坐席/lead | 终态 |

---

## 5. 跨服务交互（事件/同步调用/降级）

### 5.1 服务间信任（系统详设 §7，已按 D-1 刷新）

- 入站：仅信任 gateway 签发的 **service-jwt**（`Authorization: Bearer <jwt>`），core 校验签名 + `aud=core` + `iss=smartdesk-gateway`。
- **最终用户身份只从 service-jwt claims 读取**：`sub` → user id，`roles` → 角色数组，`org_id` → 组织。**旧的 `X-User-* / X-Org-Id` 明文透传头不再作为身份来源**。
- core 不二次鉴权用户身份，但用 claims 做领域级数据过滤（内部备注、本组范围、附件越权）。
- `X-Request-Id` 仍用于链路追踪（可选）。

### 5.2 事件发布（MVP：in-memory best-effort）

- 信封：`{event_id, event_type, occurred_at, org_id, ticket_id, actor_id, version, payload}`；主题 `smartdesk.<domain>.<event>`。
- MVP 实现：`internal/event.InMemory` 将事件保留在内存切片中，供测试/观察；**不持久化、不跨进程投递**。
- 生产前必须升级为事务性 outbox + NATS relay（[SUP-296](mention://issue/c8498d4e-a331-4a39-8e43-f9944149b12c)）。
- core 发布的事件（保持清单不变）：`ticket.created`、`ticket.assigned`/`ticket.reassigned`、`ticket.status_changed`、`ticket.commented`、`ticket.resolved`/`ticket.closed`/`ticket.reopened`。

### 5.3 异步写回消费

- 当前 `processed_events` 表已预留，但 consumer 未实现；insight 写回为 M3 目标，依赖 [SUP-296](mention://issue/c8498d4e-a331-4a39-8e43-f9944149b12c) 事件总线升级。

### 5.4 降级

- 总线不可用**不阻塞**建单/流转/评论/查询主流程：MVP 阶段事件为内存 best-effort，丢失仅影响 insight/通知异步消费。
- 对象存储未接入时附件功能局部降级：当前附件 URL 为 core 内置短时 URL。

---

## 6. 内部组件划分

```
smartdesk-core/
├─ cmd/smartdesk-core/main.go        # 装配：config→store→verifier→publisher→server
├─ internal/
│  ├─ auth/                          # service-jwt 校验（claims: sub/roles/org_id）
│  ├─ config/                        # 环境配置加载
│  ├─ domain/                        # 纯领域：Ticket/Comment/Attachment/状态机/SLA/错误码
│  ├─ event/                         # 事件信封 + in-memory Publisher 接口
│  ├─ httpapi/                       # HTTP handlers + service-jwt authenticate 中间件
│  ├─ id/                            # UUID v7 / 流水号生成
│  └─ store/                         # Store 接口 + Memory/Postgres 双实现
├─ migrations/                       # 0001_init.sql / 0002_ticket_counter.sql /
│                                    # 0003_attachments.sql / 0005_seed.sql
└─ internal/httpapi/*_test.go        # httptest 红线用例
```

### 6.1 横切关注点

- **事务**：当前 Postgres store 未显式使用多语句事务；关键写操作（ticket + sla + timeline）在各自 store 方法内完成。后续 outbox 升级需引入事务边界。
- **幂等**：`Idempotency-Key` 按 key 去重返回首次 ticket；**尚未保存 request hash**，同 key 不同 body 不会 409（gap，见 §7）。
- **可见性/领域授权**：规则集中在 `domain` + `httpapi`；requester 仅见本人工单与 public 评论；附件下载越权 403；admin 校验在 handler。
- **可观测性**：`slog` JSON 日志；`/healthz`、`/readyz`；metrics/OTel 待补充。

---

## 7. 任务分解与里程碑

> 任务 ID 对齐系统详设 §12.1。详细实现状态见 [`specs/core/tasks.md`](tasks.md)。本节汇总当前事实源状态。

### 7.0 当前实现状态快照（2026-06-17）

core 已形成轻量 MVP：`net/http` 路由 + `domain` 领域规则 + `store` 内存/Postgres 双实现，覆盖建单、列表/详情/更新、状态机、分派、评论触发 `user_reply`、SLA 启动/暂停/恢复/查询、配置种子与 service-jwt claims 身份收口。状态机非法流转返回 409，`resume` 仅用于 `suspended→in_progress`。

### 7.1 已实现（done）

- CORE-0 骨架：`cmd/main.go`、`internal/config`、`internal/auth`、`internal/domain`、`internal/event`、`internal/store` 双实现。
- CORE-A1：建单、八态状态机、非法跃迁 409、7 天 reopen、查询/详情/更新。
- CORE-A2：分派/改派回写 assignee/group。
- CORE-A3：SLA 启动/暂停/恢复/重算/查询。
- CORE-B1：评论/内部备注可见性过滤、requester public 回复触发 `user_reply`。
- CORE-B2：附件元数据、上传/下载 URL、20MB/白名单/跨 org 校验。
- CORE-B3：列表/详情/时间线正序分页、查询过滤。
- CORE-C：分类树、SLA 策略、用户目录。

### 7.2 关键 gap（需后续任务）

- **Idempotency-Key**：未保存 request hash，同 key 不同 body 不 409。
- **`ticket_status_history` 表**：未落独立表，状态审计仅从 timeline 读取。
- **SLA warning/breached 后台扫描**：无扫描器、无 `ticket.sla_warning`/`ticket.sla_breached` 事件。
- **自动分派规则 / escalate 联动**：`auto` 仅记录 kind，`escalate` 未与 SLA 超时联动。
- **watchers / csat / links**：路由未挂载、表未建。
- **真实 OSS 预签名**：未接 S3/MinIO SDK。
- **列表增强**：缺 `sla_state` 过滤；Postgres `q` 为 LIKE 非 FTS；`page_size>100` 截断未明确 400/422；`sort=-created_at` 未显式分支。
- **requester 工单范围过滤**：已转 [SUP-285](mention://issue/1af7a39e-3ce7-4003-9bda-a05c8bbbd503)。
- **事件总线升级**：in-memory best-effort → 事务性 outbox + NATS relay（[SUP-296](mention://issue/c8498d4e-a331-4a39-8e43-f9944149b12c)）。

### 7.3 里程碑映射（维持系统详设 §12.2 / O3 裁决）

- **M2 MVP**：当前已实现主体闭环；剩余 gap 以独立子任务补齐。
- **M3 智能增强**：watchers/csat/links、写回消费、事件总线升级。
- **M4 加固/发布**：NFR/安全/性能加固、越权红线、软删除/审计/导出。

---

## 8. 依赖与阻塞

| 依赖 | 类型 | 说明 |
|---|---|---|
| `src/openapi/core.yaml` v1.1.0 | 契约 | 接口唯一事实源 |
| **gateway** | 上游调用方 | 签发 service-jwt（aud=core），承载 claims |
| **PostgreSQL** | 存储 | `CORE_DATABASE_URL` 为空则回退内存 store |
| **事件总线升级** | 后续任务 | [SUP-296](mention://issue/c8498d4e-a331-4a39-8e43-f9944149b12c) 负责 outbox + NATS relay |
| **schema 补齐** | 后续任务 | 缺失表随 gap 任务以独立 migration 编号补齐 |

---

## 9. 开放事项与归档说明

### 9.1 旧设计归档

v2.0 中规划的以下内容已**归档**至 [`specs/core/archived-hexagonal-design.md`](archived-hexagonal-design.md)，不再作为当前事实源：

- 六边形（端口-适配器）分层、`internal/{ticket,transition,assignment,sla,comment,attachment,link,timeline,config,repository,events,objstore,platform}` 细粒度包布局。
- `oapi-codegen` 生成 types/server 桩、`sqlc` + `pgx` repository、`golang-migrate` 严格 up/down、NATS JetStream outbox relay/consumer。
- 0001–0004 拆分迁移 + `outbox_events` 表设计。
- `/readyz` 探测 DB+NATS 的旧语义。

上述内容降级为**长期技术债**，由 [SUP-298](mention://issue/c7b6eec2-990f-4491-ad9b-33cb47ac8151) 跟踪，不占用当前 Sprint。

### 9.2 待架构/资料后续确认项

| # | 事项 | 当前处置 | 跟踪 |
|---|---|---|---|
| D-3 | 事件总线从事务性 outbox + NATS 降级为 in-memory best-effort | MVP 接受，生产前必须升级 | [SUP-296](mention://issue/c8498d4e-a331-4a39-8e43-f9944149b12c) |
| D-4 | `/readyz` 仅反映服务本身就绪 | 已接受并刷新文档 | [SUP-297](mention://issue/d2a2e719-53ad-432e-b0bf-a51cdb0cf37d) |
| D-5 | 压缩 `0001_init.sql` 作为 MVP schema 基线 | 已接受；新表独立 migration | 本文件 §3 |
| D-1 | 身份来源改为 service-jwt claims | 已接受；系统详设 §7 同步刷新 | [SUP-294](mention://issue/f1fcc286-ef5d-4c66-8d35-c24f1aceced5) 资料评审 |

---

> 本文与代码事实源 `src/smartdesk-core/` 保持一致。任何实现变更应同步更新本文；契约变更须经梁栋批准、秦诺校验。
