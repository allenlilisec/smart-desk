# smartdesk-web 实现任务清单（tasks.md）

**版本**：v1.0（P3 任务分解）　|　**日期**：2026-06-15
**编制**：江颜（前端开发 Leader）　|　**Issue**：SUP-114
**输入**：[web子系统详细设计与实现说明书.md](../../web子系统详细设计与实现说明书.md)（main 最新冻结版，含 OQ-W1/W2/W3 架构裁决）
**契约依据**：[`src/openapi/gateway.yaml`](../../../../src/openapi/gateway.yaml)（v1.0.1，已冻结）

---

## 一、done/gap/drift 清单（P4 同步，2026-06-17）

> 口径：本轮已初始化 `src/smartdesk-web` submodule，实际代码从 `smartdesk-web@3748df5` 评估并推进到 `smartdesk-web@9ed0d0b`（补 `/healthz` 与 OQ-W2 会话快照修复）。旧版“空目录/全量 gap”结论已失效。
>
> 状态含义：`done`=当前代码满足该任务核心验收；`gap`=未实现或仅 MVP 子集；`drift`=已有实现与冻结详设/路由/契约形态不一致，需改代码或提架构裁决。

### 1.1 模块汇总

| 模块 | 详设预期 | 当前实现 | 初判 | 处置 |
|---|---|---|---|---|
| WEB-0 脚手架 | Next.js 工程、Auth、apiClient、布局壳、CI、`/healthz` | Next.js 工程、Tailwind、AuthProvider、apiClient、mock、单测已存在；本轮补 `app/api/healthz/route.ts` | ⚠️ gap | 保留工程；补 CI、OpenAPI 类型生成、middleware/RBAC/QueryProvider |
| WEB-1 报单门户 | 登录、提单、我的工单、详情、关闭/重开、CSAT、通知、附件 | `/login`、`/portal`、`/portal/new`、`/portal/[id]` 基础流已存在 | ⚠️ gap | MVP 可演示；CSAT/通知/附件/幂等与表单校验另列后续 |
| WEB-2 坐席工作台 | `/desk` 队列+详情+流转+评论/内部备注+附件+分派+SLA/时间线+AI | `/agent` 队列、详情、状态按钮、评论/内部备注、时间线基础版 | ⚠️ drift | 路由与详设不一致；建议改代码到 `/desk`，并补 lead+/附件/SLA/AI |
| WEB-3 管理后台 | 分类/SLA/用户/通知策略 CRUD | 未实现 `/admin/*` | ❌ gap | 依赖 gateway `/admin/*` 稳定后实现 |
| WEB-4 看板报表 | `/dashboard` stats 图表、筛选、CSV | 未实现 | ❌ gap | 依赖 INS-5 stats 与 gateway `/stats` |
| WEB-5 i18n 预留 | next-intl + zh-CN 文案外置 | 文案硬编码在 TSX/常量，未接 i18n | ❌ gap | M4 前补 next-intl 或同等框架 |
| 测试与质量 | Vitest、Playwright、Lighthouse、audit、OpenAPI regen | Vitest 覆盖 auth/api；无 E2E/CI/Lighthouse | ⚠️ gap | 保留现有单测；补 E2E/CI/覆盖率门禁 |

### 1.2 任务级追溯矩阵

| 任务 ID | P4 状态 | 当前代码位置 | 差异/处置 |
|---|---|---|---|
| T-00-1 | ✅ done | `src/smartdesk-web/package.json`, `tsconfig.json`, `next.config.mjs`, `src/app/layout.tsx` | Next.js 工程已存在。 |
| T-00-2 | ⚠️ gap | `tailwind.config.ts`, `src/components/ui.tsx` | Tailwind 与基础 UI 有；未见 shadcn/Radix 依赖与生成目录。 |
| T-00-3 | ❌ gap | `src/lib/api.ts`, `src/lib/types.ts` | apiClient 为手写类型；缺 `openapi-typescript` 生成、`types/gateway.d.ts` 与一致性脚本。 |
| T-00-4 | ⚠️ gap | `src/components/AuthProvider.tsx`, `src/lib/auth.ts`, `src/lib/api.ts` | token/session 与 refresh 基础存在；缺 middleware 路由守卫与 refresh queue。本轮修复 `me` 不再写 `localStorage`。 |
| T-00-5 | ❌ gap | 无 | 缺 `can()`、`usePermission`、`RoleGuard`；当前仅按页面模式隐藏部分 UI。 |
| T-00-6 | ❌ gap | 无 | 未接 TanStack Query，页面直接 `useEffect` 调 api。 |
| T-00-7 | ⚠️ drift | `src/app/login/page.tsx`, `src/app/portal/*`, `src/app/agent/page.tsx`, `src/lib/auth.ts` | 仅有 `/login`、`/portal`、`/agent`；详设要求 `/desk`、`/admin`、`/dashboard` 与多角色优先级。 |
| T-00-8 | ❌ gap | 无 `.github/workflows` | 缺 CI、lint/typecheck/audit/openapi regen 门禁。 |
| T-00-9 | ✅ done | `src/app/api/healthz/route.ts` | 本轮补静态 200 JSON 健康检查。 |
| T-01-1 | ⚠️ gap | `src/app/login/page.tsx`, `src/components/AppShell.tsx`, `src/lib/api.ts` | 登录/登出基础存在；缺 403/429 统一 UX、限流冷却与 returnUrl。 |
| T-01-2 | ⚠️ gap | `src/app/portal/new/page.tsx`, `src/lib/api.ts` | 基础提单存在；缺 Idempotency-Key、附件先上传、RHF/Zod 契约校验。 |
| T-01-3 | ⚠️ gap | `src/app/portal/page.tsx`, `src/components/TicketList.tsx` | 我的工单与 status 筛选存在；缺分页、priority/q 筛选。 |
| T-01-4 | ⚠️ gap | `src/app/portal/[id]/page.tsx`, `src/components/TicketDetailPanel.tsx` | 详情主体存在；未实现建议/相似懒加载降级、骨架屏与 portal 专属 Tab 约束。 |
| T-01-5 | ⚠️ gap | `src/components/TicketDetailPanel.tsx`, `src/lib/types.ts` | requester close/reopen 有基础按钮；缺 XState 只读状态机、409 原因展示。 |
| T-01-6 | ❌ gap | 无 | CSAT GET/POST 未实现。 |
| T-01-7 | ❌ gap | 无 | NotificationBell/Drawer 未实现。 |
| T-01-8 | ❌ gap | 无 | AttachmentList/下载与上传错误 UX 未实现。 |
| T-02-1 | ⚠️ drift | `src/app/agent/page.tsx`, `src/components/TicketList.tsx` | 队列+左右分栏基础存在，但路由为 `/agent`，详设为 `/desk`；缺深链 `/desk/tickets/[id]`。 |
| T-02-2 | ⚠️ gap | `src/components/TicketDetailPanel.tsx` | agent 状态按钮基础存在；缺 lead+ cancel、完整八态、XState、409 原因。 |
| T-02-3 | ⚠️ gap | `src/components/TicketDetailPanel.tsx`, `src/lib/api.ts` | 评论/内部备注基础存在；缺 @mentions 与专用组件拆分。 |
| T-02-4 | ❌ gap | 无 | 附件上传/管理未实现。 |
| T-02-5 | ❌ gap | 无 | 分派/改派/升级对话框未实现。 |
| T-02-6 | ❌ gap | `src/lib/types.ts` 仅有 `SlaView` 类型 | 缺 `SlaBadge` 与 SLA 展示。 |
| T-02-7 | ⚠️ gap | `src/components/TicketDetailPanel.tsx`, `src/lib/api.ts` | 时间线基础展示存在；缺分页加载。 |
| T-02-8 | ❌ gap | 无 | SimilarTickets 未实现。 |
| T-02-9 | ❌ gap | 无 | SuggestionPanel 未实现。 |
| T-03-1 | ❌ gap | 无 | 分类树 CRUD 未实现。 |
| T-03-2 | ❌ gap | 无 | SLA 策略页未实现。 |
| T-03-3 | ❌ gap | 无 | 用户/角色管理未实现。 |
| T-03-4 | ❌ gap | 无 | 通知策略页未实现。 |
| T-04-1 | ❌ gap | 无 | Stats 图表未实现。 |
| T-04-2 | ❌ gap | 无 | Stats 筛选未实现。 |
| T-04-3 | ❌ gap | 无 | CSV 导出未实现。 |
| T-05-1 | ❌ gap | 无 | next-intl/i18n 架构未实现。 |
| T-05-2 | ❌ gap | `src/lib/types.ts`, TSX 页面文案 | zh-CN 文案仍硬编码，未外置 JSON。 |
| T-QA-1 | ⚠️ gap | `src/lib/__tests__/auth.test.ts`, `src/lib/__tests__/api.test.ts` | auth/api 单测存在；缺 rbac、状态机、组件覆盖与覆盖率门禁。 |
| T-QA-2 | ❌ gap | 无 | Playwright 越权红线未实现。 |
| T-QA-3 | ❌ gap | 无 | 提单→关闭 E2E 未实现。 |
| T-QA-4 | ❌ gap | 无 | 降级场景 E2E 未实现。 |
| T-QA-5 | ❌ gap | 无 | Lighthouse CI 与 audit 门禁未实现。 |

### 1.3 drift 与裁决建议

| drift | 当前差异 | 建议 |
|---|---|---|
| 路由命名 | 实现为 `/agent`，详设和系统详设为 `/desk`；`homePathForRoles()` 也将 admin/manager 导向 `/agent` | **改代码**：保留兼容重定向可选，主入口迁移到 `/desk`；同时补 `/admin`、`/dashboard`。无需架构裁决。 |
| 契约消费 | 实现用手写 `src/lib/types.ts` + `fetch`，未由 `gateway.yaml` 生成类型 | **改代码**：补 openapi-typescript 生成与 CI 检查；不修改 OpenAPI。 |
| 目录结构 | 实现扁平 `components/` + app 页面，详设要求 `features/*`、`lib/api/client.ts`、`lib/rbac/*` | **改代码**：随 WEB-1/2 后续补功能时渐进迁移，不单独大重构。 |
| i18n | 详设要求文案外置；实现硬编码中文 | **改代码**：WEB-5 接 next-intl 或同等方案。 |
| UI/数据请求技术栈 | 详设为 shadcn/Radix、TanStack Query、RHF/Zod、XState；当前均未接入 | **改代码**：属于 P4/P5 后续实现缺口，不需架构裁决。 |

---

## 二、跨模块契约依赖

| 依赖项 | 提供方 | 阻塞任务 | 状态 |
|---|---|---|---|
| `gateway.yaml` 冻结 | 架构 / 关山 | 全量（类型生成 T-00-3） | ✅ 已冻结 v1.0.1 |
| GW-1 认证 API 可用（`/auth/login /refresh /logout /me`） | 关山（gateway 开发） | T-00-4 联调 / T-01-1 联调 | 🔄 stub 可用，待稳定 |
| GW-3 BFF 聚合（`/tickets/*` 全量路径） | 关山 | T-01-2~T-01-8、T-02-1~T-02-7 实联调 | 🔄 stub 中，并行 mock |
| CORE 状态机/建单可调用 | 石磊（core 开发） | T-01-2 实联调、T-02-2 实联调 | 🔄 in_review |
| INS-5 stats 聚合 | 苏睿（insight 开发） | T-04-1~T-04-3（M3） | ⚠️ M3 待 |
| INS-6 通知写回 | 杨达/苏睿 | T-01-7 通知铃铛实数据 | ⚠️ M2 待 |
| gateway `Set-Cookie HttpOnly`（OQ-W2 方案 A） | 关山 | T-00-4 refresh token 落地 | ✅ 架构梁栋裁定，待关山实现 |

> **解阻塞策略**：WEB-0~2 全程使用 MSW mock gateway 契约进行开发；gateway stub 合并后切真实 API。契约变更须走架构评审，前端不修改 openapi 文件。

---

## 三、依赖拓扑

```
T-00（WEB-0 脚手架）
│
├─── T-01（WEB-1 报单门户）  ←─ Sprint 1-2 / M2
│      └─── [共享 lib/auth、lib/rbac、apiClient]
│
├─── T-02（WEB-2 坐席工作台）  ←─ Sprint 2-3 / M2
│      ├─── 依赖 WEB-0 全量
│      ├─── 部分依赖 WEB-1 共享组件（TicketDetail、AttachmentList）
│      └─── T-02-8/T-02-9（建议/相似）←─ Sprint 4 / M3
│
├─── T-03（WEB-3 管理后台）  ←─ Sprint 3 / M2 收尾
│
├─── T-04（WEB-4 看板报表）  ←─ Sprint 4 / M3，需 INS-5
│
├─── T-05（WEB-5 i18n 预留）  ←─ 可与 WEB-1 并行，Sprint 5 / M4
│
└─── T-QA（测试与质量）  ←─ 贯穿全程，M2-M4 分阶交付
```

---

## 四、任务详单

### WEB-0：脚手架（Scaffold）—— Sprint 1 前置，M2

> **验收**：`next build` 通过；CI 绿（ESLint zero error / TS strict / npm audit）；`/healthz` 200。  
> **前置**：gateway.yaml 冻结（✅），无其他阻塞。  
> 所有 WEB-1~5 均依赖 WEB-0 完成。

| 任务 ID | 任务名 | 交付物 | 详设参考 |
|---|---|---|---|
| T-00-1 | Next.js 14+ App Router 工程初始化 | package.json / tsconfig.json / next.config.ts / app/layout.tsx | §1.3 / §2.1 |
| T-00-2 | shadcn/ui + Radix + Tailwind CSS 配置 | tailwind.config / components/ui 骨架 | §2.1 |
| T-00-3 | apiClient + openapi-typescript 类型生成 | lib/api/client.ts / types/gateway.d.ts / CI 生成脚本（`openapi-ts --input gateway.yaml`） | §2.1 / §4.7 |
| T-00-4 | AuthProvider + token 存取 + RefreshQueue + middleware 路由守卫 | lib/auth/\* / app/middleware.ts（JWT 存在性+角色守卫） | §2.2 / §3 / §4.1（OQ-W2 方案 A：refresh=HttpOnly Cookie，access=sessionStorage） |
| T-00-5 | RBAC 框架（can() / usePermission hook / RoleGuard 组件） | lib/rbac/\* | §2.2 / §4.1 §6.2 |
| T-00-6 | TanStack Query v5 集成（QueryClientProvider + 错误重试策略） | lib/hooks/\* 骨架 / QueryProvider | §2.1 / §5.2 |
| T-00-7 | 路由骨架：5 Route Groups 布局壳 + 根路径重定向逻辑 | app/(auth)/(portal)/(desk)/(admin)/(dashboard) layout.tsx（OQ-W1：admin>manager>lead>agent>requester） | §2.3 / §1.2 |
| T-00-8 | CI 门禁配置 | .github/workflows/ci.yml（ESLint / TS / npm audit / openapi-typescript regen 检查） | §10.4 |
| T-00-9 | 健康检查路由 | app/api/healthz/route.ts（200 静态响应，不鉴权） | §1.3 |

### WEB-1：报单门户（Portal）—— Sprint 1-2，M2

> **验收**：US-2.1 提单 E2E 通过；提单→201+跳转；CSAT+关闭主路径；R-01~R-03 越权红线。  
> **前置**：WEB-0（T-00-1~T-00-7 全部）。  
> **阻塞说明**：T-01-1~T-01-3 可 MSW mock 开发；GW-1 稳定后切实 API。

| 任务 ID | 任务名 | 交付物 | 详设参考 |
|---|---|---|---|
| T-01-1 | 登录页（LoginForm）+ 登出（UserMenu）+ 401/403/429 统一 UX | app/(auth)/login/page.tsx / features/auth/LoginForm.tsx（429 限流冷却 60s） | §4.1 |
| T-01-2 | 提单向导（CreateTicketWizard）—— 带 Idempotency-Key、附件先上传再引用 | features/tickets/CreateTicketWizard.tsx（Zod 校验 + RHF） | §4.2 POST /tickets |
| T-01-3 | 我的工单列表（MyTickets）—— 分页+筛选（status/priority/q） | app/(portal)/portal/page.tsx + features/tickets/MyTickets.tsx | §4.2 GET /tickets |
| T-01-4 | 工单详情（TicketDetail for portal）—— 主体同步；建议/相似不阻塞首屏 | features/tickets/TicketDetail.tsx（portal 视角：无 internal 备注 Tab；骨架屏） | §4.2 GET /tickets/{id} |
| T-01-5 | 确认关闭 / 重开操作（TransitionBar - requester 子集） | features/tickets/TransitionBar.tsx（XState 只读表：requester 仅 close/reopen；409 展示原因） | §4.2 POST /transitions / §6.3 |
| T-01-6 | CSAT 评价（CsatDialog） | features/tickets/CsatDialog.tsx（resolved/closed 后可评；409 非可评状态提示） | §4.2 GET/POST /csat |
| T-01-7 | 站内通知铃铛（NotificationBell + NotificationDrawer） | features/notifications/\* （30s 轮询 /notifications；点击标记已读） | §4.5 |
| T-01-8 | 附件列表（AttachmentList）+ 下载（AttachmentItem）—— 跟随 302；越权 403 友好提示 | features/attachments/\*（≤20MB 白名单；413/422 行内错误） | §4.3 |

### WEB-2：坐席工作台（Desk）—— Sprint 2-3，M2（建议/相似 Sprint 4，M3）

> **验收**：US-7.2 坐席主路径 E2E；八态流转+非法跃迁 409；评论/内部备注可见性；R-04 越权红线。  
> **前置**：WEB-0 全量；WEB-1（TicketDetail、AttachmentList 复用）。

| 任务 ID | 任务名 | 交付物 | 里程碑 | 详设参考 |
|---|---|---|---|---|
| T-02-1 | 工单队列（TicketQueue）+ 左右分栏布局（≥1280px；小屏退化） | features/tickets/TicketQueue.tsx / app/(desk)/desk/page.tsx（聚焦窗口 refetch + 操作后 invalidate） | M2 | §4.2 §5.3 §2.3 |
| T-02-2 | 状态操作（TransitionBar full）—— agent/lead 全八态；XState 可用按钮集 | 扩展 T-01-5：agent 受理/流转；lead 含 cancel/suspend；409 展示原因 | M2 | §4.2 §6.3 |
| T-02-3 | 评论/内部备注（CommentThread + CommentEditor）—— 公私分轨；@mentions；internal 对 requester 接口层过滤 | features/comments/\*（gateway 已过滤 visibility；UI 标记 internal Tag） | M2 | §4.3 |
| T-02-4 | 附件管理（full：AttachmentUploader + AttachmentList + 下载）—— 类型校验+大小限制 | 扩展 T-01-8（上传 UI：进度条；413 行内错） | M2 | §4.3 |
| T-02-5 | 分派对话框（AssignDialog）—— manual/reassign/escalate；仅 lead+ 角色渲染 | features/tickets/AssignDialog.tsx（RoleGuard lead+） | M2 | §4.2 POST /assignments |
| T-02-6 | SLA 显示（SlaBadge）—— 临近/超时高亮；暂停态展示 | features/sla/SlaBadge.tsx | M2 | §4.2 GET /sla |
| T-02-7 | 时间线（TimelinePanel）—— 分页加载 | features/tickets/TimelinePanel.tsx | M2 | §4.2 GET /timeline |
| T-02-8 | 相似工单（SimilarTickets）—— 懒加载；超时 8s 骨架屏+重试 | features/insight/SimilarTickets.tsx（独立 GET /similar；失败 EmptyState） | **M3** | §4.4 §5.2 |
| T-02-9 | AI 建议面板（SuggestionPanel）—— 读建议+采纳+纠偏；置信度展示 | features/insight/SuggestionPanel.tsx（GET/POST /suggestion；insight 5xx 展示"暂不可用"） | **M3** | §4.4 §5.2 |

### WEB-3：管理后台（Admin）—— Sprint 3，M2 收尾

> **验收**：US-7.3 管理后台主路径；admin 角色门禁；R-01/R-04 越权。  
> **前置**：WEB-0 全量；GW-3 `/admin/*` 路径可用。

| 任务 ID | 任务名 | 交付物 | 详设参考 |
|---|---|---|---|
| T-03-1 | 分类树 CRUD（CategoryTree + CategoriesPage） | app/(admin)/admin/categories/page.tsx / features/admin/CategoryTree.tsx（树形编辑）| §4.6 |
| T-03-2 | SLA 策略配置（SlaPoliciesPage） | app/(admin)/admin/sla-policies/page.tsx（表单 Zod 校验 targets） | §4.6 |
| T-03-3 | 用户/角色管理（UsersPage） | app/(admin)/admin/users/page.tsx（分页；创建+授角色） | §4.6 |
| T-03-4 | 通知策略配置（NotificationPoliciesPage） | app/(admin)/admin/notification-policies/page.tsx（矩阵 inapp/email） | §4.6 |

### WEB-4：看板报表（Dashboard）—— Sprint 4，M3

> **验收**：US-6.2 看板；stats P95<500ms；CSV 下载。  
> **前置**：WEB-0 全量；INS-5 stats 可用（阻塞，M3）。  
> **图表库**：Recharts（OQ-W5 前端内部偏好）。

| 任务 ID | 任务名 | 交付物 | 详设参考 |
|---|---|---|---|
| T-04-1 | Stats 图表（StatsChartGrid）—— SLA 达成/积压/工作量/分类分布/重开率/CSAT | features/stats/StatsChartGrid.tsx（手动刷新 + 60s auto-refetch；展示 generated_at） | §4.4 |
| T-04-2 | 筛选条件（metric/group_by/interval/from/to）—— manager/lead 只读 | features/stats/StatsFilters.tsx | §4.4 |
| T-04-3 | CSV 导出（ExportButton）—— 下载 blob；仅 manager/lead | features/stats/ExportButton.tsx（GET /stats/export） | §4.4 |

### WEB-5：i18n 预留 —— Sprint 5，M4（可与 WEB-1 并行启动）

> **验收**：默认 zh-CN 正常；文案从 JSON 加载，不硬编码在 tsx。  
> **前置**：WEB-0 T-00-7 路由骨架。

| 任务 ID | 任务名 | 交付物 | 详设参考 |
|---|---|---|---|
| T-05-1 | next-intl 接入 + 文案外置架构 | lib/i18n/\* / next.config（i18n 路由配置） | §2.2 / §6.3 |
| T-05-2 | zh-CN 默认语言包（工单状态/优先级/通用 UI 文案） | lib/i18n/zh-CN/ticket.json + common.json | §6.3 |

### T-QA：测试与质量 —— 贯穿 M2-M4

> **验收红线**：核心分支覆盖 ≥80%；E2E 越权 R-01~R-05 全过；Lighthouse 性能≥80/a11y≥90（M4）。

| 任务 ID | 任务名 | 交付物 | 里程碑 | 详设参考 |
|---|---|---|---|---|
| T-QA-1 | 单元测试骨架（Vitest + Testing Library）—— lib/auth / lib/rbac / lib/api / XState 状态机 | \_\_tests\_\_/\* 覆盖核心分支；CI 门禁 | M2 | §10.4 |
| T-QA-2 | 越权红线 E2E（Playwright）—— R-01~R-05 全过 | e2e/auth-boundary.spec.ts | M2 | 附录 A |
| T-QA-3 | 提单→关闭主路径 E2E | e2e/ticket-lifecycle.spec.ts | M2 | §7.3 M2 验收 |
| T-QA-4 | 降级场景 E2E（insight 5xx / 离线 / 慢响应 3.5s / refresh 401） | e2e/degradation.spec.ts | M2-M3 | §10.3 |
| T-QA-5 | Lighthouse CI 集成（性能≥80 / a11y≥90，三端代表页）+ npm audit 门禁 | .github/workflows/lighthouse.yml | M4 | §10.2 / §10.4 |

---

## 五、迭代排期（依 §7.2 对齐）

| 迭代 | 范围 | 里程碑 | 跨模块前置满足条件 |
|---|---|---|---|
| **Sprint 1** | WEB-0（T-00-1~T-00-9）+ WEB-1 T-01-1~T-01-4 | M2 前半 | gateway.yaml 已冻结 |
| **Sprint 2** | WEB-1 T-01-5~T-01-8 + WEB-2 T-02-1~T-02-3 + T-QA-1~T-QA-3 | M2 主线 | GW-1 联调 / CORE 状态机 in_review |
| **Sprint 3** | WEB-2 T-02-4~T-02-7 + WEB-3 T-03-1~T-03-4 | M2 收尾 | GW-3 全量 / INS-6 通知 |
| **Sprint 4** | WEB-2 T-02-8~T-02-9 + WEB-4 T-04-1~T-04-3 + T-QA-4 | M3 | INS-5 stats 可用 |
| **Sprint 5** | WEB-5 T-05-1~T-05-2 + T-QA-5 + 安全 E2E 加固 | M4 | — |

---

## 六、验收检查单（快照）

- [ ] `next build` 0 error；CI 绿（ESLint strict / TS / npm audit ≤ high / openapi-typescript regen 一致）
- [ ] `/healthz` 200 不鉴权
- [ ] US-2.1 提单 E2E 通过（MSW 或实 API）
- [ ] US-7.1 门户主路径 + US-7.2 工作台主路径 + US-7.3 管理后台主路径
- [ ] 越权红线 R-01~R-05 全过（Playwright）
- [ ] auth/rbac/apiClient/状态机分支覆盖 ≥80%
- [ ] M4：Lighthouse 性能≥80 / a11y≥90；CSP header 合规；npm audit 零高危
