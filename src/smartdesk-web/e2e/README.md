# SmartDesk Web E2E 测试

基于 Playwright 的端到端测试套件。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 安装 Playwright 浏览器
npx playwright install

# 3. 配置测试环境
cp e2e/.env.e2e.example e2e/.env.e2e
# 编辑 .env.e2e 填入实际值

# 4. 运行测试
npm run e2e          # 运行所有测试
npm run e2e:ui       # UI 模式调试
npm run e2e:mock     # Mock 模式运行
```

## 目录结构

```
e2e/
├── playwright.config.ts    # Playwright 配置
├── .env.e2e.example       # 环境变量模板
├── global-setup.ts        # 全局初始化
├── fixtures/              # 测试夹具
│   ├── auth.fixture.ts    # 认证 fixture
│   └── test-data.ts       # 测试数据
├── helpers/               # 测试工具
│   └── api-mock.ts        # API Mock 助手
└── tests/                 # 测试用例
    └── example.spec.ts    # 示例/主干用例
```

## 运行模式

### Mock 模式（默认）

不依赖真实 Gateway，使用模拟数据：

```bash
E2E_MODE=mock npm run e2e
```

### 真实 Gateway 模式

连接真实 Gateway 进行测试：

```bash
# 编辑 .env.e2e
E2E_MODE=real
E2E_GATEWAY_URL=http://your-gateway:8080

# 运行测试
npm run e2e
```

## 测试账号

测试账号通过环境变量配置：

| 角色 | 变量 | 默认值 |
|------|------|--------|
| 报单人 | E2E_PORTAL_USER | zhangsan |
| 坐席 | E2E_AGENT_USER | lisi |
| 管理员 | E2E_ADMIN_USER | admin |

## 编写测试

### 基础结构

```typescript
import { test, expect } from '../fixtures/auth.fixture';
import { createApiMock } from '../helpers/api-mock';

test('测试描述', async ({ page, auth, isMockMode }) => {
  // 启用 Mock（如需要）
  const apiMock = createApiMock(page);
  await apiMock.enableMock();
  
  // 登录
  await auth.login('portal'); // 或 'agent', 'admin'
  
  // 测试步骤
  await page.goto('/portal');
  
  // 断言
  await expect(page).toHaveTitle(/Portal/);
});
```

### Mock API

```typescript
// 设置 Mock 响应
apiMock.mockTicketCreate({
  id: 'ticket-001',
  title: '测试工单',
  // ...
});

apiMock.mockTicketList([ticket1, ticket2]);
apiMock.mockCommentCreate(commentData);
apiMock.mockStatusTransition('ticket-001', 'in_progress');
```

## CI/CD

GitHub Actions 配置在 `.github/workflows/e2e.yml`：

- 每次 push/PR 自动运行
- 生成 HTML 测试报告
- 失败时自动上传截图

## 依赖

- 父任务: [SUP-493](https://github.com/allenlilisec/smart-desk/issues/493)
- Gateway BFF: [SUP-492](https://github.com/allenlilisec/smart-desk/issues/492)

## 升级路由

- 契约未就绪 → [@江颜](mention://agent/363b4a3f-bb38-41ac-b4ed-6c9bc9af30c5)
