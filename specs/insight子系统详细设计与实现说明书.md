# SmartDesk 智能分析子系统（smartdesk-insight）详细设计与实现说明书

> 上游事实源：[《SmartDesk 系统详细设计与实现说明书》](SmartDesk系统详细设计与实现说明书.md) v1.0（main@6eaf281）、[src/openapi/insight.yaml](../src/openapi/insight.yaml)。
> 版本：v1.0（由系统详设 v1.0 派生）
> 编制：苏睿（智能服务团队 Leader / Committer）
> 协同：杨达（通知/集成）

## 0. 相对系统详设的修订记录

本文件为系统详设 v1.0 向 **smartdesk-insight** 模块的派生详设，系统详设仍是唯一权威事实源；如本文件与系统详设冲突，必须提交架构团队（梁栋）裁决，不得自行变更跨服务契约。

| 章节 | 相对系统详设的修订说明 |
|---|---|
| §1 范围与职责边界 | 引用系统详设 §2.2，聚焦 insight 自身红线：不持有工单权威状态、只给建议、不对外暴露。 |
| §2 模块架构与分层 | 在系统详设 §2.1 总架构基础上，增加 insight 内部服务定位图、进程/部署视图、建议代码目录；明确 FastAPI + 端口-适配器风格。 |
| §3 数据/存储 | 系统详设 §4.2 仅列出 insight 读模型表名；本文件补充核心表的 DDL、索引与存储选型 rationale。 |
| §4 API/契约对齐 | 系统详设 §5.1 为端点矩阵摘要；本文件逐条覆盖 `insight.yaml` 全部路径，并补充 **gateway↔insight BFF 路由映射表**。 |
| §5 跨服务交互 | 系统详设 §6.3 已给出 D1 三条路径原则；本文件显式展开三条路径、给出 `insight.classification_suggested` 事件 payload 的嵌套 `PredictResult` 结构，并补充降级策略。 |
| §6 内部组件划分 | 系统详设 §12.1 给出 INS-1~7 清单；本文件逐条映射到组件/责任人，并明确杨达承接 INS-6/7。 |
| §7 任务分解与里程碑 | 系统详设 §12.2 给出 M2/M3/M4；本文件细化到 INS 任务、负责人、依赖关系。 |
| §8 依赖与阻塞 | 在系统详设 §12.3 基础上，按 insight 视角重新梳理前置与下游。 |
| §9 开放事项 | 新增模块级待决策项，标记需架构团队确认的内容。 |
| P4 实现状态刷新 | 2026-06-17 对照 `src/smartdesk-insight` submodule@`d0fb07d` 回贴 done/gap/drift；详见 §7.3。 |

> **冲突处理原则**：本文件任何与系统详设、`src/openapi/*.yaml` 不一致之处，以上游事实源为准；开发期发现冲突立即提交架构团队裁决，禁止在实现侧“先按模块详设走”。
>
> **归档说明（P4）**：本轮未发现独立的 insight 旧版详设归档文件；历史实现说明若与系统详设 v1.0 或 `src/openapi/insight.yaml` 冲突，均视为已归档参考，不作为实现依据。

## 1. 范围与职责边界

依据系统详设 **§2.2 服务边界与职责（最终边界，以此为准）**，`smartdesk-insight` 的职责与红线如下：

| 维度 | 边界说明 |
|---|---|
| **核心职责** | 自动分类/定级建议、相似工单检索、统计聚合读模型、通知（站内+邮件）与通知策略、消费 core 事件并异步写回建议。 |
| **权威状态** | **insight 不持有工单权威状态**。分类、定级、相似结果均为“建议”；最终落库/采纳/修改权归 `smartdesk-core`。 |
| **对外暴露** | **不直接对外暴露**。所有浏览器流量经 `smartdesk-gateway` 转发，insight 仅接受来自 gateway 的内部调用。 |
| **信任模型** | 后端服务间调用采用 `serviceAuth`（gateway 签发的 service-jwt，aud=insight），service-jwt claim 承载身份/租户（`sub`、`roles`、`org_id`），`X-Request-Id` 仅作链路追踪。insight 不二次鉴权用户身份，但用 service-jwt 已验签 claims（sub/roles/org_id）做领域级过滤与日志（系统详设 §7）。 |
| **配置归属** | 分类树（taxonomy）、SLA 策略、用户角色目录等权威配置归 core；insight 只读引用分类码与 SLA 优先级映射（系统详设 §3）。 |
| **通知策略** | 通知策略由 insight 持有并执行，与通知发送同归一域。 |

**红线重申**：
1. insight 任何情况下不得直接写入 core OLTP 业务表。
2. 对外契约不出现 `org_id`；`org_id` 由内部服务间 service-jwt claim 承载（系统详设 D4 裁决）。
3. AI 分类/定级/相似必须异步执行，不得阻塞 core 建单主流程（系统详设 §9）。

## 2. 模块架构与分层

### 2.1 服务定位图

```
                       浏览器（报单人 / 坐席 / 组长 / 管理者）
                                     │ HTTPS REST/JSON · JWT Bearer
                                     ▼
        ┌──────────────────────────────────────────────────────────┐
        │ smartdesk-gateway (TS·NestJS) — 统一入口 / 认证 BFF          │
        │  · JWT+RBAC 收口 / 限流 / 审计                              │
        │  · 对 insight 的 BFF 路由：/tickets/{id}/similar、           │
        │    /tickets/{id}/suggestion、/stats、/stats/export、        │
        │    /notifications、/admin/notification-policies             │
        └────────────────────────────┬─────────────────────────────┘
                                     │ mTLS + service-jwt（sub/roles/org_id）+ X-Request-Id
                                     ▼
        ┌──────────────────────────────────────────────────────────┐
        │ smartdesk-insight (Python/FastAPI)                        │
        │  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐ │
        │  │ HTTP API    │  │ Event       │  │ Background Workers│ │
        │  │ (FastAPI)   │  │ Consumer    │  │ (通知/统计补偿)    │ │
        │  └──────┬──────┘  └──────┬──────┘  └───────────────────┘ │
        │         │                │                               │
        │  ┌──────▼────────────────▼──────┐  ┌───────────────────┐ │
        │  │ Application Services         │  │ ML / Search /Stats│ │
        │  │ · classification_service     │  │ · classifier      │ │
        │  │ · similarity_service         │  │ · similarity      │ │
        │  │ · stats_service              │  │ · stats_projector │ │
        │  │ · notification_service       │  │ · notifier        │ │
        │  │ · policy_service             │  │                   │ │
        │  └──────┬───────────────────────┘  └───────────────────┘ │
        │         │                                                   │
        │  ┌──────▼──────────────────────────────────────────────┐  │
        │  │ Repositories (SQLAlchemy Async / asyncpg)           │  │
        │  │ classification_feedback / similarity_index          │  │
        │  │ notifications / notification_policies               │  │
        │  │ stats_* / processed_events                          │  │
        │  └─────────────────────────────────────────────────────┘  │
        └──────────┬────────────────────────────────────────────────┘
                   │ NATS JetStream
        ┌──────────┴──────────┐
        ▼                     ▼
  ┌──────────┐         ┌─────────────────┐
  │ PostgreSQL│         │ SMTP/邮件网关    │
  │ insight  │         │ （邮件通道）     │
  │ 独立schema│         └─────────────────┘
  └──────────┘
```

### 2.2 进程与部署视图

| 进程 | 技术 | 说明 |
|---|---|---|
| `api` | FastAPI + Uvicorn | 实现 `insight.yaml` HTTP 接口；无状态，水平扩展。 |
| `worker` | `nats-py` + `asyncio` | 事件消费者；可与 api 同进程启动，也可独立部署以单独扩缩容。 |
| `scheduler` | APScheduler / Celery Beat（预留） | 定时补偿：相似索引刷新、统计预聚合校对、通知重试。 |

**一期建议**：`api` 与 `worker` 同容器不同协程，降低部署复杂度；统计预聚合以事件驱动为主、定时补偿为辅。

### 2.3 建议代码目录（FastAPI + 端口-适配器）

```
smartdesk-insight/
├── app/
│   ├── main.py                 # FastAPI 工厂 + 生命周期
│   ├── config.py               # Pydantic Settings
│   ├── api/
│   │   ├── deps.py             # DB session、service token 校验
│   │   ├── routers/
│   │   │   ├── classification.py   # /classification/predict
│   │   │   ├── similarity.py       # /similarity/search
│   │   │   ├── stats.py            # /stats/aggregate, /stats/export
│   │   │   ├── notifications.py    # /notifications, /notifications/{id}/read
│   │   │   ├── policies.py         # /notifications/policies
│   │   │   └── feedback.py         # /feedback/classification
│   │   └── health.py
│   ├── services/               # 应用服务层（端口）
│   │   ├── classification.py
│   │   ├── similarity.py
│   │   ├── stats.py
│   │   ├── notification.py
│   │   └── policy.py
│   ├── domain/                 # 领域模型
│   │   ├── events.py           # DomainEvent / payload Pydantic 模型
│   │   └── models.py           # SQLAlchemy ORM
│   ├── infrastructure/         # 适配器
│   │   ├── db.py
│   │   ├── nats_client.py
│   │   ├── search.py           # PG 全文检索 / 二期向量封装
│   │   ├── mailer.py
│   │   └── security.py         # serviceAuth JWT 校验
│   └── workers/
│       ├── event_consumer.py   # 统一入口
│       └── handlers.py         # ticket.created 等处理器
├── ml/
│   ├── classifier.py
│   ├── priority_estimator.py
│   ├── features.py
│   └── seeds/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── contracts/              # api-contract-check 用例
├── alembic/
├── Dockerfile
├── pyproject.toml
└── README.md
```

## 3. 数据/存储

### 3.1 存储选型

| 数据类别 | 存储 | 归属 | 说明 |
|---|---|---|---|
| 分析/统计读模型 | PostgreSQL（insight 独立 schema） | insight | 事件投影的聚合、通知记录、纠偏样本、幂等消费。 |
| 检索索引 | 一期 PG 全文检索（中文分词）+ 标题/分类；二期预留向量 | insight | OQ-5 前向兼容，契约不绑实现。 |
| 邮件发送 | SMTP/邮件网关 | insight | 邮件通道一期建议用 SMTP；网关选型待架构确认（§9）。 |
| 事件总线 | NATS JetStream | 共享基础设施 | insight 订阅 core 事件、发布写回事件（系统详设 §6.1）。 |

**多租户预留**：所有业务表含 `org_id`（一期默认 `default`），不对外暴露；二期可在查询层加租户过滤而不改表结构（系统详设 §4.1 / D4 裁决）。完整字段与 ER 关系另见 [data-model.md](001-smartdesk-system/data-model.md)。

### 3.2 insight 核心读模型 DDL

以下 DDL 基于 [data-model.md](001-smartdesk-system/data-model.md) §B 细化，用于模块实现与评审。所有表均位于 insight 独立 schema，主键 UUID v7，默认含 `org_id`、`created_at`、`updated_at`。

```sql
-- 分类纠偏回流样本（OQ-4）
CREATE TABLE classification_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    org_id TEXT NOT NULL DEFAULT 'default',
    ticket_id UUID NOT NULL,
    predicted_category_id UUID,
    confidence NUMERIC(4,3) CHECK (confidence >= 0 AND confidence <= 1),
    accepted BOOLEAN NOT NULL,
    corrected_category_id UUID,
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_classification_feedback_org_ticket
    ON classification_feedback (org_id, ticket_id);
CREATE INDEX idx_classification_feedback_created
    ON classification_feedback (created_at);

-- 相似检索索引（一期全文+标题/分类；向量预留 OQ-5）
CREATE TABLE similarity_index (
    ticket_id UUID PRIMARY KEY,
    org_id TEXT NOT NULL DEFAULT 'default',
    title_norm TEXT NOT NULL,
    category_id UUID,
    keywords_tsv TSVECTOR,
    embedding VECTOR(768),          -- 二期向量预留；一期可为空
    status TEXT NOT NULL,
    resolution_excerpt TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_similarity_index_tsv
    ON similarity_index USING GIN (keywords_tsv);
CREATE INDEX idx_similarity_index_org_category
    ON similarity_index (org_id, category_id);
-- 二期启用：CREATE INDEX idx_similarity_index_embedding
--     ON similarity_index USING hnsw (embedding vector_cosine_ops);

-- 站内/邮件通知记录（至少一次 + 幂等）
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    org_id TEXT NOT NULL DEFAULT 'default',
    user_id UUID NOT NULL,
    ticket_id UUID,
    type TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('inapp', 'email')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
    read_at TIMESTAMPTZ,
    dedupe_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, dedupe_key)
);
CREATE INDEX idx_notifications_user_unread
    ON notifications (org_id, user_id, read_at, created_at DESC);
CREATE INDEX idx_notifications_dedupe
    ON notifications (org_id, dedupe_key);

-- 通知策略（按角色+事件类型+通道订阅开关）
CREATE TABLE notification_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    org_id TEXT NOT NULL DEFAULT 'default',
    role TEXT NOT NULL CHECK (role IN ('requester','agent','lead','manager','admin')),
    event_type TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('inapp', 'email')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, role, event_type, channel)
);
CREATE INDEX idx_notification_policies_lookup
    ON notification_policies (org_id, event_type, enabled);

-- 事件消费幂等去重（至少一次 + 幂等）
CREATE TABLE processed_events (
    event_id UUID PRIMARY KEY,
    event_type TEXT NOT NULL,
    consumer TEXT NOT NULL DEFAULT 'insight',
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'success'
        CHECK (status IN ('success', 'skipped', 'failed'))
);
CREATE INDEX idx_processed_events_processed_at
    ON processed_events (processed_at);

-- 统计预聚合示例：按时间桶/分类出量（事件投影）
CREATE TABLE stats_volume (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
    org_id TEXT NOT NULL DEFAULT 'default',
    bucket TIMESTAMPTZ NOT NULL,           -- 时间桶起始
    interval TEXT NOT NULL DEFAULT 'day',  -- hour/day/week/month
    category_id UUID,
    priority TEXT,
    status TEXT,
    assignee_id UUID,
    value INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, bucket, interval, category_id, priority, status, assignee_id)
);
CREATE INDEX idx_stats_volume_lookup
    ON stats_volume (org_id, interval, bucket, category_id, priority);

-- 其他统计预聚合表按 metric 维度拆分：
-- stats_sla、stats_resolution_time、stats_backlog、stats_reopen、
-- stats_agent_workload、stats_csat；结构参考 stats_volume，按指标语义调整 value 类型。
```

> **存储约定**：`org_id` 仅用于内部多租户预留，不出现在对外契约或 gateway 响应中（D4 裁决）。`embedding` 列一期可空，二期接入 `pgvector` 后启用 HNSW 索引；检索契约（`SimilarityResult.method`、`score`）保持不变。

## 4. API/契约对齐

接口唯一事实源为 [`src/openapi/insight.yaml`](../src/openapi/insight.yaml)。本节逐条覆盖 insight 全部 HTTP 路径，并给出 gateway BFF 路由映射。

### 4.1 `insight.yaml` 路径覆盖矩阵

| insight 路径 | 方法 | 功能 | 关键实现说明 |
|---|---|---|---|
| `/classification/predict` | POST | 自动分类 + 定级建议 | 输入 `PredictRequest`；输出 `PredictResult`（含嵌套 `category`/`priority`、阈值、模式）。模型不可用时返回 503，调用方降级。 |
| `/similarity/search` | POST | 相似工单 Top-N | 输入 `SimilarityRequest`；输出 `SimilarityResult`。一期 `method=keyword`，二期可返回 `vector`/`hybrid`，契约字段不变。 |
| `/stats/aggregate` | GET | 看板聚合 | 读预聚合 `stats_*` 表；参数 `metric`/`group_by`/`interval`/`from`/`to` 与 gateway `/stats` 对齐。 |
| `/stats/export` | GET | CSV 导出 | 同 aggregate 查询逻辑，流式生成 CSV。 |
| `/notifications` | GET | 站内通知列表 | 支持 `unread_only`、`page`、`page_size`；响应含 `unread_count`。 |
| `/notifications` | POST | 发送通知 | 至少一次 + 幂等 `dedupe_key`；返回 202 表示已受理异步发送。 |
| `/notifications/{notifId}/read` | POST | 标记已读 | 204 返回；幂等。 |
| `/notifications/policies` | GET | 通知策略查询 | 按角色/事件类型/通道返回订阅开关。 |
| `/notifications/policies` | PUT | 通知策略配置 | admin 即时生效；写策略表。 |
| `/feedback/classification` | POST | 分类纠偏回流 | 记录人工采纳/纠偏，供模型迭代。 |
| `/healthz` | GET | liveness | 无鉴权。 |
| `/readyz` | GET | readiness | 含 DB、NATS 连通性检查；无鉴权。 |

### 4.2 gateway↔insight BFF 路由映射表

gateway 对外暴露 `/api/v1` 前缀，内部转发至 insight `/v1`。gateway 负责鉴权、RBAC、用户身份透传与简单聚合。

| gateway 对外路径 | insight 内部路径 | 用途 | 聚合/翻译说明 |
|---|---|---|---|
| `GET /tickets/{id}/similar` | `POST /similarity/search` | 相似工单推荐 | gateway 将 ticket_id 与 core 工单摘要一并转发；响应直接透传 `SimilarityResult`。 |
| `GET /tickets/{id}/suggestion` | （读 core `Ticket.suggestion`） | 分类/定级建议查询 | **权威来源为 core 工单详情字段**，gateway 不直接调用 insight 读取（D1 路径②）。 |
| `POST /tickets/{id}/suggestion` | `POST /feedback/classification` + core 分类更新 | 采纳/纠偏分类 | gateway 先写 core 应用分类/优先级，再回流 insight feedback；返回 core 更新后的 `Ticket`。 |
| `GET /stats` | `GET /stats/aggregate` | 看板聚合 | 参数透传，gateway 做角色范围收敛（manager/lead）。 |
| `GET /stats/export` | `GET /stats/export` | CSV 导出 | 透传，gateway 仅做鉴权。 |
| `GET /notifications` | `GET /notifications` | 通知列表 | 签发 service-jwt 并携带 sub/roles/org_id claims。 |
| `POST /notifications/{id}/read` | `POST /notifications/{id}/read` | 标记已读 | 透传。 |
| `GET /admin/notification-policies` | `GET /notifications/policies` | 通知策略查询 | admin 角色鉴权后透传。 |
| `PUT /admin/notification-policies` | `PUT /notifications/policies` | 通知策略配置 | admin 角色鉴权后透传。 |

> **注意**：`GET /tickets/{id}/suggestion` 的读取来源是 **core `Ticket.suggestion`**，不是 insight。该字段由 core 在消费 `insight.classification_suggested` 事件后写入（D1 路径①）。这是为了避免前端对同一建议存在 core/insight 双源，确保权威唯一。

## 5. 跨服务交互

### 5.1 事件消费清单（系统详设 §6.3）

insight 订阅 NATS JetStream 主题 `smartdesk.ticket.>`，消费者组 `insight-workers`。

| event_type | 发布者 | insight 用途 |
|---|---|---|
| `ticket.created` | core | 触发分类/定级/相似计算；发布 `insight.classification_suggested` 写回。 |
| `ticket.assigned` / `ticket.reassigned` | core | 通知责任人。 |
| `ticket.status_changed` | core | 通知 + 统计投影。 |
| `ticket.commented` | core | @提及 / 对外评论通知。 |
| `ticket.sla_warning` / `ticket.sla_breached` | core | 预警/超时通知 + 升级建议。 |
| `ticket.resolved` / `ticket.closed` / `ticket.reopened` | core | 通知 + 质量统计（重开率）。 |
| `ticket.merged` | core | 合并通知。 |

**幂等与顺序**：按 `event_id` 在 `processed_events` 表去重；按 `ticket_id` 一致性哈希分区，保证单工单事件按 `occurred_at` 有序（系统详设 §6.3 / D3 裁决）。

### 5.2 D1 三条路径（写回 / 读 / 人工纠偏）

系统详设 §6.3 / §13 D1 已裁定：分类建议写回采用**纯事件机制**，不新增 core 同步写回端点。insight 侧必须严格区分以下三条路径：

#### 路径①：AI 异步写回（insight → core）

insight 消费 `ticket.created` 后，调用分类/定级/相似算法，发布事件：

```jsonc
{
  "event_id": "<uuidv7>",
  "event_type": "insight.classification_suggested",
  "occurred_at": "2026-06-14T12:00:00Z",
  "org_id": "default",
  "ticket_id": "<ticket_uuid>",
  "actor_id": null,
  "version": 1,
  "payload": {
    "ticket_id": "<ticket_uuid>",
    "category": {
      "category_id": "<uuid>",
      "confidence": 0.92
    },
    "priority": {
      "value": "P2",
      "confidence": 0.85
    },
    "threshold": 0.85,
    "auto_fill_recommended": true,
    "mode": "suggest"
  }
}
```

**关键约束**：
- payload 必须与 `insight.yaml#/components/schemas/PredictResult` 的**嵌套结构**保持一致：
  - `category.category_id` + `category.confidence`
  - `priority.value` + `priority.confidence`
  - `threshold`、`auto_fill_recommended`、`mode`
- **禁止使用**扁平字段如 `category_id`、`category_confidence`。
- core 消费后，按 `event_id` 幂等写入工单详情 `Ticket.suggestion`（`ClassificationSuggestion` 扁平视图：category_id、confidence、priority、applied）。core 内部完成从 `PredictResult` 到 `ClassificationSuggestion` 的转换。
- 一期 `mode=suggest`；`auto_fill_recommended=true` 仅表示“满足自动填充条件”，是否真正自动填充由 core 根据系统配置决策（OQ-4：阈值≥0.85 且开启自动填充时）。

#### 路径②：读建议（gateway → core）

gateway `GET /tickets/{id}/suggestion` 的**权威来源 = core `Ticket.suggestion` 字段**，不直接读取 insight。原因：
- 保证前端始终读取 core 持有的权威建议态；
- 避免 core/insight 双源导致的状态漂移；
- 与系统详设 D1“契约面最小”原则一致。

#### 路径③：人工采纳/纠偏（gateway → core + insight feedback）

gateway `POST /tickets/{id}/suggestion` 流程：
1. gateway 校验 RBAC 后，将采纳/纠偏结果写入 core（更新工单 `category_id`/`priority`）。
2. core 应用分类更新，返回更新后的 `Ticket`。
3. gateway 同步调用 insight `POST /feedback/classification`，记录人工决策样本：
   - `accepted=true`：直接采纳 AI 建议；
   - `accepted=false` + `corrected_category_id`：人工纠偏。

此路径是**人触发的同步动作**，不是 AI 异步写回，因此不违反“AI 异步写回不阻塞主流程”红线。

### 5.3 降级与容错

| 故障场景 | 行为 |
|---|---|
| 分类模型不可用 | `POST /classification/predict` 返回 503；core 建单仍成功，建议为空。 |
| 相似检索不可用 | 返回空列表；web 详情页懒加载失败不阻断主内容。 |
| 事件总线不可用 | core 建单仍成功；insight 上线后通过漏事件补偿机制从 core 批量同步（M4 预留）。 |
| 通知发送失败 | 状态置 `failed`，指数退避重试 3 次；仍失败记录死信，人工排查。 |
| AI 写回事件丢失 | core 未收到写回时，`Ticket.suggestion` 为空；用户仍可在详情页手动触发预测/采纳。 |

**核心原则**：AI/bus 故障必须不阻塞 ticket 创建与核心流程（系统详设 §9 红线）。

## 6. 内部组件划分

依据系统详设 §12.1，insight 模块拆分为 INS-1~7，映射如下：

| 编号 | 组件 | 对应系统详设 | 职责 | 责任人 | 关键交付物 |
|---|---|---|---|---|---|
| **INS-1** | 事件消费骨架 | §12.1 INS-1 | NATS JetStream 订阅、统一路由、`processed_events` 幂等、ACK/NAK 策略。 | 苏睿 | `workers/event_consumer.py`、`domain/events.py` |
| **INS-2** | 自动分类 + 反馈回流 | §12.1 INS-2 | 规则+轻量模型分类、置信度校准、发布 `insight.classification_suggested`、接收 `/feedback/classification`。 | 苏睿 | `ml/classifier.py`、`services/classification.py`、`routers/feedback.py` |
| **INS-3** | 定级建议 | §12.1 INS-3 | 基于关键词紧急度 + 分类默认优先级给出 `priority.value`/`confidence`。 | 苏睿 | `ml/priority_estimator.py` |
| **INS-4** | 相似检索 | §12.1 INS-4 | PG 全文检索 + 标题/分类相似；向量预留；`/similarity/search`。 | 苏睿 | `infrastructure/search.py`、`services/similarity.py` |
| **INS-5** | 统计聚合 + 看板查询 | §12.1 INS-5 | 事件投影到 `stats_*` 预聚合表；`/stats/aggregate`、`/stats/export`。 | 苏睿 | `services/stats.py`、`workers/stats_projector.py` |
| **INS-6** | 通知中心 | §12.1 INS-6 | 站内通知列表/已读、邮件发送、至少一次送达与幂等、`/notifications`。 | 杨达 | `services/notification.py`、`infrastructure/mailer.py`、`routers/notifications.py` |
| **INS-7** | 通知策略 | §12.1 INS-7 | 按角色/事件类型/通道的策略表；`/notifications/policies`。 | 杨达 | `services/policy.py`、`routers/policies.py` |

**分工说明**：
- 苏睿负责算法核心（INS-2/3/4/5）、事件消费骨架（INS-1）、与 core/gateway 的集成边界，以及本域 Committer 检视与合入。
- 杨达负责 INS-6/7（通知/集成），苏睿负责定义事件契约与调用边界并做合入前 review。
- 常规合入：1 名同域开发者 review + 苏睿 approve；关键代码（安全、契约、跨服务集成、通知幂等）须经集体检视：≥2 名开发、累计 ≥3 分（含 Committer 1 分）。

## 7. 任务分解与里程碑

对齐系统详设 §12.2 的 M2/M3/M4。

### 7.1 里程碑定义

| 里程碑 | 目标 | 包含任务 | 交付标志 |
|---|---|---|---|
| **M2 MVP 闭环** | 提单→处理→关闭基础闭环 | INS-0（脚手架）+ INS-1（事件骨架）+ INS-6（站内通知） | core 事件可被 insight 消费并生成站内通知；gateway 通知中心可查询/标记已读。 |
| **M3 智能增强** | AI 建议、相似推荐、看板统计、通知策略 | INS-2/3/4/5 + INS-7 + INS-6 邮件通道 | `/classification/predict`、`/similarity/search`、`/stats/aggregate` 可用；通知策略生效。 |
| **M4 加固/发布** | NFR、安全、合规、灰度 | 全模块 hardening、准确率监控、通知死信处理、漏事件补偿 | 通过 NFR 测试；灰度发布；OQ-10 合规闭环。 |

### 7.2 任务清单与依赖

| 任务 | 负责人 | 依赖 | 状态/目标 |
|---|---|---|---|
| INS-0 服务脚手架 | 苏睿 | `insight.yaml` 冻结 | **drift/gap**：FastAPI、配置、Docker、DB session 可用；缺 Alembic、CI、契约测试，目录分层与 §2.3 不一致。 |
| INS-1 事件消费骨架 | 苏睿 | NATS 部署、core 事件 schema | **done/drift**：JetStream 消费、ACK/NAK、`event_id` 幂等、写回发布已实现；缺 `ticket_id` 顺序分区、失败状态记录，payload 判别模型未固化。 |
| INS-2 自动分类 | 苏睿 | taxonomy 分类树、种子语料 | **done**：`/classification/predict`、种子语料、准确率测试、`PredictResult` 嵌套结构已实现。 |
| INS-3 定级建议 | 苏睿 | INS-2 | **done**：关键词紧急度 + 分类默认优先级已与分类接口一并返回。 |
| INS-4 相似检索 | 苏睿 | `similarity_index` 表、core 事件补充标题/状态 | **gap**：`similarity_index`、搜索适配器、服务、router、降级测试均缺失。 |
| INS-5 统计聚合 | 苏睿 | core 全量事件、stats_* 表 | **gap**：`stats_*` 读模型、投影、查询服务、CSV 导出接口均缺失。 |
| INS-6 通知中心 | 杨达 | INS-1、邮件网关 | **done/gap-closure-pending**：基线站内/邮件通知、重试、死信、幂等已实现；PR11 已将默认策略收敛为“无策略时只生成站内通知，email 需显式策略开启”，待 PR11 合入后同步为最终状态。 |
| INS-7 通知策略 | 杨达 | INS-6 | **done/drift**：`GET/PUT /notifications/policies` 已实现；文件位置与 §2.3 `policies.py` 建议路径不一致，缺 admin 角色校验。 |

### 7.3 P4 实现状态刷新（2026-06-17）

本节对照 `src/smartdesk-insight` submodule@`d0fb07d`，用于 P4 done/gap/drift 验收；逐项任务级回贴见 [`specs/insight/tasks.md`](insight/tasks.md) §0.4。

| 维度 | 状态 | 证据 | 处置建议 |
|---|---|---|---|
| HTTP 契约覆盖 | **partial** | 已实现 `/classification/predict`、`/feedback/classification`、`/notifications`、`/notifications/{notifId}/read`、`/notifications/policies`、`/healthz`、`/readyz`；缺 `/similarity/search`、`/stats/aggregate`、`/stats/export`。 | INS-4/5 补实现；补契约测试校验 FastAPI OpenAPI 与 `src/openapi/insight.yaml`。 |
| 事件链路 | **partial** | `app/nats_consumer.py` 消费 `smartdesk.ticket.*`，`ProcessedEvent` 幂等，`ticket.created` 发布 `insight.classification_suggested`。 | 补 `ticket_id` 顺序分区、失败状态、M4 payload 判别模型；`ticket.created` 同步维护相似索引。 |
| 分类/定级 | **done** | `ml/classifier.py`、`ml/priority_estimator.py`、`app/services/classification.py`，测试覆盖准确率、嵌套结构和 503 降级。 | 保持；后续 taxonomy 同步方式需按 O-6 决策。 |
| 相似检索 | **gap** | 未发现 `app/infrastructure/search.py`、`app/services/similarity.py`、similarity router 或 `similarity_index` ORM。 | 本域补实现，契约不变。 |
| 统计聚合 | **gap** | 未发现 stats ORM、projector、service、router。 | 本域补实现，契约不变。 |
| 通知/策略 | **done/gap-closure-pending** | 基线 `app/services/notifications.py`、`app/infrastructure/mailer.py`、`NotificationDeadLetter`、策略接口已实现；submodule@`d0fb07d` 未含 PR11，仍表现为缺省 inapp+email。PR11 已补齐站内默认、邮件显式开启，并报 `python -m pytest -q` 40 passed。 | 以 PR11 为目标事实源；待 PR11 合入后同步主仓状态，不把基线双通道默认作为最终结论。 |
| 服务鉴权/可观测 | **partial** | `app/auth.py` 已校验 service JWT；JSON 日志存在；`readyz` 只查 DB。 | 补 NATS readiness、request context 日志字段；安全/契约相关提交前需苏睿 committer 检视。 |
| 验证结果 | **baseline+PR11 pending** | 2026-06-17 基于 submodule@`d0fb07d` 本地 `python -m pytest tests -q`：31 passed / 4 failed；4 个失败对应 PR11 已处理的默认策略 gap。PR11 自报 `python -m pytest -q`：40 passed。 | PR75 保留基线可追溯性；评审时以 PR11 合入后的新基线复验 INS-6/7。 |

## 8. 依赖与阻塞

### 8.1 前置依赖（insight 被阻塞项）

| 依赖 | 来源 | 影响范围 | 当前状态 |
|---|---|---|---|
| `src/openapi/insight.yaml` 冻结 | 架构团队（梁栋/秦诺） | 全部 HTTP 接口 | 已冻结 v1.0.0-draft，随系统详设 v1.0 生效。 |
| core 事件 schema 冻结 + NATS 部署 | core 团队 / 架构 | INS-1/2/3/4/5/6 | `ticket.created` 等 payload 已定义（系统详设 §6.3）。 |
| taxonomy（分类树）数据 | core | INS-2/3 | core 维护 `categories` 表；insight 需只读同步分类码。 |
| gateway `serviceAuth` + service-jwt claims | gateway | 全部 insight 接口安全 | 系统详设 §7 已定义；gateway 实现后联调。 |
| 种子工单语料 | 产品/业务 | INS-2 模型训练 | M3 前需 ≥200 条覆盖主要分类。 |
| 邮件网关/SMTP 选型 | 架构/运维 | INS-6 邮件通道 | 待确认（§9 开放事项）。 |

### 8.2 下游依赖（依赖 insight 的输出）

| 下游 | 依赖内容 |
|---|---|
| core | `insight.classification_suggested` 事件写回建议。 |
| gateway | `/classification/predict`、`/similarity/search`、`/stats/*`、`/notifications/*`、`/feedback/classification`。 |
| web | AI 建议弹窗、相似推荐卡片、通知中心、看板报表。 |

## 9. 开放事项

> 以下事项需架构团队或相关方进一步决策；在决策落地前，实现侧不得自行变更跨服务契约或权威归属。

| # | 开放事项 | 影响 | 建议决策方 | 风险/备注 |
|---|---|---|---|---|
| O-1 | **`insight.classification_suggested` payload 与 `PredictResult` 嵌套结构已按 D1 对齐，但 core 消费侧需确认 `ClassificationSuggestion` 扁平转换逻辑。** | core 写回路径 | 石磊（core）/ 梁栋 | 若 core 未按嵌套结构消费，将导致写回字段错位。 |
| O-2 | **向量检索二期方案**：一期用 PG 全文检索；二期是否引入 `pgvector` 或 OpenSearch，直接影响 `similarity_index.embedding` 列与索引设计。 | INS-4 | 梁栋 | 契约已前向兼容，但存储选型需在 M3 后决定。 |
| O-3 | **邮件网关选择**：一期 SMTP 最简单，但生产环境是否统一用邮件 SaaS/网关（如 SendGrid/企业邮件网关）影响 `mailer.py` 抽象。 | INS-6 | 运维/架构 | 需在 M3 前冻结，否则通知通道可能无法投产。 |
| O-4 | **M4 事件 payload 固化**：`ticket.commented`、`ticket.merged`、`insight.classification_suggested` 当前在 `insight.yaml DomainEvent` 中列为“M4 固化前不约束”。M4 必须给出确定性 schema 并 bump version（若需）。 | 事件契约 | 梁栋/秦诺 | 未固化前消费侧应只读取已定义字段，避免强依赖。 |
| O-5 | **漏事件补偿机制**：NATS 不可用时，insight 如何从 core 批量同步历史事件？是否开放内部补偿接口？ | 可靠性 | 架构团队 | 若缺失补偿，AI 写回与统计在总线故障期间会丢数据。 |
| O-6 | **分类树同步方式**：insight 是定期从 core 同步 `categories`，还是通过事件投影维护本地只读副本？ | INS-2 | core + insight | 影响分类器实时性与一致性。 |
| O-7 | **灰度策略**：M4 是否按组织/用户/流量比例灰度 AI 建议？若灰度，gateway 还是 insight 负责开关？ | M4 发布 | 架构/产品 | 影响 `mode`/`auto_fill_recommended` 的实际控制点。 |

> **红色警戒**：以上 O-1（core 消费侧嵌套结构转换）为 M3 前必须闭环项；O-3（邮件网关）为 M3 投产阻塞项；其余可保留至 M4 前决策，但需架构团队给出排期。
