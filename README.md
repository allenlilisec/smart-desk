# SmartDesk 智能服务平台

> 面向企业内部的、AI 辅助的智能工单/服务台系统。由 **1 名人类（需求方/决策者）+ 1 个 AI 虚拟研发组织（9 团队 / 20 智能体）** 协作研发，覆盖从需求到灰度上线/回滚的完整研发生命周期。
>
> **当前状态：组织设计已完成，待人类审视通过后正式开工。** 业务代码尚未开始实现。

## 这是什么

SmartDesk 让员工一键提单，系统自动分类定级、推荐相似工单，坐席协同处理，管理者实时掌握 SLA 与质量数据。

系统采用微服务架构（≥3 微服务、4 代码仓、3 门语言）：

| 代码仓 | 服务 | 语言/框架 | 职责 |
|---|---|---|---|
| `smartdesk-web` | 前端 Web | TypeScript + React/Next.js | 提单门户、坐席工作台、管理后台、看板 |
| `smartdesk-gateway` | 网关/认证 BFF | TypeScript + Node/NestJS | 统一入口、JWT 认证、RBAC、路由聚合、限流 |
| `smartdesk-core` | 工单核心服务 | Go | 工单生命周期、分派、SLA、评论、附件 |
| `smartdesk-insight` | 智能分析服务 | Python/FastAPI | 自动分类/定级、相似检索、统计、通知 |

## 目录结构

| 目录 | 内容 |
|---|---|
| `docs/` | 用户使用文档 |
| `specs/` | 系统文档：[《AI研发虚拟组织说明书》](specs/AI研发虚拟组织说明书.md)、[《产品需求说明书 PRD》](specs/SmartDesk产品需求说明书PRD.md)（草稿/待冻结）、[《用户故事与验收标准》](specs/SmartDesk用户故事与验收标准.md)，以及后续的系统设计、系统实现与任务分解、测试报告 |
| `src/` | 系统代码；当前为空，开工后存放 4 个 GitHub 仓的业务代码 |
| `README.md` | 本文件，项目总说明 |

## AI 研发虚拟组织

研发执行由一个基于 Multica 平台的虚拟组织承担，组织结构、模型映射、研发流程、质量门禁与成本论证详见
[《AI研发虚拟组织说明书》](specs/AI研发虚拟组织说明书.md)。

- **11 个团队 / 21 个智能体**，覆盖项目管理、产品需求、架构设计、前端/后端/智能服务开发、Committer 委员会、测试（功能+安全）、质量管理、发布运维、资料团队。
- **算力** 由 6 个本地 CLI 运行时提供：claude(Opus)、codex(GPT-5.5)、cursor(Composer)、gemini(Flash)、kimi(2.7)、opencode(GLM-5)。**每个智能体绑定固定模型、不可修改**；需要不同模型能力时只新建智能体。
- **质量门禁**：各实现团队 Leader 兼 committer 负责本域代码审视合入；关键代码须经集体检视（≥2 名开发、累计 ≥3 分含 committer 1 分；网关认证/RBAC 加后端+安全双评审）方可合入；Committer 委员会统管跨域合入；质量管理团队只做流程治理/方法论与红黑事件复盘（不做代码评审）；验收对照业界技术规范（安全 OWASP/CIS、可靠性、性能等，见说明书 §10.3）。

## 落地方式

组织结构经人类审视通过后，由 **CTO 直接通过 Multica 平台能力**（`multica agent/squad/autopilot` 等）创建全部技能、智能体、小队与自动化，无需脚本，也无需界面手工设置（按名称判重，幂等执行）。

代码仓托管在 **GitHub**（账号 `allen.lili@outlook.com`），开工后创建 `smartdesk-web` / `smartdesk-gateway` / `smartdesk-core` / `smartdesk-insight` 四个仓库。
