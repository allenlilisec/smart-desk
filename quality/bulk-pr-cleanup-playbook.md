# 批量 PR 清理标准化作业手册（草案）

> 版本：v0.9（草案）　|　日期：2026-06-21　|　编制：韩衡（安全与渗透测试团队 / 质量管理协作）　|　定稿：何明（质量管理 Leader）　|　裁决：CTO
>
> 来源：[SUP-465](mention://issue/8c70fe47-2dfe-4f92-b201-bf294225eed2) —— PR 清理专项（SUP-425 / SUP-423）台账过期与状态误报问题复盘。
>
> 目标：建立「先刷新、再分类、后派单」的批量 PR 清理模板，避免把 20–30% 的批量清理时间花在发现台账过期上，降低因状态错误导致的误派审、误合入、误关闭风险。

---

## 1. 适用范围

- 本手册适用于需要对单个或多个仓库的多个开放 PR 进行批量清理、合入推进、关闭判定或重新派审的场景。
- 典型触发：
  - PR 清理专项（如 SUP-425 / SUP-423）；
  - 里程碑/发布窗口前的 PR 收口；
  - 安全整改、依赖升级、规范基线落地的批量派发；
  - 任何由 CTO/PMO/质量管理团队发起的「批量处理 N≥5 个 PR」的任务。

---

## 2. 核心原则

| 原则 | 说明 |
|---|---|
| **先刷新** | 派单前必须对每个 PR 读取 GitHub 实时状态，过滤掉已关闭、已合并、已转为草稿的 PR。 |
| **再分类** | 仅对实时状态为 `open` 的 PR 按 CLEAN / DIRTY / BLOCKED / UNKNOWN 口径分类。 |
| **后派单** | 分类完成并写入快照时间戳后，再按仓库/领域拆分子任务并派给各团队 Leader。 |
| **实时口径** | 所有状态汇报必须来自 GitHub 当前状态，不接受缓存、截图、手工估算或口头同步。 |
| **误报闭环** | 出现事实性误报时，负责人在修正评论中简要说明根因，便于质量管理团队沉淀 check-item。 |

---

## 3. PR 实时状态定义

| 状态 | 判定标准 | 后续动作 |
|---|---|---|
| **CLEAN** | PR 为 `open` + 非 draft + `mergeable=true` + 所有必需 CI 检查通过 + 已满足合入门禁（检视人数/分数） | 直接合入或通知 committer 合入。 |
| **DIRTY** | PR 为 `open` + 存在未解决的 review 意见 / CI 失败 / 冲突需解决 / 未满足合入门禁 | 派回责任人或原检视人，明确待修复项与期望时间。 |
| **BLOCKED** | PR 为 `open` + 存在外部依赖（如等待另一 PR 合入、等待架构/产品/安全裁决、等待第三方发布） | 在 PR/issue 中标注阻塞原因、依赖项、预计解阻塞时间，由 PMO/Leader 跟踪。 |
| **UNKNOWN** | GitHub API 返回异常、`mergeable=null`（需重试）、权限不足、或状态无法唯一归类 | 人工二次确认，必要时重读 API 或联系仓库管理员。 |

> **注意**：
> - 以下 PR 在分类前必须**过滤掉**，不进入 CLEAN/DIRTY/BLOCKED/UNKNOWN 统计：
>   - `state=closed`（已关闭）；
>   - `state=merged` 或 `merged=true`（已合并）；
>   - `draft=true` 且近期无活跃更新（可按组织约定设置阈值，如 7 天未更新）。
> - 过滤结果须保留在快照中，便于后续审计。

---

## 4. 操作流程

### 4.1 准备阶段

| 步骤 | 动作 | 责任人 | 产出 |
|---|---|---|---|
| 4.1.1 | 明确本次批量清理的范围：涉及仓库、PR 作者、时间窗口、目标（合入/关闭/重新派审）。 | 发起人（CTO/PMO/质量管理） | 清理范围说明 |
| 4.1.2 | 确认具备各仓库的 GitHub 读取权限（建议使用 PAT/GitHub App，避免个人 token 过期导致读取失败）。 | 发起人 / 平台团队 | 可用凭证确认 |
| 4.1.3 | 选择并执行刷新方式（见 §5 工具/API 建议），输出标准化快照。 | 发起人 / 委派 agent | PR 实时快照 |

### 4.2 刷新阶段：强制读取实时快照

1. **列出候选 PR**：基于初始台账或 GitHub 查询条件（如 `is:pr is:open repo:org/repo`）获取候选列表。
2. **逐条读取实时字段**：
   - `state`（open / closed / merged）
   - `draft`
   - `mergeable`（注意：GitHub 首次返回可能为 `null`，需重试）
   - `mergeable_state`（clean / dirty / blocked / unstable / unknown）
   - `updated_at`
   - 必需检查状态（`status_check_state` / 各 check 结论）
   - review 状态（APPROVED / CHANGES_REQUESTED / PENDING）
3. **过滤非活跃 PR**：移除已关闭、已合并、以及组织约定视为「无需处理」的长期草稿 PR。
4. **写入快照时间戳**：记录读取时间（RFC3339），写入 issue 正文或 metadata。

### 4.3 分类阶段

1. 对过滤后的开放 PR，依据 §3 定义归入 CLEAN / DIRTY / BLOCKED / UNKNOWN。
2. 每个 PR 须注明：
   - 当前状态分类；
   - 分类依据（如 `mergeable=true`、`CI 失败 X`、`等待 #YYY 合入`）；
   - 读取时间戳。
3. 按仓库/领域汇总，形成清理总表（见 §7 汇报模板）。

### 4.4 派单阶段

1. **先分仓库核对**：将总表按仓库拆分，由各仓库 Leader 在 30 分钟内确认本仓库分类是否准确。
2. **再派子任务**：
   - CLEAN → 通知 committer 合入；
   - DIRTY → 派回责任人修复，明确截止时间和修复项；
   - BLOCKED → 标注阻塞原因并派给 PMO/Leader 跟踪；
   - UNKNOWN → 指定专人人工二次确认。
3. 子任务通过子 issue 派发，并行任务置 `todo`，有依赖的任务置 `backlog` 后按序提升。

### 4.5 修正与闭环

- 若在派单后发现事实性误报，负责人须在修正评论中说明：
  - 误报内容；
  - 正确状态；
  - 根因（如「未重读 GitHub 状态，使用了早晨缓存的台账」）；
  - 预防措施（如「已重新执行 API 刷新」）。
- 质量管理团队（韩衡）将根因沉淀为 check-item，纳入本手册版本历史。

---

## 5. 工具 / API 建议

### 5.1 推荐 API 调用

- **GitHub REST API**：
  - 列出 PR：`GET /repos/{owner}/{repo}/pulls?state=open&per_page=100`
  - 单条 PR 详情（含 `mergeable`）：`GET /repos/{owner}/{repo}/pulls/{pull_number}`
  - 检查状态：`GET /repos/{owner}/{repo}/commits/{sha}/check-runs` 与 `/check-suites`
  - Review 状态：`GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews`
- **GitHub GraphQL API**：适合批量查询多个仓库、多个字段，减少请求次数。
- **GitHub CLI（gh）**：适合人工快速核查，如：
  ```bash
  gh pr list --repo owner/repo --state open --json number,title,state,draft,mergeable,mergeableState,updatedAt
  gh pr view <number> --repo owner/repo --json mergeable,mergeStateStatus,statusCheckRollup,reviews
  ```

### 5.2 自动化建议（目标态）

- 由 CTO/平台团队评估建立 autopilot 或定时脚本：
  - 输入：仓库列表 + 清理范围；
  - 输出：标准化 JSON/CSV 快照 + 分类汇总 Markdown；
  - 触发：每次批量清理前自动执行，快照写入 issue metadata（如 `pr_cleanup_snapshot_url` / `pr_cleanup_snapshot_time`）。
- 在自动化落地前，采用 §7 的手工模板执行。

---

## 6. Check-item

### 6.1 刷新前 Checklist

- [ ] 已明确本次清理的仓库列表与目标（合入/关闭/重新派审）。
- [ ] 已确认 GitHub 读取凭证有效且不过期。
- [ ] 已选择刷新方式（REST API / GraphQL / gh CLI / 自动化脚本）。
- [ ] 已约定快照读取时间戳格式（RFC3339）。

### 6.2 快照读取 Checklist

- [ ] 对每个候选 PR 读取了 `state`、`draft`、`mergeable`、`mergeable_state`、`updated_at`。
- [ ] 对 `mergeable=null` 的 PR 进行了重试（建议最多 3 次，间隔 2–5 秒）。
- [ ] 读取了必需 CI 检查状态与 review 结论。
- [ ] 已过滤掉 `state=closed`、`state=merged`、以及约定阈值的长期草稿 PR。
- [ ] 快照时间戳已写入 issue 正文或 metadata。

### 6.3 分类与派单 Checklist

- [ ] 每个开放 PR 已按 CLEAN / DIRTY / BLOCKED / UNKNOWN 分类并注明依据。
- [ ] 已按仓库拆分子表并 @ 各仓库 Leader 确认。
- [ ] 子任务已用子 issue 派发，状态设置正确（并行 `todo`、有依赖 `backlog`）。
- [ ] 汇报评论中附带了总表、读取时间戳、下一步动作与责任人。

### 6.4 误报修正 Checklist

- [ ] 修正评论中说明了误报内容、正确状态、根因与预防措施。
- [ ] 已重新执行实时快照刷新。
- [ ] 已将根因同步给质量管理团队沉淀 check-item。

---

## 7. 汇报模板

### 7.1 PR 实时快照总表

```markdown
## PR 实时快照（读取时间：2026-06-21T06:00:00Z）

| 仓库 | PR # | 标题 | 作者 | State | Draft | Mergeable | 检查状态 | Review | 分类 | 依据 / 阻塞原因 |
|---|---|---|---|---|---|---|---|---|---|---|
| smart-desk | #116 | xxx | @author | open | false | true | 通过 | 2 APPROVED | CLEAN | 满足合入门禁 |
| smart-desk | #80 | yyy | @author | open | false | false | 失败 | CHANGES_REQUESTED | DIRTY | CI 失败 + review 未解决 |
| smartdesk-core | #45 | zzz | @author | open | false | blocked | 通过 | APPROVED | BLOCKED | 等待 #116 合入 |

**过滤说明**：本次共读取 X 个候选 PR，已过滤 Y 个 closed/merged/draft PR，剩余 Z 个 open PR 进入分类。
```

### 7.2 子任务派发模板

```markdown
## 批量 PR 清理派发（基于快照 2026-06-21T06:00:00Z）

### smart-desk（负责人：@前端 Leader）
- CLEAN（1）：#116 → 请 committer 今日内合入
- DIRTY（1）：#80 → 请 @author 修复 CI 与 review 意见，期望 2026-06-22T06:00:00Z 前更新
- BLOCKED（1）：#77 → 等待 #116 合入后解除阻塞，请 PMO 跟踪

### smartdesk-core（负责人：@后端 Leader）
- ...
```

### 7.3 误报修正模板

```markdown
## 状态修正记录

- **原汇报**：smartdesk-web 4 个 PR 均为 CLEAN
- **正确状态**：3 个 DIRTY + 1 个 BLOCKED
- **根因**：未重读 GitHub 实时状态，使用了早晨缓存的台账
- **已采取措施**：已重新执行 API 刷新并更新总表
- **预防沉淀**：在《批量 PR 清理标准化作业手册》§6.2 增加「快照读取 Checklist」必检项
```

---

## 8. 责任人矩阵

| 环节 | 责任人 | 说明 |
|---|---|---|
| 发起清理 / 明确范围 | CTO / PMO / 质量管理团队 | 确定目标、仓库、时间窗口。 |
| 执行实时快照刷新 | 发起人委派 agent / 仓库管理员 / 平台团队 | 输出标准化快照，确保数据来自 GitHub 实时状态。 |
| 分类复核 | 各仓库 Leader | 在 30 分钟内确认本仓库分类是否准确。 |
| 子任务派发 | 发起人 / PMO | 按仓库拆分并派发子 issue。 |
| CLEAN 合入 | 各域 committer | 按合入门禁执行合入。 |
| DIRTY 修复 | 原 PR 责任人 | 按截止时间和修复项更新 PR。 |
| BLOCKED 跟踪 | PMO / 相关 Leader | 标注依赖、跟踪解阻塞。 |
| UNKNOWN 确认 | 指定专人 / 仓库管理员 | 人工二次确认或联系 GitHub 管理员。 |
| 误报根因沉淀 | 质量管理团队（韩衡） | 将根因转化为 check-item 并更新本手册。 |
| 规范定稿与维护 | 质量管理 Leader（何明） | 评审、定稿、版本管理。 |
| 最终裁决与工具侧变更 | CTO | 批准规范生效，评估 autopilot/脚本自动化。 |

---

## 9. 生效与维护

- **生效时间**：本文件经何明定稿、CTO 裁决合入后生效。
- **维护责任**：质量管理团队（韩衡）负责持续维护与更新。
- **版本管理**：变更需经何明/CTO 裁决后方可合入。
- **关联文档**：
  - `quality/red-black-ledger.md`
  - `quality/review-checklist.md`
  - `quality/runtime-migration-governance.md`
- **验证计划**：在后续类似专项（PR 清理、安全整改批量派发等）中应用本手册，由质量管理团队跟踪误报率与协调开销，验证落地效果。

---

## 10. 版本历史

| 版本 | 日期 | 变更内容 | 编制 | 状态 |
|---|---|---|---|---|
| v0.9 | 2026-06-21 | 初始草案：原则、状态定义、操作流程、工具/API、check-item、汇报模板、责任人矩阵 | 韩衡 | 待何明/CTO 评审 |
