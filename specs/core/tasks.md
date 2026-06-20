# Tasks: smartdesk-core 实现任务分解（P4 / SUP-295 刷新）

**Input**: [`specs/core子系统详细设计与实现说明书.md`](../core子系统详细设计与实现说明书.md)（v3.0，轻量 MVP 事实源，2026-06-17）
**契约唯一事实源**: [`src/openapi/core.yaml`](../../src/openapi/core.yaml)（OpenAPI 3.1，**v1.1.0**）
**代码唯一事实源**: [`src/smartdesk-core/`](../../src/smartdesk-core/)
**派生自**: 系统详设 v1.0、梁栋 2026-06-17 D-2~D-5 裁决
**编制**: 秦诺（契约设计 / 架构设计团队）　|　日期：2026-06-17

> 本清单由 P4 `done/gap/drift` 结论刷新。当前实现采用 **`httpapi/domain/store` 轻量 MVP**（梁栋裁决接受为新事实源）；原六边形/sqlc/oapi-codegen 目标已归档于 [`archived-hexagonal-design.md`](archived-hexagonal-design.md)，不阻塞当前交付。
>
> 任务 ID 沿用详设 §7.1 / 系统详设 §12.1 的 **CORE-\*** 体系。`[P]` = 可并行。`[x]` = done，`[ ]` = gap/backlog。

---

## 0. 与 main 现有 `src/smartdesk-core/` 的 done / gap / drift 判定

> 检视基线：main@`cab06d37a6beae3b29543094d8307527e8ef907a`。

### 0.1 done（已实现）

| 项 | 位置 | 状态 |
|---|---|---|
| Go 工程骨架 | `src/smartdesk-core/` | ✅ `cmd/`、`internal/{auth,config,domain,event,httpapi,id,store}/`、`migrations/` 已建立 |
| 对外契约 | `src/openapi/core.yaml` v1.1.0 | ✅ 冻结，业务 path + `/healthz` `/readyz` 齐全 |
| 身份收口 | `internal/httpapi/auth.go` + `internal/auth/jwt.go` | ✅ service-jwt claims 为唯一身份来源 |
| 存储双实现 | `internal/store/{memory,postgres}.go` | ✅ Memory（dev/CI）+ Postgres（production） |
| 事件信封 | `internal/event/event.go` | ✅ 统一 envelope；MVP 为 in-memory best-effort publisher |

### 0.2 gap（待后续任务）

- 事件总线未升级为事务性 outbox + NATS relay（[SUP-296](mention://issue/c8498d4e-a331-4a39-8e43-f9944149b12c)）。
- `oapi-codegen` 未接入；手写 `net/http` 路由。
- `sqlc`/`pgx` repository 未接入；当前为 `database/sql + lib/pq` 直接 SQL。
- 缺失独立表：roles/user_roles/sla_policy_targets/ticket_status_history/watchers/csat_ratings/outbox_events 等。
- `api-contract-check` 未接入 CI。

### 0.3 drift（已裁决）

| # | 漂移 | 裁决结果 | 状态 |
|---|---|---|---|
| D-1 | `core.yaml` 已是 v1.1.0，身份来源改为 service-jwt claims；旧 `X-User-*` 透传头表述残留 | 以 1.1.0 + claims 为准；文档已刷新 | ✅ 已解决 |
| D-2 | 当前为 `httpapi/domain/store` 轻量 MVP，未按原详设走六边形/sqlc/oapi-codegen | 接受为新事实源；旧设计归档 | ✅ 已解决 |
| D-3 | 事件发布为 in-memory best-effort | MVP 接受，生产前升级（SUP-296 backlog） | ✅ 已裁决 |
| D-4 | `/readyz` 不因总线不可用失败 | 接受新语义；文档已刷新（SUP-297） | ✅ 已裁决 |
| D-5 | 压缩 `0001_init.sql` 作为 MVP schema 基线 | 接受；新表走独立 migration | ✅ 已裁决 |

---

## Phase 1: Setup（项目骨架）— CORE-0 ❶

- [x] T001 [CORE-0] 建立 Go module 与包骨架：`cmd/smartdesk-core/`、`internal/{auth,config,domain,event,httpapi,id,store}/`、`migrations/`。
- [x] T002 [P] [CORE-0] 接入基础依赖：`database/sql`、`lib/pq`、`slog`；无 oapi-codegen/sqlc/NATS SDK（MVP）。
- [ ] T003 [P] [CORE-0] 配置 lint/format 与 CI 工作流（含后续 `api-contract-check` 接入点）。
- [x] T004 [P] [CORE-0] `internal/config`：环境加载（DB DSN、org、JWT 公钥/aud/iss），默认监听 `127.0.0.1:8081`。

---

## Phase 2: Foundational（阻塞性基础设施）— CORE-0 ❷

### 2.1 DB schema 与迁移

- [x] T005 [CORE-0] `migrations/0001_init.sql`：当前 MVP schema（categories、sla_policies、users、tickets、sla_timers、assignments、comments、ticket_timeline、ticket_links、idempotency_keys、processed_events）。
- [x] T006 [CORE-0] `migrations/0002_ticket_counter.sql`：工单号计数器。
- [x] T007 [CORE-0] `migrations/0003_attachments.sql`：`attachments` 表及 `comment_id` 外键。
- [ ] T008 [P] [CORE-0] 补齐缺失独立表：roles/user_roles/sla_policy_targets/ticket_status_history/outbox_events/watchers/csat_ratings（各走独立编号 migration，禁止向 0001 追加）。

### 2.2 平台/出站适配器

- [x] T009 [P] [CORE-0] `internal/store`：Store 接口 + Memory/Postgres 双实现；Postgres 启动时按序执行 `migrations/*.sql`。
- [ ] T010 [CORE-0] `oapi-codegen` 生成 types + server 桩（长期技术债，[SUP-298](mention://issue/c7b6eec2-990f-4491-ad9b-33cb47ac8151)）。
- [x] T011 [CORE-0] `internal/httpapi` authenticate 中间件：校验 service-jwt 签名 + aud=core，claims 注入 context。
- [ ] T012 [CORE-0] `sqlc` + `pgx` repository 与显式事务管理（长期技术债，SUP-298）。
- [ ] T013 [CORE-0] 事务性 outbox + NATS relay（[SUP-296](mention://issue/c8498d4e-a331-4a39-8e43-f9944149b12c)）。
- [x] T014 [CORE-0] `internal/domain`：状态机表、SLA 计算、可见性规则、统一错误码。
- [x] T015 [P] [CORE-0] httptest 基座：内存 store + 内存 publisher，覆盖建单/状态机/评论/附件。

**Checkpoint**：空服务可启动，`/healthz`/`/readyz` 通过，建单链路可跑通。

---

## Phase 3: CORE-C 配置目录（taxonomy / SLA 策略 / 用户角色）— M2

- [x] T016 [CORE-C] `migrations/0005_seed.sql`：角色枚举、SLA v1 基线、分类初始集。
- [x] T017 [P] [CORE-C] taxonomy：`GET/POST /config/categories`、`PATCH/DELETE /config/categories/{catId}`。
- [x] T018 [P] [CORE-C] SLA 策略：`GET /config/sla-policies`、`PUT /config/sla-policies`。
- [x] T019 [P] [CORE-C] 用户目录：`GET/POST /config/users`、`PUT /config/users/{userId}/roles`。
- [ ] T020 [CORE-C] 契约测试：/config/* 响应对照 core.yaml schema（依赖 T010）。

---

## Phase 4: CORE-A1 工单状态机 — MVP 核心 — [US1]

### Tests

- [x] T021 [P] [CORE-A1] 契约覆盖测试：`POST/GET /tickets`、`GET/PATCH /tickets/{id}`、`/transitions`。
- [ ] T022 [P] [CORE-A1] 红线集成测试：幂等 hash 不一致 409（当前仅 key→ticket 去重）。

### 实现

- [x] T023 [CORE-A1] 建单：生成 number、落 tickets(new)、启动 SLA、写 timeline、发布 `ticket.created`。
- [x] T024 [CORE-A1] 状态机：显式 action→from→to 表、非法 409、幂等、写 timeline。
- [x] T025 [P] [CORE-A1] 查询/详情/更新：`GET /tickets` 过滤、`GET /tickets/{id}` 聚合 SLA、`PATCH` 改字段并重算 SLA。
- [ ] T026 [P] [CORE-A1] watcher：`POST /tickets/{id}/watchers`（路由未挂载，表未建）。
- [ ] T027 [P] [CORE-A1] CSAT：`POST /tickets/{id}/csat`（路由未挂载，表未建）。

---

## Phase 5: CORE-A2 分派 — [US4]

- [x] T028 [P] [CORE-A2] 契约覆盖测试：`POST /tickets/{id}/assignments`。
- [x] T029 [CORE-A2] 分派/改派：kind∈{manual,auto,reassign,escalate}；写 assignments+timeline+事件；回写 ticket assignee/group。

> `auto` 未实现真实规则分派；`escalate` 未与 SLA 超时联动（gap）。

---

## Phase 6: CORE-A3 SLA 引擎 — M2 — [US5]

- [x] T030 [P] [CORE-A3] 集成测试：计时启动、`wait_user` 暂停 / `start`·`user_reply` 恢复顺延。
- [x] T031 [CORE-A3] SlaEngine：`Start`/`Pause`/`Resume`/`Recalc`。
- [x] T032 [CORE-A3] `GET /tickets/{id}/sla` 返回 SlaTimer。
- [ ] T033 [CORE-A3] 后台扫描器：warning/breached 事件与升级策略（依赖 T013 outbox + NATS）。

---

## Phase 7: CORE-B1 评论与内部备注 — M2 — [US4]

- [x] T034 [P] [CORE-B1] 红线测试：internal 对 requester 接口层过滤；requester 回 public 触发 `user_reply`。
- [x] T035 [CORE-B1] 评论：`GET/POST /tickets/{id}/comments`；按 roles claim 过滤 internal；requester public 回复触发 `user_reply` + SLA 恢复。

---

## Phase 8: CORE-B2 附件 — M2 — [US1/US2.7]

- [x] T036 [P] [CORE-B2] 红线测试：20MB→413、非白名单→422、越权下载→403。
- [ ] T037 [P] [CORE-B2] S3/MinIO SDK 预签名（当前为内置短时 URL）。
- [x] T038 [CORE-B2] 附件路由：`GET/POST /tickets/{id}/attachments`、`GET /attachments/{attId}/download-url`；含 `comment_id`。

---

## Phase 9: CORE-B3 查询/列表/过滤 + 时间线 — M2 — [US1/US6]

- [x] T039 [P] [CORE-B3] 列表增强：status/priority/assignee_id/requester_id/group_id/category_id/q/sort/page/page_size。
  - **partial/gap**：缺 `sla_state` 过滤；Postgres `q` 为 LIKE 非 FTS；`page_size>100` 截断未明确 400/422；`sort=-created_at` 未显式分支。
- [x] T040 [P] [CORE-B3] 时间线：`GET /tickets/{id}/timeline` 正序分页。

---

## Phase 10: CORE-B4 关联/合并 — M3

- [ ] T041 [P] [CORE-B4] 集成测试：合并冲突 409。
- [ ] T042 [CORE-B4] `POST /tickets/{id}/links`：relation∈{related,duplicate,merged_into}；合并联动状态+事件。

---

## Phase 11: CORE-0 写回消费 — M3 — [US3]

- [ ] T043 [P] [CORE-0] 集成测试：processed_events 去重、confidence/自动填充开关。
- [ ] T044 [CORE-0] consumer：订阅 `insight.classification_suggested` → 落 `TicketDetail.suggestion`（依赖 T013）。

---

## Phase 12: 集成 / 契约校验 / 性能 / 安全 — M2/M4

- [ ] T045 [CORE-集成] `api-contract-check` 接入 CI（依赖 T010）。
- [ ] T046 [CORE-集成] 性能基线：列表/详情 P95 < 500ms。
- [ ] T047 [CORE-集成] 安全红线回归：越权 403、幂等、状态机。
- [ ] T048 [P] [CORE-集成] 可观测性：`/metrics`、OTel trace、outbox lag（依赖 T013）。
- [ ] T049 [P] [CORE-加固] M4 预留：软删除/审计/admin 导出删除。

---

## 依赖与执行顺序（DAG）

```
Phase1 Setup ──▶ Phase2 Foundational(CORE-0: schema/store/事件桩)
                                  │
                                  ▼
                         Phase3 CORE-C 配置
                                  │
                                  ▼
                  Phase4 CORE-A1 状态机(+watcher/csat gap) [US1 MVP]
                                  │
        ┌──────────┬──────────────┼──────────────┬──────────┐
        ▼          ▼              ▼              ▼          ▼
     A2 分派    A3 SLA        B1 评论        B2 附件     B3 查询/时间线
                                  │
                                  ▼
                Phase12 集成/契约校验/性能/安全（M2/M4）
                                  │
              Phase10 B4 + Phase11 写回消费（M3）
```

### 里程碑映射

- **M2 MVP**：CORE-0 / A1 / A2 / A3 / B1 / B2 / B3 / C 主体闭环；剩余 gap 以独立子任务补齐。
- **M3 智能增强**：B4 关联/合并、写回消费、事件总线升级（SUP-296）。
- **M4 加固/发布**：NFR/安全/性能加固、长期技术债重构（SUP-298）。

---

## 验收门禁

- 本域代码由后端 Leader 审视合入（in_review→done）。
- DB 迁移、契约变更、跨服务集成、SLA/状态机核心、安全相关代码须集体检视（≥2 名开发、累计 ≥3 分，含 committer 1 分）。
- 越权 / 状态机 / 幂等为必过红线。
