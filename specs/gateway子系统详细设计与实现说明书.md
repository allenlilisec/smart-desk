# smartdesk-gateway 模块实现设计与任务分解

> ⚠️ **本文非系统级事实源。** 这是 P1 之前的**自下而上草稿**（早于 spec-kit 系统详设与 D1–D5 契约裁定）。
> 系统级设计**以 [《SmartDesk 系统详细设计与实现说明书》](SmartDesk系统详细设计与实现说明书.md) + [`src/openapi/*.yaml`](../src/openapi/) 为准**；二者冲突时以事实源为准，不以本文为准。
> 本文将于 **P2 自顶向下由系统详设派生时整体对齐回填**。本轮（SUP-43 冻结前）仅做最小消歧手术（§4.3 聚合流程对齐契约），其余实质重写留 P2。

> 版本：v1.0-draft（非事实源，待 P2 对齐）　|　日期：2026-06-14  
> 编制：关山（网关开发 Leader）  
> 上游依据（事实源）：[《SmartDesk 系统详细设计与实现说明书》](SmartDesk系统详细设计与实现说明书.md)、[gateway OpenAPI 契约](../src/openapi/gateway.yaml)；背景参考：[《SmartDesk 系统架构设计说明书》](SmartDesk系统架构设计说明书.md) §2/§6/§7/§11、[用户故事与验收标准](SmartDesk用户故事与验收标准.md)

---

## 目录

1. [模块定位与架构](#1-模块定位与架构)
2. [认证与 JWT 实现方案](#2-认证与-jwt-实现方案)
3. [RBAC 权限模型设计](#3-rbac-权限模型设计)
4. [API 聚合层设计](#4-api-聚合层设计)
5. [限流与防护策略](#5-限流与防护策略)
6. [任务分解与里程碑](#6-任务分解与里程碑)
7. [依赖关系说明](#7-依赖关系说明)

---

## 1. 模块定位与架构

### 1.1 职责边界

| 维度 | gateway 负责 | gateway 不负责 |
|---|---|---|
| 对外入口 | 浏览器唯一 HTTPS 入口（`/api/v1`） | 不直连业务库（除会话/令牌 Redis） |
| 安全 | JWT 认证、RBAC 收口、限流、审计埋点 | 不持有工单权威状态与业务规则 |
| 聚合 | 为前端拼装 core + insight 视图（BFF） | 不做 AI 计算、不发领域事件 |
| 下游调用 | 签发 service-jwt、mTLS 客户端、透传 `X-User-*` 头 | 不替代 core/insight 的领域鉴权过滤（纵深防御仍依赖下游） |

### 1.2 模块分层（NestJS）

```
┌─────────────────────────────────────────────────────────────┐
│  HTTP 层：Controllers（对齐 gateway.yaml paths）               │
│  • GlobalJwtAuthGuard + RbacGuard + @Public / @RequireAction │
├─────────────────────────────────────────────────────────────┤
│  领域服务层                                                    │
│  • AuthService / TicketsBffService / StatsBffService …      │
├─────────────────────────────────────────────────────────────┤
│  基础设施层                                                    │
│  • CoreClient / InsightClient（HTTP + service-jwt + 透传头）    │
│  • RedisService（会话/刷新令牌/限流/登出黑名单）                 │
│  • AuditService / RateLimitGuard / TraceIdInterceptor        │
│  • IdentityProvider（Local 一期 / OIDC 预留）                  │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 仓库与部署

- **独立仓库**：`allenlilisec/smartdesk-gateway`（Private）
- **主仓挂载**：`src/smartdesk-gateway` git submodule
- **运行时依赖**：Redis（会话/限流）、core/insight 内网可达、mTLS 证书（部署期注入）
- **健康检查**：`/healthz`（liveness）、`/readyz`（Redis + 下游可达性）

### 1.4 当前实现状态（GW-1/GW-2 MVP）

| 模块 | 状态 | 说明 |
|---|---|---|
| GW-1 认证 | ✅ MVP | 登录/刷新/登出/me、JWT、Redis 会话、LocalProvider |
| GW-2 RBAC | ✅ MVP | 角色×动作矩阵、403 + 审计、越权用例单测 |
| GW-3 聚合 BFF | 🔲 骨架 | TicketsController 存在，当前为 stub，待接 core/insight |
| GW-4 限流 | 🔲 未实现 | 契约已定义 429 响应 |
| GW-5 服务令牌 | 🔲 未实现 | 架构 §6 已定义，待 CoreClient 落地 |

---

## 2. 认证与 JWT 实现方案

### 2.1 设计原则

- **收口**：所有受保护路由默认要求 Bearer JWT；仅 `login`/`refresh` 以 `@Public()` 豁免（对齐 gateway.yaml `security: []`）。
- **可插拔 IdP（OQ-2）**：认证逻辑抽象为 `IdentityProvider` 接口；一期 `LocalProvider`，二期可增 `OidcProvider` 而不改下游契约。
- **凭证与角色分离**：密码哈希与会话存 gateway（Redis）；角色主数据归 core，登录时从 IdP/目录快照写入 JWT claims。

### 2.2 令牌模型

| 令牌 | 算法 | 有效期 | 存储 | 用途 |
|---|---|---|---|---|
| access_token | HS256 | 15min（可配） | 无状态 JWT | API 鉴权，`Authorization: Bearer` |
| refresh_token | HS256 | 7d（可配） | Redis `refresh:{jti}` + `session:{sid}` | 刷新 access，登出即失效 |

**JWT Payload（access）**：

```jsonc
{
  "sub": "<user_id>",
  "username": "alice",
  "org_id": "default",
  "roles": ["agent", "lead"],
  "sid": "<session_id>",
  "type": "access"
}
```

refresh token 额外携带 `jti`（一次性刷新后可轮换）。

### 2.3 核心流程

```
登录:
  POST /auth/login → LocalProvider.validateCredentials
    → 失败: 401（统一文案，不泄露账号是否存在）
    → 成功: issueTokens → Redis 写 session + refresh jti → 200 TokenPair

刷新:
  POST /auth/refresh → verify refresh JWT + session 存活 + jti 匹配
    → 轮换 refresh jti → 200 TokenPair

登出:
  POST /auth/logout → 删除 session/refresh → 204

受保护请求:
  GlobalJwtAuthGuard → JwtStrategy.validate → AuthenticatedUser 注入 request
```

### 2.4 Redis 键设计

| 键 | TTL | 说明 |
|---|---|---|
| `session:{sid}` | = refresh 有效期 | 会话存活标记 |
| `refresh:{jti}` | = refresh 有效期 | jti → user_id，防重放 |
| `logout:access:{jti}` | = access 剩余寿命 | 登出黑名单（可选增强） |

### 2.5 实现要点（已实现）

- `AuthController` 对齐 `/auth/login|refresh|logout|me`
- `JwtStrategy` + `GlobalJwtAuthGuard` 全局默认保护
- `@Public()` 装饰器标记豁免路由
- 错误体统一 `{ code, message }`，符合 gateway.yaml `Error` schema

---

## 3. RBAC 权限模型设计

### 3.1 角色枚举

`requester | agent | lead | manager | admin`（与架构 §7、core 目录一致）

### 3.2 动作矩阵（资源×动作）

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

### 3.3 守卫链

```
Request → GlobalJwtAuthGuard（401 未认证）
       → RbacGuard（读取 @RequireAction，403 + AuditService 记审计）
       → Controller
```

- `@RequireAction(Action.TicketRead)` 声明路由所需动作
- 数据级越权（如 requester 读他人工单）在 BFF/领域服务二次校验 + 审计

### 3.4 安全红线用例（必过）

| 用例 | 期望 | 负责测试 |
|---|---|---|
| requester 访问他人工单详情 | 403 + 审计 | 武安越权用例 |
| requester 调用 admin 配置 | 403 | 武安 |
| manager PATCH 工单 | 403 | 武安 |
| 无 token 访问受保护路由 | 401 | e2e |

> **合入门禁**：认证/RBAC 相关代码合入须 **石磊（后端）+ 武安（安全）双评审**（组织 §11 + 架构 §7）。

---

## 4. API 聚合层设计

### 4.1 契约对齐原则

- **唯一事实源**：`src/openapi/gateway.yaml`（OpenAPI 3.1）
- 每个 `paths` 条目对应一个 Controller 方法；请求/响应 schema 与 components 一致
- 写操作支持 `Idempotency-Key` 头透传至 core
- 统一错误模型 `Error{code, message, details?, trace_id}`

### 4.2 路由分组与下游映射

| gateway 路由（tag） | 聚合策略 | 下游 |
|---|---|---|
| auth | 本地处理 | — |
| tickets / comments / attachments / sla / timeline / csat | 转发 + 范围收敛 | core |
| similar（懒加载） | gateway `GET /tickets/{id}/similar` 内部调用 **`insight POST /similarity/search`** | insight |
| suggestion | 读取来源 = **core 工单详情 `Ticket.suggestion` 字段**（D1 纯事件写回，不经 insight 端点）；采纳/纠偏 `POST /tickets/{id}/suggestion` → core 应用 + insight `/feedback/classification` | core（读）/ core+insight（采纳） |
| stats / notifications | 转发 | insight |
| admin | 转发（admin 角色） | core（taxonomy/SLA/用户角色）+ insight（通知策略） |

### 4.3 典型聚合：工单详情 `GET /tickets/{id}`

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
> 对齐说明（D1/D2，2026-06-14 梁栋裁定）：契约中**不存在** `insight GET /tickets/{id}/similar` 或 `.../suggestion`。
> 相似走 `insight POST /similarity/search`；建议来源是 core 工单详情 `Ticket.suggestion` 字段（纯事件写回）。本节据此已对齐，实质重写仍留 P2。

### 4.4 列表范围收敛 `GET /tickets`

| 角色 | 查询参数注入 |
|---|---|
| requester | `requester_id = sub`（强制，忽略客户端传入） |
| agent | `assignee_id = sub` 或组内（lead 管本组） |
| lead | `group_id = user.group` |
| manager / admin | 无额外限制（manager 只读） |

### 4.5 内部调用头（GW-5）

gateway → core/insight 每次请求附带：

```
Authorization: Bearer <service-jwt>   # iss=gateway, aud=core|insight, 短时
X-User-Id: <sub>
X-User-Roles: agent,lead
X-Org-Id: default
X-Request-Id: <trace_id>
Idempotency-Key: <透传>
```

### 4.6 契约校验

- 开发期：`api-contract-check` skill 校验 Controller 路由/状态码/Schema 与 gateway.yaml 一致
- CI：PR 合入前跑契约 diff（秦诺维护）

---

## 5. 限流与防护策略

### 5.1 限流（GW-4）

| 维度 | 策略 | 存储 | 响应 |
|---|---|---|---|
| 登录 `/auth/login` | 5 次/分钟/IP + 10 次/分钟/用户名 | Redis 滑窗 | 429 `RATE_LIMITED` |
| 全局 API | 100 次/分钟/用户（可配） | Redis 滑窗 | 429 |
| 附件上传申请 | 20 次/小时/用户 | Redis 滑窗 | 429 |

实现：`RateLimitGuard` + `@RateLimit({ window, max, keyFn })`，计数键 `ratelimit:{scope}:{id}`。

### 5.2 基础防护

| 威胁 | 措施 |
|---|---|
| 暴力破解 | 登录限流 + 统一 401 文案 |
| 越权 | RBAC + 数据级校验 + 审计 |
| 重放/会话劫持 | refresh jti 轮换、登出清 session |
| 注入 | DTO class-validator 校验入参 |
| 信息泄露 | 错误不暴露堆栈；生产关闭详细 debug |
| 直连后端 | core/insight 仅内网 + mTLS；gateway 为唯一外网入口 |

### 5.3 审计埋点

`AuditService` 记录关键事件（JSON 结构化日志，独立审计流）：

- 403 越权尝试：`who, route, method, action, reason`
- 登录成功/失败（不含密码）
- admin 写操作

字段对齐架构 §9：`trace_id, org_id, actor_id, timestamp`。

---

## 6. 任务分解与里程碑

### 6.1 模块任务清单

| ID | 任务 | 优先级 | 状态 | 交付物 |
|---|---|---|---|---|
| GW-1 | 认证模块：login/refresh/logout/me、JWT、Redis 会话、IdP 抽象 | P0 | ✅ MVP | AuthModule, e2e |
| GW-2 | RBAC：角色×动作、@RequireAction、403+审计 | P0 | ✅ MVP | RbacModule, roles.spec |
| GW-3a | CoreClient + service-jwt 签发（GW-5 基础） | P0 | 🔲 | `core/` HTTP client |
| GW-3b | 工单 CRUD/流转/评论/附件 BFF 转发 | P0 | 🔲 | Tickets/Comments/Attachments controllers |
| GW-3c | 工单详情聚合（core+insight 并行） | P1 | 🔲 | TicketAggregate 组装 |
| GW-3d | 统计/通知/admin BFF | P1 | 🔲 | Stats/Notifications/Admin controllers |
| GW-4 | 限流 Guard（登录+全局） | P1 | 🔲 | RateLimitGuard, 429 契约 |
| GW-5 | mTLS 客户端 + 透传头完善 | P1 | 🔲 | HttpsAgent 配置 |
| GW-6 | 契约一致性 CI + e2e 全覆盖 | P1 | 🔲 | api-contract-check 绿灯 |
| GW-7 | OIDC Provider 适配器（OQ-2 二期） | P2 | 预留 | OidcProvider |

### 6.2 里程碑对齐（架构 §11.2）

| 里程碑 | gateway 交付 | 验收 |
|---|---|---|
| **M2 MVP** | GW-1/2/3a/3b + GW-4 基础限流 | 提单→鉴权→转发 core 建单闭环；越权用例全过 |
| **M3 智能增强** | GW-3c/3d | 详情含相似/建议；看板 stats 可用 |
| **M4 加固** | GW-5/6/7 + 性能调优 | 安全评审、P95<500ms（列表转发路径） |

### 6.3 建议迭代顺序

```
迭代 1（当前）: GW-1 + GW-2 ✅
迭代 2: GW-3a + GW-5（内部调用基建）
迭代 3: GW-3b（工单主路径转发，替换 stub）
迭代 4: GW-4 + GW-3c（聚合 + 限流）
迭代 5: GW-3d + GW-6（看板/通知/admin + 契约 CI）
```

---

## 7. 依赖关系说明

### 7.1 上游依赖

| 依赖 | 提供方 | gateway 需要 | 阻塞 |
|---|---|---|---|
| gateway.yaml 契约冻结 | 梁栋/秦诺 | 全部路由 schema | 开发前 |
| core.yaml 内部契约 | 石磊/梁栋 | GW-3 转发路径与 DTO | GW-3a 起 |
| insight.yaml 内部契约 | 苏睿/梁栋 | GW-3c/3d 聚合字段 | GW-3c 起 |
| 用户/角色目录 | core | 登录时 roles 快照 | GW-1 已用 Local 种子用户 |
| Redis | 运维 | 会话/限流 | GW-1 已依赖 |
| mTLS 证书 | 运维 | GW-5 生产部署 | 不阻塞开发环境 |

### 7.2 下游被依赖

| 消费方 | 依赖 gateway 什么 |
|---|---|
| smartdesk-web | 全部 `/api/v1` 路由、JWT 流程 |
| 武安（安全测试） | RBAC 矩阵、越权用例、审计日志 |
| 秦诺（契约） | gateway.yaml 实现一致性 |

### 7.3 与其他服务协作关系

```
web ──JWT──▶ gateway ──service-jwt+X-User-*──▶ core
                         └──service-jwt+X-User-*──▶ insight

gateway 不订阅事件总线；异步链路不经 gateway。
```

### 7.4 风险与缓解

| 风险 | 缓解 |
|---|---|
| core/insight 未就绪阻塞 BFF | GW-3a 先用 mock server 或 stub 保持契约 e2e 绿灯 |
| 角色主数据与 JWT 漂移 | 刷新 token 时可选拉 core 角色快照；关键 admin 操作强制校验 |
| 聚合延迟超标 | 详情并行请求；insight 失败降级；列表不聚合 insight |

---

## 8. 契约附加修订与 gateway Major 裁定（2026-06-14）

> 来源：core 详设合入前 blocker 路由（SUP-49）；gateway.yaml `1.0.0-draft` → `1.0.1`（纯附加，不破既有消费者）。

### 8.1 Blocker 收口（B1/B2）

| ID | 问题 | 裁定 | gateway.yaml 落地 |
|---|---|---|---|
| **B1** | `CsatView` 无法从 core 仅 `csat_score` 拼全 | 认可附加字段路径：core `Ticket`/`TicketDetail` 增 `csat_comment`、`csat_rated_at`（秦诺落 core.yaml）；gateway `CsatView` 三字段映射并文档化 | `CsatView` + GET `/tickets/{id}/csat` summary |
| **B2** | 附件挂评论 gateway 不可见 | core `AttachmentInit` 已支持 `comment_id`；gateway 对外补齐透传 | `AttachmentInit`/`AttachmentView` 增可选 `comment_id` |

### 8.2 gateway Major 裁定（M1–M4，属 SUP-48 范畴）

| ID | 议题 | 裁定 | 说明 |
|---|---|---|---|
| **M1** | 列表/查询参数与 core 过滤口径 | **延后 M2**：gateway 查询参数对齐 core `TicketPage` 过滤集，随 GW-3b 实现一并固化 | 不在本修订改路径 |
| **M2** | 写端点返回体（201/200 是否回实体） | **延后 M2**：POST 类端点默认 201 空体或 Location；需回视图的写操作在 GW-3b 逐端点评审 | 保持现状 |
| **M3** | admin 角色入口与 RBAC 矩阵 | **延后 M3**：`/admin/*` 与 `admin` 角色动作矩阵在 GW-3d 与武安越权用例一并闭合 | 契约路径已存在 |
| **M4** | `Me.org_id` 与系统详设 §13 **D4** 冲突 | **移除**：对外 `Me` 不暴露 `org_id`（D4 A 裁决）；JWT claims 与服务间 `X-Org-Id` 仍保留供 gateway 注入，不进入 BFF 响应体 | `Me` schema 删除 `org_id` |

---

## 附录 A：配置项（`.env`）

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

## 附录 B：参考文档

- [SmartDesk 系统架构设计说明书](SmartDesk系统架构设计说明书.md) §6 服务间信任、§7 RBAC、§11 gateway 模块清单
- [gateway OpenAPI](../src/openapi/gateway.yaml)
- [core OpenAPI](../src/openapi/core.yaml)
- [insight OpenAPI](../src/openapi/insight.yaml)
