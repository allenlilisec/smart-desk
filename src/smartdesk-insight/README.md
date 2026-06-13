# smartdesk-insight

智能分析服务（Python / FastAPI）。MVP 范围：事件消费骨架 + 站内通知。

## 范围

- INS-1 事件消费骨架：NATS JetStream 订阅 `ticket.created/assigned/status_changed` 等事件，`event_id` 幂等去重。
- INS-6 站内通知：通知发送/查询/已读/策略配置，`/healthz` 健康检查。

## 运行

```bash
# 本地开发
pip install -r requirements.txt
DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/smartdesk_insight" \
NATS_URL="nats://localhost:4222" \
  uvicorn app.main:app --reload

# Docker
docker build -t smartdesk-insight .
docker run -p 8000:8000 -e DATABASE_URL=... -e NATS_URL=... smartdesk-insight
```

## 测试

```bash
pytest tests/ -v
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/smartdesk_insight` | PostgreSQL 连接串 |
| `NATS_URL` | `nats://localhost:4222` | NATS 地址 |
| `NATS_STREAM` | `SMARTDESK_EVENTS` | JetStream stream 名 |
| `NATS_CONSUMER` | `insight-consumer` | 消费者名 |
| `NATS_SUBJECT` | `smartdesk.ticket.*` | 订阅 subject |
| `NATS_DURABLE` | `insight-durable` | 持久消费者名 |
| `PORT` | `8000` | HTTP 端口 |

## 契约

实现遵循 `openapi/insight.yaml`：

- `GET /healthz` liveness
- `GET /notifications` 通知列表
- `POST /notifications` 发送通知（202 + 幂等）
- `POST /notifications/{notifId}/read` 标记已读
- `GET/PUT /notifications/policies` 策略查询/配置
