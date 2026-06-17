# Figma MCP 输入稿：SmartDesk WEB-2 坐席工作台效果图

> 目标：基于 SUP-263 已通过的 UI/UX 调研报告与架构裁决，生成 SmartDesk Web 坐席工作台首屏效果图。  
> 推荐画布：Desktop 1600x1000。  
> 可导入参考图：`docs/smartdesk-web-workspace-concept.svg`。

## 1. 设计目标

请在 Figma 中创建一个高保真的企业服务台坐席工作台设计稿，体现 SmartDesk 的 WEB-2 标准骨架：

- 左侧队列：固定 320px。
- 中间详情：`minmax(560px, 1fr)`。
- 右侧上下文：360px，可折叠。
- 中屏退化为“左队列 + 中详情”，右栏抽屉化。
- 窄屏采用列表到详情的深链导航。

首版 P0 交付重点是“左队列 + 中详情”可用闭环；右栏展示为可折叠侧栏，并体现每个分区独立降级。

## 2. 画面内容

### 顶部 AppShell

- 标题：SmartDesk 坐席工作台。
- 当前视图：我的待办。
- 通知入口：通知 6。
- 用户：江颜。
- 风格：企业内部系统，安静、专业、高信息密度，不做营销式大卡片。

### 左侧队列

默认视图：

- 我的待办。
- 我处理的。
- 组内未分派。
- 即将超时。

排序口径：

1. 优先级。
2. SLA 剩余时间。
3. 创建时间。

队列行内容：

- 优先级色条 + 工单号。
- 标题。
- 分类标签。
- 报单人或部门。
- SLA 剩余时间。
- 最后更新时间。

示例工单：

- P1 SD-1042 网络权限申请失败，已超时。
- P2 SD-1039 新员工门禁未生效，剩余 38m。
- P3 SD-1037 报销系统打不开，处理中。
- P4 SD-1031 会议室投屏异常，待确认。

### 中间详情

当前工单：

- 标题：SD-1042 网络权限申请失败。
- 报单人：李明。
- 部门：销售一部。
- 分类：IT 支持 / 账号权限。
- 状态：处理中。
- 优先级：P1。
- SLA：已超时。

固定 header 必须同屏展示：

- 状态。
- 优先级。
- SLA。
- 负责人。
- 客户。
- 下一步动作。

ActionBar：

- 开始处理。
- 分派。
- 转派。
- 更多操作。
- 标注“统一 action 注册表 / 快捷键映射表 / 命令菜单接口预留”。

并发冲突提示：

- 显示 409 场景提示：“该工单已被他人更新，请刷新后重试。”
- 辅助说明：写操作使用 Idempotency-Key；M2 不新增实时占用状态契约。

评论区：

- 公开评论。
- 内部备注，视觉上明显区分，避免误发。
- 输入框可在公开回复和内部备注之间切换。

### 右侧上下文侧栏

右栏整体可折叠，每个分区必须独立降级，不阻塞主体首屏。

分区：

1. 客户信息：李明、销售一部、requester、近 30 天提单数。
2. 最近工单：展示 2 条历史工单。
3. AI 建议：置信度 87%，建议补齐账号 network_access 角色，刷新权限缓存。
4. 相似工单：展示 2 条相似工单。
5. 静态弱冲突提示：基于 timeline / 最后更新人 / 更新时间，不接实时通道。

降级要求：

- insight / 相似 / AI 不可用时，只影响对应分区。
- 右栏其余信息仍可用。
- 不得阻塞中间工单详情首屏。

## 3. 设计令牌

请使用以下设计令牌，并在 Figma Variables 中按语义命名：

```text
color.action = #2563EB
color.action.hover = #1D4ED8
color.bg = #F8FAFC
color.surface = #FFFFFF
color.surface.muted = #F1F5F9
color.border = #CBD5E1
color.text = #0F172A
color.text.muted = #475569
color.success = #15803D
color.warning = #B45309
color.danger = #DC2626
color.info = #0891B2

space.1 = 4
space.2 = 8
space.3 = 12
space.4 = 16
space.6 = 24
space.8 = 32

radius.sm = 4
radius.md = 6
radius.lg = 8
```

约束：

- 状态色与图表色必须物理隔离。
- 工单状态、优先级、SLA 不只靠颜色表达，必须同时有文字标签。
- 页面内不要使用任意硬编码色值；全部通过语义变量。

## 4. 组件清单

请创建或标注以下组件：

- AppShell。
- DataTable / QueueList。
- StatusBadge。
- PriorityTag。
- SlaBadge。
- EmptyState。
- InlineRetry。
- ForbiddenPanel。
- OfflineBanner。
- ActionBar。
- ContextPanel。
- CommentComposer。

组件状态至少覆盖：

- 正常。
- 加载。
- 空态。
- 错误。
- 禁用。
- 409 并发冲突。
- 右栏分区独立降级。

## 5. Figma 生成提示词

```text
Create a high-fidelity desktop UI mockup for SmartDesk, an enterprise AI-assisted service desk.

Canvas: 1600x1000 desktop frame.
Style: quiet, professional, operational SaaS UI; dense but readable; no marketing hero, no decorative gradients.

Layout:
- Top AppShell.
- Left ticket queue fixed at 320px.
- Center ticket detail area using the remaining width.
- Right context panel fixed at 360px and visually collapsible.

Must show:
- Queue tabs: 我的待办, 我处理的, 组内未分派, 即将超时.
- Sorting hint: 优先级 -> SLA 剩余 -> 创建时间.
- Selected ticket: P1 SD-1042 网络权限申请失败, 已超时.
- Fixed detail header with status, priority, SLA, owner, requester, next action.
- ActionBar with 开始处理, 分派, 转派, 更多操作, and note that actions use a unified action registry.
- 409 conflict banner text: 该工单已被他人更新，请刷新后重试。
- Comments area with public reply and internal note clearly separated.
- Right ContextPanel sections: 客户信息, 最近工单, AI 建议, 相似工单, 静态弱冲突提示.
- Each right panel section should look independently degradable with InlineRetry or muted fallback affordance.

Design tokens:
Use #2563EB for primary actions, #F8FAFC page background, #FFFFFF surface, #0F172A text, #475569 muted text, #CBD5E1 border, #DC2626 danger, #B45309 warning, #15803D success, #0891B2 info.

Accessibility:
Use text labels with colors for priority, status and SLA; do not rely on color only. Maintain clear focus and hover affordances.
```

