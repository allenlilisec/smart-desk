# [web] SUP-472: 路由规则配置管理界面 - 列表页 + 表单骨架

Closes SUP-472

## 变更摘要

基于 SUP-473 冻结契约（PR #137 / smartdesk-core #31），搭建前端路由规则管理页面骨架。

### 新增文件

```
src/smartdesk-web/
├── package.json              # 项目依赖 (Next.js 14 + TypeScript + Tailwind + shadcn/ui)
├── tailwind.config.ts         # Tailwind 配置
├── tsconfig.json              # TypeScript 配置
├── next.config.js             # Next.js 配置
├── postcss.config.js          # PostCSS 配置
├── src/
│   ├── app/
│   │   ├── globals.css        # 全局样式 + CSS 变量
│   │   ├── layout.tsx         # 根布局
│   │   ├── page.tsx           # 首页
│   │   └── admin/
│   │       └── routing-rules/
│   │           ├── page.tsx           # 列表页：表格 + 搜索 + 启用开关 + 删除确认
│   │           ├── create/
│   │           │   └── page.tsx       # 创建页：表单 + 校验 + 预览
│   │           └── [id]/
│   │               └── edit/
│   │                   └── page.tsx   # 编辑页：同创建页，支持修改
│   ├── components/
│   │   └── ui/
│   │       ├── button.tsx     # shadcn/ui Button
│   │       ├── input.tsx      # shadcn/ui Input
│   │       ├── switch.tsx     # shadcn/ui Switch
│   │       └── dialog.tsx     # shadcn/ui Dialog
│   ├── lib/
│   │   ├── utils.ts           # 工具函数 (cn)
│   │   └── validation.ts      # 表单校验逻辑
│   └── types/
│       └── routing-rule.ts    # TypeScript 类型定义
```

### 类型定义（对齐冻结契约）

```typescript
interface RoutingRule {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  // 匹配条件
  match_category_id?: string;
  match_group_id?: string;
  match_priority?: 'P1' | 'P2' | 'P3' | 'P4';
  // 分派目标
  target_user_id?: string;
  target_group_id?: string;
  priority: number;        // 越小越优先
  is_active: boolean;
  hit_count?: number;
  // ...审计字段
}
```

### 表单校验

- ✅ 匹配条件至少一项非空校验
- ✅ 分派目标至少一项非空校验
- ✅ 规则名称必填校验
- ✅ 优先级非负整数校验

### 页面功能

**列表页** (`/admin/routing-rules`):
- 表格展示：规则名称、匹配条件、分派目标、优先级、命中次数、启用状态
- 搜索过滤（按规则名称）
- 快速启用/禁用开关
- 删除确认弹窗
- 创建/编辑入口

**创建/编辑页** (`/admin/routing-rules/create`, `/admin/routing-rules/[id]/edit`):
- 基本信息：名称、说明、优先级、启用状态
- 匹配条件：分类选择、技能组选择、优先级选择
- 分派目标：指定坐席、指定技能组
- 条件预览：实时展示匹配条件和分派目标
- 表单校验：错误提示

## 契约一致性声明

- 字段命名严格对齐 SUP-473 冻结契约：`match_xxx` / `target_xxx`
- 枚举值对齐：`P1`/`P2`/`P3`/`P4`
- 约束逻辑对齐：匹配条件至少一项、分派目标至少一项

## 待完成（后续 PR）

- [ ] TanStack Query 数据管理接入
- [ ] API 调用封装 (`/admin/routing-rules` CRUD)
- [ ] 单元测试（表单校验、组件渲染）
- [ ] 与后端 API 联调验证

## 检视要点

1. 类型定义是否与 SUP-473 契约一致
2. 表单校验逻辑是否符合约束要求
3. 页面结构是否符合验收标准

## 依赖

- 后端契约: [SUP-473](https://github.com/allenlilisec/smartdesk-core/pull/31) (in_review)
- 父任务: [SUP-471](https://github.com/allenlilisec/smart-desk/issues/471)

---

**契约来源**: SUP-473 (陈川) | **前端实现**: 关山 | **预计今日产出**: 列表页 + 表单骨架
