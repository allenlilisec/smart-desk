# Phase 1 Quickstart: SmartDesk 本地起栈与主链路验证

**Date**: 2026-06-14
> 目标：在本机拉起四服务 + 依赖中间件，跑通"提单 → 异步分类写回 → 状态流转 → 关闭"主链路，并验证降级与越权红线。**契约冻结后**方可进入实现，本文为验证脚手架约定。

## 依赖中间件
- PostgreSQL（core OLTP + insight schema）
- Redis（gateway 会话/限流）
- NATS JetStream（事件总线，Stream `SMARTDESK_EVENTS`）
- S3/MinIO（附件对象存储）

## 起栈顺序
1. 中间件（PG / Redis / NATS / MinIO）
2. core（迁移 schema + 种子：roles、初始分类树、SLA v1 基线策略）→ `/readyz` 绿
3. insight（连 PG 读模型 + 订阅 NATS）→ `/readyz` 绿
4. gateway（连 core/insight + Redis，签发 service-jwt）→ `/readyz` 绿
5. web（指向 gateway `/api/v1`）

## 主链路验证（Happy Path）
1. `POST /api/v1/auth/login` 取 JWT（requester）。
2. `POST /api/v1/tickets`（标题+描述）→ 201 返回工单号，状态 `new`（**即时成功**）。
3. 观察 `ticket.created` 事件 → insight 消费 → `insight.classification_suggested` → core 落"建议态"。
4. `GET /api/v1/tickets/{id}/suggestion` 看到分类/定级建议；`GET …/similar` 看到相似（懒加载）。
5. 坐席登录 → `POST …/transitions`（accept→in_progress→resolve）；非法跃迁返回 409。
6. requester `confirm` → `closed`；7 天内 `reopen` 可回 `in_progress`。

## 降级验证（原则 IV / SC-002）
- 停掉 insight 或 NATS → 重复步骤 2：建单**仍 201 成功**；步骤 4 建议为空/相似懒加载降级；主流程不受影响。

## 安全红线验证（SC-006）
- requester 访问他人工单/管理后台/内部备注 → 403 且记审计。
- 直连 core/insight（绕过 gateway）→ 网络层/服务令牌校验拒绝。
- 超速率阈值 → 429。
- 附件 >20MB/非白名单 → 413/拒绝；越权下载 → 403。

## 契约校验
```bash
# 秦诺：实现与契约一致性
multica skill ...   # api-contract-check
# 本地语义校验（可选）
pip install openapi-spec-validator && \
  python -c "from openapi_spec_validator import validate; import yaml; [validate(yaml.safe_load(open(f,encoding='utf-8'))) for f in ['src/openapi/gateway.yaml','src/openapi/core.yaml','src/openapi/insight.yaml']]"
```
