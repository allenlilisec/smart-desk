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
