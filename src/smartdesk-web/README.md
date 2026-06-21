# SmartDesk Web Frontend

基于 Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui 的前端项目。

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **组件库**: shadcn/ui
- **数据管理**: TanStack Query (待接入)

## 项目结构

```
src/smartdesk-web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── admin/
│   │   │   └── routing-rules/  # 路由规则管理页面
│   │   │       ├── page.tsx    # 列表页
│   │   │       ├── create/
│   │   │       │   └── page.tsx # 创建页
│   │   │       └── [id]/edit/
│   │   │           └── page.tsx # 编辑页
│   │   ├── layout.tsx          # 根布局
│   │   ├── page.tsx            # 首页
│   │   └── globals.css         # 全局样式
│   ├── components/
│   │   └── ui/                 # shadcn/ui 组件
│   ├── lib/
│   │   ├── utils.ts            # 工具函数
│   │   └── validation.ts       # 表单校验
│   └── types/
│       └── routing-rule.ts     # 路由规则类型定义
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

## 路由规则管理页面

### 列表页 (`/admin/routing-rules`)
- 表格展示：规则名称、匹配条件、分派目标、优先级、启用状态
- 搜索、启用/禁用开关、删除确认

### 创建页 (`/admin/routing-rules/create`)
- 表单字段：名称、说明、匹配条件（分类/技能组/优先级）、分派目标（坐席/技能组）、优先级、启用状态
- 表单校验：匹配条件至少一项非空、分派目标至少一项非空
- 条件预览

### 编辑页 (`/admin/routing-rules/[id]/edit`)
- 同创建页，支持修改现有规则

## 类型定义

基于 SUP-473 冻结契约，字段命名对齐后端：
- `match_category_id`: 匹配条件-分类
- `match_group_id`: 匹配条件-技能组
- `match_priority`: 匹配条件-优先级
- `target_user_id`: 分派目标-坐席
- `target_group_id`: 分派目标-技能组
- `priority`: 规则优先级（越小越优先）
- `is_active`: 启用状态

## 开发计划

1. [x] 项目结构搭建
2. [x] 类型定义（基于冻结契约）
3. [x] 列表页骨架
4. [x] 创建/编辑表单骨架
5. [ ] API 接入（待后端契约 merge）
6. [ ] 单元测试

## 依赖

- 后端契约: [SUP-473](https://github.com/allenlilisec/smartdesk-core/pull/31)
- 父任务: [SUP-472](https://github.com/allenlilisec/smart-desk/issues/472)
