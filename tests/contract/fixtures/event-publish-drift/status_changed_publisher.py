"""B1 漂移 fixture：smartdesk-core 发布 ticket.status_changed 但 payload 字段漂移。

错误地用 `from`/`to` 顶替契约字段 `from_status`/`to_status`，且漏掉 required 的
`requester_id`。event-schema-check 必须稳定拦截：
  - 缺 required: {requester_id, to_status}
  - 未定义字段: {from, to}

仅用于 event-schema-check 自测，非生产代码。
"""


def publish_status_changed(bus, ticket, old, new):
    event = {
        "event_id": ticket.event_id,
        "event_type": "ticket.status_changed",
        "occurred_at": ticket.now,
        "ticket_id": ticket.id,
        "version": 1,
        "payload": {
            "from": old,
            "to": new,
        },
    }
    bus.publish(event)
