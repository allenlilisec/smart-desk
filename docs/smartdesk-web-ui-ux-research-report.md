# SmartDesk Web UI/UX 调研与改版建议报告

> Issue：SUP-263  
> 编制：江颜（前端开发 Leader）  
> 日期：2026-06-17  
> 范围：smartdesk-web 的提单门户、坐席工作台、管理后台、数据看板  
> 输入：`README.md`、`specs/web子系统详细设计与实现说明书.md`、`specs/001-smartdesk-system/web/tasks.md`、公开产品与设计系统资料

## 1. 结论摘要

SmartDesk Web 当前最大问题不是单个页面视觉，而是还没有形成可执行的产品级体验骨架：`README.md` 明确当前仍处于 P2 详设阶段，`src/smartdesk-web` 仅是 submodule 占位；web 任务清单也给出“全量 gap”。因此“体验差”的根因应按三个层次处理：

1. 先建立统一工作台体验模型：左侧队列、中心会话/详情、右侧上下文与智能辅助，避免坐席在列表、详情、建议、历史、SLA 之间来回跳。
2. 先落设计令牌与组件规范：颜色、字体、间距、状态、反馈、空态、骨架屏、焦点态要成为实现前置，而不是页面完成后的美化。
3. 先做低成本高收益项：状态/优先级/SLA 的语义化标识、可配置表格列、统一错误与空态、快捷操作、加载与降级反馈，这些直接影响首版可用性。

建议本报告经架构设计团队决议后，作为 smartdesk-web WEB-0 脚手架与 WEB-1/2 首批页面的体验基线；后续实现 issue 不应只按页面拆，还要按“工作流 + 组件 + 状态反馈”拆。

## 2. 调研样本与证据

| 产品 | 观察重点 | 对 SmartDesk 的可借鉴点 | 资料/截图入口 |
|---|---|---|---|
| Zendesk Agent Workspace | 单一工单界面承载跨渠道会话；右侧客户上下文、知识库、应用、审批、资产等上下文面板；统一坐席状态与路由。 | 坐席工作台应采用三栏结构：队列、工单会话/详情、右侧客户上下文与 AI 建议；建议/相似工单不应阻塞详情首屏。 | [Zendesk Agent Workspace 官方说明](https://support.zendesk.com/hc/en-us/articles/4408821259930-About-the-Zendesk-Agent-Workspace)；页面含示例工单截图与右侧 context panel 截图。 |
| Intercom Inbox | 会话列表、表格布局切换、可配置列、快捷键、命令菜单、右侧最近会话/相似会话；强调操作即时性。 | WEB-2 队列应支持列表/表格密度切换、列配置、批量选择；相似工单和历史会话适合放右侧辅助栏；常用操作应支持命令菜单或快捷键。 | [Intercom Inbox 官方说明](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained)；页面含表格布局、快捷键、相似会话、最近会话截图。 |
| Freshdesk / Freshworks | 团队收件箱、SLA 管理、坐席冲突检测、自动分类定级、快捷回复、父子工单与共享责任。 | SmartDesk 一期至少要有“其他坐席正在查看/回复”提示的设计预留；SLA 不应只是详情字段，应在队列和详情 header 均可见。 | [Freshworks 工单管理指南](https://www.freshworks.com/ticketing-system/management-guide/)；列出团队 inbox、agent collision、SLA、field suggestor 等能力。 |
| Jira Service Management | 队列用于集中处理请求，按条件过滤；队列行提供摘要、状态、客户；常按 SLA/目标排序并支持搜索过滤。 | WEB-2 队列需要从一开始定义“我的队列/组内队列/SLA 优先/待分派/超时风险”等默认视图，而不是只做通用列表。 | [Jira Service Management 队列说明](https://support.atlassian.com/jira-service-management-cloud/docs/what-are-queues/)；页面含队列概念、列配置、SLA 排序说明。 |
| Linear | 同一动作可通过按钮、右键菜单、快捷键、命令菜单完成；批量操作与撤销降低高频操作成本。 | SmartDesk 坐席高频操作（受理、分派、流转、加标签、切换队列）应有一致动作入口，并预留撤销/二次确认策略。 | [Linear Concepts - Taking actions](https://linear.app/docs/conceptual-model)；页面含动作模式、快捷键、命令菜单与批量操作说明。 |
| ServiceNow Configurable Workspace | 工作区提供一个聚焦区域完成完整任务；列表、表单、活动流、评论区、标签侧栏是工作区基本部件；可按流程、品牌、数据定制。 | 管理后台不应孤立成普通 CRUD 页面，应复用同一工作区框架：列表、表单、活动流、配置侧栏、预览。 | [ServiceNow Configurable Workspace 官方说明](https://www.servicenow.com/docs/r/yokohama/platform-user-interface/learn-about-agent-workspace.html)；页面列出 workspace、list、form、activity stream、compose、tabs sidebar。 |

### 2.1 共性模式

1. 信息架构：标杆产品普遍把“待处理事项”组织成队列或 inbox，而不是从“页面菜单”出发。坐席首页应先回答“我现在该处理哪个工单”。
2. 布局栅格：坐席端倾向三栏或两栏分栏，宽屏保持列表与详情同屏；窄屏退化为列表到详情的深链导航。
3. 组件规范：状态、优先级、SLA、分派、评论、附件、内部备注、客户上下文是可复用业务组件，不应每个页面各自实现。
4. 交互范式：高频动作需要多入口但同语义，包括按钮、快捷键、右键菜单、批量操作、命令菜单。
5. 反馈系统：加载中用骨架屏；异步失败不阻断主体；相似/建议等智能能力是辅助区，不影响工单主流程。
6. 可访问性：设计系统需要明确色彩对比、焦点态、键盘可达、状态不只靠颜色表达。

## 3. SmartDesk Web 现状差距

### 3.1 当前事实

| 维度 | 当前状态 | 风险 |
|---|---|---|
| 实现状态 | 主仓说明当前仍是 P2 详设；`src/smartdesk-web` 是 submodule 占位；任务清单判定 WEB-0~5 全量 gap。 | 暂无可截屏验证的现有 UI，必须先把体验基线写入脚手架与首批页面任务。 |
| 技术基线 | 详设已选 Next.js、shadcn/ui、Radix、Tailwind、TanStack Query、React Hook Form、Zod、XState。 | 技术选型可支撑设计系统，但若未先定义令牌与状态规范，shadcn 组件会变成零散拼装。 |
| 信息架构 | 已有 `/portal`、`/desk`、`/admin`、`/dashboard` 路由分区。 | 路由分区正确，但没有定义每个角色的首屏决策信息与导航优先级。 |
| 坐席工作台 | 详设已有左队列右详情、相似/建议懒加载、SLA/时间线/评论/附件。 | 缺少右侧上下文面板与“队列优先级”设计，容易做成普通列表详情页。 |
| 反馈与降级 | 详设列出 401/403/429、insight 不可用、慢响应、离线等场景。 | 缺少统一视觉/组件规范：错误页、空态、骨架屏、Toast、冷却按钮、重试按钮容易风格不一致。 |

### 3.2 Top 体验问题与差距

| 优先级 | 问题 | 标杆对照 | 影响 | 建议 |
|---|---|---|---|---|
| P0 | 没有统一的设计令牌和业务状态视觉规范。 | Zendesk Garden 与 Atlassian Design System 都以语义色、交互态、对比度作为基础。 | 页面一旦并行开发，按钮、状态、优先级、卡片、表格密度会迅速分裂。 | WEB-0 先交付 `tokens` 与 `StatusBadge/PriorityTag/SlaBadge/EmptyState`。 |
| P0 | 坐席工作台缺少“右侧上下文与智能辅助”作为固定信息位。 | Zendesk、Intercom、ServiceNow 都把客户上下文、最近会话、相似内容、辅助应用放在侧栏。 | 坐席需要跨页查历史、建议和客户信息，效率低。 | 宽屏采用三栏：队列 320px、主体 minmax、上下文 360px；窄屏侧栏抽屉化。 |
| P0 | 队列视图未定义默认工作视图与 SLA 优先策略。 | Jira Service Management 队列按条件过滤并常按 SLA 目标排序。 | 坐席不知道先处理什么，主管也难以管控积压。 | 默认提供“我的待处理、组内待分派、SLA 风险、待客户响应、已超时”。 |
| P1 | 高频操作没有一致动作体系。 | Linear 同一动作支持按钮、上下文菜单、快捷键、命令菜单；Intercom 支持快捷键与表格直接动作。 | 坐席处理工单需要多次鼠标定位，批量处理成本高。 | WEB-2 加统一 ActionBar，后续再加命令菜单；先保留快捷键映射表。 |
| P1 | 加载、空态、错误和降级没有统一组件。 | Intercom 强调即时操作；Zendesk/ServiceNow 让辅助能力不阻塞主任务。 | insight/gateway 波动时页面会显得“坏了”，而不是“辅助能力暂不可用”。 | 建立 `LoadingSkeleton`、`InlineRetry`、`EmptyState`、`ForbiddenPanel`、`OfflineBanner`。 |
| P1 | 管理后台容易变成低密度表单堆叠。 | ServiceNow 将 list、form、activity stream、tabs sidebar 作为工作区部件。 | 管理者难以快速审阅配置影响，配置变更缺上下文。 | 管理后台复用“列表 + 编辑抽屉 + 变更摘要/预览”模式。 |
| P2 | 数据看板缺少可视化语义与可解释性基线。 | Atlassian 设计系统强调图表色与可访问性；标杆看板通常突出 SLA、积压、趋势。 | 只做图表网格会好看但不可行动。 | 每张图必须有结论摘要、时间范围、生成时间、空数据解释与导出入口。 |

## 4. 改版方向

### 4.1 产品体验原则

1. 工作流优先：坐席端以队列和下一步动作组织，而不是以页面目录组织。
2. 密度可控：运营/坐席页面默认中高信息密度，避免营销式大卡片；门户端保持低压力、分步表单。
3. 主体不被辅助能力阻塞：AI 建议、相似工单、统计读模型都放在辅助区域，失败时保留主流程。
4. 状态可解释：每个状态、优先级、SLA 风险都同时用颜色、文本、图标或数值表达，不只靠色彩。
5. 一处定义，多处复用：设计令牌、业务徽标、表格、空态、错误态、加载态先进入 WEB-0 基线。

### 4.2 四类页面建议

| 模块 | 首屏结构 | 关键体验 |
|---|---|---|
| 报单门户 | 顶部导航 + 提单入口 + 我的工单摘要；提单采用分步向导。 | 表单只问必要信息；附件失败不丢草稿；提交成功直接展示工单号、SLA 预期与后续动作。 |
| 坐席工作台 | 左侧队列、中间工单会话/详情、右侧上下文与 AI 辅助。 | 队列按 SLA 风险排序；详情 header 固定展示状态、优先级、SLA、负责人；评论与内部备注清晰分轨。 |
| 管理后台 | 左侧配置导航、中心列表、右侧编辑抽屉/预览。 | CRUD 操作要展示影响范围、变更摘要、保存反馈；危险操作二次确认。 |
| 数据看板 | 顶部筛选 + 指标摘要带 + 图表网格 + 可导出明细。 | 每个图表含生成时间、口径说明、空数据态；颜色不与状态色冲突。 |

## 5. 设计令牌建议

### 5.1 色彩令牌

参考 Zendesk Garden：蓝色用于按钮、链接、选中等互动元素；红/绿/黄用于危险、成功、警告状态；中性色用于文本、背景、边框。参考 Atlassian Design System：文本小于 24px 应满足 4.5:1 对比度，关键 UI 图形元素满足 3:1 对比度。

| 语义 | 令牌名 | 建议值 | 用途 |
|---|---|---|---|
| 主互动 | `--color-action` | `#2563EB` | 主按钮、链接、选中态、焦点强调 |
| 主互动悬停 | `--color-action-hover` | `#1D4ED8` | 主按钮 hover/active |
| 背景 | `--color-bg` | `#F8FAFC` | 页面底色 |
| 面板 | `--color-surface` | `#FFFFFF` | 页面主体面、表格、抽屉 |
| 弱面 | `--color-surface-muted` | `#F1F5F9` | 次级区块、骨架屏背景 |
| 边框 | `--color-border` | `#CBD5E1` | 表格边框、输入框、分割线 |
| 主文本 | `--color-text` | `#0F172A` | 正文、标题 |
| 次文本 | `--color-text-muted` | `#475569` | 说明、元信息 |
| 成功 | `--color-success` | `#15803D` | 已解决、成功反馈 |
| 警告 | `--color-warning` | `#B45309` | SLA 临近、需关注 |
| 危险 | `--color-danger` | `#DC2626` | 超时、失败、删除 |
| 信息 | `--color-info` | `#0891B2` | AI 建议、系统提示 |

业务状态映射：

| 业务对象 | 建议表达 |
|---|---|
| 工单状态 | 使用文字徽标 + 图标/边框，不只用色块；open/in_progress/resolved/closed/cancelled 各有固定语义色。 |
| 优先级 | P0/P1/P2/P3 用数字 + 文本 + 色彩强度；P0/P1 在队列中允许左侧风险条。 |
| SLA | 正常为中性；临近为警告；超时为危险；暂停态使用中性虚线或暂停图标。 |
| AI 置信度 | 不使用红绿判断“好坏”，用信息色 + 百分比/解释文案表达。 |

### 5.2 间距与栅格

| 令牌 | 建议值 | 用途 |
|---|---:|---|
| `--space-1` | 4px | 图标与文字间距、紧凑项 |
| `--space-2` | 8px | 表单字段内距、徽标 |
| `--space-3` | 12px | 表格行内距、按钮组 |
| `--space-4` | 16px | 表单项、列表项 |
| `--space-6` | 24px | 页面区块间距 |
| `--space-8` | 32px | 主要布局留白 |

布局建议：

| 场景 | 宽屏 | 中屏 | 小屏 |
|---|---|---|---|
| 坐席工作台 | `320px / minmax(560px,1fr) / 360px` | `300px / 1fr`，上下文抽屉 | 列表页与详情页深链切换 |
| 管理后台 | `240px / 1fr / 420px` 编辑抽屉 | 侧栏折叠 | 导航抽屉 + 全屏表单 |
| 看板 | 12 栅格，摘要 4 等分，图表 6/12 跨列 | 2 列 | 1 列 |

### 5.3 字体与排版

| 用途 | 字号/行高 | 说明 |
|---|---|---|
| 页面标题 | 24px / 32px，600 | 仅页面级标题使用，不用于卡片内。 |
| 区块标题 | 18px / 28px，600 | 表格区、详情区、图表区标题。 |
| 正文 | 14px / 22px，400 | 表格、评论、表单说明默认。 |
| 辅助文本 | 12px / 18px，400 | 时间、trace_id、字段说明、元信息。 |
| 数据数字 | 28px / 36px，600 | 看板摘要数字；需配单位和趋势解释。 |

### 5.4 圆角、阴影与密度

| 令牌 | 建议值 | 说明 |
|---|---:|---|
| `--radius-sm` | 4px | 输入框、徽标、表格内控件 |
| `--radius-md` | 6px | 按钮、弹层、卡片 |
| `--radius-lg` | 8px | Modal、Drawer；默认不超过 8px |
| `--shadow-raised` | `0 8px 24px rgba(15,23,42,.12)` | 只用于 Modal/Popover/Drawer |

密度：坐席工作台默认行高 44-48px；门户表单默认 48-56px；看板卡片不要套卡片，页面区块用全宽带和栅格。

## 6. 组件规范建议

| 组件 | 必备状态 | 首批落地位置 |
|---|---|---|
| `AppShell` | 桌面/移动导航、角色切换、用户菜单、通知入口 | WEB-0 |
| `DataTable` | 排序、筛选、分页、列配置、空态、加载态、行选择 | WEB-0/WEB-2 |
| `StatusBadge` | 工单状态、禁用态、ARIA label | WEB-0/WEB-1 |
| `PriorityTag` | P0-P3、列表紧凑态 | WEB-0/WEB-1 |
| `SlaBadge` | 正常、临近、超时、暂停、无 SLA | WEB-2 |
| `EmptyState` | 无数据、筛选无结果、权限不可见、辅助能力不可用 | WEB-0 |
| `InlineRetry` | 局部失败、重试、trace_id 展示 | WEB-0 |
| `ForbiddenPanel` | 403 不泄露资源存在性、返回首页 | WEB-0 |
| `OfflineBanner` | 离线、重连中、恢复成功 | WEB-0 |
| `ActionBar` | 主操作、次操作、危险操作、冷却/禁用原因 | WEB-1/WEB-2 |
| `ContextPanel` | 客户信息、最近工单、相似工单、AI 建议、知识库预留 | WEB-2 |
| `CommentComposer` | 公开回复、内部备注、附件、快捷回复预留 | WEB-2 |

## 7. 分期落地清单

### 7.1 P0：WEB-0 必须前置

| 任务 | 价值 | 验收 |
|---|---|---|
| 建立 Tailwind 主题令牌与语义色映射 | 避免并行页面风格分裂 | **架构强门禁**：WEB-0 必须同时落地 Tailwind theme 与 `tokens.css` 语义层，覆盖 color/spacing/typography/radius/shadow；状态色与图表色必须物理隔离。WEB-1/2 开工前需验收通过。 |
| 建立基础业务组件 | 统一状态、优先级、SLA、空态、错误态 | **架构强门禁**：StatusBadge、PriorityTag、SlaBadge、EmptyState、InlineRetry、ForbiddenPanel、OfflineBanner、DataTable、AppShell 必须在 WEB-0 完成；页面内私自硬编码色值/间距或自拼业务状态组件，committer 合入时驳回。 |
| 确定坐席三栏工作台壳 | 决定后续页面骨架 | WEB-2 标准骨架确认为左队列 320px / 中详情 minmax(560px,1fr) / 右上下文 360px；P0 只交付“左队列 + 中详情”可用闭环，右栏整体为可折叠侧栏；中屏右栏抽屉化，窄屏列表到详情深链。 |
| 建立统一反馈系统 | 降低首版“坏页面”感 | 401/403/409/429、网络错误、离线、慢响应均有统一组件；并发更新或非法跃迁 409 必须提示“该工单已被他人更新，请刷新后重试”。 |

### 7.2 P1：WEB-1/WEB-2 首批体验增益

| 任务 | 价值 | 验收 |
|---|---|---|
| 报单向导优化 | 降低提单门槛 | 字段顺序按产品基线：标题、分类、优先级、描述、附件、关联资产/服务项；分类支持一级预置与二级动态维护；AI 分类一期仅做建议与人工确认，附件失败不丢字段，提交成功页明确下一步。 |
| 队列默认视图 | 提升坐席处理效率 | 默认选中“我的待办”；辅助视图包含“我处理的”“组内未分派”“即将超时”；默认排序为优先级、SLA 剩余时间、创建时间。 |
| 工单详情 header 固定区 | 快速理解当前工单 | 状态、优先级、SLA、负责人、客户、下一步动作同屏可见。 |
| 右侧上下文面板 | 支撑智能辅助与历史关联 | 右栏分区包括客户信息、最近工单、相似工单、AI 建议；每个分区必须各自降级，insight/相似/AI 不可用时右栏其余信息仍可用，不得阻塞主体首屏。 |
| 评论/内部备注分轨 | 降低误发风险 | 内部备注视觉明显，requester 视角不可见。 |
| ActionBar 与动作注册表 | 避免 P3 命令菜单返工 | WEB-2 首版必须统一 `ActionBar` 与快捷键映射表；所有高频动作从统一 action 注册表声明，命令菜单 API/组件接口预留，P3 再补全。 |
| M2 并发冲突兜底 | 保证多人处理正确性 | M2 不新增实时占用状态契约；写操作使用 `Idempotency-Key`，非法跃迁/并发更新依赖 409 兜底；“其他坐席正在查看/编辑”只做基于 timeline/最后更新人的静态弱提示预留，不接实时通道。 |

### 7.3 P2：管理后台与看板

| 任务 | 价值 | 验收 |
|---|---|---|
| 管理后台列表 + 编辑抽屉模式 | 提升配置效率 | 列表不跳页即可编辑；保存前有变更摘要。 |
| 危险配置二次确认 | 降低误操作 | 产品基线采纳“模态二次确认 + 后果说明 + 审计日志”三件套，覆盖删除分类节点、删除 SLA 策略、禁用/删除用户、变更角色、关闭关键通知、系统配置变更、批量导出数据。 |
| 看板指标解释 | 让图表可行动 | 看板 P0 指标为 SLA 达成率、积压分布、即将超时 Top10、已超时；每张图必须有口径、时间范围、生成时间、空态和 CSV 导出。 |
| 图表色规范 | 避免状态色滥用 | 采用 Recharts；图表分类色板与工单状态语义色物理隔离，图表中的红色不得被误读为超时/危险状态。 |

### 7.4 P3：效率增强

| 任务 | 价值 | 验收 |
|---|---|---|
| 命令菜单 | 降低高频操作路径 | P3 基于 WEB-2 已预留的统一 action 注册表补全，支持创建工单、切换队列、分派、流转、搜索。 |
| 快捷键体系 | 提升坐席效率 | 首版已有快捷键映射表；P3 完整实现 `?` 查看快捷键，常用键不抢输入框焦点。 |
| 批量操作 | 处理积压 | 队列多选后支持批量分派、标记、关闭/暂停等受权限控制操作。 |
| 实时占用态 | 避免重复回复 | 不纳入 M2/M3；后续若确需 SSE/WebSocket 实时占用态，必须作为独立契约项交契约设计评估并经架构裁决，不得页面层私接实时通道。 |

## 8. 架构评审裁决与执行约束

本节原为待决事项，已由架构评审裁决通过，并采纳产品侧输入。以下约束作为 smartdesk-web 体验基线进入后续 WEB-0/1/2/3/4 实现验收。

### 8.1 已裁决架构约束

| 裁决项 | 结论 | 执行约束 |
|---|---|---|
| WEB-2 坐席工作台布局 | 通过 | 三栏壳为标准骨架：左队列 320px / 中详情 minmax(560px,1fr) / 右上下文 360px；P0 仅交付左队列 + 中详情可用闭环；右栏为可折叠侧栏，分区独立降级，不阻塞主体首屏。 |
| WEB-0 设计令牌与基础组件 | 通过，列为 P0 强门禁 | Tailwind theme + `tokens.css` 必须覆盖 color/spacing/typography/radius/shadow；StatusBadge、PriorityTag、SlaBadge、EmptyState、InlineRetry、ForbiddenPanel、OfflineBanner、DataTable、AppShell 必须先落地。页面绕过基础组件自拼状态或硬编码色值/间距，合入驳回。 |
| 命令菜单与快捷键 | 通过，P3 完整实现 | WEB-2 首版先交付统一 `ActionBar`、快捷键映射表与 action 注册表；命令菜单 API/组件接口预留，P3 再补齐。 |
| 坐席冲突提示 | 条件通过，M2 不新增实时推送 | M2 依赖 `Idempotency-Key` 与 409 冲突提示兜底；预防性提示只做基于 timeline/最后更新人的静态弱提示；实时占用推送不进 M2/M3，未来独立立项。 |
| 看板图表库与色板 | 通过 | 采用 Recharts；图表色板与工单状态语义色物理隔离；每图必须展示口径、时间范围、生成时间、空态与 CSV 导出。 |

### 8.2 已采纳产品侧输入

| 范围 | 验收基线 |
|---|---|
| 提单分类 | 一级分类预置：IT 支持、办公行政、人事、财务、安全合规、其他；二级分类由 admin 在管理后台动态维护。AI 分类一期为建议 + 人工确认，置信度高时提示推荐采纳。 |
| 提单字段顺序 | 标题、分类、优先级、描述、附件、关联资产/服务项；标题与分类应位于首屏，AI 建议用弱提示样式。 |
| 坐席默认队列 | 默认“我的待办”；辅助视图为“我处理的”“组内未分派”“即将超时”；排序为优先级、SLA 剩余时间、创建时间。 |
| 管理后台危险操作 | 删除分类节点、删除 SLA 策略、禁用/删除用户、变更角色、关闭关键通知、系统配置变更、批量导出数据均需按风险级别给出二次确认、后果说明和审计日志。 |
| 看板 P0 指标 | SLA 达成率、当前积压工单数、即将超时 Top10、已超时工单数及列表；默认支持今日、近 7 天、近 30 天切换。 |

### 8.3 后续任务拆分口径

后续实现任务按“工作流 + 组件 + 状态反馈”拆分。WEB-0 是唯一前置：设计令牌、基础组件、工作台壳、统一反馈完成并通过验收后，才启动 WEB-1/2 页面实现。实时占用态如未来确需，单独进入契约评估，不纳入本报告范围。

## 9. 资料来源

1. Zendesk Agent Workspace：https://support.zendesk.com/hc/en-us/articles/4408821259930-About-the-Zendesk-Agent-Workspace
2. Zendesk Garden 色彩规范：https://garden.zendesk.com/design/color/
3. Intercom Inbox：https://www.intercom.com/help/en/articles/6258745-the-inbox-explained
4. Freshworks 工单管理指南：https://www.freshworks.com/ticketing-system/management-guide/
5. Jira Service Management 队列说明：https://support.atlassian.com/jira-service-management-cloud/docs/what-are-queues/
6. Linear Concepts：https://linear.app/docs/conceptual-model
7. ServiceNow Configurable Workspace：https://www.servicenow.com/docs/r/yokohama/platform-user-interface/learn-about-agent-workspace.html
8. Atlassian Design System 色彩与可访问性：https://atlassian.design/foundations/color
