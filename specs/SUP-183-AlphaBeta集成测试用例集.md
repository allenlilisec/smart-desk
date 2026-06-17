# SUP-183 Alpha/Beta 集成测试用例集

> **Issue**: SUP-183（`b30e1927-d7bb-45b3-bd76-32d282fb7ef8`）  
> **负责人**: 林桥（集成测试）  
> **版本**: v1.1　|　日期: 2026-06-16（D0）  
> **上游事实源**:
> - `SmartDesk集成测试策略与用例框架.md`（严谨，v0.1）
> - `SmartDesk系统详细设计与实现说明书.md`（秦诺，v1.0，已冻结）
> - `src/openapi/{gateway,core,insight}.yaml`（OpenAPI 3.1，契约唯一事实源）
> - `gateway子系统详细设计与实现说明书.md`（关山，v1.0，已冻结）
>
> **说明**: 本文为框架到可执行用例的细化。当前四服务 `src/` 尚未实现，用例按依赖分批激活；gateway 详设已冻结，S-15~S-18 已细化到可直接执行；其余场景按框架保留到 M2/M3 实现交付后再补全字段级断言。

---

## 1. 执行策略与门禁

### 1.1 冲刺节奏（D0–D3）
| 日期 | 阶段 | 重点活动 | 产出 |
|---|---|---|---|
| D0 2026-06-16 | 设计日 | 用例细化、依赖对齐、环境基线确认 | 本用例集 v1.0 |
| D1 2026-06-17 | Alpha 准入 | 环境冒烟、P0 主链路联调 | Alpha 准入报告 |
| D2 2026-06-18 | Beta 准入 | 全量 P0/P1/P2 回归、性能基线 | Beta 测试报告 |
| D3 2026-06-19 | 收官 | 缺陷闭环复测、质量数据汇总 | 最终集成测试验收结论 |

### 1.2 分级门禁
| 优先级 | 含义 | Alpha | Beta | 失败处置 |
|---|---|---|---|---|
| **P0** | 端到端关键路径 + 4 条架构红线 | 100% 通过 | 100% 通过 | **任一失败即驳回** |
| **P1** | 异常分支、权限边界、限流、幂等、降级细化 | 抽取关键项 | 100% 通过 | 不达标不放行 |
| **P2** | 边界值、并发、性能 NFR、罕见组合 | 不执行 | ≥95% 通过 | 缺陷评估后决策 |

### 1.3 入口 / 出口准则
- **入口**: ① 所涉模块详设冻结；② 对应契约段冻结且实现通过 `api-contract-check`；③ 服务 `/readyz` 通过。
- **出口**: P0/P1 100%、P2 ≥95%、**架构红线用例 0 失败**、NFR 性能基线达标；缺陷闭环复测通过。

### 1.4 Alpha / Beta 验收门禁（合入/准出唯一依据）
| 门禁项 | Alpha | Beta | 失败处置 |
|---|---|---|---|
| P0 主流程 + 4 条架构红线 | 100% 通过 | 100% 通过 | **任一失败即驳回，不放行** |
| P1 异常分支 / 权限 / 限流 / 幂等 / 降级细化 | 抽取关键项 | 100% 通过 | 不达标不放行 |
| P2 边界 / 并发 / 性能 NFR / 罕见组合 | 不执行 | ≥95% 通过 | 缺陷评估后决策 |
| 架构红线用例 0 失败 | 强制 | 强制 | 一票驳回 |
| NFR 性能基线 | 不执行 | 强制达标 | 不达标需定位并修复 |
| 契约一致性（`api-contract-check` 0 diff） | 强制 | 强制 | 强制 |

> **4 条架构红线**：① AI 不可用建单仍成功（S-02）；② AI 异步写回不阻塞主流程（S-03）；③ 鉴权在 gateway 收口、越权/鉴权用例必过（S-15/S-16/S-18）；④ 幂等可审计（S-01/S-05/S-19）。

---

## 2. 测试环境基线

```
docker-compose 拉起：
  smartdesk-web      :3000  (Next.js)
  smartdesk-gateway  :8080  (NestJS, 对外 /api/v1)
  smartdesk-core     :8081  (Go, 内部 /v1)
  smartdesk-insight  :8000  (FastAPI, 内部 /v1)
  PostgreSQL         :5432  (core OLTP + insight schema)
  Redis              :6379  (gateway 会话/限流)
  NATS JetStream     :4222  (SMARTDESK_EVENTS)
  MinIO              :9000  (附件对象)
  MailHog            :8025  (邮件捕获)
```

- **服务间信任**: mTLS + service-jwt + `X-User-*` 透传；**不得**为方便测试关闭。
- **种子数据**: 5 类角色账号（requester/agent/lead/manager/admin）、分类树、SLA 策略基线。
- **可观测**: `trace_id` 全链路透传、`/metrics`、 ticket_timeline 审计追加。

---

## 3. 测试账号与数据

| 账号 | 角色 | 用途 |
|---|---|---|
| `req_a` / `req_b` | requester | 建单、查看自己工单、提交 CSAT |
| `agent_1` / `agent_2` | agent | 处理工单、评论、转派 |
| `lead_1` | lead | 分派/改派/升级、看板 |
| `mgr_1` | manager | 全局只读、统计 |
| `admin_1` | admin | 配置管理 |
| `bad_1` | requester | 越权试探专用 |

---

## 4. 场景与优先级矩阵

> 与《SmartDesk集成测试策略与用例框架》（SUP-62）§2 / §4.2 对齐。场景编号沿用 SUP-62 定义。

| 场景 ID | 场景名称 | P0 | P1 | P2 | Alpha | Beta | 里程碑 |
|---|---|---|---|---|---|---|---|
| S-01 | 提单建单（同步落库即成功） | ✔ | ✔ | ✔ | ✔ | ✔ | M2 |
| **S-02** | **AI 不可用降级建单（架构红线）** | **✔** | ✔ | ✔ | **✔** | ✔ | M2 |
| S-03 | 异步分类/定级/相似写回（架构红线） | ✔ | ✔ | ✔ | ✔ | ✔ | M3 |
| S-04 | 工单详情聚合（懒加载） | ✔ | ✔ | ✔ | 视依赖 | ✔ | M2/M3 |
| S-05 | 八态状态机全跃迁 | ✔ | ✔ | ✔ | ✔ | ✔ | M2 |
| S-06 | 分派/改派/转派/升级 | ✔ | ✔ | ✔ | ✔ | ✔ | M2 |
| S-07 | 评论/内部备注/@提及 | ✔ | ✔ | ✔ | 视依赖 | ✔ | M2 |
| S-08 | 附件上传/下载（鉴权+白名单+限额） | ✔ | ✔ | ✔ | ✔ | ✔ | M2 |
| **S-09** | **SLA 计时/暂停/预警/超时** | **✔** | ✔ | ✔ | **✔** | ✔ | M2 |
| S-10 | 解决→通知→确认关闭/7天重开 | ✔ | ✔ | ✔ | ✔ | ✔ | M2 |
| S-11 | CSAT 满意度 | ✔ | ✔ | ✔ | ✔ | ✔ | M2 |
| S-12 | 关联/合并工单 | — | ✔ | ✔ | 视依赖 | ✔ | M3 |
| S-13 | 看板统计近实时 | — | ✔ | ✔ | 视依赖 | ✔ | M3 |
| S-14 | 通知（站内+邮件）与策略 | ✔ | ✔ | ✔ | ✔ | ✔ | M2/M3 |
| S-15 | 认证全链路 | ✔ | ✔ | ✔ | ✔ | ✔ | M2 |
| S-16 | RBAC 越权红线 | ✔ | ✔ | ✔ | ✔ | ✔ | M2 |
| S-17 | 限流 | — | ✔ | ✔ | 抽取 | ✔ | M2 |
| **S-18** | **服务间信任边界** | **✔** | ✔ | ✔ | **✔** | ✔ | M2 |
| S-19 | 事件可靠性 | — | ✔ | ✔ | 抽取 | ✔ | M2/M3 |
| S-20 | 健康检查与就绪依赖 | ✔ | ✔ | ✔ | ✔ | ✔ | M2 |
| S-21 | admin 配置生效 | ✔ | ✔ | ✔ | ✔ | ✔ | M2/M3 |

> 注："视依赖" = 该场景主链路所依赖的 core/insight/web 实现已交付才在 Alpha 执行；否则延至 Beta。

---

## 5. 用例清单

### S-15 认证全链路（gateway，详设已冻结，可立即执行）

#### S-15-01 有效登录签发 JWT（P0 / Alpha+Beta）
- **目标**: 验证合法账号登录后获得 access_token 与 HttpOnly refresh Cookie。
- **前置**: 账号 `req_a` 已在种子数据中；Redis 可用。
- **步骤**:
  1. `POST /api/v1/auth/login`  body=`{username:"req_a", password:"seed_password"}`
  2. 检查响应体与响应头
- **期望**:
  - HTTP 200
  - 响应体仅含 `access_token`、`token_type=Bearer`、`expires_in`
  - 响应头 `Set-Cookie: sd_rt=...; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800`
  - Redis 中存在 `session:{sid}` 与 `refresh:{jti}`

#### S-15-02 无效登录不泄露账号存在性（P0 / Alpha+Beta）
- **目标**: 验证错误凭证返回统一 401，不区分账号不存在或密码错误。
- **前置**: 同 S-15-01。
- **步骤**:
  1. 用不存在的用户名登录
  2. 用存在的用户名但错误密码登录
- **期望**:
  - 两次均返回 HTTP 401
  - 响应体 `code`/`message` 完全一致
  - 响应体不含 `username` 存在性提示
  - 不返回 `access_token` 或 refresh Cookie

#### S-15-03 刷新令牌轮换（P1 / Alpha+Beta）
- **目标**: 验证 refresh 成功后轮换 jti，旧 refresh 失效。
- **前置**: 已完成 S-15-01。
- **步骤**:
  1. 携带 `sd_rt` Cookie `POST /api/v1/auth/refresh`
  2. 记录新 access_token 与新 `sd_rt` Cookie
  3. 用旧 `sd_rt` Cookie 再次刷新
- **期望**:
  - 第一次刷新 HTTP 200，返回新 access_token 与新 `sd_rt`
  - Redis 旧 `refresh:{old_jti}` 被删除/失效
  - 第二次刷新 HTTP 401

#### S-15-04 登出后令牌失效（P0 / Alpha+Beta）
- **目标**: 验证登出后 access 与 refresh 均不可用。
- **前置**: 已完成 S-15-01。
- **步骤**:
  1. 用 access_token 调用 `GET /api/v1/auth/me` 确认 200
  2. `POST /api/v1/auth/logout`
  3. 再次用原 access_token 调用 `GET /api/v1/auth/me`
  4. 用原 `sd_rt` 调用 `POST /api/v1/auth/refresh`
- **期望**:
  - 步骤 1 HTTP 200
  - 步骤 2 HTTP 204，`Set-Cookie: sd_rt=...; Max-Age=0`
  - 步骤 3 HTTP 401
  - 步骤 4 HTTP 401

#### S-15-05 受保护路由无 token 返回 401（P0 / Alpha+Beta）
- **目标**: 验证除 `login`/`refresh` 外所有路由默认需要 JWT。
- **前置**: 无需登录。
- **步骤**:
  1. 不带 `Authorization` 调用 `GET /api/v1/tickets`
  2. 带非法格式 Bearer 调用 `GET /api/v1/auth/me`
- **期望**:
  - 均返回 HTTP 401
  - 响应体符合 `Error{code,message,trace_id}`

---

### S-16 RBAC 越权红线（gateway，详设已冻结，可立即执行）

#### S-16-01 requester 访问他人工单详情 403（P0 / Alpha+Beta）
- **目标**: 验证 requester 只能查看自己工单。
- **前置**: `req_a` 已建单 T1；`req_b` 已建单 T2。
- **步骤**:
  1. `req_a` 登录
  2. `GET /api/v1/tickets/{T2_id}`
- **期望**:
  - HTTP 403
  - 响应体 `code=FORBIDDEN` 或等效
  - 审计日志记录 `actor_id=req_a, route, method, reason=data_scope`

#### S-16-02 requester 调用 admin 配置 403（P0 / Alpha+Beta）
- **目标**: 验证 admin 动作仅 admin 可执行。
- **前置**: `req_a` 已登录。
- **步骤**:
  1. `POST /api/v1/admin/categories`
  2. `PUT /api/v1/admin/sla-policies`
  3. `POST /api/v1/admin/users`
  4. `PUT /api/v1/admin/notification-policies`
- **期望**:
  - 均返回 HTTP 403
  - 审计日志记录

#### S-16-03 manager 修改工单 403（P0 / Alpha+Beta）
- **目标**: 验证 manager 全局只读，不能修改工单。
- **前置**: `mgr_1` 已登录；存在工单 T1。
- **步骤**:
  1. `PATCH /api/v1/tickets/{T1_id}`
  2. `POST /api/v1/tickets/{T1_id}/transitions`
  3. `POST /api/v1/tickets/{T1_id}/assignments`
- **期望**:
  - 均返回 HTTP 403

#### S-16-04 agent 越权分派 403（P1 / Alpha+Beta）
- **目标**: 验证分派动作仅 lead/admin 可执行。
- **前置**: `agent_1` 已登录；存在工单 T1。
- **步骤**:
  1. `POST /api/v1/tickets/{T1_id}/assignments`
- **期望**:
  - HTTP 403

#### S-16-05 requester 评论 internal 不可见（P1 / Beta）
- **目标**: 验证 requester 读取评论列表时不返回 internal 备注。
- **前置**: `agent_1` 在 T1 上创建 internal 备注 C1 与 public 评论 C2；`req_a`（T1 报单人）已登录。
- **步骤**:
  1. `req_a` 调用 `GET /api/v1/tickets/{T1_id}/comments`
- **期望**:
  - HTTP 200
  - 返回列表中仅含 C2，`visibility=internal` 的 C1 不在结果中
  - `total` 计数与可见条目一致

#### S-16-06 角色矩阵抽样验证（P1 / Beta）
- **目标**: 抽样验证 gateway 角色×动作矩阵。
- **抽样表**: 按 `gateway子系统详细设计与实现说明书.md` §5.3.2 矩阵，每个动作选取一个越权角色、一个合法角色对照执行。
- **期望**: 越权 403，合法 200/201（受数据范围限制除外）。

---

### S-17 限流（gateway，契约已定义，GW-4 待实现）

#### S-17-01 登录接口触发限流返回 429（P1 / Beta，Alpha 不执行）
- **目标**: 验证登录限流 5 次/分钟/IP 与 10 次/分钟/用户名。
- **前置**: 限流 Guard 已启用；Redis 可写。
- **步骤**:
  1. 同一 IP 在 60s 内使用正确用户名错误密码登录 6 次
  2. 第 6 次观察返回码
  3. 等待 60s 后再次登录
- **期望**:
  - 第 6 次 HTTP 429，`code=RATE_LIMITED`
  - 等待后恢复正常 401/200

#### S-17-02 全局 API 限流 429（P1 / Beta）
- **目标**: 验证全局 100 次/分钟/用户。
- **前置**: 合法用户已登录。
- **步骤**:
  1. 在 60s 内调用 `GET /api/v1/auth/me` 101 次
- **期望**:
  - 第 101 次 HTTP 429

#### S-17-03 附件上传申请限流 429（P1 / Beta）
- **目标**: 验证附件上传申请 20 次/小时/用户。
- **前置**: 合法用户已登录；存在工单。
- **步骤**:
  1. 在 1h 内调用 `POST /api/v1/tickets/{id}/attachments` 21 次
- **期望**:
  - 第 21 次 HTTP 429

---

### S-18 服务间信任边界（gateway/core/insight）

#### S-18-01 直连 core 无 service-jwt 被拒绝（P0 / Alpha+Beta）
- **目标**: 验证外部/绕过 gateway 流量无法直达 core。
- **前置**: core 内网地址可达；未持有 service-jwt。
- **步骤**:
  1. 直接 `GET http://smartdesk-core:8081/v1/healthz`（无 Authorization）
  2. 直接 `GET http://smartdesk-core:8081/v1/tickets` 并带普通用户 JWT
- **期望**:
  - 均返回 HTTP 401 或网络层拒绝（mTLS 握手失败）

#### S-18-02 service-jwt aud 不符被拒绝（P1 / Beta）
- **目标**: 验证 `aud=insight` 的 token 不能访问 core。
- **前置**: 持有有效 service-jwt 但 `aud=insight`。
- **步骤**:
  1. 用该 token 调用 core `GET /v1/tickets`
- **期望**:
  - HTTP 401/403

#### S-18-03 缺少 X-User-* 头不被 core 接受（P1 / Beta）
- **目标**: 验证 gateway 必须透传身份头。
- **前置**: 持有有效 `aud=core` service-jwt。
- **步骤**:
  1. 调用 core `GET /v1/tickets` 不带 `X-User-Id`
  2. 调用 core `GET /v1/tickets` 不带 `X-User-Roles`
- **期望**:
  - core 返回 HTTP 400/401/403（具体由 core 详设定义）

---

### S-01 提单建单（W→G→C）

#### S-01-01 正常建单落库并发布事件（P0 / Alpha+Beta）
- **目标**: 验证提单主链路同步落库、返回工单号、启动 SLA、写时间线、发事件。
- **前置**: `req_a` 已登录；core/insight/PG/NATS 可用。
- **步骤**:
  1. `POST /api/v1/tickets` body={title, description, priority=P2}
  2. 记录返回 T.id
  3. `GET /api/v1/tickets/{T.id}`
  4. `GET /api/v1/tickets/{T.id}/sla`
  5. `GET /api/v1/tickets/{T.id}/timeline`
  6. 检查 NATS `smartdesk.ticket.created`
- **期望**:
  - 步骤 1 HTTP 201，返回 `Ticket` schema，status=`new`，`number` 形如 SD-YYYY-NNNNNN
  - 步骤 3 详情与步骤 1 一致
  - 步骤 4 SLA 已启动，有剩余时长（分钟整数）
  - 步骤 5 时间线首条为 `ticket_created`
  - 步骤 6 事件信封字段完整：`event_id/event_type/occurred_at/org_id/ticket_id/actor_id/version/payload`

#### S-01-02 建单必填校验 422（P1 / Beta）
- **目标**: 验证缺少 title/description 返回 422。
- **前置**: 已登录。
- **步骤**:
  1. `POST /api/v1/tickets` body 缺 title
  2. `POST /api/v1/tickets` body 缺 description
- **期望**:
  - 均返回 HTTP 400/422，`Error` schema 含字段级 details

#### S-01-03 高并发建单幂等（P2 / Beta）
- **目标**: 验证相同 `Idempotency-Key` 只产生一张工单。
- **前置**: 已登录。
- **步骤**:
  1. 并发 10 次 `POST /api/v1/tickets` 带相同 `Idempotency-Key`
- **期望**:
  - 全部返回 HTTP 201
  - 系统中仅存在 1 张工单

---

### S-02 AI 不可用降级建单

#### S-02-01 insight/NATS 不可用时建单仍成功（P0 / Alpha+Beta）
- **目标**: 验证架构红线——AI/总线故障不阻塞建单。
- **前置**: `req_a` 已登录；停止 insight 容器或断开 NATS。
- **步骤**:
  1. `POST /api/v1/tickets`
  2. 恢复 insight/NATS
  3. 查询该工单建议字段
- **期望**:
  - 步骤 1 HTTP 201，status=`new`
  - 步骤 3 `suggestion` 为空或 null（不报错）

---

### S-03 异步分类/定级/相似写回

#### S-03-01 分类建议最终可见且不阻塞主流程（P0 / Alpha+Beta）
- **目标**: 验证事件写回在 P95 2s 内可见，不阻塞建单 201。
- **前置**: 全链路可用；分类模型已配置。
- **步骤**:
  1. 记录建单请求时间 t0，调用 `POST /api/v1/tickets`
  2. 轮询 `GET /api/v1/tickets/{id}` 观察 `suggestion` 字段
- **期望**:
  - 建单立即返回 201（t1-t0 不显著增加）
  - 2s 内 `suggestion.category_id`/`priority` 非空

#### S-03-02 重复事件幂等去重（P1 / Beta）
- **目标**: 验证 `event_id` 重复投递不会重复更新 suggestion。
- **前置**: 已产生 `insight.classification_suggested` 事件。
- **步骤**:
  1. 人工重放相同 `event_id` 的 suggestion 事件到 NATS
  2. 观察工单 suggestion 更新次数
- **期望**:
  - `processed_events` 表已记录该 event_id
  - 工单 suggestion 未被二次修改

---

### S-05 八态状态机全跃迁

#### S-05-01 主路径 new→accepted→in_progress→resolved→closed（P0 / Alpha+Beta）
- **目标**: 验证标准处理流程状态跃迁。
- **前置**: lead/agent 已登录；存在 status=`new` 工单 T。
- **步骤**:
  1. `POST /transitions` action=`accept`
  2. `POST /transitions` action=`start`
  3. `POST /transitions` action=`resolve`
  4. `POST /transitions` action=`close`
- **期望**:
  - 每步 HTTP 200，status 正确迁移
  - 每次写入 `ticket_timeline` + `ticket_status_history`

#### S-05-02 非法跃迁返回 409（P1 / Alpha+Beta）
- **目标**: 验证非法跃迁被拒绝。
- **前置**: 存在 status=`new` 工单 T。
- **步骤**:
  1. `POST /transitions` action=`resolve`（new→resolved 非法）
  2. `POST /transitions` action=`close`（new→closed 非法）
- **期望**:
  - 均返回 HTTP 409

#### S-05-03 pending_user 暂停与恢复（P1 / Alpha+Beta）
- **目标**: 验证 SLA 暂停/恢复语义。
- **前置**: 工单处于 `in_progress`。
- **步骤**:
  1. `POST /transitions` action=`wait_user` → status=`pending_user`
  2. 观察 SLA 暂停
  3. 模拟报单人回复（或系统 `user_reply`）→ status=`in_progress`
  4. 观察 SLA 恢复且剩余时长顺延
- **期望**:
  - 状态正确迁移；SLA 计时暂停/恢复

---

### S-06 分派/改派/转派/升级

#### S-06-01 分派后责任人变更并触发通知（P0 / Alpha+Beta）
- **目标**: 验证分派链路落库 + 事件 + 通知。
- **前置**: lead 已登录；存在工单 T；`agent_1` 存在。
- **步骤**:
  1. `POST /tickets/{T.id}/assignments` kind=`manual` to_user_id=`agent_1`
  2. `GET /tickets/{T.id}`
  3. 检查 NATS `ticket.assigned`
  4. `agent_1` 登录后 `GET /notifications`
- **期望**:
  - 步骤 1 HTTP 201
  - 步骤 2 `assignee_id=agent_1`
  - 步骤 3 事件正确发布
  - 步骤 4 存在该分派站内通知

---

### S-07 评论/内部备注/@提及

#### S-07-01 public/internal 评论创建与可见性（P0 / Alpha+Beta）
- **目标**: 验证评论创建与 internal 过滤。
- **前置**: agent 已登录；存在工单 T。
- **步骤**:
  1. `POST /tickets/{T.id}/comments` visibility=`internal`
  2. `POST /tickets/{T.id}/comments` visibility=`public` mentions=`[agent_2]`
  3. agent 读取评论列表
  4. requester（报单人）读取评论列表
- **期望**:
  - agent 列表含 2 条；requester 列表仅含 public 1 条

#### S-07-02 @提及触发通知（P1 / Beta）
- **目标**: 验证 @提及产生站内通知。
- **前置**: S-07-01 已完成；`agent_2` 已登录。
- **步骤**:
  1. `agent_2` 调用 `GET /notifications`
- **期望**:
  - 存在来自 T 的 @提及通知

---

### S-08 附件上传/下载

#### S-08-01 正常上传预签名与下载（P0 / Alpha+Beta）
- **目标**: 验证附件完整链路。
- **前置**: agent/requester 已登录；存在工单 T；MinIO 可用。
- **步骤**:
  1. `POST /tickets/{T.id}/attachments` filename/test.txt content_type=text/plain size_bytes=100
  2. 使用返回的上传 URL 上传文件
  3. `GET /tickets/{T.id}` 确认 attachment 列表
  4. `GET /attachments/{attId}/download` 跟随 302
- **期望**:
  - 步骤 1 HTTP 201，返回预签名 URL
  - 步骤 2 HTTP 200（或 MinIO 2xx）
  - 步骤 4 最终下载到原文件内容

#### S-08-02 附件超限与白名单（P1 / Alpha+Beta）
- **目标**: 验证 413/422 错误。
- **前置**: 已登录；存在工单 T。
- **步骤**:
  1. 申请上传 20MB+1B 文件 → 期望 413
  2. 申请上传 `evil.exe` → 期望 422

#### S-08-03 越权下载 403（P0 / Alpha+Beta）
- **目标**: 验证 `bad_1` 不能下载他人附件。
- **前置**: `req_a` 已上传附件到 T1；`bad_1`（requester，非 T1 报单人）已登录。
- **步骤**:
  1. `bad_1` 调用 `GET /attachments/{attId}/download`
- **期望**:
  - HTTP 403

---

### S-09 SLA 计时/暂停/预警/超时

#### S-09-01 SLA 按优先级启动（P0 / Alpha+Beta）
- **目标**: 验证不同优先级工单 SLA 目标时长正确。
- **前置**: requester 已登录；SLA 策略已配置。
- **步骤**:
  1. 分别创建 P1/P2/P3/P4 工单
  2. `GET /tickets/{id}/sla`
- **期望**:
  - 各工单 SLA 目标与策略一致；字段类型为整数分钟

#### S-09-02 pending_user 暂停与恢复顺延（P1 / Beta）
- **目标**: 验证暂停期间不计入 SLA，恢复后顺延。
- **前置**: 同 S-05-03。
- **步骤**:
  1. 记录进入 pending_user 时的剩余时长 R1
  2. 等待 N 分钟后恢复
  3. 记录恢复后剩余时长 R2
- **期望**:
  - R2 ≈ R1 - （非暂停期间耗时），暂停期间不扣减

#### S-09-03 SLA 预警与超时事件（P1 / Beta）
- **目标**: 验证 `sla_warning`/`sla_breached` 事件发布。
- **前置**: 可缩短 SLA 策略或缩短测试时钟。
- **步骤**:
  1. 创建 P1 工单
  2. 等待预警/超时阈值
  3. 检查 NATS 事件与工单 SLA 状态
- **期望**:
  - 预警事件在阈值到达时发布
  - 超时事件在 breach 时发布

---

### S-10 解决→通知→确认关闭/7天重开

#### S-10-01 resolve→close 终态（P0 / Alpha+Beta）
- **目标**: 验证解决关闭链路。
- **前置**: agent 已登录；工单处于 `in_progress`。
- **步骤**:
  1. `POST /transitions` action=`resolve`
  2. requester 收到通知
  3. requester `POST /transitions` action=`close`
- **期望**:
  - 状态正确迁移；通知到达；close 后无法再 close

#### S-10-02 closed 7 天内可重开（P1 / Beta）
- **目标**: 验证 7 天重开规则。
- **前置**: 工单已 closed；记录关闭时间。
- **步骤**:
  1. 第 6 天 `POST /transitions` action=`reopen`
  2. 另起一工单关闭后第 8 天尝试 reopen
- **期望**:
  - 第 6 天 HTTP 200，status=`in_progress`
  - 第 8 天 HTTP 409

---

### S-11 CSAT 满意度

#### S-11-01 解决后可评价 1–5 星（P0 / Alpha+Beta）
- **目标**: 验证 CSAT 提交与读取。
- **前置**: requester 已登录；工单 status=`resolved` 或 `closed`。
- **步骤**:
  1. `POST /tickets/{id}/csat` score=5 comment="good"
  2. `GET /tickets/{id}/csat`
- **期望**:
  - 步骤 1 HTTP 201
  - 步骤 2 返回 score/comment/rated_at 一致

#### S-11-02 非可评价状态提交 409（P1 / Beta）
- **目标**: 验证 CSAT 状态校验。
- **前置**: 工单 status=`new`。
- **步骤**:
  1. `POST /tickets/{id}/csat`
- **期望**:
  - HTTP 409

---

### S-12 关联/合并工单

#### S-12-01 合并后源工单标记并通知（P1 / Beta，M3）
- **目标**: 验证合并链路（M3 对外）。
- **前置**: lead/admin 已登录；存在 T1/T2。
- **步骤**:
  1. `POST /tickets/{T1.id}/links` target=`T2.id` kind=`merged`
  2. 检查 T1 状态/标记
  3. 检查 `ticket.merged` 事件与通知
- **期望**:
  - T1 被标记为 merged；事件发布；相关人员收到通知

---

### S-13 看板统计近实时

#### S-13-01 事件投影后统计一致（P1 / Beta，M3）
- **目标**: 验证 insight 读模型与 core 事件最终一致。
- **前置**: manager 已登录；已发生若干工单状态变更。
- **步骤**:
  1. 等待事件消费（≤NFR）
  2. `GET /stats?metric=ticket_count&group_by=status`
- **期望**:
  - 统计结果与 core 实际工单状态一致

---

### S-14 通知（站内+邮件）

#### S-14-01 分派产生站内通知（P0 / Alpha+Beta，M2）
- **目标**: 验证站内通知链路。
- **前置**: 同 S-06-01。
- **步骤**:
  1. 被分派人登录
  2. `GET /notifications`
- **期望**:
  - 列表含分派通知

#### S-14-02 通知策略控制邮件发送（P1 / Beta，M3）
- **目标**: 验证通知策略生效。
- **前置**: admin 配置关闭某类事件邮件；触发该事件。
- **步骤**:
  1. 触发事件
  2. 检查 MailHog
- **期望**:
  - 对应邮件未发送

---

### S-19 事件可靠性

#### S-19-01 单工单事件按 occurred_at 有序（P1 / Beta）
- **目标**: 验证同一工单内事件顺序。
- **前置**: 快速触发 T 的多次状态变更。
- **步骤**:
  1. 消费 NATS 中该 ticket_id 的事件
  2. 按 `occurred_at` 排序
- **期望**:
  - 顺序与操作发生顺序一致

#### S-19-02 event_id 去重（P1 / Beta）
- **目标**: 验证重复 `event_id` 被去重。
- **前置**: 同 S-03-02。
- **期望**:
  - 下游消费幂等，无重复副作用

---

### S-20 健康检查与就绪依赖

#### S-20-01 /healthz 与 /readyz（P0 / Alpha+Beta）
- **目标**: 验证健康与就绪语义。
- **步骤**:
  1. 全链路正常时 `GET /healthz`、`GET /readyz`
  2. 断开 PG/Redis/NATS 后 `GET /readyz`
- **期望**:
  - 正常时均 200
  - 依赖缺失时 `/readyz` 503，`/healthz` 仍 200

---

### S-21 admin 配置生效

#### S-21-01 分类树/SLA/用户角色变更即时生效（P1 / Alpha+Beta / Beta）
- **目标**: 验证 admin 配置下沉并生效。
- **前置**: admin 已登录。
- **步骤**:
  1. 新增分类 C
  2. 用 requester 建单选择 category_id=C
  3. 修改 SLA 策略后建单验证新策略
  4. 新增用户并授 agent 角色，用该用户登录
- **期望**:
  - 配置变更对后续业务操作即时生效

#### S-21-02 非 admin 访问 admin 接口 403（P0 / Alpha+Beta）
- **目标**: 已覆盖于 S-16-02。
- **说明**: 不再单列，引用 S-16-02。

---

## 5. Alpha / Beta 执行子集

### Alpha 必跑清单（D1 下午，<10min 反馈目标）
| 用例 ID | 名称 | 优先级 |
|---|---|---|
| S-15-01 | 有效登录签发 JWT | P0 |
| S-15-04 | 登出后令牌失效 | P0 |
| S-15-05 | 受保护路由无 token 401 | P0 |
| S-16-01 | requester 访问他人工单 403 | P0 |
| S-16-02 | requester 调用 admin 403 | P0 |
| S-16-03 | manager 修改工单 403 | P0 |
| S-18-01 | 直连 core 无 service-jwt 被拒 | P0 |
| S-01-01 | 正常建单落库并发布事件 | P0 |
| S-02-01 | AI 不可用时建单仍成功 | P0 |
| S-05-01 | 状态机主路径 | P0 |
| S-06-01 | 分派后责任人变更并触发通知 | P0 |
| S-08-01 | 附件上传下载主路径 | P0 |
| S-08-03 | 越权下载 403 | P0 |
| S-09-01 | SLA 按优先级启动 | P0 |
| S-10-01 | resolve→close 终态 | P0 |
| S-11-01 | 解决后可评价 | P0 |
| S-14-01 | 分派产生站内通知 | P0 |
| S-20-01 | /healthz /readyz | P0 |

### Beta 全量清单（D2–D3）
- 执行 §5 全部功能用例，含所有 P0/P1 与抽样 P2。
- 执行 §6 性能基线测试用例，强制达标。

---

## 6. 性能基线测试（Beta 强制）

> [SUP-183](mention://issue/b30e1927-d7bb-45b3-bd76-32d282fb7ef8) issue 明确要求 Beta 阶段完成性能基线测试。本节给出可执行的压测用例、目标阈值与执行方式。

### 6.1 执行方式
- **工具**: k6 或 Gatling；容器化执行，不污染被测服务。
- **环境**: 与功能 Beta 共用 docker-compose 环境，但独立压测 runner 容器。
- **数据**: 使用种子账号 + 预热工单数据 ≥1000 张。
- **指标**: 采集 P50/P95/P99 延迟、错误率、RPS、资源利用率（CPU/内存/DB 连接/NATS lag）。

### 6.2 用例

#### PERF-01 提单链路延迟基线（P0 / Beta）
- **目标**: 验证 `POST /api/v1/tickets` P95 延迟。
- **负载**: 100 VU，持续 5min，阶梯 Ramp-up。
- **期望**:
  - P95 < 200ms
  - 错误率 = 0%
  - 所有请求返回 HTTP 201

#### PERF-02 工单列表查询延迟基线（P1 / Beta）
- **目标**: 验证 `GET /api/v1/tickets` 分页查询 P95 延迟。
- **负载**: 200 VU，持续 5min，模拟 agent/lead/manager 并发列表查询。
- **期望**:
  - P95 < 300ms
  - 错误率 = 0%

#### PERF-03 AI 异步写回延迟基线（P0 / Beta）
- **目标**: 验证 `insight.classification_suggested` 写回后 `GET /api/v1/tickets/{id}` 可见 suggestion 的 P95 延迟。
- **负载**: 并发建单 50 req/s，轮询 suggestion 字段。
- **期望**:
  - P95 < 2s
  - 写回不阻塞建单 201 返回

#### PERF-04 统计投影近实时延迟基线（P1 / Beta）
- **目标**: 验证事件投影后 `GET /api/v1/stats` 近实时一致性延迟。
- **负载**: 持续触发工单状态变更 30 req/s，同步查询 stats。
- **期望**:
  - P95 < 5s
  - 统计结果与 core 实际状态最终一致

#### PERF-05 并发建单幂等与去重（P2 / Beta）
- **目标**: 验证高并发下 `Idempotency-Key` 幂等与 `event_id` 去重。
- **负载**: 1000 req/s，相同 Idempotency-Key 重复提交。
- **期望**:
  - 系统内仅产生 1 张工单
  - 重复事件不导致 suggestion 重复更新

### 6.3 失败处置
- 任一 P0 性能用例未达标 → Beta 出口门禁失败，需研发定位修复后复测。
- P1/P2 性能用例未达标 → 记录为缺陷并评估是否阻塞发布。

---

## 7. 接口契约四维验证（横切所有用例）

> 策略框架 §3 要求每条接口验证四项通用维度。本要求在每条用例「期望」中显式落实：

1. **Schema**: 请求/响应字段、类型、必填、enum 符合 `src/openapi/{gateway,core,insight}.yaml`。
2. **状态码**: 成功码与错误码全集符合契约；特别关注 401/403/409/413/422/429。
3. **错误模型**: 所有错误响应符合 `Error{code, message, details?, trace_id}`。
4. **Payload 一致性**: gateway 聚合视图与 core/insight 源数据一致；事件信封字段完整。

---

## 8. 与安全测试去重对齐

- 本用例集 S-15（认证）、S-16（RBAC 越权）、S-17（限流）、S-18（服务间信任）与 [SUP-63](mention://issue/34432295-4a78-44c3-9ab6-959ffcb42ad3)（武安负责的安全测试）对齐。
- **边界划分**: 本集聚焦功能集成视角（接口状态码、事件链路、降级），[SUP-63](mention://issue/34432295-4a78-44c3-9ab6-959ffcb42ad3) 聚焦渗透/规范符合性（OWASP、敏感信息泄露、会话安全）。
- 重复用例不重复执行：S-16/S-18 功能断言由本集执行，深度安全断言由 [SUP-63](mention://issue/34432295-4a78-44c3-9ab6-959ffcb42ad3) 执行，结果互为补充。

---

## 9. 执行计划负荷评估

> 用于评估 D2 是否过载，并作为资源调配依据。

| 阶段 | 用例总量 | 预估耗时 | 人力 | 说明 |
|---|---|---|---|---|
| Alpha（D1 下午） | 18 条 P0 | ~30min（含环境重置） | 1 人（林桥）+ 1 人辅助 | 目标 <10min 反馈核心链路；完整 18 条约 30min |
| Beta 功能回归（D2 上午~下午） | P0 21 + P1 ~35 + P2 ~15 ≈ 71 条 | ~4h | 2 人 | 按场景分组并行执行；缺陷即时回流 |
| Beta 性能基线（D2 下午~D3 上午） | 5 条 | ~2h（含环境预热/复测） | 1 人 | 容器化 runner；P0 性能未达标需预留复测窗口 |
| 缺陷闭环复测（D3） | 按缺陷量 | ~2~4h | 1~2 人 | 仅回归失败用例及关联 P0 |
| 报告汇总（D3） | — | ~1h | 1 人 | 每日报告 + 最终验收结论 |

**结论**: D2 负荷较重（功能回归 4h + 性能基线 2h），建议 D2 上午优先跑 P0 全量，下午 P1+P2；性能基线可并行于 P2 抽检执行。

---

## 10. 缺陷回流与验收裁决

1. **系统详设/契约歧义** → 在对应详设/契约 issue 提缺陷，同步本 issue。
2. **实现缺陷** → 创建 Bug issue 给对应模块 Leader，标注：
   - 复现链路
   - `trace_id`
   - 期望/实际
   - 所属用例 ID
3. **修复后复测**: 回归原失败用例 + 关联 P0 用例集。
4. **验收裁决**: 由测试团队 Leader 严谨按 §1.4 Alpha/Beta 验收门禁裁定；林桥负责数据与缺陷闭环支撑。

---

## 11. 依赖与阻塞

| 依赖 | 状态 | 影响用例 |
|---|---|---|
| gateway 详设冻结 | ✅ | S-15~S-18 已细化可执行 |
| core 实现交付 | ⏳ M2 | S-01/02/05/06/08/09/10/11/20/21 |
| insight 实现交付 | ⏳ M2/M3 | S-02/03/04/13/14/19 |
| web 实现交付 | ⏳ M2/M3 | S-04 端到端 UI 主路径 |
| NATS JetStream | ⏳ 部署 | 全部事件/异步用例 |
| mTLS/service-jwt | ⏳ GW-5 | S-18 全量 |
| k6/Gatling 压测 runner | ⏳ 部署 | PERF-01~PERF-05 |

---

## 12. 变更记录

| 版本 | 日期 | 修订人 | 说明 |
|---|---|---|---|
| v1.0 | 2026-06-16 | 林桥 | 初始细化：框架 → 可执行用例；gateway 段已完整；其余段按实现交付补全字段级断言 |
| v1.1 | 2026-06-16 | 林桥 | 按严谨评审意见修订：补充 §4 场景矩阵、§1.4 验收门禁、§6 性能基线测试、§7 契约四维验证、§8 SUP-63 安全测试去重说明、§9 负荷评估 |
