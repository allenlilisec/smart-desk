"""合规 fixture：多个发布点字段均符合冻结契约，event-schema-check 应全部放行。

覆盖：
  - ticket.status_changed：from_status/to_status/requester_id 齐全（含 optional）；
  - ticket.created：仅给 required(requester_id,title)，省略 optional(category_id,
    priority)——验证「仅缺 optional 字段放行」的向后兼容规则；
  - insight.classification_suggested：required 四字段齐全。

仅用于 event-schema-check 自测，非生产代码。
"""


def publish_status_changed(bus, t):
    bus.publish({
        "event_type": "ticket.status_changed",
        "ticket_id": t.id,
        "version": 1,
        "payload": {
            "from_status": t.old,
            "to_status": t.new,
            "requester_id": t.requester_id,
        },
    })


def publish_created(bus, t):
    bus.publish({
        "event_type": "ticket.created",
        "ticket_id": t.id,
        "version": 1,
        "payload": {
            "requester_id": t.requester_id,
            "title": t.title,
        },
    })


def publish_classification(bus, t):
    bus.publish({
        "event_type": "insight.classification_suggested",
        "ticket_id": t.id,
        "version": 1,
        "payload": {
            "predicted_category_id": t.category_id,
            "confidence": t.confidence,
            "priority": t.priority,
            "applied": t.applied,
        },
    })
