# core 工单生命周期 done/gap/drift 清单（SUP-266）

> 核查日期：2026-06-17  
> 范围：仅覆盖工单生命周期相关内容：状态机与非法流转拒绝、分派与 assignee/group 变更、SLA 计时/暂停/恢复/超时升级，以及这些能力直接相关的接口、服务、仓储、测试、文档状态。  
> 对照来源：`specs/core/tasks.md`、`specs/core子系统详细设计与实现说明书.md`、`src/openapi/core.yaml`、`src/smartdesk-core/`。

## done

| tasks 锚点 | 结论 | 代码/契约位置 |
|---|---|---|
| T023 / T031 | 建单会生成工单号、落 `status=new`，并按优先级启动 SLA 计时。 | `src/smartdesk-core/internal/httpapi/server.go:123`、`src/smartdesk-core/internal/httpapi/server.go:169`、`src/smartdesk-core/internal/domain/sla.go:78` |
| T024 | 状态机显式实现 `accept/start/wait_user/resolve/close/reopen/suspend/resume/cancel`，`user_reply` 仅系统内部触发，非法流转返回 409。 | `src/smartdesk-core/internal/domain/statemachine.go:22`、`src/smartdesk-core/internal/domain/statemachine.go:55`、`src/smartdesk-core/internal/httpapi/server.go:256` |
| T024 / T030 / T031 | `accept` 标记响应达成；`wait_user` 暂停 SLA；`start`/`user_reply` 恢复并顺延；`resolve` 标记解决达成。 | `src/smartdesk-core/internal/httpapi/server.go:316`、`src/smartdesk-core/internal/domain/sla.go:90`、`src/smartdesk-core/internal/domain/sla.go:99` |
| T024 | `reopen` 有 7 天窗口校验，成功后 `reopen_count+1` 并清空 `closed_at`。 | `src/smartdesk-core/internal/httpapi/server.go:274`、`src/smartdesk-core/internal/httpapi/server.go:294` |
| T025 / T031 / T032 | 工单详情聚合 SLA；`PATCH priority` 会重算 SLA 到期时间；`GET /tickets/{id}/sla` 返回 `SlaTimer`，跨租户按契约不泄露存在性。 | `src/smartdesk-core/internal/httpapi/server.go:204`、`src/smartdesk-core/internal/httpapi/server.go:238`、`src/smartdesk-core/internal/httpapi/server.go:459` |
| T028 / T029 | `POST /tickets/{id}/assignments` 支持 `manual/auto/reassign/escalate`，写 assignment、timeline、事件，并回写 ticket `assignee_id/group_id`。 | `src/smartdesk-core/internal/httpapi/server.go:333`、`src/smartdesk-core/internal/store/memory.go:314`、`src/smartdesk-core/internal/store/postgres.go:474` |
| T021 / T022 / T028 / T030 | 已有 httptest 闭环覆盖建单、状态机、非法流转、SLA 暂停、用户回复自动恢复、关闭、评论可见性、幂等、跨租户拒绝。 | `src/smartdesk-core/internal/httpapi/server_test.go:153`、`src/smartdesk-core/internal/httpapi/server_test.go:232`、`src/smartdesk-core/internal/httpapi/server_test.go:283`、`src/smartdesk-core/internal/httpapi/server_test.go:336` |
| T014 | 领域状态机和 SLA 计算是纯 domain 规则，已有单元测试覆盖合法/非法/幂等/系统动作边界。 | `src/smartdesk-core/internal/domain/statemachine.go:55`、`src/smartdesk-core/internal/domain/statemachine_test.go:10` |
| T011 / 契约 1.1.0 | 业务路由已收口为 service-jwt claims 身份，不再信任 `X-User-*` 明文头；`/healthz`、`/readyz` 免鉴权。 | `src/openapi/core.yaml:9`、`src/openapi/core.yaml:321`、`src/smartdesk-core/internal/httpapi/auth.go:15`、`src/smartdesk-core/internal/httpapi/server.go:53` |

## gap

| tasks 锚点 | 缺口 | 当前影响 | 处置建议 |
|---|---|---|---|
| T022 | Idempotency-Key 仅按 key 去重返回首次工单，未保存 request hash，也未在同 key 不同请求体时返回 409。 | 与 tasks.md “hash 不一致 409” 不一致；重复 key 的误用会被当成首次结果重放。 | 补 `request_hash/response_status/response_body` 持久化；内存/Postgres 两套 store 同步实现；补红线测试。 |
| T024 | transitions 写 timeline 与事件，但未落 `ticket_status_history` 表；当前 schema 也没有该表。 | 状态审计只能从 timeline 读取，无法满足详设里 history 表的结构化查询要求。 | 若仍需要 history 表，补迁移和 store 写入；若 timeline 已替代 history，需提 drift 等架构裁决。 |
| T029 | `auto` 分派只写默认 reason，没有真正规则分派；`escalate` 只作为 assignment kind 记录，没有与 SLA 超时升级联动。 | 满足手工/改派记录与 assignee/group 回写；不满足自动规则和超时升级闭环。 | 拆出 AssignmentRule/SlaEscalation 设计，定义规则来源、默认组和升级目标后补实现。 |
| T030 / T033 | SLA 只有读时 `breached` 计算，未持久化 warning/breached 状态，未实现后台扫描器，也未发布 `ticket.sla_warning`/`ticket.sla_breached`。 | `/sla` 能看到是否超时，但不会产生升级事件、告警或自动 assignment。 | 新增 SLA scanner 入口、扫描游标/去重字段、事件/outbox/NATS 投递与升级策略；需要集体检视。 |
| T031 | `PATCH priority` 重算 SLA 时只按 `created_at + 新策略 + paused_seconds` 计算；当前暂停中的 `paused_at` 未显式纳入重算语义。 | 非暂停态可用；暂停中改优先级的剩余预算语义不够清晰。 | 明确“暂停中改优先级”以原创建时间重算还是以恢复时刻重算，再补 domain 测试。 |
| T021 / T045 | 未使用 `oapi-codegen` 生成 server/types，也未接入自动化 `api-contract-check`；当前为手写 `net/http` 路由。 | 路由层可运行，但实现与 OpenAPI 漂移只能靠人工/测试发现。 | 由 committer 决定继续轻量手写还是切回生成桩；至少补契约路由覆盖检查。 |
| T021 / T026 / T027 | `/tickets/{id}/watchers`、`/tickets/{id}/csat` 在 core.yaml 中存在，但当前 HTTP 路由未挂载。 | 不属于本次生命周期主链，但 CORE-A1 归属仍未闭环。 | 单独补 A1 tail issue：watchers 表/store/路由；CSAT 状态校验、comment/rated_at 字段和测试。 |
| T038 / T042 | 附件预签名、关联/合并路由未实现。 | 与本工单生命周期主域无直接依赖，但 core.yaml 全契约尚未闭环。 | 由 CORE-B 继续补；本域只需注意合并若影响状态同步需与状态机复用规则对齐。 |

## drift

| # | 代码现状 | 设计/任务要求 | 建议 |
|---|---|---|---|
| D-1 | `src/openapi/core.yaml` 已是 `1.1.0`，并明确身份从 service-jwt claims 读取，拒绝旧 `X-User-* / X-Org-Id` 明文头。 | `tasks.md` 仍写 `core.yaml v1.0.1`，详设 §2/§4/§5/§8 多处仍写 `X-User-*` 透传或 `1.0.0` 冻结。 | 改设计文档到 1.1.0 + service-jwt claims 口径；不建议回退代码。 |
| D-2 | 当前实现是轻量 MVP：`internal/httpapi` + `internal/domain` + `internal/store`，内存/Postgres 双 store；没有 `ticket/transition/assignment/sla` 等详设包，也没有 sqlc/oapi-codegen。 | 详设 §6 和 tasks.md 要求六边形分包、sqlc、oapi-codegen、outbox relay/NATS。 | 这是实现策略漂移。建议由架构/committer 决定：接受轻量 MVP 并更新详设，或开重构任务回归原分层。 |
| D-3 | 事件发布为 in-memory best-effort publisher；Postgres schema 有 `processed_events`，但没有 `outbox_events`、relay 或 NATS JetStream。 | 详设要求事务性 outbox、至少一次投递、NATS relay。 | 不建议在本工单临时补半套；需要 CORE-0 跨切任务补 outbox/NATS，SLA 扫描依赖该能力。 |
| D-4 | `readyz` 返回 200 并报告 bus 健康；不会因总线不可用失败。 | 详设曾写 `/readyz` 探测 DB+NATS。 | 若降级原则要求主写路径不受总线影响，保留代码并更新文档；若运维要求 readiness 阻断流量，需架构裁决。 |
| D-5 | Postgres migration 是压缩后的 `0001_init.sql` + `0002_ticket_counter.sql`，表结构与详设拆分迁移不完全一致：无 `roles/user_roles/sla_policy_targets/outbox_events/ticket_status_history/watchers/csat_ratings` 等独立表。 | 详设 §3.2/tasks T005-T008/T016 要求拆分迁移与完整数据模型。 | 需决定当前 MVP schema 是否作为新事实源；若不是，后续迁移需谨慎补齐且保护现有数据。 |

## 本次未直接补实现的原因

可在本域闭环且低风险的主链行为已存在；剩余核心缺口（SLA 扫描/超时升级、idempotency hash、history/outbox）都跨 store、schema、事件与调度边界，属于关键代码和数据迁移，按门禁需集体检视。直接在当前大文件上补半实现会造成更大漂移，故本次以清单和详设状态刷新交付，建议拆分后续实现任务。
