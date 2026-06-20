# Phase 1 Contracts — 指针（唯一事实源在 `src/openapi/`）

**Date**: 2026-06-14
> 本目录**不复制契约**，仅指向接口唯一事实源，避免双份漂移（宪法原则 I/II）。
> 契约维护与一致性校验：秦诺（`api-contract-check`）；契约最终拍板权：梁栋。

> 📌 **跨服务契约冻结（SUP-398，2026-06-20）**：事件 payload schema 的 producer/consumer 责任边界与演进规则、服务间鉴权（`service-jwt` / `CORE_SERVICE_TOKEN` 签发/校验/注入/轮换/运维规程）已统一冻结于 [`docs/architecture/contracts.md`](../../../docs/architecture/contracts.md)。事件字段事实源仍为 `src/openapi/insight.yaml`。

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

## 契约面一致性（D1/D5 已裁定，2026-06-14 梁栋）
1. **建议写回（D1=纯事件）**：不新增 core 同步写回端点。AI 写回经 `insight.classification_suggested` 事件 → core 幂等写 `Ticket.suggestion` 字段；gateway `GET /tickets/{id}/suggestion` 读取来源即 core 工单详情 `Ticket.suggestion`（`core.yaml` 已建模）；人工采纳/纠偏走 gateway `POST /tickets/{id}/suggestion`（同步，非 AI 写回）。缺口语义闭合，契约面无新增 core 端点。
2. **csat（D5=一期对外补齐）**：gateway 已新增 `GET/POST /tickets/{id}/csat`，POST 映射 core `POST /tickets/{id}/csat`、GET 读 core 工单详情 csat 字段；`CsatCreate` 与 core 对齐。
3. **watchers/links（D5=暂不对外）**：随 M3（CORE-B4 关联合并 / INS-6 通知 UX）落地时再透出，避免端点虚挂；届时按契约变更治理（梁栋审批）。
4. **事件分区/顺序（D3）**：`ticket_id` 一致性哈希分区、单工单保序、跨工单不保证全局序、消费侧 `event_id` 幂等 —— 已写入 `insight.yaml` DomainEvent 描述。
