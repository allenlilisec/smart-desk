# core 工单生命周期与协作能力 done/gap/drift 清单（SUP-266 + SUP-267）

> 核查日期：2026-06-17
> 范围：覆盖工单生命周期（状态机、分派、SLA）与协作能力（评论/内部备注、附件）相关实现状态。对应 [SUP-266](mention://issue/88ba079e-1d89-4a37-af55-28466ddd5b7d) 与 [SUP-267](mention://issue/87631b0b-0687-43f2-9b5b-46bf71676e0b)。
> 对照来源：`specs/core/tasks.md`（v3.0）、`specs/core子系统详细设计与实现说明书.md`（v3.0）、`src/openapi/core.yaml` v1.1.0、`src/smartdesk-core/`。

## done

| tasks 锚点 | 结论 | 代码/契约位置 |
|---|---|---|
| T023 / T031 | 建单会生成工单号、落 `status=new`，并按优先级启动 SLA 计时。 | `src/smartdesk-core/internal/httpapi/ticket_handlers.go`（`createTicket`）、`src/smartdesk-core/internal/domain/sla.go`（`Start`） |
| T024 | 状态机显式实现 `accept/start/wait_user/resolve/close/reopen/suspend/resume/cancel`，`user_reply` 仅系统内部触发，非法流转返回 409。 | `src/smartdesk-core/internal/domain/statemachine.go`、`src/smartdesk-core/internal/httpapi/workflow_handlers.go`（`transition`） |
| T024 / T030 / T031 | `accept` 标记响应达成；`wait_user` 暂停 SLA；`start`/`user_reply` 恢复并顺延；`resolve` 标记解决达成。 | `src/smartdesk-core/internal/httpapi/workflow_handlers.go`（`transition`）、`src/smartdesk-core/internal/domain/sla.go` |
| T024 | `reopen` 有 7 天窗口校验，成功后 `reopen_count+1` 并清空 `closed_at`。 | `src/smartdesk-core/internal/httpapi/workflow_handlers.go`（`transition`） |
| T025 / T031 / T032 | 工单详情聚合 SLA；`PATCH priority` 会重算 SLA 到期时间；`GET /tickets/{id}/sla` 返回 `SlaTimer`，跨租户按契约不泄露存在性。 | `src/smartdesk-core/internal/httpapi/ticket_handlers.go`（`getTicket`、`patchTicket`、`getSla`） |
| T028 / T029 | `POST /tickets/{id}/assignments` 支持 `manual/auto/reassign/escalate`，写 assignment、timeline、事件，并回写 ticket `assignee_id/group_id`。 | `src/smartdesk-core/internal/httpapi/workflow_handlers.go`（`assign`）、`src/smartdesk-core/internal/store/{memory,postgres}.go` |
| T034 / T035 | 评论/内部备注可见性过滤；requester public 回复触发 `user_reply` 并恢复 SLA。 | `src/smartdesk-core/internal/httpapi/collaboration.go`、`src/smartdesk-core/internal/store/{memory,postgres}.go` |
| T036 / T038 | 附件元数据、20MB/白名单/跨 org 校验、`comment_id` 同 ticket 校验、下载授权。 | `src/smartdesk-core/internal/httpapi/attachments.go`、`src/smartdesk-core/migrations/0003_attachments.sql` |
| T040 | 时间线正序分页查询。 | `src/smartdesk-core/internal/httpapi/collaboration.go`（`timeline`） |
| T021 / T022 / T028 / T030 / T034 / T036 | 已有 httptest 闭环覆盖建单、状态机、非法流转、SLA 暂停/恢复、关闭、评论可见性、附件越权、幂等 key 去重、跨租户拒绝。 | `src/smartdesk-core/internal/httpapi/server_test.go`、`src/smartdesk-core/internal/httpapi/attachment_test.go` |
| T014 | 领域状态机和 SLA 计算为纯 domain 规则，已有单元测试覆盖。 | `src/smartdesk-core/internal/domain/statemachine.go`、`src/smartdesk-core/internal/domain/statemachine_test.go` |
| T011 / D-1 | 业务路由已收口为 service-jwt claims 身份，不再信任 `X-User-*` 明文头；`/healthz`、`/readyz` 免鉴权。 | `src/openapi/core.yaml`、`src/smartdesk-core/internal/httpapi/auth.go`、`src/smartdesk-core/internal/httpapi/server.go` |

## gap

| tasks 锚点 | 缺口 | 当前影响 | 处置建议 |
|---|---|---|---|
| T022 | Idempotency-Key 仅按 key 去重返回首次工单，未保存 request hash，也未在同 key 不同请求体时返回 409。 | 与 tasks.md “hash 不一致 409” 不一致；重复 key 的误用会被当成首次结果重放。 | 补 `request_hash/response_status/response_body` 持久化；内存/Postgres 两套 store 同步实现；补红线测试。 |
| T024 | transitions 写 timeline 与事件，但未落 `ticket_status_history` 表；当前 schema 也没有该表。 | 状态审计只能从 timeline 读取。 | 后续以独立 migration 建 `ticket_status_history` 表并在 transition 时写入。 |
| T029 | `auto` 分派只写默认 reason，没有真正规则分派；`escalate` 只作为 assignment kind 记录，没有与 SLA 超时升级联动。 | 满足手工/改派记录与 assignee/group 回写；不满足自动规则和超时升级闭环。 | 拆出 AssignmentRule/SlaEscalation 设计后补实现。 |
| T030 / T033 | SLA 只有读时 `breached` 计算，未持久化 warning/breached 状态，未实现后台扫描器，也未发布 `ticket.sla_warning`/`ticket.sla_breached`。 | `/sla` 能看到是否超时，但不会产生升级事件、告警或自动 assignment。 | 新增 SLA scanner；事件总线升级后（SUP-296）发布预警/超时事件。 |
| T031 | `PATCH priority` 重算 SLA 时只按 `created_at + 新策略 + paused_seconds` 计算；暂停中的 `paused_at` 未显式纳入重算语义。 | 非暂停态可用；暂停中改优先级的剩余预算语义不够清晰。 | 明确语义后补 domain 测试。 |
| T037 | 附件预签名未接真实 S3/MinIO SDK；当前为 core 内置短时 URL。 | 附件 URL 不指向真实对象存储。 | 接入 `internal/objstore` 或等价 S3/MinIO 客户端。 |
| T039 | 列表增强缺 `sla_state` 过滤；Postgres `q` 为 LIKE 非 FTS；`page_size>100` 截断未明确 400/422；`sort=-created_at` 未显式分支。 | 列表查询与契约有 gap。 | 逐项补齐并补测试。 |
| T026 / T027 | `/tickets/{id}/watchers`、`/tickets/{id}/csat` 路由未挂载，表未建。 | CORE-A1 归属未完全闭环。 | 独立补 watchers/csat 表、store、路由与测试。 |
| T042 | 关联/合并路由未实现。 | core.yaml 全契约尚未闭环。 | 由 CORE-B4 继续补。 |
| H-3 | requester 同 org 访问他人工单未区分；当前按 org scope 过滤。 | 越权红线未完全闭环。 | 已转 [SUP-285](mention://issue/1af7a39e-3ce7-4003-9bda-a05c8bbbd503)。 |

## drift

| # | 当前状态 | 处置 |
|---|---|---|
| D-1 | `core.yaml` v1.1.0 + service-jwt claims 为事实源；旧 `X-User-*` 透传头已废弃。 | ✅ 已接受；`specs/core子系统详细设计与实现说明书.md` v3.0、`tasks.md` v3.0 已统一口径。 |
| D-2 | 当前实现为 `httpapi/domain/store` 轻量 MVP；原六边形/sqlc/oapi-codegen 已归档为长期技术债。 | ✅ 已接受；旧设计归档于 `specs/core/archived-hexagonal-design.md`。 |
| D-3 | MVP 接受 in-memory best-effort 事件；生产前升级为事务性 outbox + NATS relay。 | ✅ 已接受；由 [SUP-296](mention://issue/c8498d4e-a331-4a39-8e43-f9944149b12c) 跟踪。 |
| D-4 | `/readyz` 仅反映服务本身就绪，不强制探测 DB/NATS。 | ✅ 已接受；由 [SUP-297](mention://issue/d2a2e719-53ad-432e-b0bf-a51cdb0cf37d) 文档化。 |
| D-5 | `0001_init.sql` 为 MVP schema 基线；缺失表随 gap 任务以独立编号 migration 补齐。 | ✅ 已接受；禁止再向 `0001_init.sql` 追加。 |

## 本次未直接补实现的原因

可在本域闭环且低风险的主链行为已存在；剩余核心缺口（SLA 扫描/超时升级、idempotency hash、history/outbox、watchers/csat/links、真实 OSS）都跨 store、schema、事件与调度边界，属于关键代码和数据迁移，按门禁需集体检视。直接在当前大文件上补半实现会造成更大漂移，故本次以清单和详设状态刷新交付，建议拆分后续实现任务。
