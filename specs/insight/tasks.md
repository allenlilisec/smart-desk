# Tasks: smartdesk-insight 实现任务分解（P3 / SUP-113）

**Input**: [`specs/insight子系统详细设计与实现说明书.md`](../insight子系统详细设计与实现说明书.md)（v1.0，已冻结，main 最新）
**契约唯一事实源**: [`src/openapi/insight.yaml`](../../src/openapi/insight.yaml)（OpenAPI 3.1，已冻结）
**实现仓库**: `src/smartdesk-insight`（Python/FastAPI 独立 submodule）
**派生自**: 系统详设 v1.0（§2.2/§5/§6/§12）；PRD US-3/US-4/US-6；insight 详设 INS-0~7
**编制**: 苏睿（智能服务团队 Leader / Committer）　|　日期：2026-06-15

> 本清单由 spec-kit `/tasks` 从**已冻结**的 insight 详设 v1.0 自顶向下派生，依赖有序、每块可独立交付/测试。任务 ID 沿用详设 §6 的 **INS-* 体系**（详设 §12.1 仅定义 INS-1~7，**INS-8 为本清单针对 M4 加固新增的编号，详设 INS 体系未列入**）；`Tn` 为本清单内的细粒度执行编号。`[P]` = 不同文件、无相互依赖、可并行。`[INS-x]` = 归属工作块，`[USn]` = 对应用户故事。
>
> **协作分工**：苏睿负责 INS-0~5（算法/检索/统计/骨架），杨达负责 INS-6/7（通知/集成）；对外接口须符合 `insight.yaml`。
>
> **命名口径说明**：文件命名遵循详设 §2.3 规范（单数形式）：`app/api/routers/notification.py`、`app/api/routers/policy.py`、`app/services/notification.py`、`app/services/policy.py`。现状代码中存在复数形式（`notifications.py`、`policies.py`），Phase 1 T001 迁移时统一为单数形式，便于检视追溯。

---

## 0. 与 main 现有 `src/smartdesk-insight` 的 done / gap / drift 初判（P4 输入）

> 检视基线：submodule@`79595d2`。结论：**INS-8 serviceAuth JWT 校验已落地**，INS-6/7 通知中心有初版实现但缺邮件通道/死信/重试完整闭环；INS-0~5 与 stats 仍为全量 Gap。

### 0.1 done（可直接消费）

| 项 | 位置 | 状态 |
|---|---|---|
| 对外契约 | `src/openapi/insight.yaml` | ✅ 冻结，覆盖 classification/similarity/stats/notifications/feedback/events |
| 模块详设 | `specs/insight子系统详细设计与实现说明书.md` v1.0 | ✅ 冻结 |
| INS-8 serviceAuth | `app/auth.py` | ✅ JWT 校验已合入 submodule main |
| INS-6/7 骨架 | `app/routers/notifications.py`、`app/services/notifications.py`、`app/models.py` | ✅ 站内通知/策略接口已就绪 |
| 事件消费幂等 | `app/services/event_processor.py`、`app/models.py:ProcessedEvent` | ✅ 去重骨架已就绪 |

### 0.2 gap（本清单覆盖）

- `src/smartdesk-insight/app/infrastructure/mailer.py` 缺失：SMTP/Console 抽象、指数退避重试、死信记录未完整实现。
- `classification_feedback`、`similarity_index` 表及业务层缺失；`stats_*` 读模型缺失。
- `ml/` 目录不存在：分类器、定级估计器、特征工程、种子语料全待建。
- `api/routers/` 缺少 `classification.py`、`similarity.py`、`stats.py`、`feedback.py`。
- NATS 写回事件 `insight.classification_suggested` 未实现。

### 0.3 drift（须在 P4 前对齐）

| # | 漂移 | 影响 | 处置 |
|---|---|---|---|
| D-1 | 当前 `app/routers/notifications.py` 路径为 `/notifications`，与 `insight.yaml` 一致；但 `NotificationStatus` enum 含 `retrying`，实际服务未区分 retrying 与 failed | 状态语义漂移 | **INS-6 实现时**统一：`email` 通道发送中=retrying，最终失败=failed，死信记录后返回 failed |
| D-2 | `app/schemas.py` 已定义 `DomainEvent` 与 payload 子模型，但 `insight.classification_suggested` payload 未固化 | 写回事件格式漂移 | **INS-1 实现时**按 **O-1** 嵌套 `PredictResult` 发布，与 `core.yaml` 消费侧对齐 |
| D-3 | 现状代码目录与详设 §2.3 规范存在差异：现状为 `app/routers/`、`app/auth.py`、`app/models.py`、`app/schemas.py`；详设 §2.3 规范为 `app/api/routers/`、`app/infrastructure/security.py`、`app/domain/models.py`、`app/domain/events.py` | 目录结构不一致，新任务路径混用 | **苏睿技术裁定**：**统一迁移到详设 §2.3 规范**。Phase 1 T001 按详设整理目录结构；Phase 7 T039 将 `app/auth.py` 迁移到 `app/infrastructure/security.py`；`app/models.py`/`app/schemas.py` 待 Phase 2 迁移到 `app/domain/`。现状文件保留至迁移完成，新任务按详设路径组织。 |

---

## Phase 1: Setup（项目骨架）— INS-0 ❶

**目的**：补齐 FastAPI 工程结构、依赖、测试与 CI 骨架，使空服务可编译启动。**阻塞后续所有阶段。**

- [ ] T001 [INS-0] 按详设 §2.3 整理 `app/` 目录：`api/routers/`、`services/`、`domain/`、`infrastructure/`、`workers/`；补齐 `__init__.py`
- [ ] T002 [P] [INS-0] 补齐依赖：`scikit-learn`、`joblib`、`numpy`、`aiosmtplib`、`alembic`、`openapi-spec-validator`；`requirements.txt` 与 `pyproject.toml` 二选一固化
- [ ] T003 [P] [INS-0] Alembic 初始迁移：基于详设 §3.2 DDL 生成 `notifications`、`notification_policies`、`notification_dead_letters`、`classification_feedback`、`similarity_index`、`processed_events`（一期 `embedding` 可空，不建 HNSW）
- [ ] T004 [P] [INS-0] 契约测试地基：`tests/contracts/` 调用 `openapi-spec-validator` 校验 FastAPI 生成的 `openapi.json` 与 `insight.yaml` 一致
- [ ] T005 [P] [INS-0] CI 工作流骨架：lint (`ruff`)、单元测试、契约校验步骤

---

## Phase 2: Foundational（阻塞性基础设施）— INS-0 ❷ / INS-1

**⚠️ CRITICAL**：本阶段完成前，INS-2~7 不可视为 production-ready。

- [ ] T006 [INS-0] `app/infrastructure/db.py`：复用现有 `engine`/`AsyncSessionLocal`，确保 Alembic 与运行时同构
- [ ] T007 [INS-0] `app/infrastructure/nats_client.py` / `app/workers/event_consumer.py`：统一 NATS JetStream 连接、订阅、ack/nak、幂等去重；消费主题 `smartdesk.ticket.*`
- [ ] T008 [INS-1] `app/workers/handlers.py`：实现 `ticket.created` / `ticket.status_changed` / `ticket.resolved|closed|reopened` 处理器，维护 `similarity_index` 投影
- [ ] T009 [INS-1] 写回发布：`app/infrastructure/nats_publisher.py` 发布 `insight.classification_suggested`，payload 为嵌套 `PredictResult`（与 `core.yaml` 消费侧对齐）
- [ ] T010 [INS-1] 事件 payload Pydantic 模型：固化 `TicketCreatedPayload`、`TicketStatusChangedPayload`、`TicketResolvedPayload`（与 `app/schemas.py` 现有模型一致）

**Checkpoint**：空服务可启动，`/healthz`/`/readyz` 通过；NATS 事件可消费、可去重、可写回。

---

## Phase 3: INS-2/3 自动分类 + 定级建议 — [US3] 🎯

**Goal**：`POST /classification/predict` 返回嵌套 `PredictResult`；消费 `ticket.created` 写回建议。
**Independent Test**：验证集准确率 ≥80%；模型不可用时 503；无扁平字段。

### Tests（红线，先写后实现）

- [ ] T011 [P] [INS-2/3] [US3] 契约测试：`/classification/predict` 响应字段严格对照 `insight.yaml#/PredictResult`
- [ ] T012 [P] [INS-2/3] [US3] 分类准确率测试：≥200 条种子语料，独立测试集准确率 ≥80%
- [ ] T013 [P] [INS-2/3] [US3] 降级测试：模型文件缺失/损坏时返回 503

### 实现

- [ ] T014 [INS-2] `ml/seeds/categories.py`：初始分类树（IT/账号权限/办公行政/人事/财务/其他）
- [ ] T015 [INS-2] `ml/seeds/corpus.py`：≥200 条合成工单语料（标题/描述/分类）
- [ ] T016 [INS-2] `ml/features.py`：TF-IDF char n-gram 特征工程
- [ ] T017 [INS-2] `ml/classifier.py`：Calibrated LogisticRegression 分类器，训练后缓存 `joblib`
- [ ] T018 [INS-3] `ml/priority_estimator.py`：紧急关键词规则 + 分类默认优先级给出 `priority.value/confidence`
- [ ] T019 [INS-2/3] `app/services/classification.py`：分类应用服务，组装 `PredictResult`
- [ ] T020 [INS-2/3] `app/api/routers/classification.py`：`POST /classification/predict`，模型不可用时 503
- [ ] T021 [INS-2/3] `app/services/event_processor.py`：消费 `ticket.created` 后调用分类/定级，发布 `insight.classification_suggested`
- [ ] T021a [INS-2] `app/services/feedback.py`：分类反馈应用服务，接收纠偏回流样本，写入 `classification_feedback` 表供模型迭代
- [ ] T021b [INS-2] `app/api/routers/feedback.py`：`POST /feedback/classification`，返回 201，与 `insight.yaml#/ClassificationFeedback` 对齐

**Checkpoint**：`POST /classification/predict` 可返回嵌套建议；`ticket.created` 可写回 `insight.classification_suggested`。

---

## Phase 4: INS-4 相似工单检索 — [US3]

**Goal**：`POST /similarity/search` 返回 Top-N 关键词相似结果，P95 < 2s，不阻塞主流程。
**Independent Test**：索引为空/异常返回空列表；返回字段与 `insight.yaml` 一致。

- [ ] T022 [P] [INS-4] [US3] 契约测试：`/similarity/search` 响应对照 `insight.yaml#/SimilarityResult`
- [ ] T023 [INS-4] `app/infrastructure/search.py`：PG `to_tsvector` 全文检索 + 标题/分类相似度复合评分；一期 `method=keyword`；`embedding` 列预留但一期不启用 HNSW
- [ ] T024 [INS-4] `app/services/similarity.py`：相似度应用服务 + Top-N 可解释摘要
- [ ] T025 [INS-4] `app/api/routers/similarity.py`：`POST /similarity/search`
- [ ] T026 [INS-4] `app/workers/handlers.py`：扩展事件处理器，维护 `similarity_index`（标题、分类、状态、resolution_excerpt）
- [ ] T027 [P] [INS-4] [US3] 降级测试：PG 不可用或索引为空时返回空列表，不抛 500

**Checkpoint**：相似检索接口可用，异常时降级为空列表。

---

## Phase 5: INS-5 统计聚合读模型 — [US6] — M3

**Goal**：`GET /stats/aggregate` 与 `/stats/export` 实现。
**Independent Test**：按时间/分类/坐席/优先级分组返回量、SLA 达成、时长。

- [ ] T028 [P] [INS-5] [US6] 契约测试：`/stats/aggregate` 响应对照 `insight.yaml#/AggregateResult`
- [ ] T029 [INS-5] `app/infrastructure/stats_projector.py`：事件驱动的 stats 读模型投影（volume/sla_attainment/resolution_time/backlog/reopen_rate/agent_workload/csat）
- [ ] T030 [INS-5] `app/services/stats.py`：按 `metric/group_by/interval/from/to` 查询聚合
- [ ] T031 [INS-5] `app/api/routers/stats.py`：`GET /stats/aggregate`、`GET /stats/export`（CSV）
- [ ] T032 [INS-5] `app/workers/handlers.py`：消费 `ticket.created`/`ticket.status_changed`/`ticket.resolved`/`ticket.closed`/`ticket.sla_breached` 更新 stats 投影

**Checkpoint**：统计接口可按维度返回聚合结果，CSV 可导出。

---

## Phase 6: INS-6/7 通知中心 + 通知策略 — [US4/US5] 🎯

**Goal**：站内/邮件通知、策略配置、幂等、重试、死信。
**Independent Test**：列表分页、标记已读幂等、邮件失败死信。

- [ ] T033 [INS-6] `app/infrastructure/mailer.py`：`Mailer` 抽象 + `SmtpMailer`/`ConsoleMailer`；指数退避重试 3 次
- [ ] T034 [INS-6] `app/models.py`：`notification_dead_letters` 表及写入逻辑
- [ ] T035 [INS-6] `app/services/notifications.py`：扩展 `_dispatch`，按策略为 `email` 通道调用 mailer，失败记死信
- [ ] T036 [INS-6] `app/services/event_processor.py`：事件处理按 `(org_id, role, event_type, channel)` 策略生成通知
- [ ] T037 [INS-7] `app/api/routers/policies.py`：`GET/PUT /notifications/policies`（已存在，需确认与模型对齐）
- [ ] T038 [P] [INS-6/7] 测试：邮件失败 → 重试 → 死信；策略关闭后不再生成对应通道通知

**Checkpoint**：通知中心满足验收标准，邮件通道闭环。

---

## Phase 7: INS-8 服务鉴权与生产加固 — M4

**Goal**：service-jwt 校验、可观测性、安全红线。

- [ ] T039 [INS-8] 确认 `app/auth.py` 已覆盖 `insight.yaml` `serviceAuth` 要求（已落地，待回归）
- [ ] T040 [INS-8] `/readyz` 增加 NATS 连通性探测
- [ ] T041 [INS-8] 日志统一 trace_id/request_id/org_id/actor_id 结构化输出
- [ ] T042 [INS-8] 安全红线：越权 403、事件幂等 0 重复副作用、AI 降级 100%

---

## 依赖与执行顺序（DAG，对齐详设 §7/§8）

```
Phase1 Setup(INS-0) ──▶ Phase2 Foundational(INS-0/1: schema/事件/投影) ─┬─▶ Phase3 INS-2/3 分类定级
                                                                     ├─▶ Phase4 INS-4 相似检索
                                                                     ├─▶ Phase5 INS-5 统计聚合
                                                                     └─▶ Phase6 INS-6/7 通知闭环
Phase7 INS-8 加固 ──▶ M4 验收
```

**跨模块阻塞项**（需 PMO/架构推动，不阻塞本清单内部）：
- O-1：core 消费侧 `PredictResult` 嵌套结构 → `ClassificationSuggestion` 扁平转换（石磊/梁栋确认）
- O-3：邮件网关/SMTP 真实凭证（M3 投产阻塞）
- O-6：分类树同步方式（core ↔ insight）

---

## 子 Issue 映射

> **状态快照说明**：表中"状态"列为编制时快照，以各 Issue 实时状态为准；后续新增 Issue 未列入。

| 子 Issue | 范围 | 负责人 | 状态（快照） |
|---|---|---|---|
| [SUP-117](mention://issue/1e4908f8-72c1-4b82-bf4b-1791b2c7bf7b) | INS-0/1 脚手架 + 事件消费骨架 | 苏睿 | todo |
| [SUP-118](mention://issue/0eedc8ee-31dd-4ef5-9484-b494e5ce8748) | INS-2/3 自动分类 + 定级建议 | 苏睿 | in_review |
| [SUP-119](mention://issue/67af34d8-aee6-4fc7-a5aa-2097eb8d6541) | INS-4 相似检索 | 苏睿 | in_review |
| [SUP-120](mention://issue/2f75744f-7f72-40e4-8a92-5c544f0f882c) | INS-5 统计聚合 | 苏睿 | todo |
| [SUP-121](mention://issue/6f4718c4-87f6-484c-9361-7749cfb99a55) | INS-6/7 通知中心 + 通知策略 | 杨达 | in_review |
