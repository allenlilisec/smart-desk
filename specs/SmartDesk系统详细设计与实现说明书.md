# SmartDesk 智能服务平台 — 系统详细设计与实现说明书

> **唯一事实源（系统级详细设计）。** 版本：v1.1.0（2026-06-17 按 core MVP 事实源修订）　|　原冻结：v1.0（2026-06-14）
> 编制：秦诺（契约设计 / 文档主笔）　|　架构拍板与最终裁决：梁栋（首席架构 / 架构设计团队 Leader）
> 方法论：[github/spec-kit](https://github.com/github/spec-kit)　Constitution → Specify → Clarify → Plan（本文为 `/plan` 产物的人类可读整理；生成轨迹见 [`.specify/`](../.specify/) 与 [`specs/001-smartdesk-system/`](001-smartdesk-system/)）。
>
> **上游事实源**：[PRD v1.0（已冻结，含 §10.1 裁决）](SmartDesk产品需求说明书PRD.md)、[用户故事与验收标准 v1.0](SmartDesk用户故事与验收标准.md)、[系统架构设计说明书（M1 大设计，梁栋）](SmartDesk系统架构设计说明书.md)、[AI 研发虚拟组织说明书 v4.0](AI研发虚拟组织说明书.md)（架构红线 / §10.3 规范基线 / §11 合入门禁）、[项目宪法 v1.0](../.specify/memory/constitution.md)。（文档层级见 §0）
> **契约事实源**：[`src/openapi/{gateway,core,insight}.yaml`](../src/openapi/)（OpenAPI 3.1）。
>
> **生成方式纠偏**：本文为**自顶向下**系统级详设（先系统、后模块）。既有 [`gateway子系统详细设计与实现说明书.md`](gateway子系统详细设计与实现说明书.md) 为**自下而上**产物，**不得**作为系统详设；其内容将在 P2 由本文向下派生时对齐回填，不在本文范围。
>
> **修订状态**：v1.0 已于 2026-06-14 冻结。本次 v1.1.0 仅按 core 模块 MVP 落地事实刷新 §4/§6/§10/§12（D-2~D-5 架构漂移裁决），不改动 gateway/insight 已冻结契约决策 D1–D5。
>
> **2026-06-17 修订**：按 [SUP-256](mention://issue/6dc94180-4236-4a26-83f3-aa8770cb73ed) D-1/D-2 裁决，将 core/insight 身份来源由旧 `X-User-* / X-Org-Id` 明文透传头统一刷新为 **service-jwt claims**（`sub`/`roles`/`org_id`），与 `src/openapi/core.yaml` v1.1.0 及 `src/smartdesk-core/internal/httpapi/auth.go` 实现一致。未改变服务边界、数据模型、事件语义。

## 0. 文档关系与事实源层级（解 SUP-43 文档冲突）

> CEO 指出梁栋/秦诺两份输出文档可能冲突。冲突的实质**不是内容矛盾**（两份在选型/边界/数据/事件上一致），而是早期**两份系统级文档都自称权威、且互不引用**（架构说明书曾声明"以本设计为准"，本文声明"唯一事实源"）。
>
> **下列层级已由梁栋作为架构 Leader 于 2026-06-14 拍板确认，事实源归属即按此固化：**

| 文档 | 定位 | 权威性 |
|---|---|---|
| `SmartDesk产品需求说明书PRD.md` + 用户故事 | 需求 WHAT/WHY（已冻结 v1.0） | 需求层唯一事实源 |
| `SmartDesk系统架构设计说明书.md`（梁栋 M1 大设计） | **总体大设计 / 上游输入**：架构红线对齐、选型论证、决策记录 | 作为本文的**直接上游与生成轨迹**；其与本文重叠的明细（边界/数据/事件/契约）**以本文为准**，避免双权威漂移 |
| **本文** `SmartDesk系统详细设计与实现说明书.md` | **系统级详细设计 HOW**（spec-kit `/plan` 整理） | **系统详设唯一事实源**（实现据此） |
| `src/openapi/*.yaml` | 接口契约 | **接口唯一事实源** |
| `gateway子系统详细设计与实现说明书.md` | 早期自下而上产物 | 非权威，P2 由本文向下派生时对齐回填 |

> **消歧措施（均已落地，2026-06-14）**：① 本文"上游事实源"已补列架构设计说明书；② 架构设计说明书顶部已加指引 banner——"重叠明细以系统详设为准、本文不再随实现演进"（经梁栋授权代加），并将其 §1/§12 内联的"以本设计为准""待 CTO 确认"措辞同步对齐；③ 旧《gateway 子系统详设》已加"非事实源"头部声明并修正 §4.3 与契约相悖的端点（D1/D2），实质重写留 P2；④ 二者重叠章节此后只在本文维护。

---

## 目录
1. [设计原则与架构红线对齐](#1-设计原则与架构红线对齐)
2. [总体架构与服务边界](#2-总体架构与服务边界)
3. [配置数据归属](#3-配置数据归属)
4. [数据模型](#4-数据模型)
5. [契约总纲（OpenAPI）](#5-契约总纲openapi)
6. [领域事件模型与事件总线](#6-领域事件模型与事件总线)
7. [服务间信任与令牌传递](#7-服务间信任与令牌传递)
8. [鉴权与 RBAC（gateway 收口）](#8-鉴权与-rbacgateway-收口)
9. [核心流程：降级与异步写回](#9-核心流程降级与异步写回)
10. [可观测性基线与 NFR 落地](#10-可观测性基线与-nfr-落地)
11. [PRD §10.1 裁决落地映射](#11-prd-101-裁决落地映射)
12. [模块与任务划分（向 P2 派生）](#12-模块与任务划分向-p2-派生)
13. [契约决策 D1–D5（已裁定）](#13-契约决策-d1d5已裁定)
14. [冻结门禁与 DoD 状态](#14-冻结门禁与-dod-状态)
15. [附录：术语 / 追溯 / 生成轨迹](#15-附录术语--追溯--生成轨迹)

---

## 1. 设计原则与架构红线对齐

| 架构红线（验收下限，来自 SUP-9 / 组织说明书） | 本设计落地 |
|---|---|
| ≥3 微服务（gateway/core/insight）+ web 前端、4 代码仓、3 门语言（TS/Go/Python） | gateway(TS/NestJS)、core(Go)、insight(Py/FastAPI) 三服务 + web(TS/Next.js)，四仓独立、三语 ✔ |
| 核心建单链路 AI 不可用可降级（建单仍成功）；AI 分析异步写回不阻塞主流程 | 建单走 core 同步事务落库即成功；分类/定级/相似经事件总线**异步**交 insight、结果**异步写回** core（§9）✔ |
| 鉴权在 gateway 收口、RBAC 最小权限；越权/鉴权用例必过 | 外部流量经 gateway 完成 JWT+RBAC 后才转发；后端仅信任 gateway 注入身份+服务令牌（§7、§8）✔ |
| 与 PRD v1.0 §10.1 裁决一致（OQ-2/4/5/7/8/1/9/10/13） | 逐条落地映射见 §11 ✔ |

**贯穿原则**（对齐[宪法](../.specify/memory/constitution.md) I–VII）：契约优先（OpenAPI 3.1 唯一接口事实源）；文档单一事实源（本文）；事件驱动解耦；幂等与可审计；多租户维度预留但一期不实现隔离（OQ-7）；检索对二期向量前向兼容（OQ-5）；身份提供方可插拔（OQ-2）。

---

## 2. 总体架构与服务边界

### 2.1 架构总览

```
                       浏览器（报单人 / 坐席 / 组长 / 管理者）
                                     │ HTTPS REST/JSON · JWT Bearer
                                     ▼
        ┌──────────────────────────────────────────────────────────┐
        │ smartdesk-gateway (TS·NestJS) — 统一入口 / 认证 BFF          │
        │  · 登录/刷新/登出/会话(JWT, Redis)                          │
        │  · RBAC 收口（最小权限，未授权 403）                         │
        │  · 路由聚合（为前端拼装 core+insight 视图）、限流(429)、审计  │
        │  · 身份提供方可插拔（一期 Local；预留 OIDC）                 │
        └──────┬──────────────────────────────────────┬─────────────┘
        内部调用：mTLS + service-jwt（claims 承载最终用户身份）
               ▼                                        ▼
   ┌───────────────────────────┐         ┌──────────────────────────────┐
   │ smartdesk-core (Go)        │         │ smartdesk-insight (Py/FastAPI)│
   │ · 工单生命周期/八态状态机   │  事件   │ · 自动分类/定级建议            │
   │ · 分派/改派/转派/升级       │ ──────▶ │ · 相似检索（关键词→向量预留）  │
   │ · 评论/内部备注/@提及       │         │ · 统计聚合（看板读模型）       │
   │ · 附件元数据/关联合并        │ ◀────── │ · 通知（站内+邮件）/通知策略   │
   │ · SLA 计时/暂停恢复/超时     │  写回   │ · 消费 core 事件、异步写回建议  │
   │ · 时间线/审计（仅追加）      │         └───────────────┬──────────────┘
   │ · 权威配置：分类树/SLA 策略  │                         │
   │   /用户角色目录             │                         │
   └─────┬───────────┬──────────┘                         │
         │发布事件     │读写                                │发布/订阅 + 写回
         ▼            ▼                                    ▼
   ┌──────────┐  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
   │ NATS     │  │ PostgreSQL   │   │ 对象存储      │   │ insight 读模型    │
   │ JetStream│  │ (core OLTP)  │   │ (S3/MinIO)   │   │ (PG 独立 schema) +│
   │ 事件总线  │  └──────────────┘   └──────────────┘   │ 检索索引(全文→向量)│
   └──────────┘                                         └──────────────────┘
            gateway 会话/刷新令牌/限流计数 → Redis
```

### 2.2 服务边界与职责（最终边界，以此为准）

| 服务 | 仓库 | 语言 | 职责 | 不负责 |
|---|---|---|---|---|
| **gateway** | `smartdesk-gateway` | TS/NestJS | 认证（登录/刷新/登出/me）、RBAC 收口、对前端聚合 BFF、限流、审计埋点、身份提供方适配（Local/OIDC 预留） | 不持工单业务逻辑；不直连业务库（除自身会话/令牌） |
| **core** | `smartdesk-core` | Go | 工单 CRUD/状态机/分派/评论备注/附件元数据/关联合并/SLA 计时/时间线审计；**权威配置**：分类树、SLA 策略、用户角色目录；发布领域事件 | 不发通知；不做 AI 计算；不直面浏览器 |
| **insight** | `smartdesk-insight` | Py/FastAPI | 自动分类/定级建议、相似检索、统计聚合读模型、通知（站内+邮件）与策略、消费 core 事件异步写回建议 | 不持工单权威状态；不做鉴权（信任 gateway）；分类/相似**只给建议**，落库权在 core |
| **web** | `smartdesk-web` | TS/Next.js | 三端 UI（报单门户/坐席工作台/管理后台/看板） | 仅经 gateway 调用，不直连 core/insight |

**关键边界规则**：① 后端服务仅监听内网、外部不可达；② insight 永远"只建议"，工单权威状态只在 core；③ web 只认 gateway `/api/v1`。

---

## 3. 配置数据归属

| 配置 | 归属 | 理由 |
|---|---|---|
| 分类体系（taxonomy 树） | **core** | 驱动建单/分派/校验，强一致；insight 分类预测只读引用分类码 |
| SLA 策略（优先级→时限，可配/可暂停语义） | **core** | SLA 计时执行在 core，策略与执行同归避免漂移 |
| 用户/角色/权限主数据 | **core**（角色目录主数据）；**gateway** 持认证凭证/会话/令牌 | OQ-2：认证在 gateway 收口且 IdP 可插拔；角色授予属业务主数据归 core |
| 通知策略（按角色/事件类型订阅） | **insight** | 通知由 insight 发送，策略与执行同归 |

> 归属为既有架构裁决（梁栋）。开发期如有异议按 §13 决策路由交梁栋裁决。

---

## 4. 数据模型

> 完整字段见 [data-model.md](001-smartdesk-system/data-model.md)。约定：snake_case；主键 UUID v7；全业务表含 `org_id`(非空, 一期`default`)、`created_at`、`updated_at`；软删除 `deleted_at`（OQ-10 预留）。

### 4.1 存储选型
| 数据类别 | 存储 | 归属 | 说明 |
|---|---|---|---|
| 工单 OLTP | PostgreSQL | core | 强一致事务：工单/状态/分派/评论/附件元数据/SLA/时间线/配置/用户角色 |
| 附件对象 | S3/MinIO | core 管元数据 | ≤20MB、白名单、下载经鉴权（OQ-9） |
| 分析/统计读模型 | PostgreSQL（insight 独立 schema） | insight | 事件投影的聚合、通知记录、纠偏样本 |
| 检索索引 | 一期 PG 全文（中文分词）+ 标题/分类；预留 OpenSearch/向量 | insight | OQ-5 前向兼容，契约不绑实现 |
| 会话/令牌/限流 | Redis | gateway | 刷新令牌、登出黑名单、限流窗口 |

> **多租户预留（OQ-7）**：所有业务表含 `org_id`，索引/外键带 `org_id`；一期不实现跨组织隔离，二期可在仓储/查询层加租户过滤而不改表结构。

### 4.2 核心实体（摘要）

> **MVP 事实源口径**：当前 core 实现已按 `0001_init.sql` 压缩基线落地部分表；目标态完整拆分表随后续 gap 任务以独立 migration 补齐（D-5 裁决，见 §13）。

| 归属 | 当前 MVP 已落地 | 已预留 / 尚未落地（目标态） |
|---|---|---|
| **core OLTP** | `tickets`、`ticket_timeline`、`assignments`、`comments`、`attachments`、`sla_policies`、`sla_timers`、`categories`、`processed_events` | `users`/`roles`/`user_roles`（身份收口在 gateway，core 仅按需反查）、`sla_policy_targets`、`ticket_status_history`（独立历史表，当前状态变更写入 `ticket_timeline`）、`watchers`、`csat_ratings`、`ticket_links`、`idempotency_keys`（当前简化字段在 `tickets`/`comments`，未独立成表） |
| **insight 读模型** | — | `classification_feedback`、`similarity_index`、`notifications`、`notification_policies`、`stats_*`、`processed_events` |

- 字段、约束、ER 关系详见 `data-model.md` §A/§B/§D；目标态未落地表以 **预留** 标注，避免读者按完整 schema 施工。

### 4.3 工单状态机（OQ-8）

> **action 名以 [`core.yaml`](../src/openapi/core.yaml) `TransitionRequest.action` enum 为准**（O2 回填，2026-06-14）。示意图仅表达跃迁语义，不复用与契约不一致的措辞。

```
new ─accept→ accepted ─start→ in_progress ─resolve→ resolved ─close→ closed(终态)
                          in_progress ─wait_user→ pending_user ─(auto user_reply | start)→ in_progress
                          closed ─reopen(≤7天,OQ-13)→ in_progress
in_progress ─suspend→ suspended ─resume→ in_progress ；任意非终态 ─cancel→ cancelled(终态)
```

- `pending_user→in_progress`：**系统自动**（报单人回复，`user_reply`，非客户端 action）或坐席手工 `start`；**不复用 `resume`**（`resume` 仅 `suspended→in_progress`）。

**工单状态名中英文对照**（PRD §10.1 OQ-8 中文名 ↔ 数据库/契约字段）：

| 中文（PRD） | 英文（`tickets.status` / 契约） |
|---|---|
| 新建 | `new` |
| 受理 | `accepted` |
| 处理中 | `in_progress` |
| 待用户 | `pending_user` |
| 已解决 | `resolved` |
| 已关闭 | `closed` |
| 挂起 | `suspended` |
| 取消 | `cancelled` |

- 终态：`closed`、`cancelled`。`pending_user` 超时 v1 仅提醒（3 天/7 天），**不自动关闭**。
- 非法跃迁 **409 拒绝**；状态变更幂等（`Idempotency-Key`，当前简化实现未独立持久化 key）；当前写入 `ticket_timeline`，`ticket_status_history` 独立表为预留。

---

## 5. 契约总纲（OpenAPI）

接口唯一事实源在 [`src/openapi/`](../src/openapi/) 三份 OpenAPI 3.1（梁栋拍板、秦诺维护校验）：

| 文件 | 服务 | 暴露面 | 覆盖 PRD §6 首批契约 |
|---|---|---|---|
| [`gateway.yaml`](../src/openapi/gateway.yaml) | gateway 对外 BFF | `/api/v1`，JWT+RBAC+限流 | 登录/刷新/登出/me、工单/评论/附件/SLA/分派/相似/建议/统计/通知/admin 配置 |
| [`core.yaml`](../src/openapi/core.yaml) | core 内部 | `/v1` | 建单、查询/列表（过滤/分页）、状态流转、分派、评论/备注、附件、关联/合并、SLA 查询、时间线、watchers、csat、taxonomy/SLA/用户角色配置 |
| [`insight.yaml`](../src/openapi/insight.yaml) | insight 内部 | `/v1` | 分类预测、相似推荐、统计聚合、通知发送/查询/策略、分类纠偏写回 |

### 5.1 端点矩阵（现状）
- **gateway**：`/auth/{login,refresh,logout,me}`；`/tickets`(±id)；`/tickets/{id}/{transitions,assignments,comments,attachments,sla,timeline,csat,similar,suggestion}`（`csat` 为 D5 一期对外新增）；`/attachments/{attId}/download`；`/stats`(±export)；`/notifications`(±read)；`/admin/{categories,sla-policies,users,notification-policies}`。
- **core**：`/tickets`(±id)；`/tickets/{id}/{transitions,assignments,comments,attachments,links,sla,timeline,watchers,csat}`；`/attachments/{attId}/download-url`；`/config/{categories,categories/{id},sla-policies,users,users/{id}/roles}`；`/healthz`、`/readyz`。
- **insight**：`/classification/predict`；`/similarity/search`；`/stats/{aggregate,export}`；`/notifications`(±read)；`/notifications/policies`；`/feedback/classification`；`/healthz`、`/readyz`。

### 5.2 通用约定（三份共用，秦诺把守一致性）
- 版本：对外 `/api/v1`、内部 `/v1`；`info.version` 语义化；破坏性变更升 `v2` 并并行。
- 错误模型：`Error{code, message, details?, trace_id}`。HTTP 语义：400 校验 / 401 未认证 / 403 越权 / 404 不存在 / 409 状态冲突·非法跃迁 / 413 附件超限 / 422 业务规则 / 429 限流。
- 分页：`page`/`page_size`（或 `cursor`），响应 `{items, page, page_size, total}`。
- 幂等：写操作支持 `Idempotency-Key`（状态流转/分派/通知幂等）。
- 时间 RFC3339 UTC；时长用整数（分钟/秒）避免浮点。
- 安全：gateway 对外 `bearerAuth`(用户 JWT)；core/insight `serviceAuth`(服务令牌)，最终用户身份由 service-jwt claims（`sub`/`roles`/`org_id`）承载，不再依赖 `X-User-*` 明文透传头。

> **契约变更治理**：新增/修改/删除字段或路径须经梁栋批准；秦诺以 `api-contract-check` 校验实现与契约一致、把守共享 schema（Error/分页/事件）与版本。**§5.1 的 gateway↔core 对齐项已由 §13 D1/D5 裁定并落地（csat 已补、suggestion 用字段语义闭合）。**

---

## 6. 领域事件模型与事件总线

### 6.1 选型：NATS JetStream（目标架构）/ in-memory best-effort（当前 MVP）
**目标结论：采用消息队列（异步），选 NATS JetStream。** 满足"AI 异步写回不阻塞主流程""通知至少一次+消费幂等"；三语 SDK 齐全；单机可运行契合本组织并行上限。RabbitMQ 为等价备选——**事件 schema 与总线实现解耦**，切换不影响契约。同步调用被否（AI 故障会阻塞建单，违反红线）。

> **MVP 事实源（D-3 裁决）**：当前 core 实现为 `internal/event` **in-memory best-effort** 发布，无事务性 outbox / NATS relay；insight 通过同步 HTTP/同进程消费或内存事件接收。生产前必须升级为事务性 outbox + NATS JetStream relay，由 [SUP-296](mention://issue/c8498d4e-a331-4a39-8e43-f9944149b12c) backlog 跟踪。

### 6.2 事件信封（统一 schema，US-4.1 AC2）
```jsonc
{ "event_id":"uuidv7", "event_type":"ticket.created", "occurred_at":"RFC3339",
  "org_id":"default", "ticket_id":"uuid", "actor_id":"uuid|null", "version":1, "payload":{} }
```
主题 `smartdesk.<domain>.<event>`，JetStream Stream `SMARTDESK_EVENTS`。

### 6.3 事件清单
| event_type | 发布者 | 消费者 | 用途 |
|---|---|---|---|
| `ticket.created` | core | insight | 触发分类/定级/相似（异步写回） |
| `ticket.assigned` / `ticket.reassigned` | core | insight | 通知责任人 |
| `ticket.status_changed` | core | insight | 通知 + 统计投影 |
| `ticket.commented` | core | insight | @提及 / 对外评论通知 |
| `ticket.sla_warning` / `ticket.sla_breached` | core | insight | 预警/超时通知 + 升级建议 |
| `ticket.resolved` / `ticket.closed` / `ticket.reopened` | core | insight | 通知 + 质量统计（重开率） |
| `ticket.merged` | core | insight | 合并通知 |
| `insight.classification_suggested` | insight | core | **异步写回**分类/定级建议（core 落建议态） |

- **至少一次 + 幂等**：消费者按 `event_id` 去重（`processed_events`）；写回/通知幂等。
- **顺序（D3 已裁定）**：主题 `smartdesk.<domain>.<event>`、Stream `SMARTDESK_EVENTS`，以 `ticket_id` 一致性哈希分区，保证**单工单事件按 `occurred_at` 有序**；**跨工单不保证全局序**，消费侧仍须 `event_id` 幂等去重。已固化进 [`insight.yaml#/components/schemas/DomainEvent`](../src/openapi/insight.yaml) 描述附录。
- **`insight.classification_suggested` 写回落地（D1 已裁定：纯事件，不新增 core 同步写回端点）**，三条路径分清：
  1. **AI 写回（异步）**：insight 发 `insight.classification_suggested` → core 消费、按 `event_id` 幂等写工单详情 `Ticket.suggestion` 字段（落"建议态"）。**不开 core 同步内部 POST**——守住"AI 异步写回不阻塞主流程"红线，契约面最小。
  2. **读**：gateway `GET /tickets/{id}/suggestion` 的权威来源 = core 工单详情 `Ticket.suggestion`（`core.yaml` 已建模 `Ticket.suggestion: ClassificationSuggestion`），经 core 内部读取。
  3. **人工采纳/纠偏（同步）**：gateway `POST /tickets/{id}/suggestion` → core 应用分类（走 core 工单分类更新路径）+ insight `/feedback/classification` 回流。此为人触发的同步动作，**非 AI 写回**，不违反异步红线。

---

## 7. 服务间信任与令牌传递

```
浏览器 ──JWT(Bearer)──▶ gateway ──校验 JWT + RBAC──▶ 通过
gateway ──内部调用──▶ core/insight    （mTLS 双向证书通道）
  头：Authorization: Bearer <service-jwt>
      // service-jwt claims: sub=最终用户ID, roles=[requester|agent|...], org_id=组织ID
      // iss=gateway, aud=core|insight, 短时
      X-Request-Id  // 链路追踪（可选）
core/insight ──▶ 只信任 gateway 的 service-jwt（校验签名+aud+iss）；最终用户身份仅来自已验签 claims
```
- 后端仅监听内网，未经 gateway 的直达请求在网络层/令牌校验被拒（US-1.3 AC1）。
- 鉴权已在 gateway 收口，后端**不二次鉴权用户身份**，但用 service-jwt claims 中的 `roles`/`org_id` 做领域级过滤（内部备注过滤、本组工单范围）——最小权限的纵深防御。
- `X-Request-Id`/`trace_id` 全链路透传，落日志与时间线。

---

## 8. 鉴权与 RBAC（gateway 收口）

- **认证（一期自建账号）**：用户名/密码 → gateway 校验 → 签发 JWT（access 短时 + refresh 在 Redis），登出加黑名单；过期受保护接口 401（US-1.1）。**密码哈希仅存 gateway**，core 仅持 `credential_ref`。
- **IdP 可插拔（OQ-2）**：认证抽象 `IdentityProvider`，一期 `LocalProvider`，预留 `OidcProvider`；二期接 SSO 不改业务侧与下游契约。
- **RBAC（最小权限）**：JWT claims 携带 `sub/roles/org`；gateway 按"资源×动作×角色"矩阵判定，未授权 **403 且记审计**（US-1.2 AC5）。角色 `requester|agent|lead|manager|admin`，一账号可兼多角色。
- **越权红线用例（必过）**：requester 访问他人工单/管理后台 → 403；内部备注接口对 requester 不返回；附件下载越权 → 403；manager 改工单 → 403。
- **限流**：按用户/IP 滑窗，超阈值 **429**（US-1.3 AC2），计数存 Redis。
- **审计埋点**：关键请求记录 who/when/what/route（US-1.3 AC3）。

> gateway 认证/RBAC 为安全关键代码：合入按宪法 §V / 组织 §11 加 **后端 + 安全双评审**。

---

## 9. 核心流程：降级与异步写回

**提单到关闭主流程（落地 PRD §5.1）**：
```
1. web →(JWT) gateway 鉴权 → 转发 core 建单
2. core 单事务：校验必填 → 落库 ticket(status=new) → 启动 SLA 计时 → 写时间线 → 发 ticket.created → 立即返回工单号
   ★ 此处建单已成功；AI 可用与否与建单成败无关（降级，US-2.1 AC4 / SC-002）
3. insight 异步消费 ticket.created → 分类/定级/相似 → 发 insight.classification_suggested
4. core 异步消费写回：分类/定级落"建议态"（一期不自动改；阈值≥0.85 且开启自动填充时才自动填充——OQ-4）
5. 分派（手工/规则）→ 受理 → 处理 →（待用户：SLA 暂停）→ 已解决 → 通知报单人 → 确认关闭 / 7 天内可重开
6. 全程事件落总线 → insight 投影统计 → 看板近实时
```
- **降级**：insight/总线不可用时，建单/状态流转/评论等 core 主流程不受影响；建议为空、相似懒加载失败仅 UI 降级（US-3.3 AC3）。
- **异步不阻塞**：分类/定级/相似 P95<2s 且在主流程之外（SC-004）。
- **SLA 计时**：按优先级启动；`pending_user` 暂停、恢复顺延；临近发 `sla_warning`、超时 `sla_breached` + 标记 + 升级建议（US-2.5）。

---

## 10. 可观测性基线与 NFR 落地

| NFR（PRD §7） | 架构落地 |
|---|---|
| 列表/详情 P95<500ms | core 读路径索引（org_id+status、assignee_id、category_id）、分页强制上限；看板走 insight 预聚合读模型 |
| AI 分类/相似 P95<2s 且不阻塞 | insight 异步消费 + 写回；相似懒加载 |
| 可用性 ≥99.5%、核心建单可降级 | 服务独立部署、无状态可水平扩；AI/总线故障不影响建单（§9） |
| 安全 OWASP ASVS/Top10 | gateway 收口鉴权、输入校验、越权防护、TLS、审计 |
| 可靠性：幂等/至少一次/可审计 | 写操作 Idempotency-Key；事件至少一次+消费幂等；时间线仅追加审计 |
| 合规预留（OQ-10） | 软删除 + 审计不可篡改 + admin 导出/删除接口预留；留存期/法务判定 M4 GA 前由人类/法务确认（不阻塞 M1/M2） |

**可观测性三支柱**：结构化 JSON 日志（统一 `trace_id/request_id/org_id/actor_id`，审计独立不可篡改）；`/metrics`(Prometheus，关键指标 SLA 计时准确性、P95/P99、事件消费 lag、分类采纳率)；OpenTelemetry 全链路 trace；`/healthz`(liveness，进程存活即 200) + `/readyz`(readiness，core 服务本身可接收流量即 200，**不强制**探测 DB/NATS；依赖健康由独立基础设施探针或告警处理)（D-4 裁决）。

---

## 11. PRD §10.1 裁决落地映射

| 裁决 | 架构落地点 |
|---|---|
| OQ-1 SLA 优先级驱动/可配/可暂停/预警 | `sla_policies`+`sla_policy_targets`+`sla_timers`（§4.2）；v1 基线入种子；core SLA 引擎（§9） |
| OQ-2 自建账号+JWT/RBAC，预留 OIDC | gateway `IdentityProvider` 可插拔（§8） |
| OQ-4 一期"建议+人工确认"，阈值≥0.85 可配，分类 admin 树 | insight 只建议、core 落建议态（§9）；`categories` 树；`classification_feedback` 回流 |
| OQ-5 一期关键词+标题/分类，契约前向兼容向量 | insight 检索契约不绑实现；`similarity_index.embedding` 预留 |
| OQ-7 单组织起步，预留多租户 | 全表 `org_id`，一期不实现隔离（§4.1） |
| OQ-8 八态状态机 + 终态(已关闭/取消)、待用户超时仅提醒 | `tickets.status` 八态 + 状态机校验（§4.3）；超时发提醒不自动关闭（§9） |
| OQ-9 附件≤20MB/白名单/对象存储/下载鉴权 | `attachments`+OSS（§4.1）；上传校验、下载授权（§8） |
| OQ-12 解决后 1–5 星 CSAT | `csat_ratings` |
| OQ-13 关闭后 7 天可重开 | `tickets.reopen_count` + 重开窗口校验（core 状态机，可配） |
| OQ-10 合规预留 | 软删除 + 审计不可篡改 + 导出/删除接口预留（§10）；M4 GA 前人类/法务闭环 |
| OQ-3/6 入站建单/知识库 | 二期；一期事件/通知侧预留可扩展入站适配 |
| OQ-11 默认中文 | 前端 i18n 框架预留、文案外置 |

---

## 12. 模块与任务划分（向 P2 派生）

> 本系统详设冻结后，P2 由各模块 Leader **自顶向下**派生模块详设（`specs/<模块名>子系统详细设计与实现说明书.md`）；P3 `/tasks` 拆任务、P4 `/implement`。下表为系统级模块清单与跨服务里程碑，供 P2 解阻塞路由。

### 12.1 模块清单（按服务/团队）
- **gateway**（前端团队·关山主写；认证/RBAC 加后端+安全双评审）：GW-1 认证（JWT/会话/IdP 抽象）、GW-2 RBAC（矩阵/403/审计）、GW-3 聚合 BFF、GW-4 限流防护、GW-5 服务令牌+mTLS+透传头。
- **core**（后端团队·石磊骨架/集成；陈川=模块A，连城=模块B）：当前 MVP 已实现 `httpapi/domain/store` 轻量分层，落地 CORE-0 骨架（schema/迁移/内存事件/健康检查）、CORE-A1 状态机（八态流转/非法跃迁 409/7 天重开）、CORE-A2 分派/改派、CORE-A3 SLA 引擎（启动/暂停/恢复/查询）、CORE-B1 评论/备注可见性、CORE-B2 附件元数据/上传下载 URL/校验、CORE-B3 查询/列表/时间线/搜索过滤、CORE-C 配置（taxonomy/SLA）。**当前仍为 gap/技术债**：`insight.classification_suggested` 写回消费、watchers/csat 端点、关联/合并（CORE-B4）、独立 `ticket_status_history`/`idempotency_keys` 表、事务性 outbox + NATS relay、六边形/sqlc/oapi-codegen 分层，由 [SUP-296](mention://issue/c8498d4e-a331-4a39-8e43-f9944149b12c)/[SUP-298](mention://issue/c7b6eec2-990f-4491-ad9b-33cb47ac8151) 跟踪。跨模块集成与 `api-contract-check` CI 为石磊**跨切职责**，不另立 CORE-ID（O1）。
- **insight**（智能服务团队·苏睿算法；杨达通知/集成）：INS-1 事件消费骨架、INS-2 自动分类+纠偏回流、INS-3 定级建议、INS-4 相似检索、INS-5 统计聚合+看板查询、INS-6 通知（站内+邮件）、INS-7 通知策略。
- **web**（前端团队·江颜主写）：WEB-1 报单门户、WEB-2 坐席工作台、WEB-3 管理后台、WEB-4 看板报表、WEB-5 i18n 预留。

### 12.2 跨服务里程碑（对齐 PRD §9）

> O3 裁决（2026-06-14）：PRD §3.1 / US-2.5 / US-2.7 明确 SLA 与附件属 MVP 闭环；原 M2 清单遗漏 A3/B2，现补齐。写回消费与 B4 归 M3，与 D5（watchers/links 对外 M3）及 OQ-4（一期人工确认）一致。

- **M2 MVP**：GW-1/2/3 + CORE-0/A1/A2/**A3**/B1/**B2**/B3/C + WEB-1/2 + INS-1/6（站内通知）→ 提单→处理→关闭闭环（含 SLA 计时/暂停/预警事件、附件上传下载）。
- **M3 智能增强**：CORE-0（`classification_suggested` 写回消费）+ CORE-B4（关联/合并）+ INS-2/3/4/5 + WEB-4 看板 + INS-6 邮件 → AI 建议、写回落库、看板与合并能力可用。
- **M4 加固/发布**：NFR/安全/性能加固、灰度；OQ-10 合规闭环。

### 12.3 依赖与阻塞
- 开发 Issue **契约冻结前置 blocked**；冻结后架构团队通知各 Leader 解阻塞。
- 关键依赖：core 事件 schema（§6）是 insight 消费前置；gateway 聚合依赖 core/insight 契约；前端依赖 gateway BFF 契约。

---

## 13. 契约决策 D1–D5 / 架构漂移 D-2~D-5（已裁定）

> 梁栋于 2026-06-14 评审通过本详设草稿并逐条裁定 D1–D5（**契约决策最终裁定**）。已据此更新 `src/openapi/*.yaml` 并通过契约一致性校验（实质改动仅 D5 的 gateway `csat`；D1/D2/D3/D4 为语义固化与附录补充）。
>
> **core 模块架构漂移 D-2~D-5 已于 2026-06-17 由梁栋终裁**：当前 `httpapi/domain/store` 轻量 MVP 为 core 新事实源；原六边形/sqlc/oapi-codegen 分层、outbox/NATS JetStream relay、`/readyz` 强制探测 DB/NATS、完整 0001–0005 schema 拆分均降级为长期技术债或后续独立 migration 补齐（详见 §4/§6/§10/§12）。

| # | 决策点 | 裁定 | 依据 / 落地 |
|---|---|---|---|
| D1 | `insight.classification_suggested` **写回落地** | **B：纯事件，不新增 core 同步写回端点** | core 已把建议建模为工单详情字段 `Ticket.suggestion: ClassificationSuggestion`；三路径分清见 §6.3（AI 写回=异步事件、读=core 工单详情字段、人工采纳/纠偏=gateway POST 同步）。守"AI 异步写回不阻塞主流程"红线，契约面最小。**契约面无新增 core 端点，缺口语义闭合。** |
| D2 | gateway 详情**聚合边界** | **A：合工单主体 + 相似/建议懒加载** | gateway 合并工单主体，相似/建议走独立懒加载端点 `/similar`、`/suggestion`（符合 US-3.3 AC3，避免 N+1 与主加载阻塞）。维持现状契约，无需改。 |
| D3 | 事件**分区键/顺序** | **写入契约附录** | 按 `ticket_id` 一致性哈希分区、单工单按 `occurred_at` 保序；跨工单不保证全局序，消费侧仍须 `event_id` 幂等。已固化进 `insight.yaml#/components/schemas/DomainEvent` 描述 + §6.3。 |
| D4 | `org_id` 进**对外契约** | **A：不暴露** | 对外契约不出现 `org_id`，gateway 从 JWT 注入、服务间用 `X-Org-Id` 透传（OQ-7 一期单组织）。二期多租户再评估，届时升 `v2` 并行，不破坏一期契约。 |
| D5 | `csat`/`watchers`/`links` **对外一致性** | **分级** | **csat 一期对外补齐**：gateway 新增 `GET/POST /tickets/{id}/csat`，POST 映射 core 已有 `POST /tickets/{id}/csat`、GET 读取来源=core 工单详情 csat 字段（不另开 core GET）；`CsatCreate` 字段与 core 对齐。**watchers/links 暂不对外**：关联/合并（CORE-B4）与 watchers（绑 INS-6 通知 UX）属 M3，避免"端点已开、后端能力未到"的契约虚挂，待 M3 ready 时按契约变更治理（梁栋审批）再透出。 |

**本次契约改动（已提交本 PR）**：
- `gateway.yaml`：新增 `/tickets/{id}/csat`（GET+POST）+ schema `CsatCreate`/`CsatView`（D5）。
- `insight.yaml`：`DomainEvent` 描述补分区/顺序附录（D3）。
- `core.yaml`：无改动（D1 确认沿用 `Ticket.suggestion` 字段，不新增端点）。
- 校验：`openapi-spec-validator` 三份均 OK；契约↔契约共享约定（Error/分页/安全方案/事件信封）一致；实现侧空（契约冻结前不编码）。

> 至此 **D1–D5 全部已裁定，无悬置契约决策**。watchers/links 的 M3 对外透出列为后续契约变更项（非本轮缺口）。

---

## 14. 冻结门禁与 DoD 状态

**冻结状态**：v1.0 已于 2026-06-14 由梁栋确认冻结。

### DoD 勾稽（本 issue SUP-43）
- [x] `.specify/` 初始化（templates/scripts/memory）、constitution 落地（v1.0 草稿）
- [x] `specs/SmartDesk系统详细设计与实现说明书.md` 产出，覆盖 架构/边界/契约/数据/事件/选型
- [x] 与 PRD v1.0 及架构红线对齐；冲突/缺口显式列出
- [x] **梁栋评审通过 + D1–D5 裁定**；据此更新 `src/openapi/*.yaml` 并通过契约一致性校验（§13）
- [x] 资料团队评审（可读性/术语/合规）—— 文澜 2026-06-14 通过（附修订建议，已合入 §4.3）
- [x] 资料团队签字后贴冻结就绪摘要 + @CEO 报备
- [x] 经梁栋最终确认冻结（**v1.0，2026-06-14**）

### 待评审/确认事项
1. ~~§13 D1–D5 契约决策~~ —— **已由梁栋裁定并落地**（2026-06-14）。
2. constitution `RATIFICATION_DATE` 待资料团队评审 + CEO 报备后由人类确认。
3. OQ-10 合规（留存期/法务）保留人类/法务在 M4 GA 前闭环，不阻塞 M1/M2。

---

## 15. 附录：术语 / 追溯 / 生成轨迹

### 15.1 术语
工单/Ticket、SLA、FRT、MTTR、坐席/Agent、RBAC、CSAT、领域事件——见 [PRD §11](SmartDesk产品需求说明书PRD.md)。工单八态中英文对照见 [§4.3](#43-工单状态机oq-8)。

### 15.2 追溯
- 需求：PRD F1–F7 / US-1.1~7.3 → 本文 §2/§4/§9 与 spec.md FR-001~010。
- 裁决：PRD §10.1 OQ-* → spec.md Clarifications → 本文 §11。
- 契约：`src/openapi/*.yaml` ← 本文 §5 ← 梁栋拍板。

### 15.3 生成轨迹（spec-kit）
```
.specify/memory/constitution.md          ← /constitution (P0)
specs/001-smartdesk-system/spec.md       ← /specify + /clarify (P1)
specs/001-smartdesk-system/plan.md       ← /plan (P1)
  ├─ research.md  ├─ data-model.md  ├─ contracts/  └─ quickstart.md
specs/SmartDesk系统详细设计与实现说明书.md ← 本文（/plan 产物人类可读整理，唯一事实源）
```
