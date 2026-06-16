# smartdesk-gateway 子系统详细设计与实现说明书

| 版本 | 日期 | 作者 | 修订说明 |
|---|---|---|---|
| v1.0 | 2026-06-14 | 关山 | SUP-52：自系统详设派生；统一 9 章目录；逐 path 对照 gateway.yaml；移除草稿/非事实源标记 |
| v1.0-draft | 2026-06-14 | 关山 | 自下而上初稿（GW-1/2 MVP 实现笔记） |

> 版本：v1.0（P2 自顶向下派生）　|　日期：2026-06-14  
> 编制：关山（网关开发 Leader）  
> 上游依据（唯一事实源）：
> - [《SmartDesk 系统详细设计与实现说明书》](SmartDesk系统详细设计与实现说明书.md) v1.0（main@6eaf281）
> - [`src/openapi/gateway.yaml`](../src/openapi/gateway.yaml)（gateway 对外 BFF 契约）
>
> **定位**：本文是 smartdesk-gateway 服务的**实现级详细设计**，在系统详设与 gateway.yaml 框架内细化内部架构、存储、契约对齐、跨服务交互、组件划分、任务分解与依赖。**不突破契约**（契约变更须经梁栋批准，秦诺校验）；契约冻结后据此并行开发。
>
> **旧版归档标注（P4，2026-06-17）**：`v1.0-draft` 为早期自下而上实现笔记，仅保留为历史归档，不再作为需求、契约或实现状态事实源。后续实现对齐以系统详设 v1.0、`src/openapi/gateway.yaml` 与本文 P2 派生内容为准；若旧草稿与系统详设冲突，一律按系统详设列 drift 并交架构裁决。

---

## 修订记录（相对系统详设）

| 系统详设章节/条款 | 本模块处理方式 | 修订原因 | 责任人/日期 |
|---|---|---|---|
| §2.2 gateway 边界 | 直接引用，无扩权 | 与系统详设保持一致 | 关山 2026-06-14 |
| §7 服务间信任 | 细化 service-jwt 签发与 claims 承载身份/租户 | P2 实现级派生 | 关山 2026-06-14 |
| §8 鉴权与 RBAC | 展开 JWT/会话/角色×动作矩阵与守卫链 | gateway 收口实现细节 | 关山 2026-06-14 |
| §5 gateway.yaml | 逐 path 对照下游映射与聚合策略（34 operations） | 契约实现视角 | 关山 2026-06-14 |
| §9 聚合流程 / §13 D1/D2 | 详情主聚合 + 相似/建议懒加载；suggestion 读 core 字段 | D1/D2 已裁定，对齐契约 | 关山 2026-06-14 |
| §12.1 GW-1~5 / §12.2 M2/M3/M4 | 任务 ID 与里程碑一一映射 | 对齐模块划分 | 关山 2026-06-14 |

---

## 目录

1. [范围与职责边界](#1-范围与职责边界)
2. [模块架构与分层](#2-模块架构与分层)
3. [数据/存储](#3-数据存储)
4. [API/契约对齐（逐 path 对照 gateway.yaml）](#4-api契约对齐逐-path-对照-gatewayyaml)
5. [跨服务交互](#5-跨服务交互)
6. [内部组件划分](#6-内部组件划分)
7. [任务分解与里程碑（GW-1~5）](#7-任务分解与里程碑gw-15)
8. [依赖与阻塞](#8-依赖与阻塞)
9. [契约附加修订与 gateway Major 裁定（2026-06-14）](#9-契约附加修订与-gateway-major-裁定2026-06-14)
10. [开放事项](#10-开放事项)

---

## 1. 范围与职责边界

### 1.1 职责边界

| 维度 | gateway 负责 | gateway 不负责 |
|---|---|---|
| 对外入口 | 浏览器唯一 HTTPS 入口（`/api/v1`） | 不直连业务库（除会话/令牌 Redis） |
| 安全 | JWT 认证、RBAC 收口、限流、审计埋点 | 不持有工单权威状态与业务规则 |
| 聚合 | 为前端拼装 core + insight 视图（BFF） | 不做 AI 计算、不发领域事件 |
| 下游调用 | 签发 service-jwt、mTLS 客户端、sub/roles/org_id claims | 不替代 core/insight 的领域鉴权过滤（纵深防御仍依赖下游） |

### 1.2 仓库与部署

- **独立仓库**：`allenlilisec/smartdesk-gateway`（Private）
- **主仓挂载**：`src/smartdesk-gateway` git submodule
- **运行时依赖**：Redis（会话/限流）、core/insight 内网可达、mTLS 证书（部署期注入）
- **健康检查**：`/healthz`（liveness）、`/readyz`（Redis + 下游可达性）

### 1.3 当前实现状态（GW-1/GW-2 MVP）

| 模块 | 状态 | 说明 |
|---|---|---|
| GW-1 认证 | ✅ MVP | 登录/刷新/登出/me、JWT、Redis 会话、LocalProvider |
| GW-2 RBAC | ✅ MVP | 角色×动作矩阵、403 + 审计、越权用例单测 |
| GW-3 聚合 BFF | 🔲 骨架 | TicketsController 存在，当前为 stub，待接 core/insight |
| GW-4 限流 | 🟡 基础 | Nest Throttler 已覆盖全局与 auth 路由并有 429 e2e；Redis 滑窗、附件上传单独限额仍待实现 |
| GW-5 服务令牌 | 🔲 未实现 | 架构 §6 已定义，待 CoreClient 落地 |

### 1.4 P4 实现状态刷新（2026-06-17）

| 项 | 当前代码状态 | 判定 |
|---|---|---|
| `/auth/login`、`/auth/refresh`、`/auth/logout`、`/auth/me` | `AuthController` + `AuthService` 已实现；refresh token 按 OQ-W2 通过 `sd_rt` HttpOnly Cookie 下发，JSON 仅返回 access token | done |
| `Me` 对外视图 | 已按系统详设 D4 与 `gateway.yaml` 移除 `org_id` 响应字段；JWT/下游透传仍保留租户上下文 | done |
| 全局 JWT/RBAC 守卫 | `GlobalJwtAuthGuard` 与 `RbacGuard` 已通过 `APP_GUARD` 注册，局部 `JwtAuthGuard` 仍有冗余 | done + gap |
| ticket/admin 路由 | 仅 `GET/PATCH /tickets/{id}` 与 `GET /admin/categories` 为 stub；其余 gateway.yaml 业务路由未实现 | gap |
| `/readyz` | 已有公开端点，但仅返回静态 ready，未探测 Redis/core/insight | gap |
| 限流 | 全局/auth 基础 429 已有 e2e；未按详设完成 Redis 滑窗、附件上传单独限额与 `Retry-After` 语义 | gap |
| service-jwt/mTLS/下游透传 | 尚未实现 CoreClient/InsightClient 与服务令牌注入 | gap |

### 1.5 设计原则（认证/RBAC 摘要）

- **收口**：所有受保护路由默认要求 Bearer JWT；仅 `login`/`refresh` 以 `@Public()` 豁免（对齐 gateway.yaml `security: []`）。
- **可插拔 IdP（OQ-2）**：认证逻辑抽象为 `IdentityProvider` 接口；一期 `LocalProvider`，二期可增 `OidcProvider` 而不改下游契约。
- **凭证与角色分离**：密码哈希与会话存 gateway（Redis）；角色主数据归 core，登录时从 IdP/目录快照写入 JWT claims。

---

## 2. 模块架构与分层

### 2.1 模块分层（NestJS）

```
┌─────────────────────────────────────────────────────────────┐
│  HTTP 层：Controllers（对齐 gateway.yaml paths）               │
│  • GlobalJwtAuthGuard + RbacGuard + @Public / @RequireAction │
├─────────────────────────────────────────────────────────────┤
│  领域服务层                                                    │
│  • AuthService / TicketsBffService / StatsBffService …      │
├─────────────────────────────────────────────────────────────┤
│  基础设施层                                                    │
│  • CoreClient / InsightClient（HTTP + service-jwt + claims）    │
│  • RedisService（会话/刷新令牌/限流/登出黑名单）                 │
│  • AuditService / RateLimitGuard / TraceIdInterceptor        │
│  • IdentityProvider（Local 一期 / OIDC 预留）                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 守卫链

```
Request → GlobalJwtAuthGuard（401 未认证）
       → RateLimitGuard（429，GW-4）
       → RbacGuard（读取 @RequireAction，403 + AuditService 记审计）
       → Controller
```

---

## 3. 数据/存储

gateway **不持有业务数据**；仅 Redis 存储会话、令牌与限流计数。

### 3.1 令牌模型

| 令牌 | 算法 | 有效期 | 存储 | 用途 |
|---|---|---|---|---|
| access_token | HS256 | 15min（可配） | 无状态 JWT | API 鉴权，`Authorization: Bearer` |
| refresh_token | HS256 | 7d（可配） | Redis `refresh:{jti}` + `session:{sid}`；浏览器侧 `sd_rt` HttpOnly Cookie | 刷新 access，登出即失效 |

**JWT Payload（access）**：

```jsonc
{
  "sub": "<user_id>",
  "username": "alice",
  "org": "default",
  "roles": ["agent", "lead"],
  "sid": "<session_id>",
  "type": "access"
}
```

refresh token 额外携带 `jti`（一次性刷新后可轮换）。

### 3.2 Redis 键设计

| 键 | TTL | 说明 |
|---|---|---|
| `session:{sid}` | = refresh 有效期 | 会话存活标记 |
| `refresh:{jti}` | = refresh 有效期 | jti → user_id，防重放 |
| `logout:access:{jti}` | = access 剩余寿命 | 登出黑名单（可选增强） |
| `ratelimit:{scope}:{id}` | 滑窗窗口 | 限流计数（GW-4） |

### 3.3 认证核心流程

```
登录:
  POST /auth/login → LocalProvider.validateCredentials
    → 失败: 401（统一文案，不泄露账号是否存在）
    → 成功: issueTokens → Redis 写 session + refresh jti
    → 200 TokenPair(access only) + Set-Cookie: sd_rt=<refresh_token>; HttpOnly; Secure; SameSite=Strict

刷新:
  POST /auth/refresh → 从 sd_rt Cookie 读取 refresh token → verify refresh JWT + session 存活 + jti 匹配
    → 轮换 refresh jti → 200 TokenPair(access only) + Set-Cookie 新 sd_rt

登出:
  POST /auth/logout → 删除 session/refresh → 204 + 清除 sd_rt Cookie

受保护请求:
  GlobalJwtAuthGuard → JwtStrategy.validate → AuthenticatedUser 注入 request
```

### 3.4 配置项（`.env`）

| 变量 | 说明 | 默认 |
|---|---|---|
| `JWT_SECRET` | HS256 密钥 | 必填 |
| `JWT_ACCESS_TTL` | access 秒数 | 900 |
| `JWT_REFRESH_TTL` | refresh 秒数 | 604800 |
| `REDIS_URL` | 会话/限流 | `redis://localhost:6379` |
| `CORE_BASE_URL` | core 内网地址 | `http://smartdesk-core:8080` |
| `INSIGHT_BASE_URL` | insight 内网地址 | `http://smartdesk-insight:8000` |
| `SERVICE_JWT_PRIVATE_KEY` | 签发 service-jwt | GW-5 |
| `RATE_LIMIT_GLOBAL` | 全局每分钟上限 | 100 |

---

## 4. API/契约对齐（逐 path 对照 gateway.yaml）

### 4.1 对齐原则

- **唯一事实源**：`src/openapi/gateway.yaml`（OpenAPI 3.1，**24 paths / 34 HTTP operations**）
- 每个 `paths` 条目对应一个 Controller 方法；请求/响应 schema 与 components 一致
- 写操作支持 `Idempotency-Key` 头透传至 core
- 统一错误模型 `Error{code, message, details?, trace_id}`

### 4.2 逐 path 对照表

| # | Path | Method | Tag | RBAC 动作 | 处理策略 | 下游映射 |
|---|---|---|---|---|---|---|
| 1 | `/auth/login` | POST | auth | —（@Public） | 本地认证 | — |
| 2 | `/auth/refresh` | POST | auth | —（@Public） | 本地刷新 | — |
| 3 | `/auth/logout` | POST | auth | 已认证 | 本地登出 | — |
| 4 | `/auth/me` | GET | auth | 已认证 | 本地读 JWT claims | — |
| 5 | `/tickets` | POST | tickets | ticket:create | 转发 | core `POST /v1/tickets` |
| 6 | `/tickets` | GET | tickets | ticket:list | 范围收敛后转发 | core `GET /v1/tickets` |
| 7 | `/tickets/{id}` | GET | tickets | ticket:read | 聚合 + 数据级校验 | core `GET /v1/tickets/{id}` |
| 8 | `/tickets/{id}` | PATCH | tickets | ticket:update | 转发 | core `PATCH /v1/tickets/{id}` |
| 9 | `/tickets/{id}/transitions` | POST | tickets | ticket:transition | 转发（幂等键透传） | core `POST /v1/tickets/{id}/transitions` |
| 10 | `/tickets/{id}/assignments` | POST | tickets | ticket:assign | 转发 | core `POST /v1/tickets/{id}/assignments` |
| 11 | `/tickets/{id}/comments` | GET | comments | comment:read | 转发 + internal 过滤 | core `GET /v1/tickets/{id}/comments` |
| 12 | `/tickets/{id}/comments` | POST | comments | comment:create | 转发 | core `POST /v1/tickets/{id}/comments` |
| 13 | `/tickets/{id}/attachments` | GET | attachments | ticket:read | 转发 | core `GET /v1/tickets/{id}/attachments` |
| 14 | `/tickets/{id}/attachments` | POST | attachments | ticket:update | 转发 | core `POST /v1/tickets/{id}/attachments` |
| 15 | `/attachments/{attId}/download` | GET | attachments | ticket:read | 鉴权后 302 | core `GET /v1/attachments/{id}/download` |
| 16 | `/tickets/{id}/sla` | GET | tickets | ticket:read | 转发 | core `GET /v1/tickets/{id}/sla` |
| 17 | `/tickets/{id}/timeline` | GET | tickets | ticket:read | 转发 | core `GET /v1/tickets/{id}/timeline` |
| 18 | `/tickets/{id}/csat` | GET | tickets | ticket:read | 读 core 工单 csat 字段 | core 工单详情字段（D5） |
| 19 | `/tickets/{id}/csat` | POST | tickets | ticket:update¹ | 转发 | core `POST /v1/tickets/{id}/csat` |
| 20 | `/tickets/{id}/similar` | GET | insight | ticket:read | 懒加载聚合 | insight `POST /similarity/search`（D2） |
| 21 | `/tickets/{id}/suggestion` | GET | insight | ticket:read | 读 core 字段 | core `Ticket.suggestion`（D1 事件写回） |
| 22 | `/tickets/{id}/suggestion` | POST | insight | ticket:update | 采纳/纠偏 | core 应用 + insight `/feedback/classification` |
| 23 | `/stats` | GET | insight | stats:read | 转发 | insight `GET /stats/aggregate` |
| 24 | `/stats/export` | GET | insight | stats:export | 转发 | insight `GET /stats/export` |
| 25 | `/notifications` | GET | notifications | 已认证 | 转发 | insight `GET /notifications` |
| 26 | `/notifications/{notifId}/read` | POST | notifications | 已认证 | 转发 | insight `POST /notifications/{id}/read` |
| 27 | `/admin/categories` | GET | admin | admin:read | 转发 | core `GET /v1/admin/categories` |
| 28 | `/admin/categories` | POST | admin | admin:write | 转发 | core `POST /v1/admin/categories` |
| 29 | `/admin/sla-policies` | GET | admin | admin:read | 转发 | core `GET /v1/admin/sla-policies` |
| 30 | `/admin/sla-policies` | PUT | admin | admin:write | 转发 | core `PUT /v1/admin/sla-policies` |
| 31 | `/admin/users` | GET | admin | admin:read | 转发 | core `GET /v1/admin/users` |
| 32 | `/admin/users` | POST | admin | admin:write | 转发 | core `POST /v1/admin/users` |
| 33 | `/admin/notification-policies` | GET | admin | admin:read | 转发 | insight `GET /admin/notification-policies` |
| 34 | `/admin/notification-policies` | PUT | admin | admin:write | 转发 | insight `PUT /admin/notification-policies` |

¹ requester 在已解决/已关闭工单上提交 CSAT 时按业务规则校验，非 ticket:update。

### 4.3 D1/D2 聚合对齐说明

> 对齐说明（D1/D2，2026-06-14 梁栋裁定）：契约中**不存在** `insight GET /tickets/{id}/similar` 或 `.../suggestion`。
> 相似走 `insight POST /similarity/search`；建议来源是 core 工单详情 `Ticket.suggestion` 字段（纯事件写回）。

**典型聚合：工单详情 `GET /tickets/{id}`**

```
1. RBAC: ticket:read
2. core GET /v1/tickets/{id} → Ticket
   （含 Ticket.suggestion 字段：D1 由 insight 经 ticket.created 事件异步写回 core，详情读取即带出，无需另调 insight）
3. 数据可见性:
   - requester: 校验 ticket.requester_id == user.sub
   - agent/lead: 本组范围（二期；一期可先全组可见）
4. 组装 TicketAggregate → 200（不阻塞于相似推荐）

# 相似推荐独立懒加载（D2，不在详情主聚合内、失败仅 UI 降级，US-3.3 AC3）：
#   gateway GET /tickets/{id}/similar → 内部调用 insight POST /similarity/search（以该工单标题/分类为查询）→ SimilarList
```

### 4.4 列表范围收敛 `GET /tickets`

| 角色 | 查询参数注入 |
|---|---|
| requester | `requester_id = sub`（强制，忽略客户端传入） |
| agent | `assignee_id = sub` 或组内（lead 管本组） |
| lead | `group_id = user.group` |
| manager / admin | 无额外限制（manager 只读） |

### 4.5 路由分组摘要

| gateway 路由（tag） | 聚合策略 | 下游 |
|---|---|---|
| auth | 本地处理 | — |
| tickets / comments / attachments / sla / timeline / csat | 转发 + 范围收敛 | core |
| similar（懒加载） | gateway `GET /tickets/{id}/similar` 内部调用 **`insight POST /similarity/search`** | insight |
| suggestion | 读取来源 = **core 工单详情 `Ticket.suggestion` 字段**（D1 纯事件写回）；采纳/纠偏 `POST /tickets/{id}/suggestion` → core 应用 + insight `/feedback/classification` | core（读）/ core+insight（采纳） |
| stats / notifications | 转发 | insight |
| admin | 转发（admin 角色） | core（taxonomy/SLA/用户角色）+ insight（通知策略） |

### 4.6 契约校验

- 开发期：`api-contract-check` skill 校验 Controller 路由/状态码/Schema 与 gateway.yaml 一致
- CI：PR 合入前跑契约 diff（秦诺维护）

---

## 5. 跨服务交互

### 5.1 服务拓扑

```
web ──JWT──▶ gateway ──service-jwt(sub/roles/org_id)──▶ core
                         └──service-jwt(sub/roles/org_id)──▶ insight

gateway 不订阅事件总线；异步链路不经 gateway。
```

### 5.2 内部调用头（GW-5）

gateway → core/insight 每次请求附带：

```
Authorization: Bearer <service-jwt>   # iss=gateway, aud=core|insight, 短时
                                      # claims: sub=<user_id>, roles=[agent,lead], org_id=default
X-Request-Id: <trace_id>              # 仅链路追踪，不作为身份来源
Idempotency-Key: <透传>
```

### 5.3 RBAC 权限模型

#### 5.3.1 角色枚举

`requester | agent | lead | manager | admin`（与架构 §7、core 目录一致）

#### 5.3.2 动作矩阵（资源×动作）

以 `Action` 枚举 + `roleActions` 映射表实现（`src/rbac/roles.ts`）：

| 动作 | requester | agent | lead | manager | admin |
|---|---|---|---|---|---|
| ticket:create | ✔ | ✔ | ✔ | ✗ | ✔ |
| ticket:list / read | ✔¹ | ✔ | ✔ | ✔² | ✔ |
| ticket:update / transition | ✗ | ✔ | ✔ | ✗ | ✔ |
| ticket:assign | ✗ | ✗ | ✔ | ✗ | ✔ |
| comment:create (public) | ✔ | ✔ | ✔ | ✗ | ✔ |
| comment:read (含 internal) | ✔³ | ✔ | ✔ | ✔ | ✔ |
| stats:read / export | ✗ | ✗ | ✔ | ✔ | ✔ |
| admin:read / write | ✗ | ✗ | ✗ | ✗ | ✔ |

¹ requester 仅自己工单；² manager 全局只读；³ requester 不返回 internal 备注（接口层过滤，US-2.4）

#### 5.3.3 安全红线用例（必过）

| 用例 | 期望 | 负责测试 |
|---|---|---|
| requester 访问他人工单详情 | 403 + 审计 | 武安越权用例 |
| requester 调用 admin 配置 | 403 | 武安 |
| manager PATCH 工单 | 403 | 武安 |
| 无 token 访问受保护路由 | 401 | e2e |

> **合入门禁**：认证/RBAC 相关代码合入须 **石磊（后端）+ 武安（安全）双评审**（组织 §11 + 架构 §7）。

### 5.4 限流与防护（GW-4）

| 维度 | 策略 | 存储 | 响应 |
|---|---|---|---|
| 登录 `/auth/login` | 5 次/分钟/IP + 10 次/分钟/用户名 | Redis 滑窗 | 429 `RATE_LIMITED` |
| 全局 API | 100 次/分钟/用户（可配） | Redis 滑窗 | 429 |
| 附件上传申请 | 20 次/小时/用户 | Redis 滑窗 | 429 |

实现：`RateLimitGuard` + `@RateLimit({ window, max, keyFn })`。

| 威胁 | 措施 |
|---|---|
| 暴力破解 | 登录限流 + 统一 401 文案 |
| 越权 | RBAC + 数据级校验 + 审计 |
| 重放/会话劫持 | refresh jti 轮换、登出清 session |
| 注入 | DTO class-validator 校验入参 |
| 信息泄露 | 错误不暴露堆栈；生产关闭详细 debug |
| 直连后端 | core/insight 仅内网 + mTLS；gateway 为唯一外网入口 |

### 5.5 审计埋点

`AuditService` 记录关键事件（JSON 结构化日志，独立审计流）：

- 403 越权尝试：`who, route, method, action, reason`
- 登录成功/失败（不含密码）
- admin 写操作

字段对齐架构 §9：`trace_id, org_id, actor_id, timestamp`。

---

## 6. 内部组件划分

| 模块 | 职责 | 关键类/文件 |
|---|---|---|
| **AuthModule** | 登录/刷新/登出/me、JWT 签发与校验 | `AuthController`, `AuthService`, `JwtStrategy`, `LocalProvider` |
| **RbacModule** | 角色×动作矩阵、守卫、审计 | `RbacGuard`, `roles.ts`, `AuditService` |
| **TicketsModule** | 工单 CRUD/流转/评论/附件 BFF | `TicketsController`, `TicketsBffService` |
| **InsightBffModule** | 相似/建议/统计/通知聚合 | `SimilarController`, `StatsBffService`, `NotificationsController` |
| **AdminModule** | admin 配置转发 | `AdminController` |
| **CoreClient** | core HTTP 客户端 + service-jwt | `CoreClient`, `CoreHttpModule` |
| **InsightClient** | insight HTTP 客户端 | `InsightClient`, `InsightHttpModule` |
| **RedisModule** | 会话/限流存储 | `RedisService` |
| **Common** | 限流、追踪、全局守卫 | `RateLimitGuard`, `TraceIdInterceptor`, `GlobalJwtAuthGuard` |

**已实现（GW-1/2）**：AuthModule、RbacModule、GlobalJwtAuthGuard、JwtStrategy、AuditService（基础）。

**待实现（GW-3~5）**：CoreClient/InsightClient、TicketsBffService 实装、RateLimitGuard、mTLS HttpsAgent。

---

## 7. 任务分解与里程碑（GW-1~5）

与系统详设 §12 对齐：

| ID | 任务 | 优先级 | 状态 | 交付物 |
|---|---|---|---|---|
| **GW-1** | 认证模块：login/refresh/logout/me、JWT、Redis 会话、IdP 抽象 | P0 | ✅ MVP | AuthModule, e2e |
| **GW-2** | RBAC：角色×动作、@RequireAction、403+审计 | P0 | ✅ MVP | RbacModule, roles.spec |
| **GW-3** | 聚合 BFF：CoreClient/InsightClient + 全部 gateway.yaml 路由转发与聚合（工单/评论/附件/相似/建议/统计/通知/admin） | P0 | 🔲 | Controllers + BffServices |
| **GW-4** | 限流 Guard（登录+全局+附件上传） | P1 | 🔲 | RateLimitGuard, 429 契约 |
| **GW-5** | mTLS 客户端 + service-jwt 签发 + claims 完善 | P1 | 🔲 | HttpsAgent, ServiceJwtService |

### 7.1 GW-3 子任务分解

| 子项 | 内容 | 依赖 |
|---|---|---|
| GW-3a | CoreClient + InsightClient 基建（GW-5 基础） | GW-5 可并行 stub |
| GW-3b | 工单主路径转发（tickets/transitions/assignments/comments/attachments） | GW-3a, core.yaml |
| GW-3c | 详情聚合 + 相似/建议懒加载（D1/D2） | GW-3b, insight.yaml |
| GW-3d | 统计/通知/admin BFF | GW-3a, insight.yaml |

### 7.2 里程碑对齐（架构 §11.2）

| 里程碑 | gateway 交付 | 验收 |
|---|---|---|
| **M2 MVP** | GW-1/2/3（含 3a/3b）+ GW-4 基础限流 | 提单→鉴权→转发 core 建单闭环；越权用例全过 |
| **M3 智能增强** | GW-3c/3d | 详情含相似/建议；看板 stats 可用 |
| **M4 加固** | GW-5 + 性能调优 + 契约 CI 全覆盖 | 安全评审、P95<500ms（列表转发路径） |

### 7.3 建议迭代顺序

```
迭代 1（当前）: GW-1 + GW-2 ✅
迭代 2: GW-3a + GW-5（内部调用基建）
迭代 3: GW-3b（工单主路径转发，替换 stub）
迭代 4: GW-4 + GW-3c（聚合 + 限流）
迭代 5: GW-3d + 契约 CI（看板/通知/admin + api-contract-check 绿灯）
```

---

## 8. 依赖与阻塞

### 8.1 上游依赖

| 依赖 | 提供方 | gateway 需要 | 阻塞 |
|---|---|---|---|
| gateway.yaml 契约冻结 | 梁栋/秦诺 | 全部路由 schema | 开发前 ✅ |
| core.yaml 内部契约 | 石磊/梁栋 | GW-3 转发路径与 DTO | GW-3a 起 |
| insight.yaml 内部契约 | 苏睿/梁栋 | GW-3c/3d 聚合字段 | GW-3c 起 |
| 用户/角色目录 | core | 登录时 roles 快照 | GW-1 已用 Local 种子用户 |
| Redis | 运维 | 会话/限流 | GW-1 已依赖 |
| mTLS 证书 | 运维 | GW-5 生产部署 | 不阻塞开发环境 |

### 8.2 下游被依赖

| 消费方 | 依赖 gateway 什么 |
|---|---|
| smartdesk-web | 全部 `/api/v1` 路由、JWT 流程 |
| 武安（安全测试） | RBAC 矩阵、越权用例、审计日志 |
| 秦诺（契约） | gateway.yaml 实现一致性 |

### 8.3 风险与缓解

| 风险 | 缓解 |
|---|---|
| core/insight 未就绪阻塞 BFF | GW-3a 先用 mock server 或 stub 保持契约 e2e 绿灯 |
| 角色主数据与 JWT 漂移 | 刷新 token 时可选拉 core 角色快照；关键 admin 操作强制校验 |
| 聚合延迟超标 | 详情并行请求；insight 失败降级；列表不聚合 insight |

---

## 9. 契约附加修订与 gateway Major 裁定（2026-06-14）

> 来源：core 详设合入前 blocker 路由（SUP-49）；gateway.yaml `1.0.0-draft` → `1.0.1`（纯附加，不破既有消费者）。

### 9.1 Blocker 收口（B1/B2）

| ID | 问题 | 裁定 | gateway.yaml 落地 |
|---|---|---|---|
| **B1** | `CsatView` 无法从 core 仅 `csat_score` 拼全 | 认可附加字段路径：core `Ticket`/`TicketDetail` 增 `csat_comment`、`csat_rated_at`（秦诺落 core.yaml）；gateway `CsatView` 三字段映射并文档化 | `CsatView` + GET `/tickets/{id}/csat` summary |
| **B2** | 附件挂评论 gateway 不可见 | core `AttachmentInit` 已支持 `comment_id`；gateway 对外补齐透传 | `AttachmentInit`/`AttachmentView` 增可选 `comment_id` |

### 9.2 gateway Major 裁定（M1–M4，属 SUP-48 范畴）

| ID | 议题 | 裁定 | 说明 |
|---|---|---|---|
| **M1** | 列表/查询参数与 core 过滤口径 | **延后 M2**：gateway 查询参数对齐 core `TicketPage` 过滤集，随 GW-3b 实现一并固化 | 不在本修订改路径 |
| **M2** | 写端点返回体（201/200 是否回实体） | **延后 M2**：POST 类端点默认 201 空体或 Location；需回视图的写操作在 GW-3b 逐端点评审 | 保持现状 |
| **M3** | admin 角色入口与 RBAC 矩阵 | **延后 M3**：`/admin/*` 与 `admin` 角色动作矩阵在 GW-3d 与武安越权用例一并闭合 | 契约路径已存在 |
| **M4** | `Me.org_id` 与系统详设 §13 **D4** 冲突 | **移除**：对外 `Me` 不暴露 `org_id`（D4 A 裁决）；服务间身份由 service-jwt 的 `org_id` claim 承载，不进入 BFF 响应体 | `Me` schema 删除 `org_id` |

---

## 10. 开放事项

| 项 | 说明 | 处置 |
|---|---|---|
| OQ-2 OIDC IdP | 二期可插拔身份提供方 | 预留 `OidcProvider` 接口；一期 LocalProvider |
| OQ-4 自动填充阈值 | 分类/定级建议是否自动应用 | 一期默认建议态；阈值入 config（insight 侧） |
| agent/lead 组内范围 | 一期 agent 可见全组 vs 仅本人 | 二期细化 `group_id` 注入；一期可先全组可见 |
| GW-3 与下游就绪顺序 | core/insight 未就绪阻塞 BFF | mock/stub 保持契约 e2e；见 §8.3 |
| 契约 CI（GW-6 级能力） | api-contract-check 纳入 PR 门禁 | 秦诺维护；M4 前落地 |
| TicketAggregate.similar 字段 | gateway.yaml schema 含 similar 但 D2 要求懒加载 | 详情主路径不阻塞 similar；独立 `/similar` 端点 |

---

## 附录：参考文档

- [SmartDesk 系统详细设计与实现说明书](SmartDesk系统详细设计与实现说明书.md)
- [SmartDesk 系统架构设计说明书](SmartDesk系统架构设计说明书.md) §6 服务间信任、§7 RBAC、§11 gateway 模块清单
- [gateway OpenAPI](../src/openapi/gateway.yaml)
- [core OpenAPI](../src/openapi/core.yaml)
- [insight OpenAPI](../src/openapi/insight.yaml)
- [用户故事与验收标准](SmartDesk用户故事与验收标准.md)
