# smartdesk-web

SmartDesk 前端应用（报单门户 + 坐席工作台 MVP）。

## 技术栈

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- 仅经 gateway API 调用（`openapi/gateway.yaml`）

## 快速开始

```bash
cd smartdesk-web
npm install
cp .env.example .env.local
npm run dev
```

访问 http://localhost:3000

## Mock 模式

默认 `NEXT_PUBLIC_USE_MOCK=true`，无需 gateway 即可演示：

| 用户名 | 角色 | 入口 |
|---|---|---|
| zhangsan | 报单人 | /portal |
| lisi | 坐席 | /agent |

## 接入真实 Gateway

```env
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
```

## MVP 功能

### WEB-1 报单门户
- 提单表单（标题/描述/优先级）
- 我的工单列表（状态筛选）
- 工单详情：评论、确认关闭、重开

### WEB-2 坐席工作台
- 左队列右详情布局
- 状态操作（受理/处理/待用户/解决/挂起）
- 时间线、对外评论与内部备注
