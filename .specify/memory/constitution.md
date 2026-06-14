<!--
Sync Impact Report
- Version change: (none) → 1.0.0  (首次固化)
- Modified principles: 首次定义，无
- Added sections: 核心原则 I–VII、附加约束（架构红线 / 安全基线）、质量门禁、治理
- Removed sections: 无
- Templates requiring updates:
  - .specify/templates/plan-template.md  ✅ Constitution Check 槽位与本宪法原则对齐
  - .specify/templates/spec-template.md  ✅ 不引入实现细节，与原则 I（契约优先）兼容
  - .specify/templates/tasks-template.md ✅ 任务分组含测试/可观测/版本纪律
- Follow-up TODOs:
  - TODO(RATIFICATION_DATE): 本宪法待梁栋评审 + CEO 报备后由人类确认正式批准日；当前为草拟日。
-->

# SmartDesk 项目宪法 / Project Constitution

> 适用范围：SmartDesk 智能服务平台全部代码仓（`smartdesk-gateway` / `smartdesk-core` / `smartdesk-insight` / `smartdesk-web`）与契约（`src/openapi/*.yaml`）。
> 本宪法是**质量与协作的最高约束**；与下游设计/任务冲突时以本宪法为准，除非经治理流程修订。
> 上游依据：[《AI 研发虚拟组织说明书》](../../specs/AI研发虚拟组织说明书.md)（架构红线、§10.3 规范基线、§11 合入门禁）、[PRD v1.0](../../specs/SmartDesk产品需求说明书PRD.md)。

## 核心原则 / Core Principles

### I. 契约优先（Contract-First，不可协商）
接口的**唯一事实源**是 `src/openapi/` 下的 OpenAPI 3.1 契约（`gateway.yaml` / `core.yaml` / `insight.yaml`）。
- 任何跨服务/对外接口 MUST 先在契约中定义并通过评审，**契约冻结前不得编码实现**。
- 实现 MUST 与契约一致，由契约维护人（秦诺）用 `api-contract-check` 持续校验；漂移即缺陷。
- 破坏性变更 MUST 升 `v2` 并并行，不得就地破坏 `v1`。
- **理由**：四仓三语并行，唯有契约先行能让前后端、跨服务解耦推进且可独立验收。

### II. 文档单一事实源（Single Source of Truth）
系统级设计的唯一人类可读事实源是 `specs/SmartDesk系统详细设计与实现说明书.md`。
- 模块详设 MUST 自该系统详设**自顶向下**派生，不得自下而上倒推为系统详设。
- 设计与契约/PRD 冲突时，MUST 显式记录冲突并经治理裁决，不得静默偏离。
- `.specify/` 工作产物保留为生成轨迹，但不替代上述事实源文档。
- **理由**：避免"文档考古"与多版本漂移；纠偏本轮自下而上的方法论错误。

### III. 服务边界与架构红线（不可协商）
系统 MUST 维持 **≥3 微服务（gateway/core/insight）+ 前端 web、4 代码仓、3 门语言（TS/Go/Python）** 的形态。
- 鉴权 MUST 在 gateway 收口，RBAC 最小权限；后端服务不直接面向浏览器。
- 服务边界与数据归属以系统详设为准；越界访问他服务数据库或绕过 gateway 即违规。
- **理由**：组织级架构红线（SUP-9 / 组织说明书），是验收下限，不达标驳回。

### IV. 核心链路可降级、AI 异步不阻塞（不可协商）
建单等核心链路 MUST 在 AI / 事件总线不可用时仍可成功完成（降级）。
- 分类/定级/相似等 AI 能力 MUST 经事件总线**异步**计算并**异步写回**，不阻塞主流程。
- insight 只产出"建议"，落库决策权在 core；AI 故障仅导致建议为空/懒加载降级，不影响业务闭环。
- **理由**：可用性 ≥99.5% 与建单不中断是产品底线（PRD §7 / NFR）。

### V. 质量门禁与集体检视（不可协商）
关键代码合入 MUST 满足组织 §11 门禁：**≥2 名开发集体检视、累计评分 ≥3 分（且至少含 1 名 committer）**。
- 安全关键代码（gateway 认证/RBAC）合入 MUST 加**后端 + 安全双评审**。
- 越权/鉴权用例、状态机非法跃迁用例 MUST 全过，作为安全/功能红线。
- 无测试或测试不过的变更不得合入；CI 绿灯是合入前置。
- **理由**：质量是受控产出而非个人裁量，评分门禁保证集体责任。

### VI. 幂等、可审计、最终一致
写操作 MUST 幂等（状态流转/分派/通知支持 `Idempotency-Key`）。
- 领域事件 MUST 至少一次送达且消费方按 `event_id` 去重幂等。
- 关键操作 MUST 写不可篡改的时间线/审计（仅追加，普通角色不可改删）。
- 跨服务一致性以事件为唯一同步通道，读模型最终一致，不共享事务。
- **理由**：服务台的合规与可追溯要求；异步架构下的正确性基线。

### VII. 安全与隐私基线
MUST 遵循 OWASP ASVS / Top10：强制鉴权与 RBAC、输入校验、越权防护、传输加密（TLS）、审计日志。
- PII 最小化；附件下载经鉴权；敏感凭证（密码哈希）仅存于 gateway，core/web/insight 不持有。
- 留存期/法务合规（OQ-10）MUST 在 M4 灰度放行前由人类/法务闭环（不阻塞 M1/M2）。
- **理由**：服务台承载员工 PII 与内部数据，安全是放行前置。

## 附加约束 / 架构与规范基线

- **技术栈**：gateway=TS/NestJS、core=Go、insight=Python/FastAPI、web=TS/Next.js；OLTP=PostgreSQL、对象存储=S3/MinIO、会话/限流=Redis、事件总线=NATS JetStream（RabbitMQ 等价备选，事件 schema 与实现解耦）。
- **版本与时间**：对外 `/api/v1`、内部 `/v1`；时间 RFC3339 UTC；时长用整数（分钟/秒）避免浮点。
- **多租户预留**：全业务表含 `org_id`，一期固定单组织、不实现隔离逻辑（OQ-7）。
- **可观测性**：结构化日志 + `trace_id` 全链路透传、`/metrics`(Prometheus)、`/healthz`+`/readyz`、OpenTelemetry 链路追踪。
- **规范基线**：对照组织说明书 §10.3（安全/可靠性/性能/代码质量）清单，由质量管理团队维护、测试团队据此验收。

## 质量门禁 / Quality Gates（合入前置）

1. 契约一致性校验通过（`api-contract-check`），无契约漂移。
2. 关键代码 ≥2 人检视、累计 ≥3 分含 committer；安全关键加后端+安全双评审。
3. 单元/集成测试通过，越权/鉴权与状态机非法跃迁用例必过。
4. 系统详设为唯一事实源；**冻结为受控动作**——草稿先 `in_review`，经资料团队评审、@CEO 报备，未经架构 Leader（梁栋）确认不得宣布冻结。

## 治理 / Governance

- **修订流程**：本宪法的修订（新增/删除/重定义原则）由架构设计团队（Leader 梁栋）提案 → 评审 → 触及人类决策项报 CEO；记录于 Sync Impact Report 并按语义化版本升级。
- **版本策略**：MAJOR=向后不兼容的治理/原则移除或重定义；MINOR=新增原则或实质扩充；PATCH=措辞/澄清/笔误。
- **合规检视**：每次 `/plan`、每次关键合入 MUST 执行 Constitution Check；违反项须在计划的 Complexity Tracking 显式论证，否则驳回。
- **裁决路由**：设计/契约实质争议交架构设计团队（梁栋）裁决；契约总纲与 `gateway.yaml`/`core.yaml`/`insight.yaml` 的最终拍板权在梁栋；触及人类决策的节点先报 CEO。

**版本 / Version**: 1.0.0 | **批准日 / Ratified**: TODO(RATIFICATION_DATE：待梁栋评审 + CEO 报备后由人类确认) | **最近修订 / Last Amended**: 2026-06-14
