# Phase 0 Research: SmartDesk 系统级选型与裁决

**Date**: 2026-06-14 | **Plan**: [plan.md](./plan.md)
> 所有 spec 级 NEEDS CLARIFICATION 已由 [PRD §10.1](../SmartDesk产品需求说明书PRD.md) 冻结裁决解决（见 spec.md Clarifications）。本文件记录**技术选型**与未决项的 Decision / Rationale / Alternatives，沿用《系统架构设计说明书》既有结论。

## R1. 事件总线选型
- **Decision**: NATS JetStream（持久流、至少一次 + ACK、序号去重、三语 SDK、单机可跑）。
- **Rationale**: 满足"AI 异步写回不阻塞主流程""通知至少一次+消费幂等"；多语言栈契合；运维轻量契合本机并行上限。
- **Alternatives**: RabbitMQ（等价备选，运维已有则可换）；同步调用（✗，AI 故障会阻塞建单，违反原则 IV）。**事件 schema 与总线实现解耦**，切换不影响契约。

## R2. 相似检索路线
- **Decision**: 一期 PostgreSQL 全文检索（中文分词）+ 标题/分类相似；`similarity_index.embedding` 列与 ANN 索引预留。
- **Rationale**: OQ-5 一期关键词、二期向量；契约不绑定实现，前向兼容。
- **Alternatives**: 一期直接向量（成本/选型未定，推迟二期）；OpenSearch（实现选型可 M3 详设再定，契约已兼容）。

## R3. 配置数据归属
- **Decision**: 分类树(taxonomy) + SLA 策略 → **core**；通知策略 → **insight**；认证凭证 → **gateway**、角色主数据 → **core**。
- **Rationale**: 策略与执行同归避免漂移（SLA 计时在 core、通知发送在 insight）；OQ-2 认证在 gateway 收口但角色授予属业务主数据。
- **Alternatives**: 独立配置服务（一期过度设计，否）。
- **裁决归属**: 实质归属决策权在梁栋（已在架构说明书 §2.3 记录，本轮沿用）。

## R4. 服务间信任与令牌
- **Decision**: gateway 校验用户 JWT + RBAC 后，以 mTLS + 短时 `service-jwt`(iss=gateway, aud=core|insight) 调内部服务，并透传 `X-User-Id/Roles/Org/Request-Id`；后端不二次鉴权，仅做领域级数据过滤（纵深防御）。
- **Rationale**: 鉴权 gateway 收口（原则 III）；后端只信任 gateway；最小权限的领域过滤防御内部越权。
- **Alternatives**: 后端各自校验用户 JWT（重复鉴权、密钥扩散，否）。

## R5. IdP 可插拔（OQ-2）
- **Decision**: 认证抽象 `IdentityProvider` 接口，一期 `LocalProvider`（用户名/密码+JWT），预留 `OidcProvider`。
- **Rationale**: 二期接 SSO/OIDC 不改业务侧与下游契约。

## R6. SLA 模型（OQ-1）
- **Decision**: `sla_policies` + `sla_policy_targets`(优先级→响应/解决分钟) + `sla_timers`(快照 priority/policy、可暂停累计、due_at 顺延、breached 标记)。v1 基线值入种子，admin 可配。
- **Rationale**: "优先级驱动、可配置、可暂停"，数值可调不改契约形态。

## R7. 降级路径（原则 IV）
- **Decision**: 建单在 core 单事务内"校验→落库(status=new)→启动 SLA→写时间线→发 ticket.created→立即返回工单号"；AI 可用性与建单成败无关。insight/总线故障仅致建议为空/相似懒加载降级。
- **Rationale**: SC-002 建单 100% 成功；NFR 可用性。

## R8. 多租户预留（OQ-7）
- **Decision**: 全业务表含 `org_id`（非空，一期固定 `default`），索引/外键带 `org_id`；一期不实现隔离逻辑。
- **Rationale**: 避免二期推倒重来；对外契约不暴露 `org_id`（gateway 注入）——**已裁定 D4：不暴露**（2026-06-14 梁栋）。

## 契约决策 D1–D5（已裁定）
见 [plan.md §契约决策 D1–D5](./plan.md) 与系统详设 §13：D1 建议写回=纯事件、D2 聚合边界=A、D3 事件分区/顺序入附录、D4 `org_id` 不对外、D5 csat 一期对外补齐/watchers·links 随 M3 透出。已据此更新 OpenAPI 并通过一致性校验，无悬置项。
