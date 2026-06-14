# Implementation Plan: SmartDesk 智能服务平台（系统级详细设计）

**Feature Directory**: `001-smartdesk-system` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)
**Input**: spec.md + [.specify/memory/constitution.md](../../.specify/memory/constitution.md)
**整理为唯一事实源**: [specs/SmartDesk系统详细设计与实现说明书.md](../SmartDesk系统详细设计与实现说明书.md)（由本 plan 派生）

## Summary
SmartDesk 为企业内部 AI 辅助工单/服务台。系统采用 **gateway(TS/NestJS) + core(Go) + insight(Py/FastAPI) 三微服务 + web(TS/Next.js) 前端、4 仓 3 语言** 形态：gateway 收口认证/RBAC/限流并对前端聚合 BFF；core 持工单域权威状态、状态机、SLA 计时、权威配置（分类树/SLA 策略/用户角色）并发布领域事件；insight 异步消费事件产出分类/定级/相似建议、统计读模型与通知，**只给建议、异步写回、不阻塞主流程**；事件总线 NATS JetStream（至少一次+幂等）。契约唯一事实源为 `src/openapi/{gateway,core,insight}.yaml`（OpenAPI 3.1）。

## Technical Context
**Language/Version**: TS(Node 20/NestJS) · Go 1.22 · Python 3.12(FastAPI) · TS(Next.js) 前端
**Primary Dependencies**: NestJS、Go(net/http + 选定 web 框架)、FastAPI、Next.js/React；NATS JetStream 客户端（三语 SDK）
**Storage**: PostgreSQL（core OLTP + insight 独立 schema 读模型）；S3/MinIO 对象存储（附件）；Redis（gateway 会话/刷新令牌/限流）
**Testing**: 各服务单测 + 跨服务集成测试（事件链路）；契约校验 `api-contract-check`；越权/状态机非法跃迁用例
**Target Platform**: 容器化微服务，单机可本地运行（契合 6 运行时/本机并行上限）
**Project Type**: microservices（4 仓）
**Performance Goals**: 列表/详情 P95<500ms；AI 分类/相似 P95<2s 且不阻塞；建单链路降级 100% 成功
**Constraints**: 鉴权 gateway 收口；AI 异步写回；事件至少一次+幂等；全表 `org_id` 多租户预留；检索前向兼容向量
**Scale/Scope**: 一期单组织；F1–F7 全能力域；M2 MVP→M3 智能→M4 加固

## Constitution Check
*GATE：Phase 0 前通过；Phase 1 后复核。逐条对照 [constitution.md](../../.specify/memory/constitution.md)。*

| 原则 | 是否满足 | 设计落点 |
|---|---|---|
| I 契约优先 | ✅ | 三份 OpenAPI 3.1 为唯一接口事实源；`api-contract-check` 守一致；破坏升 v2 |
| II 文档单一事实源 | ✅ | 系统详设自顶向下派生；`.specify/` 留生成轨迹；既有 gateway 子系统文档不作系统详设 |
| III 服务边界/红线 | ✅ | 3 微服务+web、4 仓、3 语言；gateway 收口；后端不直面浏览器 |
| IV 可降级/AI 异步 | ✅ | 建单同步落库即成功；分类/定级/相似经事件总线异步写回（§8 流程） |
| V 质量门禁 | ✅ | ≥2 人检视 ≥3 分含 committer；gateway 认证/RBAC 加后端+安全双评审；用例红线 |
| VI 幂等/审计/最终一致 | ✅ | `Idempotency-Key`；事件 `event_id` 去重；时间线仅追加；读模型最终一致 |
| VII 安全/隐私 | ✅ | OWASP；密码哈希仅 gateway；附件鉴权；OQ-10 M4 闭环 |

**结论**：无未论证的违反项，Complexity Tracking 为空。Phase 1 设计后复核仍满足。

## Complexity Tracking
*（无违反项，留空。）*

## Project Structure

### Documentation (this feature)
```
specs/001-smartdesk-system/
├── spec.md          # WHAT/WHY + Clarifications（吸收 PRD §10.1）
├── plan.md          # 本文件（HOW 概要 + 门禁）
├── research.md      # Phase 0：选型与未知项裁决
├── data-model.md    # Phase 1：实体/字段/关系/状态机
├── quickstart.md    # Phase 1：本地起栈与主链路验证
├── checklists/requirements.md
└── contracts/       # Phase 1：指向 src/openapi（唯一事实源，不复制）
```

### Source Code (repository root)
```
src/
├── openapi/         # 契约唯一事实源（gateway.yaml / core.yaml / insight.yaml）
├── smartdesk-gateway/   # TS/NestJS（认证/RBAC/聚合 BFF/限流）
├── smartdesk-core/      # Go（工单域/状态机/SLA/配置/事件发布）
├── smartdesk-insight/   # Py/FastAPI（分类/相似/统计/通知/事件消费）
└── smartdesk-web/       # TS/Next.js（三端 UI）
```

## Phase 0: Outline & Research → [research.md](./research.md)
解决选型与裁决映射：事件总线（NATS JetStream）、检索路线（关键词→向量预留）、配置归属、服务间信任、IdP 可插拔、SLA 模型、降级路径。所有 spec NEEDS CLARIFICATION 已由 PRD §10.1 解决。

## Phase 1: Design & Contracts → [data-model.md](./data-model.md)、[contracts/](./contracts/)、[quickstart.md](./quickstart.md)
- 数据模型：core OLTP 实体 + insight 读模型 + 八态状态机 + ER 关系（data-model.md）。
- 契约：复用并校验 `src/openapi/*.yaml`（contracts/ 指向之）。
- quickstart：本地起栈 + 提单→分类写回→关闭主链路验证步骤。

## Phase 2: Task planning approach（描述，不在本命令执行）
后续 `/tasks`（P3）将按 data-model 实体、contracts 端点、用户故事优先级生成依赖有序任务，按服务/团队分组（见系统详设 §模块与任务划分）。

---

## 契约决策 D1–D5（已裁定，2026-06-14 梁栋）
> 全部裁定详见系统详设 [§13](../SmartDesk系统详细设计与实现说明书.md)。摘要：

1. **D1 建议写回 = 纯事件**：不新增 core 同步写回端点；AI 写回经 `insight.classification_suggested` → core 幂等写 `Ticket.suggestion` 字段；读取来源=core 工单详情字段；人工采纳/纠偏走 gateway `POST /tickets/{id}/suggestion`（同步）。
2. **D2 聚合边界 = A**：gateway 合工单主体，相似/建议懒加载（`/similar`、`/suggestion`）。维持现状契约。
3. **D3 事件分区/顺序**：`ticket_id` 一致性哈希分区、单工单保序、跨工单不保证全局序、消费侧 `event_id` 幂等 —— 写入 `insight.yaml` DomainEvent 附录。
4. **D4 `org_id` 不进对外契约**：gateway 从 JWT 注入、服务间 `X-Org-Id` 透传；二期多租户升 `v2` 并行。
5. **D5 csat/watchers/links 分级**：csat 一期对外补齐（gateway 新增 `GET/POST /tickets/{id}/csat`）；watchers/links 暂不对外，随 M3 落地透出。

> 本轮契约改动：`gateway.yaml`(+csat 路径与 schema)、`insight.yaml`(+事件分区/顺序附录)；`core.yaml` 无改动。已过 `openapi-spec-validator` 与契约↔契约一致性校验。**无悬置契约决策。**
