"""Notification business logic."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app import models, schemas

logger = logging.getLogger(__name__)


async def create_notification(
    db: AsyncSession,
    data: schemas.NotificationSend,
    org_id: str = "default",
) -> models.Notification:
    """Create a notification, idempotent by dedupe_key."""
    notification = models.Notification(
        org_id=org_id,
        user_id=data.user_id,
        ticket_id=data.ticket_id,
        type=data.type,
        channel=data.channel,
        title=data.title,
        body=data.body,
        status="pending",
        dedupe_key=data.dedupe_key,
    )
    db.add(notification)
    try:
        await db.flush()
        await db.refresh(notification)
    except Exception as exc:  # pragma: no cover - caught by unique constraint
        logger.warning("notification_dedupe_collision", extra={"dedupe_key": data.dedupe_key, "error": str(exc)})
        raise
    return notification


async def get_notification(
    db: AsyncSession, notification_id: uuid.UUID
) -> Optional[models.Notification]:
    return await db.get(models.Notification, notification_id)


async def list_notifications(
    db: AsyncSession,
    user_id: uuid.UUID,
    unread_only: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> schemas.NotificationPage:
    base_filter = select(models.Notification).where(
        models.Notification.user_id == user_id
    )
    if unread_only:
        base_filter = base_filter.where(models.Notification.read_at.is_(None))

    total_result = await db.execute(
        select(func.count()).select_from(base_filter.subquery())
    )
    total = total_result.scalar_one()

    unread_result = await db.execute(
        select(func.count())
        .select_from(models.Notification)
        .where(
            models.Notification.user_id == user_id,
            models.Notification.read_at.is_(None),
        )
    )
    unread_count = unread_result.scalar_one()

    items_result = await db.execute(
        base_filter
        .order_by(models.Notification.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = items_result.scalars().all()

    return schemas.NotificationPage(
        items=[schemas.Notification.model_validate(item) for item in items],
        page=page,
        page_size=page_size,
        total=total,
        unread_count=unread_count,
    )


async def mark_read(
    db: AsyncSession, notification_id: uuid.UUID
) -> Optional[models.Notification]:
    notification = await get_notification(db, notification_id)
    if notification is None:
        return None
    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
        await db.flush()
    return notification


async def get_policies(
    db: AsyncSession, org_id: str = "default"
) -> list[schemas.NotificationPolicy]:
    result = await db.execute(
        select(models.NotificationPolicy)
        .where(models.NotificationPolicy.org_id == org_id)
        .order_by(
            models.NotificationPolicy.role,
            models.NotificationPolicy.event_type,
            models.NotificationPolicy.channel,
        )
    )
    return [
        schemas.NotificationPolicy.model_validate(p) for p in result.scalars().all()
    ]


async def upsert_policies(
    db: AsyncSession,
    policies: list[schemas.NotificationPolicy],
    org_id: str = "default",
) -> list[models.NotificationPolicy]:
    """Replace policies for the org with the provided list."""
    await db.execute(
        select(models.NotificationPolicy).where(
            models.NotificationPolicy.org_id == org_id
        )
    )
    # Simplest correct approach: delete existing org policies and re-insert.
    await db.execute(
        models.NotificationPolicy.__table__.delete().where(
            models.NotificationPolicy.org_id == org_id
        )
    )

    created = []
    for p in policies:
        policy = models.NotificationPolicy(
            org_id=org_id,
            role=p.role,
            event_type=p.event_type,
            channel=p.channel,
            enabled=p.enabled,
        )
        db.add(policy)
        created.append(policy)
    await db.flush()
    return created


async def is_policy_enabled(
    db: AsyncSession,
    role: str,
    event_type: str,
    channel: str,
    org_id: str = "default",
) -> bool:
    """Check whether a notification policy is enabled; defaults to True if absent."""
    result = await db.execute(
        select(models.NotificationPolicy.enabled)
        .where(
            models.NotificationPolicy.org_id == org_id,
            models.NotificationPolicy.role == role,
            models.NotificationPolicy.event_type == event_type,
            models.NotificationPolicy.channel == channel,
        )
    )
    row = result.scalar_one_or_none()
    return row if row is not None else True
