<!--
Sync Impact Report
==================
Version change: (template) → 1.0.0
Bump type: MAJOR (initial ratification — first concrete constitution from template)

Modified principles:
  [PRINCIPLE_1_NAME] → I. 契约优先（Contract-First）
  [PRINCIPLE_2_NAME] → II. 文档质量门禁（Documentation Quality Gate）
  [PRINCIPLE_3_NAME] → III. 合入规则与集体检视（Merge Rules & Collective Review）
  [PRINCIPLE_4_NAME] → IV. 文档单一事实源（Single Source of Truth）
  [PRINCIPLE_5_NAME] → V. 自顶向下强约束（Top-Down Enforcement）

Added sections:
  - 附加约束：技术栈与契约边界（Additional Constraints）
  - 研发流程与质量门禁（Development Workflow & Quality Gates）
  - Governance

Removed sections: none

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check 段落与本宪法一致（契约优先 / 自顶向下 / 单一事实源）
  ✅ .specify/templates/spec-template.md — 范围与需求段落无冲突
  ✅ .specify/templates/tasks-template.md — 任务分类无冲突
  ⚠ README.md — 现有 §质量门禁描述与本宪法一致，无需改动；后续如评分线变更需同步

Deferred TODOs: none
-->

# SmartDesk Constitution

本宪法是 SmartDesk 项目自顶向下研发流程的最高规定动作与门禁基线，约束从需求到灰度
上线/回滚全生命周期的所有阶段与所有团队（人类决策者 + AI 虚拟研发组织）。后续每个
`/specify`、`/clarify`、`/plan`、`/tasks`、`/analyze`、`/implement` 阶段均须遵守本宪法。

## Core Principles

### I. 契约优先（Contract-First）

OpenAPI 契约是跨模块对接的**唯一接口事实源**。任何跨服务/跨仓的交互必须先有契约、
后有实现：

- 契约位于主仓 `src/openapi/`（gateway / core / insight 三份契约总纲），由首席架构
  (梁栋) 对契约变更拥有最终决定权。
- **禁止未定义契约即开工**：模块在契约冻结前不得开始接口实现。
- 实现必须与契约逐字段一致，可通过 `api-contract-check` 技能校验；契约与实现冲突时，
  以契约为准，实现必须改正。
- 契约变更须先评审通过并冻结，再通知相关开发团队解阻塞。

*理由*：微服务架构（≥3 微服务、4 仓、3 语言）下，接口漂移是最大的集成风险；契约先行
把对接错误前移到设计阶段消除。

### II. 文档质量门禁（Documentation Quality Gate）

各阶段产出文档须经**资料团队（文澜）评审签字**方可冻结。

- Specify / Plan / Tasks / 设计说明书等阶段文档，未经资料团队对可读性、合规性、
  一致性签字，不得进入下一阶段，也不得作为下游开工依据。
- 签字记录留存在对应 Multica issue 评论中，给出文件路径作为冻结证据。

*理由*：文档是自顶向下流程的承载体；无评审的文档会让歧义沿流程放大，质量门禁把关
在源头。

### III. 合入规则与集体检视（Merge Rules & Collective Review）

代码合入须满足评审人数与评分线，关键代码须经集体检视。

- **基线规则**：关键代码须经集体检视——≥2 名开发参与、累计 ≥3 分且其中含
  committer 1 分，方可合入。
- **强化规则**：网关认证 / RBAC 等安全敏感代码，额外要求后端 + 安全双评审。
- **Committer 委员会**（江颜 / 石磊 / 苏睿）统管跨域合入；各实现团队 Leader 兼
  committer 负责本域代码审视合入。
- 质量管理团队只做流程治理 / 方法论与红黑事件复盘，**不做代码评审**。

*理由*：集体检视与评分线把“谁能合、合什么”制度化，避免单人合入与权限越界，安全
敏感面额外加固。

### IV. 文档单一事实源（Single Source of Truth）

**系统级详设是最高事实源**；模块详设与代码不得与之冲突。

- 事实源优先级（高→低）：系统级详细设计 > 契约（接口边界，见原则 I）> 模块详设 > 代码。
- 模块详设与代码若与系统级详设冲突，以系统级详设为准；需变更系统行为时，先改系统级
  详设并重新评审冻结，再下沉到模块与代码。
- 同一事实只允许有一处权威定义，其余位置引用而非复制。

*理由*：多团队并行时，复制的“事实”必然漂移；单一事实源让冲突可判定、可追溯。

### V. 自顶向下强约束（Top-Down Enforcement）

系统 Plan 先于任何模块详设；**禁止“模块各自出详设再合并”的老路**。

- 阶段顺序强约束：系统级 Specify/Plan 冻结后，才能展开模块级详设与实现。
- 不允许模块团队在系统 Plan 缺位时自行出详设；任何自底向上的“先做后合”都视为违例。
- 本阶段（P0：脚手架 + Constitution）为先行波次，必须在 P1（系统级 Specify/Plan）之前完成。

*理由*：自底向上合并是历史返工的根因；强制自顶向下让架构决策在分解前定型。

## 附加约束：技术栈与契约边界（Additional Constraints）

- **代码仓与技术栈**（不可随意更改）：`smartdesk-web`（TS + React/Next.js）、
  `smartdesk-gateway`（TS + Node/NestJS）、`smartdesk-core`（Go）、
  `smartdesk-insight`（Python/FastAPI）。
- **契约目录**：跨模块契约统一置于主仓 `src/openapi/`，分 gateway / core / insight 三份。
- **目录约定**：`specs/` 存系统级文档（PRD、用户故事、系统架构/详设、测试报告），
  `docs/` 存用户文档，`src/` 存四个仓的业务代码，`.specify/` 存 spec-kit 脚手架与本宪法。
- **模型绑定**：每个智能体绑定固定模型不可修改；需要不同模型能力时新建智能体，而非
  改配置。

## 研发流程与质量门禁（Development Workflow & Quality Gates）

- **规定动作**：所有特性走 spec-kit 流程——`/constitution`（一次性基线）→ `/specify`
  → `/clarify`（按需）→ `/plan` → `/tasks` → `/analyze`（按需）→ `/implement`。
- **阶段门禁出口条件**：
  1. 阶段文档经资料团队（文澜）评审签字（原则 II）。
  2. 跨模块接口已在 `src/openapi/` 契约中定义并冻结（原则 I）。
  3. 系统级详设已冻结且为最高事实源，下游无冲突（原则 IV）。
- **合入门禁**：满足原则 III 的评审人数 / 评分线 / 集体检视，安全敏感代码加双评审。
- **冻结证据**：每个阶段完成须在对应 Multica issue 评论给出文件路径（与 PR 链接，
  如涉及代码）。

## Governance

- 本宪法**优先于**一切其他研发实践；与本宪法冲突的局部约定一律以本宪法为准。
- **修订程序**：宪法修订须由架构团队（梁栋）提议、资料团队（文澜）就可读性 / 合规性
  评审签字后方可生效；修订须在 issue 中留存记录并说明影响范围。
- **版本策略**（语义化版本）：
  - MAJOR：原则的删除 / 不兼容重定义、治理规则的破坏性变更。
  - MINOR：新增原则 / 章节或实质性扩展指引。
  - PATCH：措辞澄清、错别字、非语义性细化。
- **合规审查**：所有阶段评审与代码合入须核对本宪法各原则；复杂度 / 例外必须显式说明
  理由，否则不予通过。
- 运行期开发指引以本宪法 + 系统级详设为准；`.specify/templates/` 与各 `/speckit-*`
  技能须与本宪法保持一致，发现漂移即修正。

**Version**: 1.0.0 | **Ratified**: 2026-06-14 | **Last Amended**: 2026-06-14
