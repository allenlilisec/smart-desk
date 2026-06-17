# Tasks: smartdesk-insight 实现任务分解（P3 / SUP-113）

**Input**: [`specs/insight子系统详细设计与实现说明书.md`](../insight子系统详细设计与实现说明书.md)（v1.0，已冻结，main 最新）
**契约唯一事实源**: [`src/openapi/insight.yaml`](../../src/openapi/insight.yaml)（OpenAPI 3.1，已冻结）
**实现仓库**: `src/smartdesk-insight`（Python/FastAPI 独立 submodule）
**派生自**: 系统详设 v1.0（§2.2/§5/§6/§12）；PRD US-3/US-4/US-6；insight 详设 INS-0~7
**编制**: 苏睿（智能服务团队 Leader / Committer）　|　日期：2026-06-15

> 本清单由 spec-kit `/tasks` 从**已冻结**的 insight 详设 v1.0 自顶向下派生，依赖有序、每块可独立交付/测试。任务 ID 沿用详设 §6 的 **INS-
*** 体系；`Tn` 为本清单内的细粒度执行编号。`[P]` = 不同文件、无相互依赖、可并行。`[INS-x]` = 归属工作块，`[USn]` = 对应用户故事。
>
> **协作分工**：苏睿负责 INS-0~5（算法/检索/统计/骨架），杨达负责 INS-6/7（通知/集成）；对外接口须符合 `insight.yaml`。

---

## 0. 与 main 现有 `src/smartdesk-insight` 的 done / gap / drift 回贴（P4 刷新）

> 检视基线：submodule@`d0fb07d`（2026-06-17，`fix(db): restore AsyncSessionLocal definition lost in merge conflict`）。结论：**INS-2/3 分类/定级、feedback、`insight.classification_suggested` 写回、INS-6/7 通知/策略/邮件重试与死信、INS-8 serviceAuth 已有实现**；**INS-4 相似检索、INS-5 统计聚合、Alembic/契约测试/CI/readyz NATS 仍为 Gap**；目录分层、事件 payload 固化、通知策略默认语义与 tests 存在 Drift。
>
> 状态定义：`done` = 代码已实现且有测试或可运行证据；`gap` = 当前实现缺失或不足以满足任务；`drift` = 代码与 `tasks.md`/模块详设/系统详设目标不一致，需改代码或改设计裁决。

### 0.1 done（可直接消费）

| 项 | 位置 | 状态 |
|---|---|---|
| 对外契约 | `src/openapi/insight.yaml` | ✅ 冻结，覆盖 classification/similarity/stats/notifications/feedback/events |
| 模块详设 | `specs/insight子系统详细设计与实现说明书.md` v1.0 | ✅ 冻结 |
| INS-8 serviceAuth | `app/auth.py` | ✅ JWT 校验已合入 submodule main |
| INS-2/3 分类/定级 | `app/routers/classification.py`、`app/services/classification.py`、`ml/*` | ✅ `/classification/predict` 返回嵌套 `PredictResult`，种子语料 228 条，准确率测试覆盖 |
| INS-2 feedback | `app/routers/feedback.py`、`app/services/feedback.py`、`app/models.py:ClassificationFeedback` | ✅ `/feedback/classification` 已落表 |
| INS-1 写回事件 | `app/services/event_processor.py`、`app/infrastructure/nats_publisher.py` | ✅ `ticket.created` 后发布 `insight.classification_suggested`，payload 使用嵌套 `PredictResult` |
| INS-6/7 通知中心 | `app/routers/notifications.py`、`app/services/notifications.py`、`app/models.py` | ✅ 站内/邮件通知、策略接口、重试与死信记录已就绪 |
| 事件消费幂等 | `app/services/event_processor.py`、`app/models.py:ProcessedEvent` | ✅ 去重骨架已就绪 |

### 0.2 gap（本清单覆盖）

- `similarity_index` ORM/迁移、`app/infrastructure/search.py`、`app/services/similarity.py`、`/similarity/search` 缺失，INS-4 仍未实现。
- `stats_*` 读模型、`stats_projector.py`、`app/services/stats.py`、`/stats/aggregate`、`/stats/export` 缺失，INS-5 仍未实现。
- Alembic 迁移、契约测试、CI 工作流缺失；运行时仍靠 `Base.metadata.create_all` 建表。
- `/readyz` 只检查 DB，未检查 NATS；日志未完整透传 `trace_id/request_id/org_id/actor_id`。
- `processed_events` 缺 `consumer/status` 字段；`DomainEvent.payload` 仍为自由 `dict`，未对 M4 事件做判别 union。
- 通知事件消费会按默认策略同时生成 inapp/email，但现有部分测试仍按旧“单 inapp 默认”预期断言，测试期望与实现语义漂移。

### 0.3 drift（须在 P4 前对齐）

| # | 漂移 | 影响 | 处置 |
|---|---|---|---|
| D-1 | 代码目录仍为 `app/routers/*`、`app/db.py`、`app/nats_consumer.py`，未按详设 §2.3 的 `app/api/routers`、`app/infrastructure/db.py`、`app/workers/*` 分层 | 文档与代码位置不一致，后续评审引用易错 | 建议短期更新任务清单引用当前路径；若 M4 前重构，再按详设目录迁移 |
| D-2 | `notification_policies` 默认缺省为 enabled；事件消费默认创建 inapp + email 两条通知，部分旧测试仍期望只创建 inapp | 测试红；通知默认策略语义需确认 | 杨达负责确认默认策略：若默认双通道，修测试；若默认站内单通道，改 `is_policy_enabled` |
| D-3 | `ticket.created` 当前只触发分类/定级写回与通知，未维护 `similarity_index` | 与详设“分类/定级/相似”同源异步处理不一致 | INS-4 实现时补 `similarity_index` 投影，不改跨服务契约 |
| D-4 | `readyz` 设计要求 DB+NATS，代码只查 DB | 运维健康检查覆盖不足 | 本域可补：增加 NATS 连通性或显式降级状态 |
| D-5 | `DomainEvent.payload` 对 `ticket.commented`、`ticket.merged`、`insight.classification_suggested` 仍是自由 object | M4 事件契约未固化 | 只列 drift；需梁栋/秦诺冻结事件 schema 后再改 |

### 0.4 tasks.md 逐项 done / gap / drift 回贴

| 任务 | 状态 | 代码/证据 | 说明 |
|---|---|---|---|
| T001 | drift | `app/routers/*`、`app/services/*`、`app/infrastructure/*` | 功能目录已存在，但未按详设 `app/api/routers`、`domain`、`workers` 命名分层。 |
| T002 | gap | `requirements.txt` | 已有 `scikit-learn`；缺 `joblib`、`numpy` 显式依赖、`aiosmtplib`、`alembic`、`openapi-spec-validator`。 |
| T003 | gap | `app/models.py`、`app/main.py` | `notifications`/`policies`/`dead_letters`/`classification_feedback`/`processed_events` 已有 ORM；无 Alembic，缺 `similarity_index` 与 `stats_*`。 |
| T004 | gap | `tests/` | 无 `tests/contracts/`，未校验 FastAPI `openapi.json` 与 `src/openapi/insight.yaml` 一致。 |
| T005 | gap | repo 根目录 | 未发现 CI workflow。 |
| T006 | done+drift | `app/db.py` | runtime engine/session 可用；路径与 `app/infrastructure/db.py` 设计漂移，Alembic 同构未落地。 |
| T007 | done+gap | `app/nats_consumer.py`、`app/services/event_processor.py` | 有 JetStream stream/consumer、ack/nak、幂等；缺独立 `nats_client.py`、按 `ticket_id` 顺序分区与失败状态记录。 |
| T008 | gap | `app/services/event_processor.py` | 处理 ticket 事件用于通知/分类写回；未维护 `similarity_index` 投影。 |
| T009 | done | `app/infrastructure/nats_publisher.py`、`app/services/event_processor.py` | 发布 `insight.classification_suggested`，payload 为嵌套 `PredictResult`。 |
| T010 | done+drift | `app/schemas.py` | `TicketCreatedPayload`、`TicketStatusChangedPayload`、`TicketResolvedPayload` 已有；`DomainEvent.payload` 仍是自由 `dict`。 |
| T011 | done+gap | `tests/test_classification.py` | 覆盖嵌套响应字段；未做 OpenAPI schema 严格契约 diff。 |
| T012 | done | `ml/seeds/corpus.py`、`tests/test_classification.py` | 种子语料 228 条，准确率测试要求 >=80%。 |
| T013 | done | `app/routers/classification.py`、`tests/test_classification.py` | 模型不可用返回 503 已测。 |
| T014 | done | `ml/seeds/categories.py` | 初始分类树已实现。 |
| T015 | done | `ml/seeds/corpus.py` | 合成语料 >=200 条。 |
| T016 | done | `ml/features.py` | TF-IDF 输入特征清洗已实现。 |
| T017 | done+drift | `ml/classifier.py` | LogisticRegression + CalibratedClassifierCV 已实现；训练为进程内 lazy cache，未落 `joblib` 文件缓存。 |
| T018 | done | `ml/priority_estimator.py` | 紧急关键词 + 分类默认优先级已实现。 |
| T019 | done | `app/services/classification.py` | 组装 `PredictResult`。 |
| T020 | done | `app/routers/classification.py` | `POST /classification/predict` 已实现。 |
| T021 | done | `app/services/event_processor.py` | `ticket.created` 后调用分类/定级并发布建议；模型不可用不阻塞通知。 |
| T022 | gap | 缺 `tests`/router | 无 `/similarity/search` 契约测试。 |
| T023 | gap | 缺 `app/infrastructure/search.py` | PG 全文检索未实现。 |
| T024 | gap | 缺 `app/services/similarity.py` | 相似度应用服务未实现。 |
| T025 | gap | 缺 similarity router | `POST /similarity/search` 未实现。 |
| T026 | gap | `app/services/event_processor.py` | 未维护相似索引。 |
| T027 | gap | `tests/` | 无相似检索降级测试。 |
| T028 | gap | `tests/` | 无 stats 契约测试。 |
| T029 | gap | 缺 `stats_projector.py` | stats 读模型投影未实现。 |
| T030 | gap | 缺 `app/services/stats.py` | stats 查询服务未实现。 |
| T031 | gap | 缺 stats router | `/stats/aggregate`、`/stats/export` 未实现。 |
| T032 | gap | `app/services/event_processor.py` | 未消费事件更新 stats 投影。 |
| T033 | done | `app/infrastructure/mailer.py`、`app/services/notifications.py` | Mailer 抽象、Console/SMTP、指数退避重试已实现。 |
| T034 | done | `app/models.py:NotificationDeadLetter` | 死信表 ORM 与写入逻辑已实现。 |
| T035 | done+drift | `app/services/notifications.py`、`app/routers/notifications.py` | email dispatch/retry/dead-letter 已有；事件消费只创建 email notification，不直接投递邮件。 |
| T036 | done+drift | `app/services/event_processor.py` | 按 `(role,event_type,channel)` 策略生成通知；默认策略语义需确认。 |
| T037 | done+drift | `app/routers/notifications.py` | `GET/PUT /notifications/policies` 已实现；文件路径不是 `app/api/routers/policies.py`。 |
| T038 | done+drift | `tests/test_email_delivery.py`、`tests/test_notifications.py` | 邮件失败死信、策略开关有测试；现有套件 31/35 通过，4 个旧通知期望与默认双通道实现漂移。 |
| T039 | done | `app/auth.py`、`tests/test_auth.py` | serviceAuth JWT 校验覆盖 audience/issuer/exp/key。 |
| T040 | gap | `app/main.py:readyz` | 只检查 DB，未检查 NATS。 |
| T041 | gap | `app/logging_config.py`、调用点日志 | JSON 日志存在；未系统性注入 `trace_id/request_id/org_id/actor_id`。 |
| T042 | done+gap | `app/auth.py`、`app/services/event_processor.py`、tests | 越权/幂等/AI降级有部分覆盖；事件副作用幂等在旧测试中因通知双通道预期漂移仍红，需统一后回归。 |

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

| 子 Issue | 范围 | 负责人 | 状态 |
|---|---|---|---|
| [SUP-117](mention://issue/1e4908f8-72c1-4b82-bf4b-1791b2c7bf7b) | INS-0/1 脚手架 + 事件消费骨架 | 苏睿 | todo |
| [SUP-118](mention://issue/0eedc8ee-31dd-4ef5-9484-b494e5ce8748) | INS-2/3 自动分类 + 定级建议 | 苏睿 | in_review |
| [SUP-119](mention://issue/67af34d8-aee6-4fc7-a5aa-2097eb8d6541) | INS-4 相似检索 | 苏睿 | in_review |
| [SUP-120](mention://issue/2f75744f-7f72-40e4-8a92-5c544f0f882c) | INS-5 统计聚合 | 苏睿 | todo |
| [SUP-121](mention://issue/6f4718c4-87f6-484c-9361-7749cfb99a55) | INS-6/7 通知中心 + 通知策略 | 杨达 | in_review |
