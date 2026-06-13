"""Enumerations aligned with openapi/insight.yaml and core.yaml contracts."""
from __future__ import annotations

from enum import Enum


class NotificationChannel(str, Enum):
    inapp = "inapp"
    email = "email"


class NotificationStatus(str, Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"
    retrying = "retrying"


class RoleCode(str, Enum):
    requester = "requester"
    agent = "agent"
    lead = "lead"
    manager = "manager"
    admin = "admin"


class Priority(str, Enum):
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"


class TicketStatus(str, Enum):
    new = "new"
    accepted = "accepted"
    in_progress = "in_progress"
    pending_user = "pending_user"
    resolved = "resolved"
    closed = "closed"
    suspended = "suspended"
    cancelled = "cancelled"
