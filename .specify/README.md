# `.specify/` — spec-kit 工作产物（生成轨迹）

> 由 SUP-43（P0+P1 系统级详细设计）初始化。方法论：[github/spec-kit](https://github.com/github/spec-kit)。
> 维护：架构设计团队（Leader 梁栋 / 契约与文档主笔 秦诺）。

本目录是 **spec-kit 的工作产物与生成轨迹**，不是给人阅读的最终交付件。
人类可读的唯一事实源（系统详设）是 [`../specs/SmartDesk系统详细设计与实现说明书.md`](../specs/SmartDesk系统详细设计与实现说明书.md)，由本目录 `specs/001-smartdesk-system/` 下的 `/plan` 产物整理派生。

## 结构

```
.specify/
├── init-options.json          # 初始化选项（分支编号策略、脚本 shell、AI 助手）
├── feature.json               # 当前活动 feature 目录指针（供 /plan /tasks 定位）
├── memory/
│   └── constitution.md        # 项目宪法（/constitution 产物，受控冻结）
├── templates/                 # spec-kit 模板（spec/plan/tasks/constitution）
└── scripts/powershell/        # 链路脚本（setup-plan / check-prerequisites / create-new-feature / common）
```

feature 目录（`spec.md` / `plan.md` / `research.md` / `data-model.md` / `contracts/` / `quickstart.md`）位于
[`../specs/001-smartdesk-system/`](../specs/001-smartdesk-system/)。

## 链路阶段（本轮范围：P0 + P1）

| 阶段 | 命令 | 产物 | 状态 |
|---|---|---|---|
| P0 | `/constitution` | `memory/constitution.md` | ✅ 草稿 |
| P1 | `/specify` | `specs/001-smartdesk-system/spec.md` | ✅ 草稿 |
| P1 | `/clarify` | spec 中 Clarifications（吸收 PRD §10.1 裁决） | ✅ 草稿 |
| P1 | `/plan` | `plan.md` + `research.md` + `data-model.md` + `contracts/` + `quickstart.md` | ✅ 草稿 |
| P3 | `/tasks` | `tasks.md` | ⏳ 后置 |
| P4 | `/implement` | 代码 | ⏳ 后置 |

> 契约唯一事实源仍是 [`../src/openapi/*.yaml`](../src/openapi/)；本目录 `contracts/` 指向它，不复制。
