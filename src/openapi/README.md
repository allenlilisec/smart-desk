# SmartDesk 契约总纲（OpenAPI）

> M1 整体大设计的接口唯一事实源。OpenAPI 3.1。梁栋产出、秦诺维护与一致性校验（`api-contract-check`）。
> 设计背景与数据模型/事件/信任模型见 [`../../specs/SmartDesk系统架构设计说明书.md`](../../specs/SmartDesk系统架构设计说明书.md)。
>
> **状态：v1.1.0，MVP 轻量实现冻结。核心契约已对齐轻量 MVP 事实源（SUP-447 架构裁决）。**

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
- 安全：
  - gateway 对外使用 `bearerAuth`（用户 JWT）
  - core/insight 内部使用 `serviceAuth`（gateway 服务令牌）：
    - gateway 私钥签发 service-jwt，claim 承载最终用户身份（`sub`=用户ID、`roles`=角色数组、`org_id`=租户）
    - core/insight 验签后从 claim 读取身份，**不再接受 `X-User-*` / `X-Org-Id` 明文透传头**（SUP-194 已移除，防伪造）
    - 验签失败返回 401

## 校验

```bash
# 秦诺：契约一致性与实现校验
multica skill ... # api-contract-check（详见技能）
# 本地快速语义校验（可选）
pip install openapi-spec-validator && \
  python -c "from openapi_spec_validator import validate; import yaml; [validate(yaml.safe_load(open(f,encoding='utf-8'))) for f in ['src/openapi/gateway.yaml','src/openapi/core.yaml','src/openapi/insight.yaml']]"
```

任何契约变更须经架构（梁栋）批准；秦诺把守跨服务共享 schema（Error/分页/事件）与版本管理。
