# Tasks: smartdesk-core 实现任务分解（P3 / SUP-111）

**Input**: [`specs/core子系统详细设计与实现说明书.md`](../core子系统详细设计与实现说明书.md)（v2.0，已冻结，main 最新）
**契约唯一事实源**: [`src/openapi/core.yaml`](../../src/openapi/core.yaml)（OpenAPI 3.1，**v1.1.0**，已冻结）
**派生自**: 系统详设 v1.0（§2.2/§4/§6/§9/§12）；spec.md US-1~US-7；data-model.md
**编制**: 石磊（后端核心负责人 / Committer 委员会召集人）　|　日期：2026-06-15

> **引用层级**：`src/openapi/core.yaml`（契约唯一事实源）→ `SmartDesk系统详细设计与实现说明书.md`（系统级事实源）→ [`specs/core子系统详细设计与实现说明书.md`](../core子系统详细设计与实现说明书.md)（core 实现级派生）→ 本文（执行清单）→ [`lifecycle-done-gap-drift.md`](lifecycle-done-gap-drift.md)（实现快照）。下游不得突破上游约定。
>
> 本清单由 spec-kit `/tasks` 从**已冻结**的 core 详设 v2.0 自顶向下派生，依赖有序、每块可独立交付/测试。任务 ID 沿用详设 §7.1 / 系统详设 §12.1 的 **CORE-\*** 体系（不自创新 ID）；`Tn` 为本清单内的细粒度执行编号。`[P]` = 不同文件、无相互依赖、可并行。`[CORE-x]` = 归属工作块，`[USn]` = 对应系统用户故事。
>
> **Tests 纳入说明**：详设 §7.3 把「越权 / 状态机 / 幂等」列为**必过红线（功能+安全）**，集成测试框架已随 SUP-34 合入。故本清单**显式包含测试任务**（非可选）。
>
> **术语速查**：`service-jwt`/`serviceAuth` = gateway 签发、aud=core 的服务令牌；`claims` = 令牌中的 `sub/roles/org_id`；`MVP` = 当前 `httpapi/domain/store` 轻量实现；`outbox` = 事务性发件箱（MVP 为 in-memory best-effort）。旧 `X-User-* / X-Org-Id` 明文透传头已废弃。

---

## 0. 与 main 现有 `src/` 实现的 done / gap / drift 初判（P4 输入）

> 检视基线：main@`786425d`（P3 早期）。当前 `src/smartdesk-core/` 已形成**轻量 MVP**：`net/http` 路由 + `internal/domain` + `internal/store`（内存/Postgres 双实现），覆盖工单生命周期主链（建单、状态机、分派、SLA、评论/附件/时间线）。下表按当前事实刷新 done/gap/drift。

### 0.1 done（已就绪，可直接消费）

| 项 | 位置 | 状态 |
|---|---|---|
| 对外契约 | `src/openapi/core.yaml` v1.1.0 | ✅ 冻结，17 业务 path + `/healthz` `/readyz` 齐全，与详设 §4.1 逐 path 对齐 |
| 模块详设 | `specs/core子系统详细设计与实现说明书.md` v2.0 | ✅ 冻结，O1–O6 已裁决、里程碑已定稿 |
| DB 数据模型 | 详设 §3.2 DDL（节选）+ 系统详设 §4.2 | ✅ 设计完成（待落为迁移文件） |
| 事件清单/信封 | 详设 §5.2 / 系统详设 §6 | ✅ 设计完成（待落为 outbox 实现） |
| 集成测试框架 | SUP-34（`specs/SmartDesk集成测试策略与用例框架.md`） | ✅ 框架已合入，可挂 core 用例 |

### 0.2 gap（全部待实现 —— 本清单覆盖）

- `src/smartdesk-core/` 已存在轻量 MVP，但**未按详设 §6 六边形/子域包拆分**，也无 `sqlc`/`oapi-codegen`/`outbox relay`/NATS relay → 由后续 Issue 决定是接受轻量 MVP 事实源还是回归原分层。
- 无迁移文件（0001–0005）、无 sqlc/oapi-codegen 生成物、无 outbox relay/consumer、无任一 domain 服务、无 CI `api-contract-check` 接线。

### 0.3 drift（漂移，须在 P4 前对齐）

| # | 漂移 | 影响 | 处置 |
|---|---|---|---|
| D-1 | 详设 §6/§8.2 引用 `core.yaml info.version = 1.0.0`，**实际 main 已是 1.1.0**（PR #27 去 `-draft` 为 1.0.0，PR #33：`Ticket/TicketDetail` 增 `csat_comment`/`csat_rated_at`，`Attachment` 增 `comment_id`） | 文档版本号滞后，**非契约冲突**：1.1.0 在 1.0.0 之后附加字段提升 minor 版本，且 data-model 的 `csat_ratings.comment` / `attachments.comment_id` 已覆盖，schema 不需改 | **以 1.1.0 为准**实现；详设版本引用已回填 1.1.0（文档级，交资料/架构，不阻塞编码）。`T_CSAT`/`T_ATT` 任务已含这三字段。 |
| D-2 | 详设 §4.2 状态机措辞 vs core.yaml `action` enum（O2 已裁决以契约为准） | 无：已裁决，详设 §4.2 已按契约口径收敛 | 实现直接以 core.yaml `TransitionRequest.action` enum 为准 |

---

## Phase 1: Setup（项目骨架）— CORE-0 ❶

**目的**：建立 Go 工程结构与工具链，使空服务可编译启动。**阻塞后续所有阶段。**

- [x] T001 [CORE-0] 在 `src/`（或仓库约定的 `smartdesk-core/`）初始化 Go module（Go 1.22+），建立详设 §6 包骨架目录：`cmd/smartdesk-core/`、`internal/{appconfig,httpapi/{gen,middleware},domain,ticket,transition,assignment,sla,comment,attachment,link,timeline,config,repository,events,objstore,platform}`、`migrations/`、`test/` — **MVP**：module、`cmd/`、`migrations/`、`internal/domain`/`httpapi`/`store` 已存在；目标子域包尚未拆分（D-2）
- [ ] T002 [P] [CORE-0] 接入工具链与固定版本：`oapi-codegen`、`sqlc`、`golang-migrate`、`nats.go`、`pgx/v5`、`chi`、`slog`、OTel；`Makefile`/`taskfile`（gen / migrate / lint / test 目标） — **gap**：`golang-migrate`/`pgx`/`slog` 已用；`oapi-codegen`/`sqlc`/`chi`/`nats.go` 未接入
- [ ] T003 [P] [CORE-0] 配置 lint/format（golangci-lint、gofumpt）与 CI 工作流骨架（编译 + 单测 + 后续接 `api-contract-check`） — **gap**：CI 未接 `api-contract-check`
- [x] T004 [P] [CORE-0] `internal/appconfig`：envconfig 加载（DB/NATS/OSS/端口/JWT 公钥等），**仅监听内网**端口（详设 §2.3 红线） — **MVP**：配置加载已实现，仅监听内网

---

## Phase 2: Foundational（阻塞性基础设施）— CORE-0 ❷

**⚠️ CRITICAL**：本阶段完成前，任何 CORE-A/B/C 用户故事不可开工（详设 §8.1 DAG 根）。

### 2.1 DB schema 与迁移（**关键代码：DB 迁移 → 集体检视红线**）

- [x] T005 [CORE-0] `migrations/0001_init.{up,down}.sql`：`roles`(全局枚举,无 org_id 例外)、`users`、`user_roles`、`categories`、`sla_policies`、`sla_policy_targets`（详设 §3.2；`db-migration` 技能生成执行） — **MVP**：`0001_init.sql` 压缩基线已存在；`roles`/`user_roles` 简化为 `users.roles TEXT[]`，`sla_policy_targets` 简化为 `sla_policies.targets JSONB`（D-5）
- [ ] T006 [CORE-0] `migrations/0002_tickets.{up,down}.sql`：`tickets`（八态）、`ticket_status_history`、`ticket_timeline` + 全部读路径索引（含 FTS gin）（依赖 T005） — **gap**：`ticket_status_history` 缺失；`tickets` 在 `0001_init` 中，`ticket_timeline` 已存在；FTS 未实现
- [x] T007 [CORE-0] `migrations/0003_workflow.{up,down}.sql`：`assignments`、`comments`、`attachments`、`ticket_links`、`sla_timers`、`watchers`、`csat_ratings`（依赖 T006） — **MVP**：`0003_attachments.sql` 已存在；`assignments`/`comments`/`sla_timers` 在 `0001_init` 中；`watchers`/`csat_ratings` 缺失
- [ ] T008 [P] [CORE-0] `migrations/0004_infra.{up,down}.sql`：`idempotency_keys`、`outbox_events`、`processed_events`（R3 实现增表，依赖 T005） — **gap**：`outbox_events` 缺失；`idempotency_keys`/`processed_events` 在 `0001_init` 中但缺少 `request_hash/response_json/status_code`

### 2.2 平台/出站适配器与契约桩

- [x] T009 [P] [CORE-0] `internal/platform`：pgx 连接池、NATS JetStream 连接、slog 结构化 JSON（统一 `trace_id/request_id/org_id/actor_id`）、OTel、`/healthz`(liveness) + `/readyz`(探测 DB+NATS)（核对 core.yaml `security:[]`） — **MVP**：pgx/slog/healthz 已存在；NATS JetStream 未接；`/readyz` 不强制探测 DB/NATS（D-4）
- [ ] T010 [CORE-0] `internal/httpapi/gen`：`oapi-codegen` 从 `src/openapi/core.yaml` 生成 types + chi server 桩（契约先行；后续 CI 跑 `api-contract-check` 阻止漂移）（依赖 T002） — **gap**：手写 `net/http`，未生成
- [x] T011 [CORE-0] `internal/httpapi/middleware`：`recover → requestID(透传 X-Request-Id，仅链路追踪) → serviceAuth(校验 service-jwt 签名+aud=core) → userCtx(从已验签 claims 提取 sub/roles/org_id) → metrics`（详设 §2.2/§5.1） — **MVP**：中间件链内联在 `Server` 中，已按 claims 口径实现
- [ ] T012 [CORE-0] `internal/repository`：pgx+sqlc Tx 管理基座 + `queries/*.sql` 脚手架；统一「业务表 + timeline + outbox」单事务三写工具（依赖 T005–T008,T010） — **gap**：`internal/store` 手写 SQL，无 sqlc/ports 抽象；无 outbox 单事务三写
- [ ] T013 [CORE-0] `internal/events`：事件信封(`event_id/event_type/occurred_at/org_id/ticket_id/actor_id/version/payload`)、outbox 写入 API、**outbox relay**（`FOR UPDATE SKIP LOCKED`，至少一次、多副本安全）→ NATS `smartdesk.<domain>.<event>`（依赖 T009,T012） — **gap**：`internal/event` in-memory best-effort，无 outbox/NATS（D-3）
- [x] T014 [CORE-0] `internal/domain`：纯领域内核 —— 状态机迁移表（§4.2）、SLA 计算函数、可见性/领域授权规则、统一错误码（`Error{code,message,details?,trace_id}` 映射 400/401/403/404/409/413/422） — **MVP**：已实现
- [ ] T015 [P] [CORE-0] **集成测试地基**：testcontainers（PG+NATS）夹具，挂接 SUP-34 框架；幂等/越权/状态机红线用例骨架（详设 §7.3） — **gap**：httptest + Postgres 集成测试已存在，无 testcontainers/NATS

**Checkpoint**：空服务可启动，`/healthz`/`/readyz` 通过，`ticket.created` 可经 outbox 投递 + 消费去重；契约桩就绪。

---

## Phase 3: CORE-C 配置目录（taxonomy / SLA 策略 / 用户角色）— M2

**Goal**：提供权威配置主数据；**先于 A3**（A3 需 SLA 策略）与 A1（建单需 users/categories）就绪。
**Independent Test**：`/config/*` 全量 CRUD 通过；种子数据可查。

- [x] T016 [CORE-C] `migrations/0005_seed`：`roles` 枚举、SLA v1 基线（P1 15m/4h、P2 60m/1bd、P3 240m/3bd、P4 1bd/5bd，bd 按 8h/日折算）、`categories` 初始集（IT/账号权限/办公行政/人事/财务/其他）（依赖 T005） — **MVP**：已实现
- [x] T017 [P] [CORE-C] [US7] `internal/config` taxonomy：`GET/POST /config/categories`、`PATCH/DELETE /config/categories/{catId}`（移动父节点/启停/排序；**被引用删除 409**） — **MVP**：已实现（`config_handlers.go`）
- [x] T018 [P] [CORE-C] [US7] `internal/config` SLA 策略：`GET /config/sla-policies`、`PUT /config/sla-policies`（admin，改数值不改契约形态） — **MVP**：已实现
- [x] T019 [P] [CORE-C] [US7] `internal/config` 用户角色目录：`GET/POST /config/users`、`PUT /config/users/{userId}/roles`（一账号可兼多角色；core 仅存 `credential_ref`） — **MVP**：已实现
- [ ] T020 [CORE-C] 契约测试：`/config/*` 全量响应对照 core.yaml schema（依赖 T010） — **gap**：未接入自动化 `api-contract-check`

**Checkpoint**：配置主数据可用，A1/A3 解除前置依赖。

---

## Phase 4: CORE-A1 工单状态机（Priority: P1）🎯 MVP 核心 — [US1]

**Goal**：建单 + 八态流转 + 查询/详情/更新 + watcher/csat（R2 归并）。MVP 主干。
**Independent Test**：建单返回工单号、状态=`new`；状态机推进合法、非法跃迁 409、重复提交幂等；7 天内可重开。

### Tests（红线，先写后实现）

- [ ] T021 [P] [CORE-A1] [US1] 契约测试：`POST/GET /tickets`、`GET/PATCH /tickets/{id}`、`/transitions`、`/watchers`、`/csat` 响应对照 core.yaml — **gap**：未接入自动化 `api-contract-check`
- [ ] T022 [P] [CORE-A1] [US1] 红线集成测试：**幂等**（Idempotency-Key 命中返回首次结果 / hash 不一致 409）+ **非法状态跃迁 409** + **降级**（AI/NATS 不可用建单仍 201，SC-002） — **partial**：非法跃迁 409/降级已实现；幂等缺 request_hash 与 409 逻辑

### 实现

- [x] T023 [CORE-A1] [US1] `internal/ticket` 建单：单事务 `idempotency 检查 → 生成 number(SD-2026-NNNNNN, FOR UPDATE 行锁) → tickets(new) → SlaEngine.Start 占位 → timeline(ticket_created) → outbox(ticket.created)` → 201（不等 AI，详设 §2.2 链） — **MVP**：`createTicket` 已实现；outbox 为 in-memory
- [x] T024 [CORE-A1] [US1] `internal/transition` 状态机执行：`action→from→to` 表校验、非法 409、写 `ticket_status_history`+`ticket_timeline`、幂等键；含 `accept/start/wait_user/resolve/close/reopen(7天窗口,reopen_count+1)/suspend/resume/cancel`；SLA 暂停/恢复联动钩子（依赖 T023,T014） — **MVP**：状态机已实现；`ticket_status_history` 未落表
- [x] T025 [P] [CORE-A1] [US1] `internal/ticket` 查询/详情/更新：`GET /tickets`（基础列表）、`GET /tickets/{id}`（`TicketDetail` 含 sla/suggestion/links 聚合，可见性过滤 403/404）、`PATCH /tickets/{id}`（改 title/description/category_id/priority；**priority 变更触发 SlaEngine.Recalc** 钩子；422） — **MVP**：已实现；`sla_state` 过滤未实现，requester 可见性 H-3 待闭环
- [ ] T026 [P] [CORE-A1] [US1] `internal/ticket` watcher：`POST /tickets/{id}/watchers` body `{watch:bool}` → **204**（US-5.3） — **gap**：未实现
- [ ] T027 [P] [CORE-A1] [US1] `internal/ticket` CSAT：`POST /tickets/{id}/csat` `{score 1..5, comment?}`，仅 resolved/closed 可评否则 **409**；写 `csat_ratings` + 回填 `tickets.csat_score`/**`csat_comment`/`csat_rated_at`（core.yaml 1.1.0，见 D-1）** — **gap**：未实现

**Checkpoint**：单工单全生命周期闭环可独立演示（US1 AC1–AC3）。**A2/A3/B1/B2/B3 解除依赖。**

---

## Phase 5: CORE-A2 分派（Priority: P2）— [US4]

**Goal**：手工/自动/改派/升级。依赖 A1。

- [x] T028 [P] [CORE-A2] [US4] 契约+集成测试：`POST /tickets/{id}/assignments`（kind 枚举、越权 403） — **MVP**：集成测试已覆盖
- [x] T029 [CORE-A2] [US4] `internal/assignment`：`kind∈{manual,auto,reassign,escalate}` → 写 `assignments`+timeline → outbox `ticket.assigned`/`ticket.reassigned`；规则自动分派；201 Assignment（依赖 T024） — **MVP**：手工/改派已实现；`auto`/`escalate` 为占位，未与 SLA 超时升级联动

---

## Phase 6: CORE-A3 SLA 引擎（Priority: P2）— M2 — [US5]

**Goal**：启动/暂停/恢复/重算 + 后台扫描（warning/breached）。依赖 A1 + CORE-C 策略。

- [x] T030 [P] [CORE-A3] [US5] 红线集成测试：计时启动、`wait_user` 暂停 / `start`·`user_reply` 恢复顺延、临近/超时事件（US-5 AC1–3，SC-005） — **MVP**：启动/暂停/恢复/顺延已测；临近/超时事件未实现
- [x] T031 [CORE-A3] [US5] `internal/sla` SlaEngine：`Start`(建单按 priority 选 target 落 sla_timers)、`Pause/Resume`(paused_total_seconds 顺延)、`Recalc`(priority 变更)；落实 T023/T024 的占位钩子（依赖 T023,T024,T016） — **MVP**：已实现
- [x] T032 [CORE-A3] [US5] `GET /tickets/{id}/sla` 返回 `SlaTimer`（response/resolve due、paused、breached）；404 — **MVP**：已实现
- [ ] T033 [CORE-A3] [US5] 后台扫描器：`idx_sla_due` 扫未达成→发 outbox `ticket.sla_warning`/`ticket.sla_breached`、置 breached 标记（依赖 T013,T031） — **gap**：未实现

---

## Phase 7: CORE-B1 评论与内部备注（Priority: P2）— M2 — [US4]

**Goal**：评论/内部备注 + 可见性过滤 + @提及 + user_reply 自动流转。依赖 A1。

- [x] T034 [P] [CORE-B1] [US4] 红线集成测试：**internal 备注对 requester 接口层过滤**（US-2.4 AC2，不止 UI）+ requester 回 public 触发 `user_reply`（见 `src/smartdesk-core/internal/httpapi/server_test.go`）
- [x] T035 [CORE-B1] [US4] `internal/comment`：`GET /tickets/{id}/comments`（按 service-jwt roles claim 过滤 internal）、`POST`（`visibility∈{public,internal}`+`mentions` → timeline → outbox `ticket.commented`）；requester 回 public 时内部触发 `TransitionService(user_reply)`（pending_user→in_progress，SLA 恢复）（见 `src/smartdesk-core/internal/httpapi/collaboration.go`、`src/smartdesk-core/internal/store/{memory,postgres}.go`）

---

## Phase 8: CORE-B2 附件（Priority: P2）— M2 — [US1/US2.7]

**Goal**：元数据 + OSS 预签名 + 下载授权。依赖 A1 + OSS 就绪。

- [x] T036 [P] [CORE-B2] [US1] 红线集成测试：上传超 20MB→**413**、非白名单→**422**、越权下载→**403**（US-2.7 AC2）（见 `src/smartdesk-core/internal/httpapi/attachment_test.go`）
- [ ] T037 [P] [CORE-B2] `internal/objstore`：S3/MinIO 客户端 + 预签名（上传/下载）（依赖 T004）— **gap**：当前实现为 core 内置短时 URL 形态，未接 MinIO/S3 SDK 与 bucket 配置。
- [x] T038 [CORE-B2] [US1] `internal/attachment`：`GET/POST /tickets/{id}/attachments`（`AttachmentInit` 校验 ≤20MB/白名单 → 签上传 URL）、`GET /attachments/{attId}/download-url`（鉴权后签短时下载 URL）；响应含 **`comment_id`（core.yaml 1.1.0，见 D-1）**（依赖 T023,T037）（见 `src/smartdesk-core/internal/httpapi/attachments.go`、`src/smartdesk-core/internal/domain/ticket.go`、`src/smartdesk-core/migrations/0003_attachments.sql`）

---

## Phase 9: CORE-B3 查询/列表/过滤 + 时间线（Priority: P2→P3）— M2 — [US1/US6]

**Goal**：列表过滤增强 + 时间线/审计。依赖 A1。

- [x] T039 [P] [CORE-B3] [US1] `internal/ticket` 列表增强：`GET /tickets` 全过滤（`status/priority/assignee_id/requester_id/group_id/category_id/q/sla_state`+`sort`+分页 `page_size≤100`）；`q` 走 FTS；返回 `TicketPage`（升级 T025 基础列表）— **partial/gap（H-3）**：代码已支持 status/priority/assignee_id/requester_id/group_id/category_id/q/sort/page/page_size 与 org scope；requester 与同 org 坐席的工单范围授权未区分，已转 [SUP-285](mention://issue/1af7a39e-3ce7-4003-9bda-a05c8bbbd503) H-3 gap 闭环；缺 `sla_state` 过滤，Postgres `q` 为 `LIKE` 非 FTS。
- [x] T040 [P] [CORE-B3] [US1] `internal/timeline`：`GET /tickets/{id}/timeline` 正序、只读追加、分页 `TimelinePage`（US-2.8）（见 `src/smartdesk-core/internal/httpapi/collaboration.go`、`src/smartdesk-core/internal/store/{memory,postgres}.go`）

---

## Phase 10: CORE-B4 关联/合并（Priority: P3）— **M3** — [US (edge: 合并)]

**Goal**：关联/合并。M3（O3 裁决）。依赖 A1。

- [ ] T041 [P] [CORE-B4] 集成测试：合并→子单 `merged_into` 主单 + 状态同步 + `ticket.merged`；关系冲突 **409**（US-2.6）
- [ ] T042 [CORE-B4] `internal/link`：`POST /tickets/{id}/links`（`relation∈{related,duplicate,merged_into}`）；合并联动状态+outbox `ticket.merged`；201 TicketLink（依赖 T024）

---

## Phase 11: CORE-0 写回消费（Priority: P2）— **M3** — [US3]

**Goal**：消费 `insight.classification_suggested` 落建议态。M3（O3 裁决）。依赖 T013 consumer。

- [ ] T043 [P] [CORE-0] 集成测试：`event_id` 去重（processed_events）、`confidence≥0.85 且自动填充开关开` 才填充（OQ-4），否则仅建议态
- [ ] T044 [CORE-0] `internal/events` consumer：JetStream 持久消费者订阅 `insight.classification_suggested` → 落 `TicketDetail.suggestion`（建议态）；**不开 core 同步写回端点（D1 守红线）**（依赖 T013,T025）

---

## Phase 12: 集成 / 契约校验 / 性能 / 安全（石磊跨切职责）— M2/M4

**Purpose**：跨模块联调与红线验收（非 §12.1 编号，详设 §7.1 末行）。

- [ ] T045 [CORE-集成] `api-contract-check` 技能接入 CI，阻止实现 ↔ core.yaml 漂移（依赖 T010）
- [ ] T046 [CORE-集成] 性能基线：工单列表/详情 P95 < 500ms（SC-003）压测脚本与门禁
- [ ] T047 [CORE-集成] 安全红线全量回归：越权 403（SC-006）、事件至少一次/0 重复副作用（SC-007）、降级 100%（SC-002）
- [ ] T048 [P] [CORE-集成] 可观测性收口：`/metrics`（P95/P99、SLA 计时准确性、outbox lag、消费 lag）、OTel trace 贯通
- [ ] T049 [P] [CORE-加固] M4 预留：OQ-10 软删除/审计/admin 导出删除接口（合规由人类 GA 前闭环，**不阻塞 M2/M3**）

---

## 依赖与执行顺序（DAG，对齐详设 §8.1）

```
Phase1 Setup ──▶ Phase2 Foundational(CORE-0: schema/事件/平台/桩) ─┬─▶ Phase3 CORE-C 配置
                                                                  │
   Phase3 CORE-C ──(SLA策略/users/categories)──────────────┐      │
                                                           ▼      ▼
                                              Phase4 CORE-A1 状态机(+watcher/csat) [US1 MVP]
                                                           │
                          ┌────────────┬──────────┬────────┼────────┬──────────┬──────────┐
                          ▼            ▼          ▼        ▼        ▼          ▼          ▼
                       A2 分派     A3 SLA(+C)  B1 评论   B2 附件   B3 查询/时间线  B4 合并(M3) 写回消费(M3)
                       [US4]       [US5]      [US4]     [US1]     [US1/US6]    (edge)      [US3]
                          └────────────┴──────────┴────────┴────────┴──────────┴──────────┘
                                                           ▼
                                       Phase12 集成/契约校验/性能/安全（石磊，M2/M4）
```

### 里程碑映射（详设 §7.2 / 系统详设 §12.2，O3 裁决定稿）

- **M2 MVP**：CORE-0 / A1 / A2 / A3 / B1 / B2 / B3 / C（提单→处理→关闭闭环，含 SLA 计时/暂停/预警、附件上传下载）→ Phase 1–9 + Phase12(性能/安全)。
- **M3 智能增强**：CORE-0(写回消费) + CORE-B4(关联/合并)→ Phase 10–11。
- **M4 加固/发布**：NFR/安全/性能加固、OQ-10 软删除/审计/导出闭环 → Phase12 T049。

### 并行机会

- Phase 1：T002/T003/T004 并行。
- Phase 2：T008 与 T005–T007 链并行；T009/T015 与迁移链并行。
- Phase 3：T017/T018/T019 三个 config 子域并行（T016 种子先行）。
- **A1 完成后**：A2 / A3 / B1 / B2 / B3 五块可由 陈川（A2/A3）/ 连城（B1/B2/B3）**并行推进**（不同包，经 domain 端口协作，互不 import）。
- 各块的契约/集成测试任务（T021/T028/T030/T034/T036/T041/T043）相对实现可先行（红线先写后实现）。

---

## 跨模块契约依赖（跨域阻塞标注）

| 依赖对端 | 类型 | core 侧依赖点 | 阻塞判定 |
|---|---|---|---|
| **契约冻结**（梁栋） | 前置门禁 | `core.yaml` v1.1.0 已冻结 | ✅ 已满足，开发 Issue 可解阻塞 |
| **gateway**（GW-3/GW-5） | 上游调用方 | core 仅信任 gateway 的 service-jwt(aud=core)+mTLS，身份由 claims 承载；旧的 `X-User-* / X-Org-Id` 明文透传头**已废弃**。**core 不被 gateway 实现阻塞**（core 定义并校验 serviceAuth 契约即可）；GW-3 聚合 BFF **反向依赖 core 契约就绪**（已就绪） | ⚠️ 单向：core→无阻塞；gateway 依赖 core 契约（已解除） |
| **insight**（INS-1/2/3/6） | 事件对端 | ① core 发 `ticket.*` 供 insight 消费 —— **core 事件 schema(§5.2) 是 insight 消费前置**，core 须先冻结事件信封；② core 消费 `insight.classification_suggested`（Phase 11）—— **依赖 insight 事件 schema 冻结**，否则 T044 阻塞 | ⚠️ **双向**：core 发布侧领先（T013 须先冻结事件 schema 供 INS）；core 消费侧（T044/M3）**阻塞于 insight `classification_suggested` schema 冻结**，需与 insight Leader 对齐字段（confidence/category/priority/applied） |
| **PostgreSQL** | 存储 | core OLTP 独享库、golang-migrate | 环境就绪即可，无跨域阻塞 |
| **NATS JetStream** | 事件总线 | Stream `SMARTDESK_EVENTS` | 不可用时 outbox 兜底，**不阻塞主流程** |
| **对象存储 S3/MinIO** | 附件 | CORE-B2(T037/T038) 预签名 | OSS 未就绪仅阻塞 B2，主流程不受影响 |
| 技能 `db-migration`/`api-contract-check`/`service-scaffold` | 工具 | T005–T008 / T045 / T001 | 已具备 |

> **跨域阻塞结论**：core M2 主链（Phase 1–9）**无外部硬阻塞**，可立即开工。唯一跨域硬依赖是 **Phase 11 写回消费（M3）阻塞于 insight `insight.classification_suggested` 事件 schema 冻结** —— 已标注，由石磊在 M3 前与 insight Leader 对齐字段契约。core 须在 T013 同步**冻结自身 `ticket.*` 事件信封**作为 insight 消费的前置交付。

---

## 验收门禁（详设 §7.3 / Agent Identity）

- 本域代码由石磊审视合入（in_review→done）。
- **关键代码**（DB 迁移 T005–T008/T016、契约相关 T010/T045、跨服务集成 T013/T044、SLA/状态机核心 T024/T031、安全相关 T011/T047）须发起**集体检视（≥2 名开发、累计 ≥3 分，含 committer 1 分）**后合入。
- 越权 / 状态机 / 幂等用例（T022/T034/T036/T047）为**必过红线**（功能 + 安全）。

---

## 落地建议（P3→P4 衔接）

P4（/implement）建议把本清单的 **Phase 块**回填为实现子 issue：CORE-0 骨架（石磊）→ CORE-C（石磊/陈川）→ CORE-A1（陈川）→ A2/A3（陈川）∥ B1/B2/B3（连城）→ B4/写回消费（M3）。前置依赖块 `todo`，并行块在 A1 done 后统一提升 `todo`，严格串行块（迁移链 0001→0002→0003）保持序内 backlog→todo 提升。
