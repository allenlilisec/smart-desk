"""Notification HTTP endpoints (openapi/insight.yaml notifications tag)."""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import schemas
from app.config import settings
from app.db import get_db
from app.services import notifications as notification_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["notifications"])


def _current_user_id(request: Request) -> uuid.UUID:
    """Resolve user identity from gateway-injected headers."""
    user_header = request.headers.get("x-user-id")
    if not user_header:
        raise HTTPException(status_code=401, detail="missing x-user-id")
    return uuid.UUID(user_header)


def _org_id(request: Request) -> str:
    return request.headers.get("x-org-id", "default")


@router.get("/notifications", response_model=schemas.NotificationPage)
async def list_notifications(
    request: Request,
    unread_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(
        default=settings.default_page_size, ge=1, le=settings.max_page_size
    ),
    db: AsyncSession = Depends(get_db),
):
    user_id = _current_user_id(request)
    return await notification_service.list_notifications(
        db, user_id=user_id, unread_only=unread_only, page=page, page_size=page_size
    )


@router.post("/notifications", response_model=schemas.Notification, status_code=202)
async def send_notification(
    request: Request,
    data: schemas.NotificationSend,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
):
    """Explicit send endpoint; usually invoked internally by event consumer."""
    org_id = _org_id(request)
    dedupe = idempotency_key or data.dedupe_key
    try:
        return await notification_service.create_notification(
            db,
            schemas.NotificationSend(
                user_id=data.user_id,
                ticket_id=data.ticket_id,
                type=data.type,
                channel=data.channel,
                title=data.title,
                body=data.body,
                dedupe_key=dedupe,
            ),
            org_id=org_id,
        )
    except IntegrityError:
        logger.warning("duplicate_notification", extra={"dedupe_key": dedupe})
        raise HTTPException(status_code=409, detail="notification already exists")


@router.post("/notifications/{notif_id}/read", status_code=204)
async def mark_read(
    request: Request,
    notif_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    user_id = _current_user_id(request)
    notification = await notification_service.get_notification(db, notif_id)
    if notification is None:
        raise HTTPException(status_code=404, detail="notification not found")
    if notification.user_id != user_id:
        raise HTTPException(status_code=403, detail="not owner")
    await notification_service.mark_read(db, notif_id)


@router.get("/notifications/policies", response_model=list[schemas.NotificationPolicy])
async def get_policies(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await notification_service.get_policies(db, org_id=_org_id(request))


@router.put("/notifications/policies", status_code=200)
async def upsert_policies(
    request: Request,
    policies: list[schemas.NotificationPolicy],
    db: AsyncSession = Depends(get_db),
):
    await notification_service.upsert_policies(db, policies, org_id=_org_id(request))
    return {"status": "ok"}
