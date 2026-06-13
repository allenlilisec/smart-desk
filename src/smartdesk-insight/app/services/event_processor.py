"""Process NATS domain events into notifications."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app import models, schemas
from app.enums import NotificationChannel, RoleCode
from app.services import notifications as notification_service

logger = logging.getLogger(__name__)


async def record_event_processed(
    db: AsyncSession, event_id: uuid.UUID, event_type: str
) -> bool:
    """Insert event into idempotency ledger; return False if already processed.

    This INSERT ... ON CONFLICT DO NOTHING is the single gate for idempotency.
    Called at the start of processing so concurrent consumers cannot pass a
    preceding SELECT and then both generate notifications (TOCTOU).
    """
    stmt = (
        pg_insert(models.ProcessedEvent)
        .values(
            event_id=event_id,
            event_type=event_type,
            processed_at=datetime.now(timezone.utc),
        )
        .on_conflict_do_nothing(index_elements=["event_id"])
    )
    result = await db.execute(stmt)
    await db.flush()
    inserted = result.rowcount == 1
    if not inserted:
        logger.info("event_already_processed", extra={"event_id": str(event_id)})
    return inserted


async def process_domain_event(
    db: AsyncSession, event: schemas.DomainEvent
) -> list[models.Notification]:
    """Dispatch a domain event to notification generation.

    Idempotency is enforced by inserting into processed_events first; if the
    event was already processed, we return immediately without side effects.
    """
    logger.info(
        "processing_event",
        extra={
            "event_id": str(event.event_id),
            "event_type": event.event_type,
            "ticket_id": str(event.ticket_id),
        },
    )

    if not await record_event_processed(db, event.event_id, event.event_type):
        return []

    created: list[models.Notification] = []

    if event.event_type == "ticket.created":
        created.extend(await _handle_ticket_created(db, event))
    elif event.event_type in ("ticket.assigned", "ticket.reassigned"):
        created.extend(await _handle_ticket_assigned(db, event))
    elif event.event_type == "ticket.status_changed":
        created.extend(await _handle_status_changed(db, event))
    elif event.event_type == "ticket.resolved":
        created.extend(await _handle_resolved(db, event))
    elif event.event_type == "ticket.sla_breached":
        created.extend(await _handle_sla_breached(db, event))
    else:
        logger.debug("unhandled_event_type", extra={"event_type": event.event_type})

    return created


def _parse_payload(event: schemas.DomainEvent, model: type) -> schemas.BaseModel | None:
    """Validate event payload against the typed schema for its event_type."""
    payload = event.payload
    if payload is None:
        return None
    try:
        return model.model_validate(payload)
    except Exception as exc:
        logger.warning(
            "payload_validation_failed",
            extra={
                "event_id": str(event.event_id),
                "event_type": event.event_type,
                "error": str(exc),
            },
        )
        return None


async def _handle_ticket_created(
    db: AsyncSession, event: schemas.DomainEvent
) -> list[models.Notification]:
    """Notify requester that ticket was created."""
    payload = _parse_payload(event, schemas.TicketCreatedPayload)
    if payload is None:
        return []

    title = f"工单已创建: #{event.ticket_id}"
    body = payload.title or "您的工单已成功提交。"
    return await _send_if_enabled(
        db,
        event,
        user_id=payload.requester_id,
        role=RoleCode.requester,
        event_type="ticket.created",
        title=title,
        body=body,
    )


async def _handle_ticket_assigned(
    db: AsyncSession, event: schemas.DomainEvent
) -> list[models.Notification]:
    """Notify assignee about the new assignment."""
    payload = _parse_payload(event, schemas.TicketAssignedPayload)
    if payload is None:
        return []

    title = f"工单分派给你: #{event.ticket_id}"
    body = payload.reason or "你有一条新的待处理工单。"
    return await _send_if_enabled(
        db,
        event,
        user_id=payload.to_user_id,
        role=RoleCode.agent,
        event_type="ticket.assigned",
        title=title,
        body=body,
    )


async def _handle_status_changed(
    db: AsyncSession, event: schemas.DomainEvent
) -> list[models.Notification]:
    """Notify requester on status changes they care about."""
    payload = _parse_payload(event, schemas.TicketStatusChangedPayload)
    if payload is None:
        return []

    title = f"工单状态更新: {payload.to_status.value}"
    body = f"你的工单 #{event.ticket_id} 状态已变更为 {payload.to_status.value}。"
    return await _send_if_enabled(
        db,
        event,
        user_id=payload.requester_id,
        role=RoleCode.requester,
        event_type="ticket.status_changed",
        title=title,
        body=body,
    )


async def _handle_resolved(
    db: AsyncSession, event: schemas.DomainEvent
) -> list[models.Notification]:
    """Notify requester to confirm resolution."""
    payload = _parse_payload(event, schemas.TicketResolvedPayload)
    if payload is None:
        return []

    return await _send_if_enabled(
        db,
        event,
        user_id=payload.requester_id,
        role=RoleCode.requester,
        event_type="ticket.resolved",
        title=f"工单已解决: #{event.ticket_id}",
        body="你的工单已被标记为已解决，请确认关闭。",
    )


async def _handle_sla_breached(
    db: AsyncSession, event: schemas.DomainEvent
) -> list[models.Notification]:
    """Notify assignee/lead on SLA breach."""
    payload = _parse_payload(event, schemas.TicketSlaPayload)
    if payload is None or payload.assignee_id is None:
        return []

    return await _send_if_enabled(
        db,
        event,
        user_id=payload.assignee_id,
        role=RoleCode.agent,
        event_type="ticket.sla_breached",
        title=f"SLA 超时: #{event.ticket_id}",
        body="你负责的工单已触发 SLA 超时，请尽快处理。",
    )


async def _send_if_enabled(
    db: AsyncSession,
    event: schemas.DomainEvent,
    user_id: uuid.UUID,
    role: RoleCode,
    event_type: str,
    title: str,
    body: str,
    channel: NotificationChannel = NotificationChannel.inapp,
) -> list[models.Notification]:
    """Generate a notification if policy allows."""
    enabled = await notification_service.is_policy_enabled(
        db, role=role, event_type=event_type, channel=channel, org_id=event.org_id
    )
    if not enabled:
        return []

    dedupe_key = f"{event.event_id}:{event_type}:{channel.value}:{user_id}"
    notification = await notification_service.create_notification(
        db,
        schemas.NotificationSend(
            user_id=user_id,
            ticket_id=event.ticket_id,
            type=event_type,
            channel=channel.value,
            title=title,
            body=body,
            dedupe_key=dedupe_key,
        ),
        org_id=event.org_id,
    )
    return [notification]
