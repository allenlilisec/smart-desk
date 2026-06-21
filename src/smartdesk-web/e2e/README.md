# SmartDesk Web E2E 测试

## 新增页面

### /portal - 报单人门户
- 新建工单表单（支持标题、描述、分类、优先级）
- 成功反馈并展示工单号
- 链接到我的工单列表

### /portal/my-tickets - 我的工单列表
- 工单列表展示（标题、状态、优先级、创建时间）
- 搜索和状态筛选
- 点击进入工单详情

### /portal/tickets/[id] - 工单详情（报单人视角）
- 工单详情展示
- 评论列表（仅公开评论）
- 添加回复功能

### /agent/queue - 坐席工单队列
- 待处理工单列表
- 搜索和状态筛选
- 接单功能
- 查看工单详情

### /agent/tickets/[id] - 工单详情（坐席视角）
- 工单详情展示
- 状态流转操作（accept、start、resolve等）
- 评论列表（公开+内部备注标签页）
- 添加评论（支持公开/内部可见性）
- 报单人信息侧边栏

## 测试定位点

测试定位点常量定义在 `src/lib/test-ids.ts`，用于E2E测试选择元素：
- `PORTAL_TEST_IDS` - Portal页面
- `MY_TICKETS_TEST_IDS` - 我的工单列表页
- `PORTAL_TICKET_DETAIL_TEST_IDS` - Portal工单详情页
- `AGENT_QUEUE_TEST_IDS` - Agent队列页
- `AGENT_TICKET_DETAIL_TEST_IDS` - Agent工单详情页

## Mock模式

设置环境变量启用Mock模式：
```bash
NEXT_PUBLIC_MOCK_MODE=true npm run dev
```

或运行E2E测试：
```bash
npm run e2e:mock
```

## 运行测试

```bash
# 开发模式
npm run dev

# 运行E2E测试
npm run e2e

# Mock模式E2E测试
npm run e2e:mock
```
