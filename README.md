# SmartDesk 智能服务平台

> 面向企业内部的、AI 辅助的智能工单/服务台系统。由 **1 名人类（需求方/决策者）+ 1 个 AI 虚拟研发组织（9 团队 / 20 智能体）** 协作研发，覆盖从需求到灰度上线/回滚的完整研发生命周期。
>
> **当前状态：P3 实现进行中。** 四个子服务的业务代码已落地于各自 submodule（详见下方实现状态）。

## 实现状态与回归前置条件

> **重要：`src/smartdesk-*` 是 git submodule。** `multica repo checkout` / `git clone` 默认不会拉取 submodule 内容，签出后 `src/smartdesk-*` 是**空目录**——这**不代表"没有代码"**。在对"有没有代码 / 有没有数据库 / 能不能回归"下任何结论前，**必须先执行 `git submodule update --init --recursive` 并核对子模块内容**（CTO 2026-06-21 硬 SOP）。基于未初始化的空目录下结论一律无效。

* **当前阶段**：**P3 实现进行中**。核心工单链路已实现并合入各 submodule。
* **`src/` 现状**：`src/openapi/*.yaml` 冻结契约 + 四个 `smartdesk-*` submodule；**submodule 指针指向真实已实现的提交**（见 `.gitmodules` 与 `git submodule status`）。
* **各服务实现概览**（核对 2026-06-21，以 submodule 指针所指提交为准）：
  | 子服务 | 语言/框架 | 实现概况 |
  |---|---|---|
  | `smartdesk-core` | Go | 工单生命周期/状态机、分派端点(manual/auto/reassign/escalate)、SLA 计时、评论/内部备注、附件、事件信封；`migrations/0001–0006`；memory+postgres 双 store（逐文件核对） |
  | `smartdesk-gateway` | NestJS | 网关/认证 BFF：JWT/RBAC、聚合转发；`src/`、`test/`、`package.json` 齐全 |
  | `smartdesk-web` | Next.js | 提单门户/坐席工作台/管理后台前端 + openapi + vitest |
  | `smartdesk-insight` | Python/FastAPI | 自动分类/相似检索/统计/通知；`app/`、`ml/`、`migrations/`、`tests/` |
* **已知功能边界（gap，属"待补功能"而非"代码不存在"）**：自动分派的**真实路由规则匹配尚未实现**（`auto` 仅落 baseline、不写回 assignee，[SUP-471](https://github.com/allenlilisec/smart-desk/issues) / `specs/core/routing-engine-contract.md`）；`escalate × SLA` 未联动；`watchers/csat/links`、真实 OSS 预签名、事务性 outbox+NATS 等。逐项见各子系统详设 §7.2 与 `specs/core/tasks.md`。
* **回归前置条件**：对**已实现功能**已具备回归条件（前提：先 `git submodule update --init --recursive`）；上述 gap 项不在回归范围。
* **运行实例说明**：`deploy/docker-compose.alpha.yml` / `canary.yml` 提供可拉起的带持久化部署；**"代码与建表脚本已存在"不等于"当前一定有一套在跑、带持久化的实例"**——是否有在跑实例属运行时/部署事实，由部署侧按需确认，本文不做断言。

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
| `src/` | 系统代码：`openapi/` 冻结契约 + 四个 `smartdesk-*` submodule（指向已实现提交，须 `git submodule update --init --recursive` 拉取后可见） |
| `deploy/` | 预发 compose 金丝雀双轨部署（`docker-compose.canary.yml`）与切换/验证脚本 |
| `README.md` | 本文件，项目总说明 |
| `.github/workflows/` | CI/CD 流水线：灰度发布、回滚、告警触发测试 |
| `.github/actions/notify-alert/` | 复用告警通知 Action |

### 监控告警配置入口

灰度发布与回滚流水线的监控告警配置见 [`specs/灰度回滚监控告警配置.md`](specs/灰度回滚监控告警配置.md)，
触发测试记录见 [`docs/监控告警触发测试记录.md`](docs/监控告警触发测试记录.md)。

主要流水线：

| 流水线 | 文件 | 用途 |
|---|---|---|
| `Deploy Canary` | `.github/workflows/deploy-canary.yml` | C1/C2/C3 灰度发布，含 G 门禁超时与失败告警 |
| `Rollback to LKG` | `.github/workflows/rollback.yml` | 一键回滚，含回滚成功/失败通知 |
| `Alert Trigger Tests` | `.github/workflows/alert-test.yml` | 告警触发测试 |

> 告警级别与 [`specs/发布监控告警基线.md`](specs/发布监控告警基线.md) P0/P1 对齐；
> G1–G5 人类确认角色为 CTO（`multica-test@hotmail.com`）。

## 金丝雀发布与回滚入口

四服务仓库均已配置 GitHub Actions 流水线：

| 仓库 | 金丝雀发布 | 回滚 |
|---|---|---|
| `smartdesk-core` | Actions → `Deploy Canary` | Actions → `Rollback to LKG` |
| `smartdesk-gateway` | Actions → `Deploy Canary` | Actions → `Rollback to LKG` |
| `smartdesk-insight` | Actions → `Deploy Canary` | Actions → `Rollback to LKG` |
| `smartdesk-web` | Actions → `Deploy Canary` | Actions → `Rollback to LKG` |

各仓库 README 详细记录了 workflow 输入参数与 GitHub Environment 配置要求。

### 人类确认点（G1–G5）

按 [`specs/灰度发布策略.md`](specs/灰度发布策略.md) §7，所有放量推进须 **CTO** 确认：

| 门禁 | 时机 | 确认人 | 说明 |
|---|---|---|---|
| G1 | 灰度启动前 | CTO | 确认 LKG 清单、策略 v1.0 已签字、staging dry-run 计划 |
| G2 | C1（5%）启动 | CTO | 确认预发验证通过、四服务镜像就绪 |
| G3 | C1 → C2 推进 | CTO | 确认 C1 观测窗口 P0/P1 清零、SLI 达标 |
| G4 | C2 → C3 推进 | CTO | 确认 C2 观测窗口 P0/P1 清零、SLI 达标 |
| G5 | C3 全量（100%） | CTO | 确认 C3 观测 60 min 达标后提请全量 |

> **告警清零 ≠ 自动放量**。流水线通过 GitHub Environment 的 required reviewers 实现 G 门禁人工确认；不自动推进 C1→C2→C3。

### 预发 compose 操作

```bash
# 从仓库根目录执行
docker compose -f deploy/docker-compose.canary.yml up -d --build

# C1 / C2 / C3 / rollback
./deploy/scripts/canary-stage.sh c1
./deploy/scripts/canary-stage.sh c2
./deploy/scripts/canary-stage.sh c3
./deploy/scripts/canary-stage.sh rollback

# 验证分流比例
./deploy/scripts/verify-split.sh http://localhost:19080/api/ 200
```

## 契约门禁工具（G-X / G-X-E）

冻结契约 [`src/openapi/insight.yaml`](src/openapi/insight.yaml) 是前后端、跨服务的唯一事实源。两条 CI 必过项据此双检：

| 门禁 | 脚本 | 校验对象 |
|---|---|---|
| **G-X** | `scripts/api_contract_check.py` | 调用方端点路径与 OpenAPI 提供方契约一致（路径 / 方法 / 废弃路径） |
| **G-X-E** | `scripts/event_schema_check.py` | 跨服务领域事件 **payload 字段名**与冻结契约逐字段一致（缺 required / 字段改名 / 未定义新字段） |

### G-X-E 运行说明

```bash
# 生产源（CI 中子模块未检出时自动跳过对应扫描根，退出 0）
python scripts/event_schema_check.py --config scripts/event-schema-check.json

# 自测（fixture）
python -m pytest tests/contract/test_event_schema_check.py -q
```

退出码：`0` 无漂移；`1` 发现漂移 / 缺 required / 未定义字段；`2` 用法或解析错误。

判定规则：按信封 `event_type` 硬编码映射到 payload schema（与契约 §3.1 表一致，SUP-17 裁决⑤），
运行时解析 `insight.yaml` 的 `required` / `properties` 键集，对每个发布点构造的字段集合 `F` 比对：
缺 `required`（`R−F`）或出现未定义字段（`F−P`，已扣除 allowlist）即 FAIL；仅缺 optional 字段放行（向后兼容）。
发布点识别策略与局限见 `scripts/event_schema_check.py` 模块 docstring。

### 误报处理路径

- **意图性新增 optional 字段**（向后兼容、尚未 bump version）：在 `scripts/event-schema-check.json`
  的 `allowlist` 临时登记 —— `{"<SchemaName>": ["<新增字段名>"]}`，并在 PR 描述记 version 演进 TODO。
  allowlist 仅用于「多出 schema 未定义字段」一类，**不得**用于绕过缺 required 或字段改名/删除等破坏性变更。
- **发布点用变量传 payload 致漏报**（`payload=build_xxx()` 而非内联字面量）：脚本无法提取字段，
  改用内联字面量或在 PR 说明标注。
- **契约本身有歧义**：不要自行改契约，回 [SUP-414] @梁栋裁决。
- 字段改名（如 `from_status`→`from`）会同时触发「缺 required 原名」+「多未定义新名」两条，属预期拦截，应修代码而非加 allowlist。

## AI 研发虚拟组织

研发执行由一个基于 Multica 平台的虚拟组织承担，组织结构、模型映射、研发流程、质量门禁与成本论证详见
[《AI研发虚拟组织说明书》](specs/AI研发虚拟组织说明书.md)。

- **11 个团队 / 21 个智能体**，覆盖项目管理、产品需求、架构设计、前端/后端/智能服务开发、Committer 委员会、测试（功能+安全）、质量管理、发布运维、资料团队。
- **算力** 由 6 个本地 CLI 运行时提供：claude(Opus)、codex(GPT-5.5)、cursor(Composer)、gemini(Flash)、kimi(2.7)、opencode(GLM-5)。**每个智能体绑定固定模型、不可修改**；需要不同模型能力时只新建智能体。
- **质量门禁**：各实现团队 Leader 兼 committer 负责本域代码审视合入；关键代码须经集体检视（≥2 名开发、累计 ≥3 分含 committer 1 分；网关认证/RBAC 加后端+安全双评审）方可合入；Committer 委员会统管跨域合入；质量管理团队只做流程治理/方法论与红黑事件复盘（不做代码评审）；验收对照业界技术规范（安全 OWASP/CIS、可靠性、性能等，见说明书 §10.3）。

## 落地方式

组织结构经人类审视通过后，由 **CTO 直接通过 Multica 平台能力**（`multica agent/squad/autopilot` 等）创建全部技能、智能体、小队与自动化，无需脚本，也无需界面手工设置（按名称判重，幂等执行）。

代码仓托管在 **GitHub**（账号 `allen.lili@outlook.com`），`smartdesk-web` / `smartdesk-gateway` / `smartdesk-core` / `smartdesk-insight` 四个仓库均已创建并在持续实现中，以 submodule 形式挂载于本仓 `src/` 下。
