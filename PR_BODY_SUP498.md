## 概述

实现 SUP-498：坐席队列与评论交互 E2E 用例（Playwright，Mock + 真实 Gateway 双模式）。

Closes SUP-498

## 变更内容

修复 SUP-498 E2E 用例并补齐最小可运行前端入口：

- **tests/agent/ticket-queue.spec.ts**：重写坐席端核心用例
  - 用例 1：坐席查看工单队列（张三提交的工单可见、字段正确）
  - 用例 2：工单详情与评论（内部备注、对外回复、评论列表刷新）
  - 用例 3：状态流转（new → accepted → in_progress → resolved）
- **e2e/helpers/api-mock.ts**：新增 `seedMockTickets` / `seedMockComments`，修复 `/comments`、`/transitions` 路由 ticketId 索引，按 gateway.yaml 对齐契约
- **e2e/fixtures/auth.fixture.ts**：Mock 登录先 `goto('/')` 再操作 localStorage，避免 about:blank SecurityError
- **src/smartdesk-web/**：补齐 Next.js 最小可运行入口
  - `package.json` / `tsconfig.json` / `next.config.js` / `tailwind.config.ts` / `postcss.config.js`
  - `/agent`、`/agent/tickets/[id]`、`/portal`、`/portal/tickets`、`/portal/tickets/new`、`/portal/tickets/[id]`、`/login`
  - 现有 `admin/routing-rules` 页面所需 shadcn/ui 组件 stub

## 验收

- [x] 坐席队列 E2E 用例通过（Mock 模式）
- [x] 评论交互 E2E 用例通过（Mock 模式）
- [x] 状态流转 E2E 用例通过（Mock 模式）
- [x] 真实 Gateway 模式下测试通过

## 检视要点

1. fixture/Mock 处理器是否对齐 SUP-492 的评论与状态流转接口
2. 用例断言是否覆盖工单字段（标题、状态、优先级、创建人）
3. 状态流转用例是否完整覆盖 new → accepted → in_progress → resolved

## 依赖

- 父 issue：SUP-493
- Gateway 接口：SUP-492

## 合入门禁（Web 领域）

- committer：江颜（前端 Leader，2 分）
- 检视：卫泽（前端开发，1 分）
- 满足「≥2 名开发、≥1 committer、赞成票 ≥3 分」即可合入
