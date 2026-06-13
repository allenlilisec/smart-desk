"""Pydantic schemas aligned with openapi/insight.yaml."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.enums import (
    NotificationChannel,
    NotificationStatus,
    Priority,
    RoleCode,
    TicketStatus,
)


class Error(BaseModel):
    code: str
    message: str
    details: Optional[list[dict]] = None
    trace_id: Optional[str] = None


# ---- Event payloads (P0 #1: typed per event_type) ----


class TicketCreatedPayload(BaseModel):
    requester_id: uuid.UUID
    title: str
    category_id: Optional[uuid.UUID] = None
    priority: Optional[Priority] = None


class TicketAssignedPayload(BaseModel):
    to_user_id: uuid.UUID
    from_user_id: Optional[uuid.UUID] = None
    kind: Optional[str] = Field(default=None, examples=["manual", "auto", "reassign", "escalate"])
    reason: Optional[str] = None


class TicketStatusChangedPayload(BaseModel):
    from_status: Optional[TicketStatus] = None
    to_status: TicketStatus
    requester_id: uuid.UUID


class TicketResolvedPayload(BaseModel):
    requester_id: uuid.UUID


class TicketSlaPayload(BaseModel):
    level: str = Field(examples=["warning", "breached"])
    assignee_id: Optional[uuid.UUID] = None
    due_at: Optional[datetime] = None


class NotificationSend(BaseModel):
    user_id: uuid.UUID
    ticket_id: Optional[uuid.UUID] = None
    type: str = Field(examples=["ticket.assigned"])
    channel: NotificationChannel
    title: str
    body: str = ""
    dedupe_key: Optional[str] = None


class Notification(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    ticket_id: Optional[uuid.UUID] = None
    type: str
    channel: NotificationChannel
    title: str
    body: str
    status: NotificationStatus
    read_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationPage(BaseModel):
    items: list[Notification]
    page: int
    page_size: int
    total: int
    unread_count: int


class NotificationPolicy(BaseModel):
    role: RoleCode
    event_type: str
    channel: NotificationChannel
    enabled: bool

    model_config = {"from_attributes": True}


class DomainEvent(BaseModel):
    """Unified domain-event envelope consumed from NATS JetStream."""

    event_id: uuid.UUID
    event_type: str
    occurred_at: datetime
    org_id: str = "default"
    ticket_id: uuid.UUID
    actor_id: Optional[uuid.UUID] = None
    version: int = 1
    payload: Optional[dict] = None


class HealthResponse(BaseModel):
    status: str = "ok"
