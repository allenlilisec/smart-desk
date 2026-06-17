# Tasks: smartdesk-gateway 实现任务分解（P3 / SUP-112）

**Input**: [`specs/gateway子系统详细设计与实现说明书.md`](../gateway子系统详细设计与实现说明书.md)（v1.0，已冻结，main 最新）
**契约唯一事实源**: [`src/openapi/gateway.yaml`](../../src/openapi/gateway.yaml)（OpenAPI 3.1，**24 paths / 34 operations**）
**实现仓库**: `src/smartdesk-gateway`（NestJS submodule）
**派生自**: 系统详设 v1.0（§2.2/§7/§8/§9/§12）；PRD US-1~US-6；gateway 详设 GW-1~5
**编制**: 关山（网关开发 Leader）　|　日期：2026-06-15

> 本清单由 spec-kit `/tasks` 从**已冻结**的 gateway 详设 v1.0 自顶向下派生，依赖有序、每块可独立交付/测试。任务 ID 沿用详设 §7 / 系统详设 §12.1 的 **GW-\*** 体系；`Tn` 为本清单内的细粒度执行编号。`[P]` = 不同文件、无相互依赖、可并行。`[GW-x]` = 归属工作块，`[USn]` = 对应用户故事。
>
> **Tests 纳入说明**：详设 §8 把「越权 / RBAC / 429 限流」列为**必过红线**，GW-1/2 已有 e2e 骨架。本清单显式包含契约与越权测试任务。

---

## 0. 与 main 现有 `src/smartdesk-gateway` 的 done / gap / drift 初判（P4 输入）

> P4 刷新（2026-06-17）：当前检视基线为 submodule@`ac507b3`。结论：**GW-1/GW-2 MVP 已落地，OQ-W2 HttpOnly refresh cookie 已落地，D4 对外 `org_id` 漂移已闭环，D2 契约描述漂移已由梁栋裁决并按 `gateway.yaml` 修订闭环**；GW-3~5、`/readyz` 真探活、Redis 滑窗限流、契约全覆盖仍为 gap。

### 0.1 done（12 项，可直接消费）

| 项 | 位置 | 状态 |
|---|---|---|
| 对外契约 | `src/openapi/gateway.yaml` | ✅ 冻结，34 operations |
| 模块详设 | `specs/gateway子系统详细设计与实现说明书.md` v1.0 | ✅ 冻结 |
| GW-1 登录 | `AuthController` POST `/auth/login` | ✅ LocalProvider + JWT |
| GW-1 刷新/登出 | POST `/auth/refresh`, `/auth/logout` | ✅ Redis 会话 + `sd_rt` HttpOnly Cookie |
| GW-1 当前用户 | GET `/auth/me` | ✅ JWT claims；对外不暴露 `org_id` |
| GW-2 工单 stub 响应 | GET/PATCH `/tickets/{id}` | ✅ 内部保留 `org_id` 授权，对外响应剥离 `org_id` |
| GW-1 JWT/Redis | `JwtStrategy`, `RedisModule` | ✅ MVP |
| GW-1 e2e | `test/app.e2e-spec.ts` | ✅ 认证链路 + refresh cookie + D4 回归 |
| GW-2 角色矩阵 | `rbac/roles.ts` | ✅ Action 枚举 |
| GW-2 守卫 | `RbacGuard`, `@RequireAction` | ✅ 单元 + 路由级 |
| GW-2 审计 | `AuditService.recordForbidden` | ✅ 403 埋点 |
| GW-2 越权 e2e | `roles.spec.ts` + stub tickets | ✅ manager 禁改 |
| 健康检查 | `HealthController` `/healthz` | ✅ 无鉴权 |
| 基础限流 | `ThrottlerModule` + `test/throttler.e2e-spec.ts` | ✅ 全局/auth 429 基础覆盖 |

### 0.2 gap（54 项 —— 本清单 T013+ 覆盖）

- **局部守卫冗余 / 全路由动作未覆盖**：`GlobalJwtAuthGuard`/`RbacGuard` 已全局注册，但 tickets/admin stub 仍保留局部 `JwtAuthGuard`；全路由 `@RequireAction` 未覆盖 34 operations
- **GW-3 BFF**：`TicketsController`/`AdminController` 为 stub；无 `CoreClient`/`InsightClient`；28/34 operations 未实装
- **GW-4 限流**：已有 Nest Throttler 基础限流；无 Redis 滑窗 `RateLimitGuard`、无附件上传限流、`Retry-After`/429 契约未全覆盖
- **GW-5 服务令牌**：无 service-jwt 签发、mTLS `HttpsAgent`、下游 `X-User-*` 透传头完善
- **readyz**：端点存在但未探活 Redis/core/insight
- **契约 CI**：`api-contract-check` 未接入 gateway submodule CI

### 0.3 drift（P4 刷新）

| # | 漂移 | 影响 | 处置 |
|---|---|---|---|
| D-1 | `GET /auth/me` 响应曾含 `org_id`，gateway.yaml `Me` schema 已按 **D4 裁决删除 org_id** | 契约漂移，web 可能误消费 | **已闭环**：`AuthService.toMe()` 移除字段，单测 + e2e 增加不暴露断言 |
| D-1b | `GET /tickets/{id}` stub 响应曾含内部 `org_id`，gateway.yaml `Ticket` / `TicketAggregate` schema 无该字段 | 契约漂移，浏览器侧可见内部租户字段 | **已闭环**：内部授权继续使用 `org_id`，对外 `PublicTicket` 响应剥离字段，单测 + e2e 增加不暴露断言 |
| D-2 | `gateway.yaml` `/tickets/{id}` 详情描述与 `TicketAggregate.similar` 曾暗示相似推荐内联聚合；系统详设 D2 要求相似推荐独立懒加载 | 文档/契约描述层漂移，可能误导实现为同步聚合 insight | **已裁决并闭环**：梁栋裁定修订契约；`gateway.yaml` summary 已改为 core 主体 + `Ticket.suggestion`，并已移除 `TicketAggregate.similar`，相似推荐走 `/tickets/{id}/similar` |

---

## Phase 1: Setup（工程基线）— [GW-0]

**目的**：NestJS 工程可编译、OpenAPI 类型生成、CI 骨架。**阻塞后续所有阶段。**

- [ ] T001 [GW-0] 确认 `src/smartdesk-gateway` 包布局与详设 §6 一致（`auth/` `rbac/` `tickets/` `admin/` `health/` `common/` `config/` `redis/`），补齐缺失 barrel export
- [ ] T002 [P] [GW-0] `openapi-typescript` 从 `src/openapi/gateway.yaml` 生成 `src/types/gateway-api.d.ts`；`package.json` 增加 `gen:api` 脚本
- [ ] T003 [P] [GW-0] 统一 `HttpExceptionFilter` + `TraceIdInterceptor` 输出 `Error{code,message,details?,trace_id}`（对齐 gateway.yaml components）
- [ ] T004 [P] [GW-0] `configuration.ts` 补齐 `CORE_BASE_URL` `INSIGHT_BASE_URL` `SERVICE_JWT_*` `MTLS_*` 环境项与 `.env.example`

---

## Phase 2: Foundational（阻塞性基础设施）— [GW-0/GW-2]

**⚠️ CRITICAL**：全局鉴权/RBAC 注册完成前，GW-3 路由不可视为 production-ready。

- [ ] T005 [GW-2] 在 `AppModule` 注册 `APP_GUARD`：`GlobalJwtAuthGuard` + `RbacGuard`（全局生效，`@Public()` 豁免 auth 路由）
- [ ] T006 [GW-2] 审计日志结构化：403/401 写入 `AuditService`（含 `user_id` `route` `action` `reason` `trace_id`）
- [ ] T007 [P] [GW-2] 为 34 operations 建立 `@RequireAction` 覆盖清单（对照详设 §4.2 表），缺失路由标红
- [ ] T008 [P] [GW-0] `HealthController` 增加 `/readyz`：探测 Redis ping + core/insight `GET /healthz`（失败 503，契约对齐）
- [ ] T009 [GW-0] 契约测试地基：`test/contract/gateway.contract.spec.ts` 骨架，对照 gateway.yaml path/method/status 列表
- [ ] T010 [P] [GW-0] Idempotency-Key 中间件：写操作透传至 core（`POST/PATCH/PUT` 路由）
- [ ] T011 [P] [GW-0] 列表范围收敛 helper：`scopeTicketsQuery(user, query)` 实现详设 §4.4（requester/agent/lead/manager）
- [ ] T012 [GW-0] CI 工作流骨架：lint + unit + e2e + 预留 `api-contract-check` 步骤

**Checkpoint**：空服务全局鉴权生效，`/healthz`/`/readyz` 可探测，契约测试骨架就绪。

---

## Phase 3: GW-1 认证模块 — [US2] 🎯

**Goal**：login/refresh/logout/me、JWT、Redis 会话、IdP 抽象。
**Independent Test**：合法登录得 token；refresh 轮转；logout 失效；me 返回 roles。

- [ ] T013 [P] [GW-1] [US2] 契约测试：`/auth/login` `/auth/refresh` `/auth/logout` `/auth/me` 状态码与 schema
- [x] T014 [GW-1] [US2] **drift 修复 D-1**：`AuthService.toMe()` 移除 `org_id`；更新单测与 e2e 断言（P4 2026-06-17）
- [ ] T015 [P] [GW-1] [US2] 登录失败统一 401 + 审计（防枚举：message 泛化）
- [ ] T016 [P] [GW-1] [US2] Refresh token 轮转：旧 refresh 失效、并发 refresh 串行化（Redis 锁）
- [ ] T017 [GW-1] [US2] Logout：删除 Redis 会话 + refresh 黑名单
- [x] T018 [GW-1] [US2] `GET /auth/me` 返回 `{user_id, username, display_name, roles[]}` 严格对照 gateway.yaml `Me`（P4 2026-06-17）
- [ ] T019 [P] [GW-1] [US2] IdP 抽象：`IdentityProvider` 接口预留 OIDC stub（M4，不阻塞 M2）
- [ ] T020 [GW-1] [US2] 认证 e2e 回归：login→me→refresh→logout 全链路（依赖 T014）

**Checkpoint**：GW-1 契约零 drift，认证红线用例全绿。

---

## Phase 4: GW-2 RBAC 全覆盖 — [US1.2]

**Goal**：角色×动作矩阵、全路由 @RequireAction、403+审计、数据级校验钩子。

- [ ] T021 [P] [GW-2] [US1.2] 红线 e2e：requester 调 admin 路由 → 403 + 审计记录
- [ ] T022 [P] [GW-2] [US1.2] 红线 e2e：agent 读组外工单 → 403（数据级，stub 阶段 mock core 404/403）
- [ ] T023 [GW-2] [US1.2] `can(action, roles)` 与详设 §6 RBAC 矩阵逐格对照单测（`roles.spec.ts` 扩展）
- [ ] T024 [GW-2] [US1.2] manager 只读：PATCH/POST 写操作前置拒绝（已有 manager patch stub，推广到全写路由）
- [ ] T025 [P] [GW-2] [US1.2] internal 评论过滤：转发 core 前按角色过滤响应（BFF 层，US-2.4）
- [ ] T026 [GW-2] [US1.2] 403 响应体统一 `{code:'FORBIDDEN', message, trace_id}` 对照 gateway.yaml
- [ ] T027 [P] [GW-2] [US1.2] RBAC 矩阵文档与代码常量同步检查脚本（防漂移）
- [ ] T028 [GW-2] [US1.2] 移除 tickets stub 上冗余局部 `JwtAuthGuard`，统一依赖全局守卫（依赖 T005）

**Checkpoint**：越权红线全过，RBAC 覆盖 34 operations 映射表。

---

## Phase 5: GW-3a 下游客户端基建 — [GW-5 基础]

**Goal**：CoreClient + InsightClient + 错误归一 + 降级钩子。

- [ ] T029 [GW-3a] `src/clients/core.client.ts`：axios/fetch 封装，基址 `CORE_BASE_URL`，透传 `X-Request-Id`
- [ ] T030 [P] [GW-3a] `src/clients/insight.client.ts`：基址 `INSIGHT_BASE_URL`
- [ ] T031 [GW-5] `ServiceJwtService`：签发 `service-jwt`（aud=core|insight，短 TTL，私钥来自 env）
- [ ] T032 [GW-5] 下游请求拦截器：注入 `Authorization: Bearer <service-jwt>` + `X-User-Id` `X-User-Roles` `X-Org-Id`
- [ ] T033 [P] [GW-3a] 下游错误映射：core/insight 4xx/5xx → gateway `Error` schema（保留 trace_id）
- [ ] T034 [P] [GW-3a] 超时与重试：GET 幂等重试 1 次；POST 不重试；超时 504 降级语义
- [ ] T035 [GW-3a] Mock 模式：`CORE_MOCK=true` 时走 `clients/core.mock.ts`（解耦 core 未就绪，详设 §8.3）
- [ ] T036 [GW-3a] 客户端单元测试：401/403/404/409/422/429/503 映射表

**Checkpoint**：Clients 可独立调用 mock core/insight，服务 JWT 可签发。

---

## Phase 6: GW-3b 工单主路径 BFF — [US1/US4] 🎯 M2 核心

**Goal**：tickets/transitions/assignments/comments/attachments/sla/timeline/csat 转发 + 范围收敛。
**Independent Test**：requester 建单→agent 处理→关闭；全路径对照详设 §4.2 #5–19。

- [ ] T037 [P] [GW-3b] [US1] 契约测试：tickets 主路径 #5–10 响应对照 gateway.yaml
- [ ] T038 [GW-3b] [US1] `POST /tickets` → core 建单 + 201（Idempotency-Key 透传）
- [ ] T039 [P] [GW-3b] [US1] `GET /tickets` 列表：范围收敛（T011）+ 分页参数透传
- [ ] T040 [GW-3b] [US1] `GET/PATCH /tickets/{id}`：转发 core + requester 数据级校验
- [ ] T041 [P] [GW-3b] [US4] `POST /tickets/{id}/transitions` 转发 + 409/422 透传
- [ ] T042 [P] [GW-3b] [US4] `POST /tickets/{id}/assignments` 转发
- [ ] T043 [GW-3b] [US4] `GET/POST /tickets/{id}/comments` 转发 + internal 过滤（T025）
- [ ] T044 [P] [GW-3b] [US1] `GET/POST /tickets/{id}/attachments`、`GET /attachments/{attId}/download` 302 转发
- [ ] T045 [P] [GW-3b] [US1] `GET /tickets/{id}/sla` `GET /tickets/{id}/timeline` 转发
- [ ] T046 [GW-3b] [US1] `GET/POST /tickets/{id}/csat` 转发（D5；requester 评分规则校验）
- [ ] T047 [GW-3b] 删除/替换 `TicketsService` stub，接入 `TicketsBffService` + `CoreClient`
- [ ] T048 [GW-3b] [US1] e2e：提单→鉴权→转发 core mock 201 闭环（M2 验收）

**Checkpoint**：工单主路径 16 operations 实装，stub 清除。

---

## Phase 7: GW-4 限流与防护 — [US2/US1]

**Goal**：登录/refresh 限流、全局滑窗、附件上传限流、429 契约。

- [ ] T049 [GW-4] [US2] `RateLimitGuard` Redis 滑窗：`ratelimit:{scope}:{id}`（详设 §3）
- [ ] T050 [P] [GW-4] [US2] `/auth/login` `/auth/refresh` 强化限流（防暴力破解，对齐 Throttler 现有配置）
- [ ] T051 [P] [GW-4] 全 API 全局限额（per user/IP 可配置）
- [ ] T052 [GW-4] [US1] 附件上传 `POST .../attachments` 单独限额（详设 §5.4）
- [ ] T053 [GW-4] 429 响应体 `{code:'RATE_LIMITED', message, retry_after?}` + `Retry-After` 头
- [ ] T054 [GW-4] e2e：连续 login 失败触发 429

**Checkpoint**：GW-4 契约状态码覆盖，安全红线可演示。

---

## Phase 8: GW-3c 智能聚合 — [US3] — M3

**Goal**：similar 懒加载、suggestion 读 core + 采纳写回。

- [ ] T055 [P] [GW-3c] [US3] `GET /tickets/{id}/similar` → insight `POST /similarity/search`（D2，失败降级空列表）
- [ ] T056 [GW-3c] [US3] `GET /tickets/{id}/suggestion` 读 core `Ticket.suggestion`（D1，不另调 insight）
- [ ] T057 [GW-3c] [US3] `POST /tickets/{id}/suggestion` 采纳/纠偏 → core 应用 + insight `/feedback/classification`
- [ ] T058 [P] [GW-3c] [US3] 详情 `TicketAggregate` 组装（core 工单主体 + `Ticket.suggestion`；similar 不内联，走 `/tickets/{id}/similar` 懒加载）
- [ ] T059 [GW-3c] [US3] e2e：insight 不可用 similar 返回 200 空列表（US-3.3 AC3 降级）

**Checkpoint**：D1/D2 聚合路径闭合，M3 智能增强可演示。

---

## Phase 9: GW-3d 统计/通知/Admin — [US5/US6/US7] — M3

**Goal**：stats/notifications/admin 全转发。

- [ ] T060 [P] [GW-3d] [US6] `GET /stats` `GET /stats/export` → insight 转发（manager/admin RBAC）
- [ ] T061 [P] [GW-3d] [US5] `GET /notifications` `POST /notifications/{id}/read` → insight 转发
- [ ] T062 [GW-3d] [US7] `/admin/categories` `/admin/sla-policies` `/admin/users` CRUD → core 转发（6 ops）
- [ ] T063 [GW-3d] [US7] `/admin/notification-policies` GET/PUT → insight 转发；替换 `AdminController` stub

**Checkpoint**：34/34 operations 实装完成。

---

## Phase 10: GW-5 生产加固 — M4

- [ ] T064 [GW-5] mTLS `HttpsAgent` 配置（开发环境可跳过，生产 mandatory）
- [ ] T065 [GW-5] 安全评审材料：RBAC 矩阵导出、审计日志样例、service-jwt 轮换说明

---

## Phase 11: 契约 CI 与性能 — 跨切

- [ ] T066 [GW-集成] `api-contract-check` 接入 gateway CI；34 operations 全覆盖绿灯；列表转发 P95 < 500ms 压测脚本

---

## 依赖与执行顺序（DAG，对齐详设 §7.3）

```
Phase1 Setup ──▶ Phase2 Foundational(全局守卫/契约地基) ──▶ Phase3 GW-1(认证) ──▶ Phase4 GW-2(RBAC)
                                                                    │
                                                                    ▼
                                              Phase5 GW-3a(Clients + service-jwt)
                                                                    │
                          ┌─────────────────────┬───────────────────┴──────────────────┐
                          ▼                     ▼                                      ▼
                    Phase6 GW-3b(工单主路径)  Phase7 GW-4(限流)              Phase10 GW-5(mTLS)
                          │                     │                                      │
                          └──────────┬──────────┘                                      │
                                     ▼                                                 │
                              Phase8 GW-3c(智能聚合)                                   │
                                     │                                                 │
                                     ▼                                                 │
                              Phase9 GW-3d(stats/admin)                                │
                                     └──────────────────────┬──────────────────────────┘
                                                            ▼
                                                   Phase11 契约CI/性能
```

### 里程碑映射（详设 §7.2 / 系统详设 §12.2）

- **M2 MVP**：Phase 1–7 + Phase 6（GW-3b）→ 提单→鉴权→转发 core 闭环；越权/限流红线全过
- **M3 智能增强**：Phase 8–9（GW-3c/3d）→ 相似/建议/看板/通知/admin
- **M4 加固**：Phase 10–11 → mTLS、契约 CI、性能基线

### 建议 MVP 范围（P4 启动）

Phase 2 → Phase 3–4（D-1 修复 + RBAC 全覆盖）→ Phase 5–6（GW-3a/3b 工单主路径）→ Phase 7（基础限流）= **M2 闭环**。

---

## 跨模块契约依赖

| 依赖对端 | 类型 | gateway 侧依赖点 | 阻塞判定 |
|---|---|---|---|
| **gateway.yaml** | 前置门禁 | 34 operations schema | ✅ 已冻结 |
| **core**（GW-3b） | 硬阻塞 | 工单/评论/附件/admin 转发路径 | ⚠️ core M2 未就绪时可 **T035 mock 并行** |
| **insight**（GW-3c/3d） | 软阻塞 | similar/stats/notifications | ⚠️ GW-3b 可先交付；3c/3d 可 mock insight |
| **Redis** | 运行时 | 会话/限流 | ✅ GW-1 已依赖 |
| **武安**（安全） | 下游 | RBAC/审计/限流 e2e | 不阻塞开发 |

---

## 验收门禁

- gateway 认证/RBAC 代码合入需 **石磊 + 武安** 双评审（组织红线）
- 越权 / 429 / 契约一致性（T021/T022/T054/T066）为**必过红线**
- 合入前 PR 须带 `SUP-112` issue key

---

## 落地建议（P3→P4 衔接）

P4 建议按 Phase 块拆子 issue：GW-3a（关山）→ GW-3b（关山）∥ GW-4（关山）→ GW-3c/3d（M3）→ GW-5/CI（M4）。A1 完成后 web（江颜）可对接真实 BFF。
