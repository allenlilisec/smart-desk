# CORE-A1 工单生命周期红线测试用例（T021 / T022）

> 对应任务：SUP-172「[P4][core][CORE-A] 工单生命周期实现（陈川）」立即可开工项。
> 事实源：
> - 接口契约：`src/openapi/core.yaml` v1.1.0
> - 子系统详设：`specs/core子系统详细设计与实现说明书.md` v2.0（§3.2 / §4.2）
> - 集成测试框架：`specs/SmartDesk集成测试策略与用例框架.md`
>
> 说明：本文件为**测试设计**，供后续实现时直接落地为 Go 契约/集成测试。当前 repo 尚无 Go 骨架，故先以用例集形式输出。

---

## 1. 范围与测试分层

| 编号 | 任务 | 类型 | 目标 |
|---|---|---|---|
| T021 | `/tickets`、`/transitions`、`/watchers`、`/csat` 契约测试 | 单服务契约测试 | 逐 path/schema/状态码/错误模型对齐 `core.yaml`，不依赖真实 PG/NATS |
| T022 | 红线集成测试 | 集成测试（testcontainers PG+NATS） | 验证「幂等、非法状态跃迁 409、AI/NATS 降级仍 201」三条架构红线 |

前置依赖：CORE-0 骨架（oapi-codegen 生成、`serviceAuth` 中间件、testcontainers 夹具）就绪后方可**编码执行**；但用例设计本身已完成，不阻塞。

---

## 2. T021 契约测试用例集

### 2.1 通用断言（每条用例必验）

1. **HTTP 状态码**与 `core.yaml` 该 path 的 `responses` 严格一致。
2. **响应 schema**：字段名、类型、required、enum、nullable、format 与 `core.yaml` 零漂移。
3. **错误模型**：`Error{code, message, details?, trace_id}`，且 `code` 为可读大写下划线字符串。
4. **认证/透传头**：无 `Authorization` 或无效 service-jwt → 401；`aud≠core` → 401。

---

### 2.2 `POST /tickets`

| 用例ID | 场景 | 请求要点 | 期望 | 对齐 |
|---|---|---|---|---|
| T021-T01 | 最小合法建单 | `{title, description}`，无 Idempotency-Key | 201；返回 `Ticket`，`status=new`；`number` 形如 `SD-2026-000123`；`priority` 默认 `P3`；`source=web` | core.yaml `TicketCreate` / `Ticket` |
| T021-T02 | 完整字段建单 | `category_id`、`priority=P1`、`attachment_ids` | 201；返回字段与请求一致 | core.yaml `TicketCreate` |
| T021-T03 | 标题超长 | `title` 长度 >200 | 400 / 422；`code=VALIDATION_FAILED` | core.yaml `maxLength:200` |
| T021-T04 | 缺少必填 | 缺 `description` | 400 / 422；`code=VALIDATION_FAILED` | core.yaml `required:[title,description]` |
| T021-T05 | 非法 priority | `priority=P0` | 400 / 422；枚举校验失败 | `Priority` enum |
| T021-T06 | 未认证 | 无 Authorization | 401 | `security: serviceAuth` |
| T021-T07 | 越权领域过滤（预留） | requester 建单后返回的 `requester_id` 与 `X-User-Id` 一致 | 201；后续 T022 再验越权 | §4.2 |

---

### 2.3 `GET /tickets`

| 用例ID | 场景 | 请求要点 | 期望 | 对齐 |
|---|---|---|---|---|
| T021-T08 | 列表默认分页 | 无 query | 200；`TicketPage{items:[], page:1, page_size:20, total:0}` | `TicketPage` |
| T021-T09 | 分页参数边界 | `page=1&page_size=100` | 200；`page_size=100` | `PageSize max 100` |
| T021-T10 | page_size 超限 | `page_size=101` | 400 / 422 | `PageSize maximum:100` |
| T021-T11 | 按 status 过滤 | `status=new` | 200；items 全部 `status=new` | query schema |
| T021-T12 | 按 priority 过滤 | `priority=P1` | 200；items 全部 `priority=P1` | query schema |
| T021-T13 | 关键词 q | `q=无法登录` | 200；命中标题/描述关键词 | `q` 参数 |
| T021-T14 | sla_state 过滤 | `sla_state=breached` | 200；items 符合该 SLA 状态 | query enum `[ok,warning,breached]` |
| T021-T15 | sort 参数 | `sort=-created_at` | 200；按 created_at 倒序 | `sort` 参数 |
| T021-T16 | 未认证 | 无 Authorization | 401 | `security: serviceAuth` |

---

### 2.4 `GET /tickets/{id}`

| 用例ID | 场景 | 请求要点 | 期望 | 对齐 |
|---|---|---|---|---|
| T021-T17 | 正常详情 | 合法 ticket UUID | 200；`TicketDetail` 含 `sla`、`suggestion`、`links`；基础字段与 `Ticket` 一致 | `TicketDetail` |
| T021-T18 | 不存在 | 随机 UUID | 404；`Error` | `NotFound` |
| T021-T19 | 非法 UUID | `id=not-a-uuid` | 400 | path schema `format:uuid` |
| T021-T20 | 越权 | requester 访问他人工单 | 403 或 404（信息不泄露） | `Forbidden` |
| T021-T21 | 未认证 | 无 Authorization | 401 | `security: serviceAuth` |

---

### 2.5 `PATCH /tickets/{id}`

| 用例ID | 场景 | 请求要点 | 期望 | 对齐 |
|---|---|---|---|---|
| T021-T22 | 更新标题/描述 | `{title, description}` | 200；返回更新后的 `Ticket`；`updated_at` 刷新 | `TicketUpdate` |
| T021-T23 | 更新分类 | `{category_id}` | 200；`category_id` 变更 | `TicketUpdate` |
| T021-T24 | 更新优先级 | `{priority:P1}` | 200；`priority` 变更，且应触发 SLA Recalc（T022 验） | `TicketUpdate` + §4.2 |
| T021-T25 | 空 body | `{}` | 200；原样返回或 422（按实现定，契约无禁止） | 预留 |
| T021-T26 | 不存在 | 随机 UUID | 404 | `NotFound` |
| T021-T27 | requester 更新他人工单 | 他人 ticket id | 403/404 | `Forbidden` |
| T021-T28 | 未认证 | 无 Authorization | 401 | `security: serviceAuth` |

---

### 2.6 `POST /tickets/{id}/transitions`

| 用例ID | 场景 | 请求要点 | 期望 | 对齐 |
|---|---|---|---|---|
| T021-T29 | 合法 accept | `new → accepted` | 200；返回 `Ticket`，`status=accepted` | §4.2 |
| T021-T30 | 合法 start | `accepted → in_progress` | 200；`status=in_progress` | §4.2 |
| T021-T31 | 合法 wait_user | `in_progress → pending_user` | 200；`status=pending_user` | §4.2 |
| T021-T32 | 合法 resolve | `in_progress → resolved` | 200；`status=resolved` | §4.2 |
| T021-T33 | 合法 close | `resolved → closed` | 200；`status=closed`；`closed_at` 有值 | §4.2 |
| T021-T34 | 合法 reopen | closed 7 天内 | 200；`status=in_progress`；`reopen_count+1` | §4.2 |
| T021-T35 | 非法跃迁 | `new → resolve` | **409**；`Error` | `409` response |
| T021-T36 | 非法 action | `action=not_exist` | 400 / 422 / 409 | `TransitionRequest.action` enum |
| T021-T37 | 缺少 action | `{}` | 400 / 422 | `required:[action]` |
| T021-T38 | 不存在 ticket | 随机 UUID | 404 | `NotFound` |
| T021-T39 | 未认证 | 无 Authorization | 401 | `security: serviceAuth` |

---

### 2.7 `POST /tickets/{id}/watchers`

| 用例ID | 场景 | 请求要点 | 期望 | 对齐 |
|---|---|---|---|---|
| T021-T40 | 关注 | `{watch:true}` | **204**，body 为空 | `204` response |
| T021-T41 | 取消关注 | `{watch:false}` | **204**，body 为空 | `204` response |
| T021-T42 | body 缺少 watch | `{}` | 400 / 422 | inline schema `required:[watch]` |
| T021-T43 | 不存在 ticket | 随机 UUID | 404 | `NotFound` |
| T021-T44 | 未认证 | 无 Authorization | 401 | `security: serviceAuth` |

---

### 2.8 `POST /tickets/{id}/csat`

| 用例ID | 场景 | 请求要点 | 期望 | 对齐 |
|---|---|---|---|---|
| T021-T45 | resolved 评价 | ticket status=resolved，`{score:5}` | 201；`Ticket.csat_score=5`；`csat_rated_at` 有值；`csat_comment` 可空 | `CsatCreate` / `Ticket` |
| T021-T46 | closed 评价带 comment | `{score:4, comment:"..."}` | 201；回填 `csat_comment` | core.yaml 1.1.0 D-1 |
| T021-T47 | new 状态评价 | status=new | **409**；`Error` | `409` response |
| T021-T48 | score 越界 | `score=0` / `score=6` | 400 / 422 | `minimum:1 maximum:5` |
| T021-T49 | 不存在 ticket | 随机 UUID | 404 | `NotFound` |
| T021-T50 | 未认证 | 无 Authorization | 401 | `security: serviceAuth` |

---

## 3. T022 红线集成测试场景

运行环境：真实 PG + NATS JetStream（testcontainers），真实 core HTTP server。

### 3.1 幂等红线

#### IT-A1-001 幂等命中返回首次结果

1. 使用同一 `Idempotency-Key: key-001` 和同一 body 连续两次 `POST /tickets`。
2. 断言：两次均返回 **201**；`id`、`number`、响应体完全一致。
3. 断言：数据库仅一条 ticket 记录；`idempotency_keys` 表存在 `(org_id='default', key='key-001')` 记录。

#### IT-A1-002 幂等键相同但请求 hash 不一致 → 409

1. 第一次 `POST /tickets` 带 `Idempotency-Key: key-002`，body `{title:"A", description:"B"}`，得 201。
2. 第二次使用相同 `Idempotency-Key: key-002`，body `{title:"A", description:"C"}`。
3. 断言：第二次返回 **409**；`code` 提示幂等键冲突/请求不一致。
4. 断言：数据库仍仅一条对应 ticket。

#### IT-A1-003 transitions 幂等

1. `POST /tickets/{id}/transitions` 同一 `Idempotency-Key` + 同一 action 重复两次。
2. 断言：两次均 200；`ticket_status_history` 仅新增一条记录。

---

### 3.2 非法状态跃迁红线

覆盖 `core.yaml` §4.2 状态机表的所有非法组合。下列组合必须返回 **409**：

| from | 非法 action | 说明 |
|---|---|---|
| new | resolve / close / reopen / suspend / resume | 必须先 accept |
| accepted | wait_user / resolve / close / reopen / suspend / resume | 必须先 start |
| in_progress | accept / close / reopen | close 仅允许从 resolved |
| pending_user | accept / resolve / close / reopen / suspend / resume | 恢复走 start 或 user_reply |
| resolved | accept / start / wait_user / resolve / suspend / resume / cancel | 只能 close / reopen |
| closed | 除 reopen 外所有 action | 终态 |
| suspended | accept / wait_user / resolve / close / reopen / cancel | 只能 resume |
| cancelled | 所有 action | 终态 |

每个组合写一个子用例，断言：
- HTTP 409；
- `ticket.status` 未改变；
- `ticket_status_history` 未新增记录；
- `ticket_timeline` 未新增 `status_changed` 事件。

#### IT-A1-004 resume 不复用为 pending_user 恢复

- ticket 状态为 `pending_user`，`POST /transitions` `action=resume` → 409。
- 正确路径应为 `action=start` 或系统内部 `user_reply`。

#### IT-A1-005 reopen 7 天窗口

- ticket `closed_at = now - 6 days`，`action=reopen` → 200，`reopen_count=1`。
- ticket `closed_at = now - 7 days`（边界需明确），按产品口径应为允许/拒绝之一，建议用例覆盖「7 天整仍允许、7 天零 1 秒拒绝」。
- ticket `closed_at = now - 8 days`，`action=reopen` → 409。

---

### 3.3 降级红线（AI / NATS 不可用建单仍 201）

#### IT-A1-006 NATS 断开时建单成功

1. 停止/隔离 NATS 容器。
2. `POST /tickets` 正常 body。
3. 断言：返回 **201**；PG 中 ticket `status=new`；`ticket_timeline` 有 `ticket_created`；`outbox_events` 有未发的 `ticket.created`（`published_at IS NULL`）。
4. 恢复 NATS，等待 outbox relay 补投；断言事件成功发布。

#### IT-A1-007 insight 不可用时建单成功

1. insight 服务未启动（或 NATS 无 insight 消费者）。
2. `POST /tickets` 正常 body。
3. 断言：返回 **201**；`TicketDetail.suggestion` 为空/未填充；主流程无阻塞。

---

### 3.4 可见性/越权红线（T022 与 T021 重叠，强化断言）

#### IT-A1-008 requester 不可见他人工单

- requester A 创建 ticket；requester B `GET /tickets/{id}` → 403（或 404，信息不泄露）。

#### IT-A1-009 CSAT 仅可评自己的 resolved/closed 工单

- requester A 的 ticket resolved；requester B `POST /csat` → 403/404。
- agent 将 ticket 转至 in_progress 后 requester A `POST /csat` → 409。

---

## 4. 与集成测试框架 S-xx 映射

| 本文件用例 | 集成框架场景 | 备注 |
|---|---|---|
| T021-T01~T50 | S-01 / S-05 / S-10 / S-11 | 契约层细化 |
| IT-A1-001~003 | S-05 / S-19 | 幂等红线 |
| IT-A1-004~005 | S-05 / S-10 | 状态机 + 7 天窗口 |
| IT-A1-006~007 | S-02 | 降级红线 |
| IT-A1-008~009 | S-16 | 越权红线 |

---

## 5. 后续落地动作

1. CORE-0 骨架就绪后，将 T021 用例落为 `internal/httpapi/*_test.go` 或 `test/contract/*_test.go`（mock repository，仅验 handler/schema 映射）。
2. T022 落为 `test/integration/core_a1_test.go`，使用 testcontainers PG+NATS 夹具。
3. 与 `api-contract-check` CI 门禁对齐：T021 用例定期跑，防止实现与 `core.yaml` 漂移。
