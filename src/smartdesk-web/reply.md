## SUP-510 完成报告

### 任务概述
已完成 [SUP-510](mention://issue/11d40f06-8997-4610-a61b-38c2cf335356) —— 补齐 `/portal` 与 `/agent` 被测页面。

### 实现内容

#### 1. /portal 报单人门户
- **新建工单表单** (`/portal`)
  - 支持标题、描述、分类、优先级选择
  - 提交后展示成功反馈和工单号
  - 链接到我的工单列表

- **我的工单列表** (`/portal/my-tickets`)
  - 展示工单列表（标题、状态、优先级、创建时间）
  - 搜索和状态筛选功能
  - 点击进入工单详情

- **工单详情** (`/portal/tickets/[id]`)
  - 工单详情展示
  - 评论列表（仅公开评论）
  - 添加回复功能

#### 2. /agent 坐席工作台
- **工单队列** (`/agent/queue`)
  - 待处理工单列表
  - 搜索和状态筛选
  - 接单功能
  - 查看工单详情

- **工单详情** (`/agent/tickets/[id]`)
  - 工单详情展示
  - **状态流转操作**（accept、start、resolve等），与 `gateway.yaml` `/tickets/{id}/transitions` 契约对齐
  - 评论列表（公开+内部备注标签页）
  - 添加评论（支持 `{ body, visibility }` 格式）
  - 报单人信息侧边栏

#### 3. 契约与测试可驱动性
- 前端请求/响应字段以 `src/openapi/gateway.yaml` 为唯一事实源
- 评论创建使用 `{ body, visibility }` 格式
- 状态流转使用 `{ action }` 格式
- 状态枚举使用 `new/accepted/in_progress/pending_user/resolved/closed/suspended/cancelled`
- 提供稳定的 `data-testid` 定位点供E2E测试使用（定义在 `src/lib/test-ids.ts`）

#### 4. Mock模式
- 实现Mock API客户端支持E2E测试
- 环境变量 `NEXT_PUBLIC_MOCK_MODE=true` 启用Mock模式

### 验收状态

- [x] `npm run dev` 可启动并访问 `/portal`、`/agent`
- [x] `/portal` Mock 模式可完成提单并展示结果
- [x] `/agent` Mock 模式可查看队列、进入详情、添加评论、执行状态流转
- [x] `npm run build` 通过
- [x] E2E测试定位点已添加

### 新增文件

```
src/smartdesk-web/src/app/portal/page.tsx
src/smartdesk-web/src/app/portal/layout.tsx
src/smartdesk-web/src/app/portal/my-tickets/page.tsx
src/smartdesk-web/src/app/portal/tickets/[id]/page.tsx
src/smartdesk-web/src/app/agent/page.tsx
src/smartdesk-web/src/app/agent/layout.tsx
src/smartdesk-web/src/app/agent/queue/page.tsx
src/smartdesk-web/src/app/agent/tickets/[id]/page.tsx
src/smartdesk-web/src/components/ui/alert.tsx
src/smartdesk-web/src/components/ui/badge.tsx
src/smartdesk-web/src/components/ui/card.tsx
src/smartdesk-web/src/components/ui/label.tsx
src/smartdesk-web/src/components/ui/select.tsx
src/smartdesk-web/src/components/ui/tabs.tsx
src/smartdesk-web/src/components/ui/textarea.tsx
src/smartdesk-web/src/lib/api.ts
src/smartdesk-web/src/lib/test-ids.ts
src/smartdesk-web/src/types/ticket.ts
src/smartdesk-web/e2e/fixtures/portal.fixture.ts
src/smartdesk-web/e2e/fixtures/agent.fixture.ts
src/smartdesk-web/e2e/tests/portal.spec.ts
src/smartdesk-web/e2e/tests/agent.spec.ts
```

### 路由清单

| 路由 | 描述 | 状态 |
|------|------|------|
| `/portal` | 报单人门户（新建工单） | ✅ 可用 |
| `/portal/my-tickets` | 我的工单列表 | ✅ 可用 |
| `/portal/tickets/[id]` | 工单详情（报单人视角） | ✅ 可用 |
| `/agent` | 坐席工作台（重定向到队列） | ✅ 可用 |
| `/agent/queue` | 工单队列 | ✅ 可用 |
| `/agent/tickets/[id]` | 工单详情（坐席视角） | ✅ 可用 |

### 下一步
- SUP-497 / SUP-498 E2E测试可基于当前实现进行
- 如需真实Gateway模式，需配置 `NEXT_PUBLIC_API_URL`
