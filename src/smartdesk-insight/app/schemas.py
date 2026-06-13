"""Pydantic schemas aligned with openapi/insight.yaml."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class Error(BaseModel):
    code: str
    message: str
    details: Optional[list[dict]] = None
    trace_id: Optional[str] = None


class NotificationSend(BaseModel):
    user_id: uuid.UUID
    ticket_id: Optional[uuid.UUID] = None
    type: str = Field(examples=["ticket.assigned"])
    channel: str = Field(examples=["inapp", "email"])
    title: str
    body: str = ""
    dedupe_key: Optional[str] = None


class Notification(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    ticket_id: Optional[uuid.UUID] = None
    type: str
    channel: str
    title: str
    body: str
    status: str = Field(examples=["pending", "sent", "failed", "retrying"])
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
    role: str = Field(examples=["requester", "agent", "lead", "manager", "admin"])
    event_type: str
    channel: str = Field(examples=["inapp", "email"])
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
