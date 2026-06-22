# SmartDesk Web E2E 测试套件

基于 Playwright 的端到端测试套件，覆盖「张三提单 → 李四队列 → 评论交互」主链路。

## 技术栈

<<<<<<< HEAD
```bash
# 1. 安装依赖
npm install

# 2. 安装 Playwright 浏览器
npx playwright install

# 3. 配置测试环境
cp e2e/.env.e2e.example e2e/.env.e2e
# 编辑 .env.e2e 填入实际值

# 4. 运行测试
npm run e2e          # 运行所有测试（默认 Gateway 模式）
npm run e2e:ui       # UI 模式调试
npm run e2e:mock     # Mock 模式运行
npm run e2e:gateway  # 真实 Gateway 模式运行
npm run e2e:gateway:local  # 连接本地 http://localhost:8080 Gateway
```
=======
- **测试框架**: Playwright
- **语言**: TypeScript
- **浏览器**: Chromium, Firefox, WebKit
>>>>>>> origin/main

## 目录结构

```
e2e/
├── fixtures/
│   ├── auth.fixture.ts      # 认证 fixture（登录状态管理）
│   ├── test-data.ts         # 测试数据模板
│   └── types.ts             # TypeScript 类型定义
├── helpers/
│   └── api-mock.ts          # API Mock 助手（Mock 模式）
├── tests/
│   ├── portal/              # 报单人门户测试
│   │   ├── create-ticket.spec.ts   # 提单流程
│   │   └── my-tickets.spec.ts      # 我的工单列表
│   ├── agent/               # 坐席工作台测试
│   └── example.spec.ts      # 示例/主干用例骨架
├── global-setup.ts          # 全局设置
└── README.md                # 本文件
```

## 运行模式

### Mock 模式（默认）

使用 Playwright 的 route API 拦截并模拟 API 响应，无需后端服务。

```bash
<<<<<<< HEAD
npm run e2e:mock
=======
# Mock 模式（默认）
npx playwright test

# 或显式指定
E2E_MODE=mock npx playwright test
>>>>>>> origin/main
```

### 真实 Gateway 模式

调用真实的 Gateway 服务进行测试。

```bash
<<<<<<< HEAD
# 方式 1：直接指定 Gateway 地址
npm run e2e:gateway -- --env E2E_GATEWAY_URL=http://your-gateway:8080

# 方式 2：连接本地 Gateway
npm run e2e:gateway:local
=======
# 真实 Gateway 模式
E2E_MODE=real E2E_BASE_URL=http://localhost:3001 npx playwright test
```

## 运行测试

```bash
# 运行所有测试
npm run e2e

# 运行特定测试文件
npx playwright test e2e/tests/portal/create-ticket.spec.ts

# UI 模式（调试）
npm run e2e:ui

# 特定浏览器
npx playwright test --project=chromium
>>>>>>> origin/main
```

真实 Gateway 模式下，`playwright.config.ts` 会自动启动 Next.js 开发服务器，API 请求通过 `next.config.js` 的 rewrites 代理到 `E2E_GATEWAY_URL`。请确保 Gateway 服务已就绪。

## 测试账号

| 账号 | 角色 | 用途 |
|------|------|------|
| zhangsan | requester | 报单人门户测试 |
| lisi | agent | 坐席工作台测试 |
| admin | admin | 管理员后台测试 |

## Mock 数据

Mock 数据定义在 `fixtures/test-data.ts` 中：

- 用户信息（TEST_USERS）
- 工单模板（TICKET_TEMPLATES）
- 评论模板（COMMENT_TEMPLATES）
- API 响应模板（MOCK_RESPONSES）

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| E2E_MODE | 运行模式（mock/real） | mock |
| E2E_BASE_URL | 测试站点基础 URL | http://localhost:3000 |
| E2E_GATEWAY_URL | Gateway 服务 URL（真实模式） | - |

## 验收标准

- ✅ Playwright 配置完成，可运行 `npm run e2e`
- ✅ 主链路 E2E 用例通过（张三提单 → 李四队列 → 评论交互）
- ✅ 与真实 Gateway 环境可联调
- ✅ Mock 模式与真实 Gateway 模式可切换

## 相关 Issue

- [SUP-493](mention://issue/6ad99b94-3d05-460a-8cb5-4577eaa841be) - Playwright E2E 测试套件
- [SUP-497](mention://issue/d8572578-1446-49ca-90f4-c4c33daba0d6) - 报单人提单流程
- [SUP-498](mention://issue/7cf5594e-a34a-4694-8a24-aeddb5735557) - 坐席队列与评论交互
