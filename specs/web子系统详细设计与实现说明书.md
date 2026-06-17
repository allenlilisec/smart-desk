# smartdesk-web 子系统详细设计与实现说明书

> 版本：v1.0（P2 自顶向下派生）　|　日期：2026-06-14  
> 编制：江颜（前端开发 Leader / 前端域 committer）  
> 上游依据（唯一事实源）：[《SmartDesk 系统详细设计与实现说明书》](SmartDesk系统详细设计与实现说明书.md)（main@6eaf281）、[`src/openapi/gateway.yaml`](../src/openapi/gateway.yaml)（BFF 契约）  
> 参考输入（非事实源）：[《SmartDesk 系统架构设计说明书》](SmartDesk系统架构设计说明书.md)、[《用户故事与验收标准》](SmartDesk用户故事与验收标准.md)、SUP-34 旧草稿（若有，冲突以系统详设裁决）

---

## 修订记录（相对系统详设）

| 章节 | 相对系统详设变更 | 理由 |
|---|---|---|
| §1 范围 | 无扩权；明确 web 不持业务状态、不直连 core/insight | 对齐 §2.2 最终边界 |
| §2 架构 | 细化 Next.js App Router 三端分区与分层 | P2 实现级派生，不改变系统边界 |
| §4 API | 逐 path 映射到页面/组件与错误处理策略 | 契约消费方视角，便于并行开发 |
| §5 跨服务 | 前端仅同步 REST；事件经 BFF 投影，不直连 NATS | 对齐 §9 降级语义 |
| §7 里程碑 | WEB-1~5 拆到迭代与 M2/M3/M4；§7.3 验收标准引用 §10 规范基线 | 对齐 §12.1/§12.2；修订 R1（资料初审沈思） |
| §10（新增） | 验收标准规范基线（安全/性能/可用性/代码质量） | 补 §10.3 要求的规范基线声明（修订 R1） |
| §3 存储 | 刷新令牌存储策略更新为 OQ-W2 方案 A（HttpOnly Cookie，同源代理） | 梁栋架构裁定 OQ-W2（2026-06-15） |
| §9 开放事项 | 回写 OQ-W1/W2/W3 架构裁决结论 | 梁栋架构裁定（2026-06-15），合入前收尾 |
| §2 布局/导航 | 新增 §2.3 全局 AppShell（左侧深色主导航 + 顶部轻工具栏）作为 portal/desk/admin/dashboard 统一信息架构；原「路由与布局」表顺延为 §2.4，统一引用 AppShell | 梁栋架构裁定 SUP-270/SUP-284（2026-06-17），CEO 拍板方案 A：P0 按 Figma 重整壳层与令牌 |
| §11（新增） | P4 实现状态同步：按 `smartdesk-web@9ed0d0b` 标注 done/gap/drift 与处置 | SUP-262 要求对齐当前代码、任务清单与系统详设 |

---

## 目录

1. [范围与职责边界](#1-范围与职责边界)
2. [模块架构与分层](#2-模块架构与分层)
3. [数据/存储（本模块归属）](#3-数据存储本模块归属)
4. [API/契约对齐（gateway BFF）](#4-api契约对齐gateway-bff)
5. [跨服务交互与降级](#5-跨服务交互与降级)
6. [内部组件划分](#6-内部组件划分)
7. [任务分解与里程碑](#7-任务分解与里程碑)
8. [依赖与阻塞](#8-依赖与阻塞)
9. [开放事项](#9-开放事项)
10. [验收标准规范基线（对齐 §10.3）](#10-验收标准规范基线对齐-103)
11. [P4 实现状态同步](#11-p4-实现状态同步)

---

## 1. 范围与职责边界

### 1.1 职责（引用系统详设 §2.2，不得扩权）

| 维度 | web 负责 | web 不负责 |
|---|---|---|
| 用户界面 | 三端 UI：报单门户（WEB-1）、坐席工作台（WEB-2）、管理后台（WEB-3）、看板报表（WEB-4） | 不实现业务规则与权威状态 |
| API 调用 | **仅**经 gateway `/api/v1`（JWT Bearer） | 不直连 core/insight；不持有 service-jwt |
| 鉴权体验 | 登录/登出/令牌刷新、路由守卫、按角色隐藏/禁用操作、401/403/429 统一 UX（§8） | 不做 RBAC 裁决（gateway 收口）；不存密码哈希 |
| 状态展示 | 展示 gateway 聚合视图（TicketAggregate、StatsResult 等） | 不本地改写工单权威字段后不同步 |
| 国际化 | i18n 框架与文案外置预留（WEB-5，默认中文 OQ-11） | 一期不交付多语言切换 UI |

### 1.2 三端 UI 与角色映射（系统详设 §2.1 / WEB-1~4）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        smartdesk-web (Next.js)                          │
├─────────────────┬─────────────────────┬─────────────────────────────────┤
│ WEB-1 报单门户   │ WEB-2 坐席工作台     │ WEB-3 管理后台 + WEB-4 看板       │
│ 路由前缀 /portal │ 路由前缀 /desk       │ 路由前缀 /admin、/dashboard      │
├─────────────────┼─────────────────────┼─────────────────────────────────┤
│ 角色: requester │ 角色: agent, lead     │ 角色: admin（写）                │
│ (+ 全员提单入口) │ (+ lead 分派/升级)    │ manager, lead（看板只读）        │
├─────────────────┼─────────────────────┼─────────────────────────────────┤
│ · 登录/注册入口  │ · 我的队列/组内队列   │ · 分类树 CRUD                   │
│ · 结构化提单     │ · 工单详情（右栏）    │ · SLA 策略配置                  │
│ · 我的工单列表   │ · 状态操作/分派       │ · 用户/角色管理                 │
│ · 工单详情/追评  │ · 评论/内部备注       │ · 通知策略配置                  │
│ · 确认关闭/重开  │ · 相似/建议（懒加载） │ · SLA/积压/工作量看板           │
│ · CSAT 评价      │ · 附件上传/下载       │ · CSV 导出                      │
│ · 站内通知铃铛   │ · 站内通知            │                                 │
└─────────────────┴─────────────────────┴─────────────────────────────────┘
                              │ HTTPS + JWT
                              ▼
                    gateway /api/v1（唯一 API 入口）
```

**入口路由策略**：根路径 `/` 按 `me.roles` 重定向——`requester`→`/portal`；`agent|lead`→`/desk`；`manager`→`/dashboard`；`admin`→`/admin`；多角色并存时优先级 `admin > manager > lead > agent > requester`（可配置，见 §9）。

### 1.3 仓库与部署

| 项 | 约定 |
|---|---|
| 仓库 | `allenlilisec/smartdesk-web`（Private） |
| 主仓挂载 | `src/smartdesk-web` git submodule |
| 运行时 | Node 20 LTS；Next.js 14+ App Router |
| 构建产物 | 静态+SSR 混合；`NEXT_PUBLIC_API_BASE` 指向 gateway |
| 健康检查 | `/healthz`（静态路由，不鉴权） |

---

## 2. 模块架构与分层

### 2.1 技术选型

| 关注点 | 选型 | 理由 |
|---|---|---|
| 框架 | Next.js 14+（App Router） | 架构红线；SSR/CSR 混合、路由分组契合三端 |
| 语言 | TypeScript 5+ | 与 gateway 同语系；OpenAPI 类型生成 |
| UI 组件 | shadcn/ui + Radix + Tailwind CSS | 可定制、无障碍、与设计系统一致 |
| 数据请求 | TanStack Query v5 | 缓存、重试、乐观更新、分页 |
| API 客户端 | `openapi-typescript` 生成类型 + 薄封装 `apiClient` | 契约优先，编译期对齐 gateway.yaml |
| 表单 | React Hook Form + Zod | 与契约 schema 对齐校验 |
| 状态机 UI | XState（工单操作按钮可用性） | 对齐 core 八态，非法操作前置禁用 |
| 鉴权 | 自定义 `AuthProvider` + middleware | §8 前端鉴权体验 |
| 测试 | Vitest + Testing Library + Playwright | 组件/越权 E2E（US-1.2 红线） |

### 2.2 分层架构

```
┌────────────────────────────────────────── 表现层 (app/) ──────────────────────────────────────────┐
│  Route Groups: (auth) / (portal) / (desk) / (admin) / (dashboard)                                  │
│  · page.tsx / layout.tsx / loading.tsx / error.tsx                                                 │
│  · 页面级组合：队列+详情分栏、提单向导、看板图表                                                       │
├────────────────────────────────────────── 功能组件层 (features/) ───────────────────────────────────┤
│  tickets/ · comments/ · attachments/ · sla/ · insight/ · notifications/ · admin/ · stats/          │
│  · 业务组件：TicketQueue, TicketDetail, TransitionBar, SuggestionPanel, SimilarList …              │
├────────────────────────────────────────── 共享 UI (components/) ────────────────────────────────────┤
│  · 设计系统：Button, DataTable, StatusBadge, PriorityTag, RoleGuard, EmptyState …                  │
├────────────────────────────────────────── 应用服务层 (lib/) ──────────────────────────────────────────┤
│  api/        — apiClient, 错误归一化, Idempotency-Key 注入                                         │
│  auth/       — token 存取, refresh 队列, session 恢复, logout                                      │
│  rbac/       — can(action, resource), usePermission hook                                          │
│  hooks/      — useTickets, useTicketDetail, useStats …                                             │
│  i18n/       — WEB-5 预留：next-intl 或同类，默认 zh-CN                                            │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 全局 AppShell（统一信息架构）

> **来源**：CEO 决策方案 A（2026-06-17）+ 梁栋架构裁定（SUP-270 / SUP-284）。本节是结构性决策，凡 `(portal) / (desk) / (admin) / (dashboard)` 四个路由组**强制共享**该 AppShell；任何脱离 AppShell 的页面级布局须在合入前通过架构裁决，否则一律驳回。

#### 2.3.1 壳层结构

```
┌───────────────────────────────────────────────────────────────────────────┐
│ 顶部轻工具栏 (TopBar，h=48px)                                              │
│  · 左：当前模块面包屑/页面标题（不放主导航）                                 │
│  · 中：全局搜索（M3+，P0 占位）                                             │
│  · 右：通知铃铛 · 主题/语言切换（M3+） · 当前用户菜单（display_name + 登出） │
├──────────┬────────────────────────────────────────────────────────────────┤
│ 左侧深色  │ 内容区 (main)                                                  │
│ 主导航    │  · 各路由组的页面内容（list/detail/board/form…）               │
│ (Sidebar) │  · 不重复渲染顶栏/侧栏；不允许在 main 内再起一套站点级导航      │
│ w=224px   │                                                                │
│ 折叠 64px │                                                                │
└──────────┴────────────────────────────────────────────────────────────────┘
```

- **左侧主导航（Sidebar，深色品牌蓝/深灰）**：站点级一级入口（门户 / 工作台 / 管理后台 / 数据看板）+ 角色范围内的二级入口；折叠态仅图标 64px，展开 224px。设计令牌按 Figma 收敛（详见 [P0 实施清单](#7-任务分解与里程碑)），禁用粉/珊瑚 FAB。
- **顶部轻工具栏（TopBar，浅色）**：模块上下文（标题/面包屑）+ 全局动作（搜索/通知/用户）；**不放一级导航**，避免与左栏重复。
- **内容区**：业务页面唯一可变区域；坐席工作台的「左队列 / 中详情 / 右上下文」三栏视觉骨架在 main 内自布局，不替代 AppShell。

#### 2.3.2 导航可见性（角色驱动，零契约）

- 导航项可见性**唯一**依据：`GET /auth/me`（gateway 契约 `#/components/schemas/Me`）返回的 `roles: string[]`（枚举 `requester | agent | lead | manager | admin`，详见 [gateway.yaml §components.schemas.Me](../src/openapi/gateway.yaml)）。
- 实现路径：左栏每项由 `<RoleGuard allow={[...]}>` 包裹，与 §6.2 现有 `RoleGuard` 组件复用（不新增 RBAC 数据源、不在前端硬编码角色映射表）。
- 入口路由策略（§1.2 末段）不变：根路径 `/` 仍按 `me.roles` 重定向；多角色优先级 `admin > manager > lead > agent > requester`。
- **零契约硬门禁**：AppShell 显示用户名/角色仅消费 `Me.user_id / display_name / roles`，**不得**承诺 `avatar_url / email / org_name` 等 gateway.yaml 未定义字段；缺字段一律占位或隐藏 UI 元素，**严禁注入静态假数据**。

#### 2.3.3 视觉基线与红线

| 项 | 决定 | 红线 |
|---|---|---|
| 视觉北极星 | [Figma 四屏](https://www.figma.com/make/6yPmCGPfb6E4JT8YYmWpeN/Smartdesk-Web-Portal?preview-route=%2Fportal)：登录 / 门户 / 坐席工作台 / 管理后台 | 仅作设计规范 + 交互参照 |
| 营销/愿景图 | 谷歌生成图 | **不进入开发基线**，禁止据此设界面 |
| figma.com/**make** 产物 | AI 生成 React/CSS | **严禁照搬代码**；必须在既有 Next.js App Router + shadcn/ui + Radix + Tailwind + next-intl + TanStack Query 栈上**重写实现**、接真实契约。违者引入双套设计系统、破坏 SSR/i18n/契约绑定，按合入门禁驳回 |
| WCAG 合规 | AA | 新主色 / 浅灰说明文字 / 蓝底白字逐对经 axe-core + Lighthouse 实测，正文 4.5:1、大字/图形 3:1 过线方可合入，不凭观感 |

#### 2.3.4 P0 范围纪律（壳层、令牌、基础组件样式）

P0 改造的**唯一**变更面：

1. 新增/替换 AppShell（Sidebar + TopBar 布局组件，§6.2 新增条目）。
2. 收敛设计令牌：品牌蓝、浅灰工作区、白色内容卡、状态色、字阶、间距栅格（按 Figma 锁定，废弃粉/珊瑚 FAB）。
3. 基础组件视觉刷新：`Button / DataTable / StatusBadge / PriorityTag / EmptyState / Card` 等仅样式层调整。

**保留不动**（CTO 范围纪律）：

- 现有路由分组与深链（§2.4）、`(auth)` 全屏布局。
- 业务组件 `TicketQueue / TicketList / TicketDetailPanel / TransitionBar / SuggestionPanel / SimilarList` 的功能与数据流。
- `RoleGuard`、TanStack Query 数据层、`apiClient`、鉴权/刷新流（§3 / §4.1 / §4.7）。
- 工单八态、状态机 UI（§6.3）。

P0 实施清单与子任务派发归 SUP-270 子链（先拆后派），本 spec 仅冻结口径，不重复列任务。

#### 2.3.5 缺口与降级（右栏客户上下文）

- 坐席工作台「右栏 · 客户上下文 / 历史工单 / 满意度趋势」在 gateway.yaml 当前定稿中**无对应字段**（无 `requester_id` 透传，无按提单人过滤的工单查询参数，无 CSAT 聚合视图）。
- P0 处理：右栏**只落视觉骨架**（卡片占位 + 「待接入」空态），**严禁假数据**。
- 解阻塞依赖 [SUP-280](mention://issue/43b84fd4-5dbb-40a0-b520-b3677777d0a9)：gateway 透 `requester_id` + 历史工单按 requester 过滤的契约扩展，梁栋批准 → 秦诺 `api-contract-check` 通过 → 前端再实装数据接入。
- 数据看板图表骨架按 SUP-270 归 **P1**，不进 06-18 必达窗口。

#### 2.3.6 与契约的一致性结论（架构确认）

- 本节描述的 IA 仅消费 `GET /auth/me` 返回的 `Me.{user_id, display_name, roles}`，未引入超出 `gateway.yaml` 的字段承诺。
- 右栏客户上下文、数据看板按 requester 维度的聚合视图属契约缺口，已明确走 SUP-280 解决，不在 P0 落地实数据。
- 经逐项核对，**IA 与现有契约不冲突**；spec 与 SUP-270 当前定稿一致。

### 2.4 路由分组与守卫

| 路由组 | 路径示例 | 布局 | 守卫角色 |
|---|---|---|---|
| `(auth)` | `/login` | 全屏居中（**不套 AppShell**） | 公开 |
| `(portal)` | `/portal`, `/portal/tickets`, `/portal/tickets/[id]` | 全局 AppShell + 宽屏响应式栅格（主列表单 + 次列非阻塞信息） | `requester`+（登录用户） |
| `(desk)` | `/desk`, `/desk/tickets/[id]` | 全局 AppShell + 工作台三栏（左队列 / 中详情 / 右上下文骨架，≥1280px） | `agent`, `lead` |
| `(admin)` | `/admin/categories`, `/admin/users`, `/admin/sla-policies`, `/admin/notification-policies` | 全局 AppShell + 表格内容（P0 只读零契约，搜索/过滤/编辑单独立项） | `admin` |
| `(dashboard)` | `/dashboard`, `/dashboard/[metric]` | 全局 AppShell + 顶栏筛选 + 图表网格 | `manager`, `lead`（只读） |

**响应式**：

- `<1280px`：左栏自动折叠为图标态（64px）；坐席工作台「中详情 / 右上下文」退化为列表→详情全屏导航（保留深链 `/desk/tickets/[id]`）。
- `<768px`：左栏隐藏为抽屉式（TopBar 触发），AppShell 自身仍生效。

---

## 3. 数据/存储（本模块归属）

web **无业务数据库**。仅以下客户端侧存储：

| 存储 | 介质 | 内容 | TTL/策略 |
|---|---|---|---|
| 访问令牌 | `sessionStorage`（优先）或内存 | `access_token` | 随 `expires_in`；不落 `localStorage`（降低 XSS 持久化风险） |
| 刷新令牌 | **HttpOnly Cookie**（gateway `Set-Cookie; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`；Next.js `rewrites` 同源代理，**OQ-W2 架构裁定方案 A**） | `refresh_token` | 登出清除；刷新失败→强制重登 |
| 用户快照 | TanStack Query 缓存 | `GET /auth/me` 响应 | staleTime 5min；登出 invalidate |
| UI 偏好 | `localStorage` | 列宽、主题、最近筛选 | 非敏感；可清除 |
| 草稿 | `sessionStorage` | 提单未提交草稿 | 会话级 |

> **安全**：不在前端存储密码、service-jwt、完整审计日志。附件下载走 gateway 302 短时签名 URL，不缓存 blob 到持久存储。

---

## 4. API/契约对齐（gateway BFF）

> 契约文件：[`src/openapi/gateway.yaml`](../src/openapi/gateway.yaml)。web **不得**引用 core.yaml / insight.yaml 生成客户端。

### 4.1 认证（§8 前端鉴权体验）

| Path | 方法 | WEB 模块 | 页面/组件 | 前端行为 |
|---|---|---|---|---|
| `/auth/login` | POST | 全局 | `LoginForm` | 提交 username/password；成功存 TokenPair→跳转角色首页；401 统一文案；429 展示限流提示 |
| `/auth/refresh` | POST | `lib/auth` | — | access 将过期前 60s 静默刷新；401→清会话→`/login?expired=1` |
| `/auth/logout` | POST | 全局 | `UserMenu` | 调登出→清缓存→`/login` |
| `/auth/me` | GET | 全局 | `AuthProvider` | 启动时恢复会话；驱动路由守卫与 `RoleGuard` |

**鉴权 UX 细则（系统详设 §8）**：

1. **401 未认证/过期**：apiClient 拦截→尝试 refresh 一次→仍失败则全局跳转登录，保留 `returnUrl`。
2. **403 越权**：不跳转登录；页面内 `ForbiddenPanel`（「无权访问」）+ 可选返回首页；**不**尝试重试。
3. **429 限流**：Toast + 禁用提交按钮冷却（登录 60s、提单 5s）。
4. **RBAC 前置**：按钮级 `can('ticket:transition')` 与路由级双检；requester 不渲染内部备注 Tab；manager 不渲染工单编辑/流转按钮。
5. **审计友好**：403 页面不泄露资源是否存在（与 gateway 统一）。

### 4.2 工单（WEB-1 / WEB-2）

| Path | 方法 | 角色 | 页面/组件 | 备注 |
|---|---|---|---|---|
| `/tickets` | POST | requester+ | `CreateTicketWizard` | 带 `Idempotency-Key`；201 跳转详情；附件先 `POST .../attachments` 再引用 `attachment_ids` |
| `/tickets` | GET | 全员（范围由 gateway 收敛） | `TicketList` / `MyTickets` / `AgentQueue` | 分页 `page/page_size`；筛选 status/priority/q |
| `/tickets/{id}` | GET | 全员 | `TicketDetail` | 主体同步加载；`suggestion`/`similar` **不**阻塞首屏（D2） |
| `/tickets/{id}` | PATCH | agent+ | `TicketEditForm` | manager 无 UI 入口（越权 403 红线） |
| `/tickets/{id}/transitions` | POST | agent+, requester（close/reopen） | `TransitionBar` | XState 驱动可用 action；409 展示非法跃迁原因 |
| `/tickets/{id}/assignments` | POST | lead+ | `AssignDialog` | manual/reassign/escalate |
| `/tickets/{id}/sla` | GET | agent+, requester（自己的） | `SlaBadge` | 临近/超时高亮 |
| `/tickets/{id}/timeline` | GET | 全员 | `TimelinePanel` | 分页加载 |
| `/tickets/{id}/csat` | GET/POST | requester | `CsatDialog` | resolved/closed 后可评；409 非可评状态 |

### 4.3 评论与附件（WEB-1 / WEB-2）

| Path | 方法 | 角色 | 组件 | 备注 |
|---|---|---|---|---|
| `/tickets/{id}/comments` | GET | 全员 | `CommentThread` | requester 只见 `visibility=public`（gateway 过滤） |
| `/tickets/{id}/comments` | POST | requester, agent+ | `CommentEditor` | internal 仅 agent/lead/manager；支持 @mentions |
| `/tickets/{id}/attachments` | GET/POST | 全员 | `AttachmentList`, `AttachmentUploader` | ≤20MB 白名单；413/422 友好提示 |
| `/attachments/{attId}/download` | GET | 全员 | `AttachmentItem` | 跟随 302；越权 403 |

### 4.4 智能分析（WEB-2 / WEB-4，M3）

| Path | 方法 | 角色 | 组件 | 备注 |
|---|---|---|---|---|
| `/tickets/{id}/similar` | GET | agent+ | `SimilarTickets` | **懒加载**；失败 EmptyState，不阻塞详情 |
| `/tickets/{id}/suggestion` | GET | agent+ | `SuggestionPanel` | 读 core 字段投影；置信度展示 |
| `/tickets/{id}/suggestion` | POST | agent+ | `SuggestionPanel` | 采纳/纠偏 |
| `/stats` | GET | manager, lead | `StatsChartGrid` | metric/group_by/interval/from/to |
| `/stats/export` | GET | manager, lead | `ExportButton` | 下载 CSV blob |

### 4.5 通知（WEB-1 / WEB-2）

| Path | 方法 | 组件 | 备注 |
|---|---|---|---|
| `/notifications` | GET | `NotificationBell`, `NotificationDrawer` | `unread_only`；轮询 30s（M2）；后续 SSE 预留 |
| `/notifications/{notifId}/read` | POST | 同上 | 点击标记已读 |

### 4.6 管理后台（WEB-3）

| Path | 方法 | 页面 | 备注 |
|---|---|---|---|
| `/admin/categories` | GET/POST | `CategoriesPage` | 树形编辑 |
| `/admin/sla-policies` | GET/PUT | `SlaPoliciesPage` | 表单校验 targets |
| `/admin/users` | GET/POST | `UsersPage` | 分页；创建用户授角色 |
| `/admin/notification-policies` | GET/PUT | `NotificationPoliciesPage` | 矩阵编辑 inapp/email |

### 4.7 apiClient 横切约定

```typescript
// 所有写操作可选注入（提单/流转）
headers['Idempotency-Key'] = crypto.randomUUID();

// 错误归一化
interface ApiError { code: string; message: string; trace_id?: string }
// 401 → auth.refresh()；403 → throw ForbiddenError；409 → 业务提示；429 → RateLimitError
```

**契约校验**：CI 跑 `openapi-typescript` 生成 `src/types/gateway.d.ts`；PR 变更 gateway.yaml 时同步 regen；`api-contract-check` 技能抽检关键 path 的请求/响应形状。

---

## 5. 跨服务交互与降级

web **仅同步调用 gateway REST**，不订阅 NATS、不 WebSocket 直连 insight（M2）。

### 5.1 主流程（提单→关闭，系统详设 §9）

```
portal 提单 → POST /tickets → 201 展示工单号（AI 不阻塞）
desk 受理   → POST /transitions (accept→start→…)
desk 解决   → resolve → portal 通知 → requester close + CSAT
```

### 5.2 降级策略（前端职责）

| 场景 | 后端行为 | 前端 UX |
|---|---|---|
| insight 不可用 | 建单仍 201；suggestion/similar 空或 5xx | 详情正常；建议区「暂不可用」；相似区隐藏或骨架屏失败态 |
| similar 懒加载慢 | 独立 GET，不阻塞详情 | 骨架屏 + 超时 8s 提示重试 |
| stats 聚合延迟 | insight 读模型最终一致 | 看板展示 `generated_at`；手动刷新按钮 |
| 附件上传失败 | 413/422 | 行内错误，不丢表单其他字段 |
| 离线/网络错误 | — | TanStack Query 重试 2 次；全局离线横幅 |

### 5.3 实时性（M2 vs 后续）

| 数据 | M2 | 后续可选 |
|---|---|---|
| 通知 | 30s 轮询 `/notifications` | SSE/WebSocket（需 gateway 扩展，**不在本模块契约内**） |
| 看板 | 手动刷新 + 进入页 refetch | 60s 自动 refetch |
| 队列 | 聚焦窗口 refetch；操作后 invalidate | — |

---

## 6. 内部组件划分

### 6.1 目录结构（smartdesk-web）

```
smartdesk-web/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (portal)/portal/...
│   ├── (desk)/desk/...
│   ├── (admin)/admin/...
│   ├── (dashboard)/dashboard/...
│   ├── layout.tsx
│   └── middleware.ts          # JWT 存在性 + 路由角色
├── features/
│   ├── tickets/
│   ├── comments/
│   ├── attachments/
│   ├── insight/
│   ├── notifications/
│   ├── admin/
│   └── stats/
├── components/ui/             # shadcn 生成
├── lib/
│   ├── api/client.ts
│   ├── auth/
│   ├── rbac/
│   └── i18n/                  # WEB-5 预留
└── types/gateway.d.ts         # openapi-typescript 生成
```

### 6.2 核心组件清单

| 组件 | 所属 | 职责 |
|---|---|---|
| `AuthProvider` | lib/auth | 会话生命周期、me 查询 |
| `RoleGuard` | lib/rbac | 子树按角色渲染 |
| `TicketQueue` | features/tickets | 左栏列表+筛选+分页 |
| `TicketDetail` | features/tickets | 右栏详情容器 |
| `TransitionBar` | features/tickets | 八态操作按钮（XState） |
| `CommentThread` | features/comments | 公私评论分轨展示 |
| `SuggestionPanel` | features/insight | 建议展示+采纳 |
| `SimilarTickets` | features/insight | 懒加载相似列表 |
| `StatsChartGrid` | features/stats | 多 metric 图表 |
| `CategoryTree` | features/admin | 分类树 CRUD |
| `NotificationBell` | features/notifications | 未读角标+抽屉 |

### 6.3 状态机 UI（工单八态）

前端维护 **只读** 状态机表（与系统详设 §4.3 / gateway `TransitionRequest.action` 对齐），用于：

- 计算当前可用 `action` 按钮集（结合角色：requester 仅 close/reopen；agent 受理/流转；lead 含 cancel/suspend）
- 非法操作 **前置 disabled**，仍依赖服务端 409 最终裁决
- 状态中文映射表内置于 `lib/i18n/zh-CN/ticket.json`（WEB-5 外置）

---

## 7. 任务分解与里程碑

> 对齐系统详设 §12.1 WEB-1~5 与 §12.2 M2/M3/M4。

### 7.1 模块任务（WEB-1 ~ WEB-5）

| ID | 名称 | 交付物 | 依赖 |
|---|---|---|---|
| **WEB-0** | 脚手架 | Next.js 工程、Auth、apiClient、布局壳、CI | GW-1 登录可用 |
| **WEB-1** | 报单门户 | 提单向导、我的工单、详情、关闭/重开、CSAT | GW-3 `/tickets` POST/GET、CORE 建单 |
| **WEB-2** | 坐席工作台 | 队列+详情、流转、评论、附件、分派、SLA/时间线 | GW-3 全量 tickets 路径、CORE 状态机 |
| **WEB-3** | 管理后台 | 分类/SLA/用户/通知策略 CRUD | GW-3 `/admin/*`、CORE-C |
| **WEB-4** | 看板报表 | Stats 图表+筛选+CSV 导出 | GW-3 `/stats`、INS-5 |
| **WEB-5** | i18n 预留 | next-intl 接入、文案外置、默认 zh-CN | 可与 WEB-1 并行 |

### 7.2 迭代计划

| 迭代 | 范围 | 里程碑 |
|---|---|---|
| **Sprint 1** | WEB-0 + WEB-1 提单/我的工单 | M2 前半 |
| **Sprint 2** | WEB-2 队列+详情+流转+评论 | M2 闭环（配 INS-6 站内通知 UI） |
| **Sprint 3** | WEB-2 附件+分派+SLA；WEB-3 管理后台 | M2 收尾 |
| **Sprint 4** | WEB-4 看板；WEB-2 相似/建议懒加载 | M3 |
| **Sprint 5** | WEB-5 i18n；越权 E2E；性能与 a11y 加固 | M4 |

### 7.3 里程碑勾稽

| 里程碑 | web 交付 | 验收标准（摘要） |
|---|---|---|
| **M2 MVP** | WEB-0/1/2 + 通知铃铛 | US-2.1 提单；US-2.2 流转；US-7.1/7.2 三端主路径；提单→关闭 E2E；§10.3 单测覆盖率门禁 |
| **M3 智能增强** | WEB-4 + 建议/相似 UI | US-3.1~3.3；US-6.2 看板；§10.2 性能基线（列表 P95、懒加载超时）|
| **M4 加固/发布** | WEB-3 完善 + WEB-5 + 安全 E2E | US-1.2 越权红线全过（§10 附录 A）；Lighthouse 性能≥80 + a11y≥90（§10.2/10.4）；CSP/HTTPS 合规（§10.1）；OQ-10 合规预留入口 |

---

## 8. 依赖与阻塞

| 依赖项 | 提供方 | 阻塞影响 | 状态 |
|---|---|---|---|
| gateway.yaml 冻结 | 架构/关山 | 无法生成 API 类型 | ✅ 已冻结（D1–D5 裁定） |
| GW-1 认证可用 | 关山 | WEB-0 联调 | 🔄 MVP 已有，待稳定 |
| GW-3 BFF 聚合 | 关山 | WEB-1/2 详情/列表 | 🔄 stub 中，并行 mock |
| CORE 状态机/建单 | 石磊 | WEB-1/2 实联调 | in_review |
| INS-5 stats | 苏睿 | WEB-4 | M3 |
| INS-6 通知 | 杨达/苏睿 | 通知铃铛实数据 | M2 |

**解阻塞策略**：WEB-0~2 使用 MSW mock gateway 契约开发；契约 PR 合并后切真实 API。不修改 openapi 文件——契约变更走架构流程。

---

## 9. 开放事项

| # | 事项 | 建议 | 裁决方 | 优先级 |
|---|---|---|---|---|
| OQ-W1 | 多角色用户登录后默认落地页优先级 | ✅ **已裁定（梁栋 2026-06-15）**：采纳 §1.2 优先级表 `admin > manager > lead > agent > requester`；产品可配，一期默认即可。 | 产品/梁栋 | 低 |
| OQ-W2 | refresh_token 存储：跨域部署时 gateway 能否 Set-Cookie 同源代理 | ✅ **已裁定（梁栋 2026-06-15）**：**方案 A（冻结）**：web 通过 Next.js `rewrites`/`middleware` 将 `/api/v1/*` 同源反代至 gateway；`refresh_token` 由 gateway `Set-Cookie`（`HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`）；`access_token` 存内存或 `sessionStorage`（不落 `localStorage`）；**禁止**方案 B（sessionStorage 存 refresh）上生产。 | 架构梁栋 + 关山 | 高（已解） |
| OQ-W3 | lead「本组」范围一期是否简化为全 agent 可见 | ✅ **已裁定（梁栋 2026-06-15）**：一期跟随 gateway §4.4「全组可见」；web **不做**二次组过滤，仅渲染 gateway 收敛后的列表。 | 梁栋 | 中 |
| OQ-W4 | 通知实时性：M2 轮询间隔是否 30s | 可接受则 M2 不扩契约 | 产品 | 低 |
| OQ-W5 | 看板图表库（ECharts vs Recharts） | 团队偏好 Recharts（React 原生） | 前端内部 | 低 |

---

## 10. 验收标准规范基线（对齐 §10.3）

> 依据：[《AI 研发虚拟组织说明书》§10.3](AI研发虚拟组织说明书.md) 规范基线清单。  
> 本节声明 smartdesk-web 模块各质量维度适用的**业界技术规范基线**，供测试团队（严谨/武安）据此验收，质量管理（何明）核查动作到位。

### 10.1 安全基线

| 规范 | web 模块适用范围 | 验收要点 |
|---|---|---|
| **OWASP ASVS Level 1/2**（前端适用章节） | V1 架构安全、V2 认证、V3 会话管理、V5 校验/编码/转义、V6 密码/数据安全 | XSS：所有输出经 React/Next.js 框架转义（禁用 `dangerouslySetInnerHTML`）；CSRF：JWT Bearer 不含 Cookie 时免疫，若 HttpOnly Cookie 须加 SameSite=Strict |
| **OWASP Top 10（前端视角）** | A01 访问控制、A03 注入（DOM XSS）、A07 认证失效、A09 组件漏洞 | 路由守卫 + 按钮级 `RoleGuard` 双检；CSP 响应头（`Content-Security-Policy: default-src 'self'`）；依赖无高危 CVE（`npm audit` CI 门禁）|
| **JWT 安全（RFC 8725）** | `access_token` 存取策略 | 不存 `localStorage`（XSS 持久化风险）；`sessionStorage` 或内存；refresh token 走 HttpOnly Cookie 或 sessionStorage（OQ-W2 待架构裁决，见 §9）|
| **CSP / HTTPS** | 内容安全策略 | 生产环境强制 HTTPS；CSP 头拒绝 inline-script；Subresource Integrity（外部 CDN 资产）|

### 10.2 性能基线

| 指标 | 目标值 | 测试场景 | 对齐系统详设 |
|---|---|---|---|
| 首屏加载（P95，3G Fast 模拟） | ≤ 3s（LCP） | Playwright + Lighthouse CI，核心三端入口页 | 系统详设 §10 NFR |
| 工单列表渲染（P95） | ≤ 500ms | 100 条分页数据 | 系统详设 §10 "列表/详情 P95<500ms" |
| 相似票懒加载（P95） | ≤ 8s（含超时重试 UI） | 详情页 `/similar` 独立 GET，不阻塞主体 | D2 契约裁定；§5.2 |
| Lighthouse 性能评分 | ≥ 80（M4 目标） | CI Lighthouse，三端代表页 | §7.3 M4 验收 |
| Bundle 分包 | 每路由组 JS ≤ 200kB（gzip） | `next build` 分析报告 | — |

### 10.3 可用性与降级基线

| 场景 | 降级行为 | 验收要求 |
|---|---|---|
| insight 不可用 | 建单 201 正常；suggestion/similar 展示"暂不可用"，不阻塞详情 | E2E：mock insight 5xx，断言详情页主体可用 |
| 网络离线 | 全局离线横幅；TanStack Query 自动重试 2 次（退避）；操作失败 Toast | Playwright 拦截 network，断言横幅可见 |
| gateway 慢响应（>3s） | 骨架屏 + 超时提示；用户可手动刷新 | 测试：延迟注入 3.5s，断言骨架屏展示 |
| 令牌刷新失败 | 清会话→`/login?expired=1`（保留 `returnUrl`）| E2E：模拟 refresh 401，断言登录页 returnUrl 参数 |

### 10.4 代码质量基线

| 维度 | 工具/规范 | 门禁 |
|---|---|---|
| 单元/组件测试覆盖率 | Vitest + Testing Library | 核心业务逻辑（auth/rbac/apiClient/状态机）分支覆盖 ≥ 80%；PR 不得降低覆盖率 |
| E2E 测试 | Playwright | 附录 A 越权红线全过；M2 提单→关闭主路径全过 |
| 静态分析 / Lint | ESLint（Next.js 规则集）+ TypeScript strict | CI 零严重告警（`error` 级）；`warn` 须有 suppression 注释 |
| 无障碍（a11y） | `axe-core`（集成 Testing Library）/ Lighthouse a11y | Lighthouse a11y 评分 ≥ 90（M4）；关键交互元素有 ARIA 标签 |
| 依赖安全 | `npm audit --audit-level=high` | CI 门禁：高危/严重漏洞不得合入（须有 workaround 或升级） |
| OpenAPI 类型同步 | `openapi-typescript` + `api-contract-check` 技能 | gateway.yaml 变更时同步 regen `types/gateway.d.ts`；契约抽检通过 |

---

## 11. P4 实现状态同步

> 同步时间：2026-06-17。代码依据：主仓 `src/smartdesk-web` submodule 已从 `smartdesk-web@3748df5` 推进到 `smartdesk-web@9ed0d0b`，本轮在该工作树内补 `src/app/api/healthz/route.ts`，并修复 `AuthProvider` 会话快照不再写入 `localStorage`。系统详设与 gateway OpenAPI 仍为事实源，本文不因当前 MVP 代码降低冻结设计目标。

### 11.1 实现状态摘要

| 范围 | 状态 | 当前实现证据 | 结论 |
|---|---|---|---|
| WEB-0 脚手架 | ⚠️ gap | `package.json`、`tsconfig.json`、`next.config.mjs`、`src/app/layout.tsx`、`src/components/AuthProvider.tsx`、`src/lib/api.ts`、`src/app/api/healthz/route.ts` | 工程与基础认证/API 已有，`/healthz` 已补；仍缺 OpenAPI 类型生成、middleware、RBAC、TanStack Query、CI。 |
| WEB-1 报单门户 | ⚠️ gap | `src/app/login/page.tsx`、`src/app/portal/page.tsx`、`src/app/portal/new/page.tsx`、`src/app/portal/[id]/page.tsx`、`src/components/TicketDetailPanel.tsx` | 登录、提单、列表、详情、close/reopen 基础可演示；CSAT、通知、附件、幂等、表单校验未达详设。 |
| WEB-2 坐席工作台 | ⚠️ drift | `src/app/agent/page.tsx`、`src/components/TicketList.tsx`、`src/components/TicketDetailPanel.tsx` | 队列/详情/状态/评论/时间线 MVP 已有，但路由为 `/agent`，与冻结设计 `/desk` 不一致；附件、分派、SLA、AI 建议/相似仍缺。 |
| WEB-3 管理后台 | ❌ gap | 无 `/admin/*` 页面 | 需待 gateway `/admin/*` 稳定后实现。 |
| WEB-4 看板报表 | ❌ gap | 无 `/dashboard` 页面或 stats 组件 | 依赖 INS-5 stats 与 gateway `/stats`。 |
| WEB-5 i18n | ❌ gap | `src/lib/types.ts` 与 TSX 页面中文硬编码 | 未接 i18n 框架，文案未外置。 |
| 测试与质量 | ⚠️ gap | `src/lib/__tests__/auth.test.ts`、`src/lib/__tests__/api.test.ts` | auth/api 回归测试已有；缺 Playwright、Lighthouse、覆盖率与 CI 门禁。 |

### 11.2 已在本轮闭环的 web 本域 gap

| 项 | 对应任务 | 变更 | 状态 |
|---|---|---|---|
| 健康检查 | T-00-9 | 新增 `src/app/api/healthz/route.ts`，返回静态 `{ "status": "ok" }` | 已闭环；`next build` 通过，`next start` 下 `GET /api/healthz` 返回 200 |
| OQ-W2 会话快照一致性 | T-00-4 / §3 存储 | `AuthProvider.refreshMe()` 改用 `saveMeSnapshot()`，避免 `sd_me` 写入 `localStorage`；新增单测覆盖 | 已闭环；`npm test` 17/17 通过 |

### 11.3 不能在本轮闭环的 gap 与依赖

| gap | 后续任务 | 依赖/说明 |
|---|---|---|
| OpenAPI 类型生成与契约检查 | 补 T-00-3 / T-00-8 | 使用 `gateway.yaml` 生成 `types/gateway.d.ts`，并在 CI 校验生成结果；不改 OpenAPI。 |
| 路由守卫、RBAC、QueryProvider | 补 T-00-4~T-00-7 | 先补 `can()`/`RoleGuard`，再迁移页面；避免只靠 UI 隐藏。 |
| `/agent` → `/desk` 路由漂移 | 改代码 | 建议保留 `/agent` 临时重定向到 `/desk`，主实现迁到 `/desk`，并修正多角色首页优先级。 |
| WEB-1 附件/CSAT/通知/幂等 | 补 T-01-2 / T-01-6~T-01-8 | gateway 对应路径已在契约中；真实联调需关山确认 stub/实现稳定。 |
| WEB-2 附件/分派/SLA/AI | 补 T-02-4~T-02-9 | 分派/SLA 依赖 gateway 聚合；AI 建议/相似属 M3，依赖 insight/core 写回链路。 |
| WEB-3 管理后台 | 补 T-03-1~T-03-4 | 依赖 gateway `/admin/*` 与 core 权威配置能力稳定。 |
| WEB-4 看板 | 补 T-04-1~T-04-3 | 依赖 INS-5 stats 与 gateway `/stats`/`/stats/export`。 |
| WEB-5 i18n | 补 T-05-1~T-05-2 | 不依赖后端，可与页面补齐并行；需统一文案抽取口径。 |
| Playwright/Lighthouse/CI | 补 T-QA-2~T-QA-5 | 需要稳定路由与 mock/真实 API 环境后落地。 |

### 11.4 drift 裁决状态

| drift | 建议动作 | 是否需架构裁决 |
|---|---|---|
| `/agent` 与冻结 `/desk` 不一致 | 改代码到 `/desk`，`/agent` 仅作为兼容重定向（如产品仍需要旧入口再提裁决） | 否 |
| `homePathForRoles()` 未按 `admin > manager > lead > agent > requester` 路由 | 改代码，与 OQ-W1 已裁决优先级对齐 | 否 |
| 手写 API 类型未绑定 gateway OpenAPI | 改代码，接 `openapi-typescript` 生成与 CI 检查 | 否 |
| 目录未按 `features/*`/`lib/rbac/*`/`lib/api/client.ts` 分层 | 后续功能开发时渐进迁移，避免单独大改影响 MVP | 否 |
| UI 技术栈缺 shadcn/Radix、TanStack Query、RHF/Zod、XState | 按原详设补实现；若团队决定换栈，需前端 committer 发起设计变更 | 仅换栈时需要 |

---

## 附录 A：越权红线 E2E 用例（必过）

| 用例 | 操作 | 期望 |
|---|---|---|
| R-01 | requester 访问 `/admin` | 403 或重定向+ForbiddenPanel |
| R-02 | requester 打开他人工单 deep link | 403 |
| R-03 | requester 评论 API 不展示 internal | 列表无 internal |
| R-04 | manager PATCH 工单 | UI 无入口；强制 API 403 |
| R-05 | requester 下载他人附件 | 403 |

---

## 附录 B：追溯

| 系统详设章节 | 本文落地 |
|---|---|
| §2.1 三端 UI | §1.2、§2.3 |
| §8 鉴权与 RBAC | §4.1、§6.2 AuthProvider/RoleGuard |
| §9 降级 | §5.2 |
| §12.1 WEB-1~5 | §7.1 |
| §12.2 M2/M3/M4 | §7.3 |
| gateway BFF 契约 | §4 全表 |
