# SmartDesk 契约总纲（OpenAPI）

> M1 整体大设计的接口唯一事实源。OpenAPI 3.1。梁栋产出、秦诺维护与一致性校验（`api-contract-check`）。
> 设计背景与数据模型/事件/信任模型见 [`../../specs/SmartDesk系统架构设计说明书.md`](../../specs/SmartDesk系统架构设计说明书.md)。
>
> **状态：v1.0-draft，待 CTO 评审 → 人类冻结。契约冻结前各开发团队不得编码。**

| 契约 | 服务 | 语言 | 暴露面 |
|---|---|---|---|
| [`gateway.yaml`](gateway.yaml) | smartdesk-gateway | TS/NestJS | **对外唯一入口**：`/api/v1`，JWT 认证 + RBAC 收口 + 限流，聚合 core/insight |
| [`core.yaml`](core.yaml) | smartdesk-core | Go | **内部**：`/v1`，工单域 + 权威配置；仅 gateway 经服务令牌调用 |
| [`insight.yaml`](insight.yaml) | smartdesk-insight | Python/FastAPI | **内部**：`/v1`，分类/相似/统计/通知；仅给建议，事件异步消费写回 |

## 覆盖 PRD §6"首批待定义契约"清单

建单、查询/列表（过滤/分页）、状态流转、分派、评论/备注、附件、SLA 查询、分类预测、相似推荐、统计聚合、事件 schema、通知发送 — 全部覆盖（事件 schema 见 `insight.yaml#/components/schemas/DomainEvent` 与设计文档 §5）。

## 通用约定（三份共用）

- 版本：对外 `/api/v1`、内部 `/v1`；破坏性变更升 `v2` 并行。
- 错误模型：`Error{code, message, details?, trace_id}`。
- HTTP 语义：400 校验 / 401 未认证 / 403 越权 / 404 不存在 / 409 状态冲突·非法跃迁 / 413 附件超限 / 422 业务规则 / 429 限流。
- 分页：`page`/`page_size`，响应 `{items, page, page_size, total}`。
- 幂等：写操作支持 `Idempotency-Key` 头。
- 时间 RFC3339 UTC；时长用整数（分钟/秒）。
- 安全：gateway `bearerAuth`(用户 JWT)；core/insight `serviceAuth`(gateway 服务令牌) + `X-User-*` 透传身份。

## 校验

```bash
# 秦诺：契约一致性与实现校验
multica skill ... # api-contract-check（详见技能）
# 本地快速语义校验（可选）
pip install openapi-spec-validator && \
  python -c "from openapi_spec_validator import validate; import yaml; [validate(yaml.safe_load(open(f,encoding='utf-8'))) for f in ['src/openapi/gateway.yaml','src/openapi/core.yaml','src/openapi/insight.yaml']]"
```

任何契约变更须经架构（梁栋）批准；秦诺把守跨服务共享 schema（Error/分页/事件）与版本管理。
