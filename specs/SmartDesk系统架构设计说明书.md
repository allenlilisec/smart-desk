# SmartDesk 智能服务平台 — 系统架构设计说明书（M1·整体大设计）

> 📌 **文档层级（SUP-43）**：本文为 M1 整体大设计——上游输入与决策轨迹，已作为轨迹冻结。与《[SmartDesk系统详细设计与实现说明书](SmartDesk系统详细设计与实现说明书.md)》重叠的明细（服务边界/数据归属/事件/契约）**以系统详设为准**，本文不再随实现演进。完整层级见系统详设 §0。

> 版本：v1.0-draft（待 CTO 评审 → 人类冻结契约总纲）　|　日期：2026-06-14
> 编制：梁栋（首席架构 / 架构设计团队 Leader）　|　契约维护与一致性校验：秦诺
> 上游依据：[《产品需求说明书 PRD》v1.0](SmartDesk产品需求说明书PRD.md)（含 §6 模块划分初稿、§10.1 开放问题裁决）、[《用户故事与验收标准》v1.0](SmartDesk用户故事与验收标准.md)、[《AI 研发虚拟组织说明书》v4.0](AI研发虚拟组织说明书.md)（架构红线、§10.3 规范基线）
>
> **本设计是 M1 阶段交付物**，覆盖：① 总体架构与服务边界；② 数据模型；③ 契约总纲（OpenAPI，见 `src/openapi/`）；④ 领域事件模型与事件总线选型、服务间信任与令牌传递；⑤ 可观测性基线与 NFR 落地；⑥ 模块与任务划分。服务边界、数据归属与契约的**最终明细以系统详设为准**（见顶部文档层级与系统详设 §0；PRD §6 为输入）。
>
> **门禁**：本设计经 CTO 评审后提交人类冻结契约总纲；**契约冻结前各开发团队不得编码**（详细设计可在大设计框架内并行准备，但不得突破契约）。

---

## 目录

1. [设计原则与架构红线对齐](#1-设计原则与架构红线对齐)
2. [总体架构与服务边界](#2-总体架构与服务边界)
3. [数据模型](#3-数据模型)
4. [契约总纲（OpenAPI）](#4-契约总纲openapi)
5. [领域事件模型与事件总线选型](#5-领域事件模型与事件总线选型)
6. [服务间信任与令牌传递](#6-服务间信任与令牌传递)
7. [鉴权与 RBAC（gateway 收口）](#7-鉴权与-rbacgateway-收口)
8. [核心流程的降级与异步写回](#8-核心流程的降级与异步写回)
9. [可观测性基线与 NFR 落地](#9-可观测性基线与-nfr-落地)
10. [§10.1 裁决在架构上的落地映射](#10-1011-裁决在架构上的落地映射)
11. [模块与任务划分](#11-模块与任务划分)
12. [冻结门禁与开放事项](#12-冻结门禁与开放事项)

---

## 1. 设计原则与架构红线对齐

| 架构红线（验收下限） | 本设计落地 |
|---|---|
| ≥3 微服务（gateway/core/insight，web 为前端）、4 代码仓、3 门语言（TS/Go/Python） | gateway(TS/NestJS)、core(Go)、insight(Python/FastAPI) 三服务 + web(TS/Next.js) 前端，四仓独立，三门语言 ✔ |
| 核心建单链路在 AI 不可用时可降级（建单仍成功）；AI 分析异步写回，不阻塞主流程 | 建单走 core 同步事务落库即成功；分类/定级/相似经**事件总线异步**交 insight 计算，结果**异步写回** core（见 §8） ✔ |
| 鉴权在 gateway 收口，RBAC 最小权限；越权/鉴权用例必过 | 所有外部流量经 gateway 完成 JWT 校验 + RBAC 判定后才转发；后端服务仅信任 gateway 注入的身份上下文 + 服务令牌（见 §6、§7） ✔ |

**贯穿原则**：契约先行（OpenAPI 3.1 为唯一接口事实源）；事件驱动解耦；幂等与可审计；多租户维度预留但一期不实现隔离逻辑（OQ-7）；检索接口对二期向量方案前向兼容（OQ-5）；身份提供方可插拔（OQ-2）。

---

## 2. 总体架构与服务边界

### 2.1 架构总览

```
                          ┌──────────────────────────────────────┐
                          │  浏览器（报单人 / 坐席 / 组长 / 管理者）  │
                          └───────────────────┬──────────────────┘
                                              │ HTTPS (REST/JSON, JWT Bearer)
                                              ▼
              ┌────────────────────────────────────────────────────────┐
              │  smartdesk-gateway  (TS · NestJS) ── 统一入口 / 认证 BFF   │
              │  • JWT 登录/刷新/登出、会话                                │
              │  • RBAC 鉴权（收口，最小权限）                             │
              │  • 路由聚合（为前端拼装 core+insight 视图）、限流、审计埋点  │
              │  • 身份提供方可插拔（一期自建账号；预留 OIDC 适配器）        │
              └───────┬───────────────────────────────────┬────────────┘
            内部调用 (mTLS + 服务令牌 + 透传用户身份)        │
                      ▼                                     ▼
        ┌───────────────────────────┐       ┌──────────────────────────────┐
        │ smartdesk-core (Go)        │       │ smartdesk-insight (Py/FastAPI) │
        │ • 工单生命周期/状态机       │       │ • 自动分类/定级建议             │
        │ • 分派/改派/转派/升级       │       │ • 相似工单检索（关键词→向量预留）│
        │ • 评论/内部备注/@提及       │       │ • 统计聚合（看板读模型）        │
        │ • 附件元数据/关联合并        │       │ • 通知（站内+邮件）/通知策略    │
        │ • SLA 计时/暂停恢复/超时     │       │ • 消费 core 事件、异步写回建议   │
        │ • 时间线/审计                │       └──────────────┬───────────────┘
        │ • 配置：分类树 / SLA 策略    │                      │
        └───────┬─────────┬──────────┘                      │
                │发布事件   │读写                              │发布/订阅事件 + 写回
                │          ▼                                 │
                │   ┌─────────────┐   ┌──────────────┐        │
                │   │ PostgreSQL   │   │ 对象存储      │        │
                │   │ (core OLTP)  │   │ (S3/MinIO)   │        │
                │   └─────────────┘   └──────────────┘        │
                ▼                                             ▼
        ┌────────────────────────────────────────────────────────────┐
        │         事件总线  NATS JetStream（至少一次、持久化、幂等消费）   │
        └────────────────────────────────────────────────────────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                     ┌────────────────┐            ┌────────────────────┐
                     │ insight 读模型  │            │ 检索索引            │
                     │ (PostgreSQL)    │            │ (PG 全文→OpenSearch │
                     │ 统计/通知/反馈  │            │  /向量库 预留)       │
                     └────────────────┘            └────────────────────┘
```

### 2.2 服务边界与职责（与系统详设一致，冲突以详设为准）

| 服务 | 仓库 | 语言 | 职责（对外契约见 `src/openapi/`） | 不负责 |
|---|---|---|---|---|
| **gateway** | `smartdesk-gateway` | TS/NestJS | 认证（登录/刷新/登出/me）、RBAC 收口、对前端的聚合 BFF、限流、审计埋点、身份提供方适配（自建/OIDC 预留） | 不持有工单业务逻辑；不直接连业务库（除自身会话/令牌存储） |
| **core** | `smartdesk-core` | Go | 工单 CRUD/状态机/分派/评论备注/附件元数据/关联合并/SLA 计时/时间线审计；**权威配置**：分类树（taxonomy）、SLA 策略；用户与角色目录（账号/RBAC 主数据）；发布领域事件 | 不发通知；不做 AI 计算；不直接面向浏览器 |
| **insight** | `smartdesk-insight` | Py/FastAPI | 自动分类/定级建议、相似检索、统计聚合读模型、通知（站内+邮件）与通知策略、消费 core 事件并异步写回建议 | 不持有工单权威状态；不做鉴权（信任 gateway 注入身份）；分类/相似**只给建议**，落库决策权在 core |
| **web** | `smartdesk-web` | TS/Next.js | 三端 UI（报单门户/坐席工作台/管理后台/看板） | 仅经 gateway 调用，不直连 core/insight |

### 2.3 配置数据归属（解 PRD §6 跨切关注点）

| 配置 | 归属 | 理由 |
|---|---|---|
| 分类体系（taxonomy 树） | **core** | 驱动建单/分派/校验，强一致需求；insight 分类预测只读引用其分类码 |
| SLA 策略（优先级→时限表，可配置、可暂停语义） | **core** | SLA 计时执行在 core，策略与执行同归避免漂移 |
| 用户/角色/权限主数据（RBAC 角色绑定） | **core**（目录主数据）；gateway 持**认证凭证/会话/令牌** | OQ-2：身份**认证**在 gateway 收口且 IdP 可插拔；但角色授予属业务主数据，归 core，gateway 鉴权时从 JWT claims + core 角色快照判定 |
| 通知策略（按角色/事件类型订阅开关） | **insight** | 通知由 insight 发送，策略与执行同归 |

> 决策记录：**taxonomy 与 SLA 策略归 core**（PRD §6 留待架构定），**通知策略归 insight**，**认证凭证归 gateway、角色主数据归 core**。如开发期对归属有异议，按 §决策路由交架构（梁栋）裁决。

---

## 3. 数据模型

### 3.1 存储选型

| 数据类别 | 存储 | 归属服务 | 说明 |
|---|---|---|---|
| 工单 OLTP | PostgreSQL | core | 强一致事务；工单/状态/分派/评论/附件元数据/SLA/时间线/配置/用户角色 |
| 附件对象 | S3 兼容对象存储（MinIO 可本地化） | core 管元数据，对象存 OSS | ≤20MB、类型白名单、下载经鉴权（OQ-9） |
| 分析/统计读模型 | PostgreSQL（insight 独立库/schema） | insight | 由事件投影出的看板聚合、通知记录、分类纠偏样本 |
| 检索索引 | 一期 PostgreSQL 全文检索（中文分词）+ 标题/分类相似；预留 OpenSearch/向量库 | insight | OQ-5 前向兼容：检索契约不绑定实现 |
| 会话/令牌/限流计数 | Redis | gateway | 刷新令牌、登出黑名单、限流窗口 |

> **多租户预留（OQ-7）**：所有业务表含 `org_id`（非空，一期固定单组织默认值 `default`），索引与外键带 `org_id`；一期**不实现**跨组织隔离逻辑，二期可在仓储层/查询层加租户过滤而无需改表结构。

### 3.2 core 主要实体（OLTP，PostgreSQL）

> 命名 snake_case；主键 UUID v7（时序友好）；所有表含 `org_id`、`created_at`、`updated_at`；软删除用 `deleted_at`（合规删除/留存 OQ-10 预留）。

**users / roles / user_roles**（账号目录与 RBAC 主数据）
- `users(id, org_id, username, email, display_name, status, credential_ref, created_at, ...)` — `credential_ref` 指向 gateway 持有的凭证（密码哈希在 gateway，core 不存明文/哈希）。
- `roles(code, name)` 固定枚举：`requester|agent|lead|manager|admin`。
- `user_roles(user_id, role_code, scope)` — `scope` 预留坐席组维度（lead 管本组）。

**categories**（分类树 / taxonomy，admin 可维护）
- `categories(id, org_id, parent_id, code, name, active, sort, created_at, ...)` — 自引用树；OQ-4 预置初始集（IT/账号权限/办公行政/人事/财务/其他）由产品+admin 在 M2 细化。

**sla_policies**（SLA 策略，可配置）
- `sla_policies(id, org_id, name, active, ...)`
- `sla_policy_targets(policy_id, priority, response_minutes, resolve_minutes)` — 优先级→响应/解决时限；OQ-1 v1 基线值入种子数据（P1 15m/4h；P2 1h/1bd；P3 4h/3bd；P4 1bd/5bd），业务可在 M2 前调数值不改形态。

**tickets**（工单主表）
- `tickets(id, org_id, number, title, description, requester_id, assignee_id, group_id, category_id, priority, status, source, reopen_count, closed_at, csat_score, created_at, updated_at, deleted_at)`
- `status ∈ {new, accepted, in_progress, pending_user, resolved, closed, suspended, cancelled}`
- `priority ∈ {P1,P2,P3,P4}`；`number` 为人类可读流水号（org 内唯一）。

**ticket_status_history / ticket_timeline**（状态历史与时间线/审计）
- `ticket_status_history(id, ticket_id, from_status, to_status, actor_id, reason, created_at)` — 非法跃迁不写；写时校验状态机。
- `ticket_timeline(id, ticket_id, event_type, actor_id, payload_json, created_at)` — 建单/分派/状态/评论/SLA/关联/关闭等全量时间线，正序展示；**审计不可被普通用户篡改/删除**（仅追加，无 update/delete 接口暴露给非系统角色）。

**assignments**（分派记录）：`(id, ticket_id, from_user_id, to_user_id, to_group_id, kind[manual|auto|reassign|escalate], reason, actor_id, created_at)`。

**comments**（评论与内部备注）：`(id, ticket_id, author_id, body, visibility[public|internal], mentions_json, created_at, deleted_at)` — `internal` 对 requester 不可见，**接口层过滤**（不仅 UI）。

**attachments**（附件元数据）：`(id, ticket_id, comment_id?, uploader_id, filename, content_type, size_bytes, object_key, checksum, created_at)` — 对象存 OSS；下载经鉴权签发短时 URL 或 gateway 代理授权。

**ticket_links**（关联/合并）：`(id, ticket_id, linked_ticket_id, relation[related|duplicate|merged_into], created_at)` — 合并时子单 `merged_into` 主单、状态同步、通知报单人。

**sla_timers**（SLA 计时实例）：`(id, ticket_id, policy_id, priority, response_due_at, resolve_due_at, response_met, resolve_met, paused, paused_total_seconds, paused_at, breached, created_at, updated_at)` — `pending_user` 期间 `paused=true` 累计暂停时长；恢复后顺延 due_at。

**watchers**：`(ticket_id, user_id, created_at)` — 关注/跟随。
**csat_ratings**：`(ticket_id, requester_id, score[1..5], comment, created_at)` — OQ-12 解决后轻量评价。

### 3.3 insight 读模型与样本（PostgreSQL，独立 schema，由事件投影）

- `classification_feedback(id, org_id, ticket_id, predicted_category_id, confidence, accepted, corrected_category_id, actor_id, created_at)` — 纠偏样本回流，供模型迭代（OQ-4）。
- `similarity_index(ticket_id, org_id, title_norm, category_id, keywords_tsv, embedding?[预留], updated_at)` — 一期 `keywords_tsv` 全文 + 标题/分类；`embedding` 列与 ANN 索引**预留**（OQ-5）。
- `notifications(id, org_id, user_id, ticket_id, type, channel[inapp|email], title, body, read_at, dedupe_key, status, created_at)` — `dedupe_key` 保证幂等、至少一次。
- `notification_policies(id, org_id, role, event_type, channel, enabled)` — admin 可配（US-4.4）。
- `stats_*` 聚合物化表/视图：按 时间/分类/坐席/优先级 的出量、SLA 达成、时长（US-3.4/US-6.x），由领域事件投影，近实时刷新。

### 3.4 ER 关系要点

- `tickets` 1—N `comments / attachments / ticket_timeline / assignments / ticket_links / sla_timers / csat_ratings / watchers`。
- `tickets.category_id → categories.id`；`tickets.assignee_id/requester_id → users.id`。
- `sla_timers.policy_id → sla_policies.id`；策略变更不回改历史计时（快照 priority/policy 到 timer）。
- insight 读模型**只读投影**，不与 core OLTP 共享事务；以事件为唯一同步通道（最终一致）。

---

## 4. 契约总纲（OpenAPI）

接口唯一事实源在 `src/openapi/` 下三份 OpenAPI 3.1 契约（梁栋产出、秦诺维护校验）：

| 文件 | 服务 | 覆盖 PRD §6"首批待定义契约" |
|---|---|---|
| [`src/openapi/gateway.yaml`](../src/openapi/gateway.yaml) | gateway 对外 BFF | 登录/刷新/登出/me、对前端聚合的工单/评论/附件/SLA/分派/分类建议/相似/统计/通知/admin 配置（统一鉴权+限流入口） |
| [`src/openapi/core.yaml`](../src/openapi/core.yaml) | core 内部契约 | 建单、查询/列表（过滤/分页）、状态流转、分派、评论/备注、附件、SLA 查询、关联/合并、时间线、taxonomy/SLA 策略/用户角色配置 |
| [`src/openapi/insight.yaml`](../src/openapi/insight.yaml) | insight 内部契约 | 分类预测、定级建议、相似推荐、统计聚合、通知发送/查询、通知策略、分类纠偏写回（事件 schema 见 §5 与 `insight.yaml#/components/schemas`） |

**契约通用约定**（三份共用，秦诺把守一致性）：
- 版本：URL 前缀 `/api/v1`（gateway 对外）/ `/v1`（内部）；OpenAPI `info.version` 语义化；破坏性变更升 `v2` 并并行。
- 统一错误模型 `Error{code, message, details?, trace_id}`；HTTP 语义：`400` 校验、`401` 未认证、`403` 越权、`404` 不存在、`409` 状态冲突/非法跃迁、`413` 附件超限、`422` 业务规则、`429` 限流。
- 分页：`?page=&page_size=`（或 `cursor`），响应 `{items, page, page_size, total}`；列表过滤字段在各 path 显式声明。
- 幂等：写操作支持 `Idempotency-Key` 头（状态流转/通知/分派幂等，US-2.2 AC4 / US-4.1 AC3）。
- 时间：RFC3339 UTC；金额/时长用整数（分钟/秒）避免浮点。
- 安全方案：gateway 对外 `bearerAuth`(JWT)；内部服务 `serviceAuth`(服务令牌) + 透传用户身份头（见 §6）。

> **裁决权**：契约变更（新增/修改/删除字段或路径）须经梁栋批准；秦诺以 `api-contract-check` 校验实现与契约一致、把守跨服务共享 schema（Error/分页/事件）与版本管理。

---

## 5. 领域事件模型与事件总线选型

### 5.1 选型：NATS JetStream（消息队列，异步）

**结论：采用消息队列（异步），选 NATS JetStream**，而非同步调用。

| 维度 | 同步调用 | **NATS JetStream（选定）** | RabbitMQ（备选） |
|---|---|---|---|
| 主流程解耦/降级 | ✗ AI 故障会阻塞建单 | ✔ 建单只发事件即返回 | ✔ |
| 至少一次 + 持久化 | — | ✔ JetStream 持久流 + ACK | ✔ |
| 多语言客户端（Go/Py/TS） | — | ✔ 官方 SDK 齐全 | ✔ |
| 运维轻量（本地/单机可跑） | — | ✔ 单二进制、轻 | 中 |
| 消费幂等/重放 | — | ✔ 消费者持久 + 序号去重 | ✔ |

选 NATS JetStream 的理由：满足 NFR「通知至少一次送达、消费方幂等」「AI 异步写回不阻塞主流程」，多语言 SDK 齐全契合三语栈，单机可运行契合本组织并行度上限（6 运行时/本机）。RabbitMQ 为等价备选，若运维已有 Rabbit 可替换——**事件 schema 与总线实现解耦**，切换不影响契约。

### 5.2 事件 schema（统一信封，US-4.1 AC2）

```jsonc
{
  "event_id": "uuidv7",          // 全局唯一，消费去重键
  "event_type": "ticket.created",// 见下表
  "occurred_at": "RFC3339",
  "org_id": "default",           // 多租户预留
  "ticket_id": "uuid",
  "actor_id": "uuid|null",       // 触发人；系统触发为 null
  "version": 1,                  // schema 版本
  "payload": { /* 按 event_type 定义 */ }
}
```

主题（subject）命名 `smartdesk.<domain>.<event>`，JetStream Stream 名 `SMARTDESK_EVENTS`。

| event_type | 发布者 | 主要消费者 | 用途 |
|---|---|---|---|
| `ticket.created` | core | insight | 触发分类/定级/相似（异步写回） |
| `ticket.assigned` / `ticket.reassigned` | core | insight | 通知责任人 |
| `ticket.status_changed` | core | insight | 通知 + 统计投影 |
| `ticket.commented` | core | insight | @提及通知、对外评论通知 |
| `ticket.sla_warning` / `ticket.sla_breached` | core | insight | 预警/超时通知 + 升级建议 |
| `ticket.resolved` / `ticket.closed` / `ticket.reopened` | core | insight | 通知 + 质量统计（重开率） |
| `ticket.merged` | core | insight | 合并通知 |
| `insight.classification_suggested` | insight | core | **异步写回**分类/定级建议（core 落库为建议态） |

- **至少一次 + 幂等**：消费者以 `event_id` 去重（落 `processed_events` 表或 KV）；写回/通知操作幂等。
- **顺序**：按 `ticket_id` 分区保证单工单事件有序（JetStream subject 分区/一致性哈希）。

---

## 6. 服务间信任与令牌传递

```
浏览器 ──JWT(Bearer)──▶ gateway ──(1)校验JWT+RBAC──▶ 通过
gateway ──(2)内部调用 core/insight──▶  mTLS 通道
        头：Authorization: Bearer <service-jwt>     // 服务身份，短时、gateway 私钥签
            X-User-Id / X-User-Roles / X-Org-Id / X-Request-Id  // 透传最终用户身份上下文
core/insight ──(3)──▶ 只信任来自 gateway 的服务令牌；校验 service-jwt 签名+aud；
                       用 X-User-* 做领域级数据可见性（如内部备注过滤、本组工单范围）
```

- **后端不直接面向浏览器**：core/insight 仅监听内网，外部不可达；未经 gateway 的直达请求在网络层被拒（NFR/US-1.3 AC1）。
- **服务令牌**：gateway 用私钥签发短时 `service-jwt`（`iss=gateway, aud=core|insight, sub=svc`），core/insight 校验签名与受众；**用户身份不再二次鉴权**（鉴权已在 gateway 收口），但用 `X-User-*` 做**领域级数据过滤**（最小权限的纵深防御）。
- **mTLS**：服务间 TLS 双向证书，杜绝内网仿冒；证书由部署期签发（发布运维）。
- `X-Request-Id`/`trace_id` 全链路透传，落日志与时间线，支撑审计与链路追踪。

---

## 7. 鉴权与 RBAC（gateway 收口）

- **认证（一期自建账号）**：用户名/密码 → gateway 校验 → 签发 JWT（access 短时 + refresh 在 Redis），登出加入黑名单；令牌过期受保护接口 401（US-1.1）。
- **IdP 可插拔（OQ-2）**：认证逻辑抽象为 `IdentityProvider` 接口，一期实现 `LocalProvider`；预留 `OidcProvider` 适配点，二期接 SSO/OIDC **不改业务侧**与下游契约。
- **RBAC（最小权限）**：JWT claims 携带 `sub/roles/org`；gateway 按"资源×动作×角色"矩阵判定，未授权 **403** 且**记审计**（US-1.2 AC5）。角色：`requester|agent|lead|manager|admin`，一账号可兼多角色。
- **关键越权用例（必过）**：requester 访问他人工单/管理后台→403；内部备注接口对 requester 不返回；附件下载越权→403；manager 改工单→403。这些是安全测试（武安）与越权用例的红线。
- **限流**：gateway 按用户/IP 滑窗限流，超阈值 **429**（US-1.3 AC2），计数存 Redis。
- **审计埋点**：网关对关键请求记录 who/when/what/route（US-1.3 AC3）。

> 网关认证/RBAC 为安全关键代码：其合入按组织 §11 须加**后端石磊 + 安全武安双评审**（架构在此明确，开发期照此门禁执行）。

---

## 8. 核心流程的降级与异步写回

**提单到关闭主流程（落地 PRD §5.1）**：

```
1. web →(JWT) gateway 鉴权 → 转发 core 建单
2. core 事务内：校验必填→落库 ticket(status=new)→启动 SLA 计时→写时间线→发 ticket.created 事件 → 立即返回工单号
   ★ 此处建单已成功；AI 是否可用与建单成败无关（降级满足 US-2.1 AC4 / NFR）
3. insight 异步消费 ticket.created → 分类/定级/相似计算 → 发 insight.classification_suggested
4. core 异步消费写回：分类/定级落为"建议态"（一期不自动改，置信度≥0.85 且开启自动填充时才自动填充——OQ-4）
5. 分派（手工/规则）→ 受理→处理→（待用户：SLA 暂停）→已解决→通知报单人→报单人确认关闭/7天内可重开
6. 全程事件落总线 → insight 投影统计 → 看板近实时消费
```

- **降级**：insight/事件总线不可用时，建单/状态流转/评论等 core 主流程**不受影响**；建议为空、相似推荐懒加载失败仅 UI 降级（US-3.3 AC3）。
- **异步写回不阻塞**：分类/定级/相似 P95<2s 且在主流程之外（NFR §7）。
- **SLA 计时**：建单/受理按优先级启动；`pending_user` 暂停、恢复顺延；临近阈值发 `sla_warning`、超时 `sla_breached`+标记+升级建议（US-2.5）。

---

## 9. 可观测性基线与 NFR 落地

| NFR（PRD §7） | 架构落地 |
|---|---|
| 列表/详情 P95<500ms | core 读路径加索引（org_id+status、assignee_id、category_id）、分页强制上限；看板走 insight 预聚合读模型 |
| AI 分类/相似 P95<2s 且不阻塞 | insight 异步消费 + 写回；相似懒加载 |
| 可用性 ≥99.5%、核心建单可降级 | 服务独立部署、无状态可水平扩；AI/总线故障不影响建单（§8） |
| 安全 OWASP ASVS/Top10 | gateway 收口鉴权、输入校验、越权防护、TLS、审计；安全测试（武安）按 §10.3 验收 |
| 可靠性：幂等、至少一次、可审计 | 写操作 Idempotency-Key；事件至少一次+消费幂等；时间线只追加审计 |
| 合规预留（OQ-10） | 软删除 + 审计不可篡改 + admin 导出/删除接口预留；留存期/法务判定 M4 GA 前由人类/法务确认（不阻塞 M1/M2） |

**可观测性基线（三支柱）**：
- **日志**：结构化 JSON，统一 `trace_id/request_id/org_id/actor_id`，分级；审计日志独立、不可篡改。
- **指标**：各服务暴露 `/metrics`(Prometheus)；关键指标 SLA 计时准确性、接口 P95/P99、事件消费滞后(lag)、分类采纳率。
- **链路追踪**：OpenTelemetry，gateway→core/insight→事件消费全链路 trace 透传。
- **健康检查**：各服务 `/healthz`(liveness)、`/readyz`(readiness，含 DB/总线依赖)。

---

## 10. §10.1 裁决在架构上的落地映射

| 裁决 | 架构落地点 |
|---|---|
| OQ-1 SLA 优先级驱动/可配/可暂停/预警 | `sla_policies` + `sla_timers`（§3.2）；v1 基线值入种子；core SLA 引擎（§8）；阈值可配不改契约 |
| OQ-2 自建账号+JWT/RBAC，预留 OIDC | gateway `IdentityProvider` 可插拔（§7） |
| OQ-4 一期"建议+人工确认"，阈值≥0.85 可配，分类 admin 树 | insight 只给建议、core 落建议态（§8）；`categories` 树（§3.2）；`classification_feedback` 回流（§3.3） |
| OQ-5 一期关键词+标题/分类相似，契约前向兼容向量 | insight 检索契约不绑实现；`similarity_index.embedding` 预留（§3.3） |
| OQ-7 单组织起步，数据模型预留多租户 | 全表 `org_id`，一期不实现隔离逻辑（§3.1） |
| OQ-8 状态机 + 终态(已关闭/取消)、待用户超时仅提醒 | `tickets.status` 八态 + 状态机校验（§3.2）；超时发提醒事件不自动关闭（§8） |
| OQ-9 附件≤20MB/白名单/对象存储/下载鉴权 | `attachments` + OSS（§3.1）；上传校验、下载授权（§7） |
| OQ-12 解决后 1–5 星 CSAT | `csat_ratings`（§3.2） |
| OQ-13 关闭后 7 天可重开 | `tickets.reopen_count` + 重开窗口校验（core 状态机，可配） |
| OQ-10 合规预留 | 软删除 + 审计不可篡改 + 导出/删除接口预留（§9）；M4 GA 前人类/法务闭环 |

---

## 11. 模块与任务划分

> 供阶段 3「按任务/模块迭代」拆解。每个迭代内自成闭环：迭代详细设计 → 开发 → 开发者测试 → 评审合入。**契约冻结后**由各开发 Leader 解阻塞并路由。

### 11.1 按服务/团队的模块清单

**gateway（前端团队·关山主写，认证/RBAC 合入加后端+安全双评审）**
- GW-1 认证模块：登录/刷新/登出/me、JWT、会话（Redis）、IdP 抽象（Local 实现 + OIDC 预留）
- GW-2 RBAC 模块：角色×动作矩阵、403、审计埋点
- GW-3 聚合 BFF：为前端拼装工单详情（core+insight 相似/建议）、列表、看板
- GW-4 限流与防护：滑窗限流 429、基础防护
- GW-5 服务令牌签发 + mTLS 客户端 + 透传头

**core（后端团队·石磊搭骨架/集成；陈川=模块A，连城=模块B）**
- CORE-0 骨架：服务脚手架、DB schema/迁移、事件发布客户端、配置、健康检查/指标（石磊）
- CORE-A1 工单状态机（建单/八态流转/非法跃迁拒绝/幂等）（陈川）
- CORE-A2 分派/改派/规则自动分派/升级（陈川）
- CORE-A3 SLA 计时引擎（启动/暂停/恢复/预警/超时事件）（陈川）
- CORE-B1 评论与内部备注（接口层可见性过滤）+ @提及（连城）
- CORE-B2 附件元数据 + OSS 集成 + 下载授权（连城）
- CORE-B3 查询/列表/过滤/分页 + 时间线/审计（连城）
- CORE-B4 关联/合并（连城）
- CORE-C 配置：taxonomy 树 + SLA 策略 + 用户/角色目录（石磊/陈川分担）

**insight（智能服务团队·苏睿主写算法；杨达做通知/集成）**
- INS-1 事件消费骨架（订阅 core 事件、幂等、读模型投影）（苏睿/杨达）
- INS-2 自动分类（一期规则/关键词+建议模式，阈值≥0.85 可配）+ 纠偏回流（苏睿）
- INS-3 定级建议（苏睿）
- INS-4 相似检索（一期关键词+标题/分类；契约前向兼容向量）（苏睿）
- INS-5 统计聚合读模型 + 看板查询接口（苏睿）
- INS-6 通知：站内+邮件、模板、至少一次/幂等、发送记录（杨达）
- INS-7 通知策略配置（杨达）

**web（前端团队·江颜主写）**
- WEB-1 报单门户（提单/我的工单/确认解决/重开）
- WEB-2 坐席工作台（队列+详情：时间线/评论备注/相似/状态操作）
- WEB-3 管理后台（分类树/SLA 策略/用户角色/通知策略）
- WEB-4 看板与报表（SLA 达成/积压/工作量/分类分布/质量视图/CSV 导出）
- WEB-5 i18n 框架预留（默认中文，OQ-11）

### 11.2 跨服务集成里程碑（对齐 PRD §9）

- **M2 MVP**：GW-1/2/3 + CORE-0/A1/A2/B1/B3/C + WEB-1/2 + INS-1/6（站内通知）→ 提单→处理→关闭闭环。
- **M3 智能增强**：INS-2/3/4/5 + WEB-4 看板 + INS-6 邮件 → AI 建议与看板可用。
- **M4 加固/发布**：NFR/安全/性能加固、灰度（测试/安全/发布团队）；OQ-10 合规闭环。

### 11.3 依赖与阻塞解除

- 所有开发 Issue 在**契约冻结前置 blocked**；冻结后由架构团队通知各开发 Leader 解阻塞。
- 关键依赖：core 事件 schema（§5）是 insight 消费前置；gateway 聚合依赖 core/insight 契约就绪；前端依赖 gateway BFF 契约。

---

## 12. 冻结门禁与开放事项

**M1 退出 = 人类冻结契约总纲。** 评审路径：架构团队产出（本稿 + 三份 OpenAPI）→ CTO 评审 → 提交人类冻结。**契约冻结前各开发团队不得编码。**

**确认/开放事项**（本节随系统详设刷新；明细以《系统详细设计与实现说明书》为准）：
1. 配置归属决策（taxonomy/SLA 策略归 core、通知策略归 insight、认证凭证归 gateway/角色主数据归 core）——**已裁定**（系统详设 §3 / D1–D5，2026-06-14 梁栋），非待决。
2. 事件总线选型 NATS JetStream（RabbitMQ 等价备选）——**已裁定**（系统详设 §6.1 / D3，2026-06-14 梁栋），非待决。
3. 检索一期实现（PG 全文 vs OpenSearch）——契约已前向兼容，实现选型可在 M3 详设时再定（开放，不阻塞契约）。
4. OQ-10 合规（留存期/法务判定）——保留人类/法务在 M4 GA 前闭环，不阻塞 M1/M2（开放）。

**设计争议**统一交架构设计团队（梁栋）裁决；触及人类决策的节点先提交人类。
