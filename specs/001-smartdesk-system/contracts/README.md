# Phase 1 Contracts — 指针（唯一事实源在 `src/openapi/`）

**Date**: 2026-06-14
> 本目录**不复制契约**，仅指向接口唯一事实源，避免双份漂移（宪法原则 I/II）。
> 契约维护与一致性校验：秦诺（`api-contract-check`）；契约最终拍板权：梁栋。

| 契约 | 服务 | 暴露面 | 文件 |
|---|---|---|---|
| gateway | smartdesk-gateway (TS/NestJS) | 对外唯一入口 `/api/v1`，JWT+RBAC+限流，聚合 | [`../../../src/openapi/gateway.yaml`](../../../src/openapi/gateway.yaml) |
| core | smartdesk-core (Go) | 内部 `/v1`，工单域+权威配置 | [`../../../src/openapi/core.yaml`](../../../src/openapi/core.yaml) |
| insight | smartdesk-insight (Py/FastAPI) | 内部 `/v1`，分类/相似/统计/通知 | [`../../../src/openapi/insight.yaml`](../../../src/openapi/insight.yaml) |

## 端点速览（现状）
- **gateway**: `/auth/{login,refresh,logout,me}`、`/tickets`(±id)、`/tickets/{id}/{transitions,assignments,comments,attachments,sla,timeline,similar,suggestion}`、`/attachments/{id}/download`、`/stats`(±export)、`/notifications`、`/admin/{categories,sla-policies,users,notification-policies}`。
- **core**: `/tickets`(±id)、`/tickets/{id}/{transitions,assignments,comments,attachments,links,sla,timeline,watchers,csat}`、`/attachments/{id}/download-url`、`/config/{categories,sla-policies,users,users/{id}/roles}`、`/healthz`、`/readyz`。
- **insight**: `/classification/predict`、`/similarity/search`、`/stats/{aggregate,export}`、`/notifications`(±read)、`/notifications/policies`、`/feedback/classification`、`/healthz`、`/readyz`。

## 通用约定（三份共用）
对外 `/api/v1`、内部 `/v1`；`Error{code,message,details?,trace_id}`；HTTP 语义 400/401/403/404/409/413/422/429；分页 `page/page_size`→`{items,page,page_size,total}`；写操作 `Idempotency-Key`；时间 RFC3339 UTC、时长整数；安全 `bearerAuth`(对外 JWT) / `serviceAuth`(内部服务令牌)+`X-User-*`。

## ⚠ 契约面一致性缺口（待梁栋裁决，见 plan §待裁决）
1. **建议写回端点**：gateway 暴露 `/tickets/{id}/suggestion`(读/采纳)，但 core.yaml 未见内部写回端点——写回走"事件消费落库"还是"core 内部端点"待定。
2. **CSAT/watchers/links 对外暴露**：core 有 `/csat`、`/watchers`、`/links`，gateway 未全部透出——一期对外聚合面是否补齐待定。
