"""Tests for notification APIs and event processing."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app import schemas
from app.db import get_db
from app.main import app
from app.models import Base
from app.services import event_processor, notifications

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="session")
async def engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db(engine) -> AsyncSession:
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db) -> AsyncClient:
    async def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


class TestNotificationsApi:
    async def test_healthz(self, client: AsyncClient):
        response = await client.get("/healthz")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    async def test_send_and_list_notification(self, client: AsyncClient):
        user_id = uuid.uuid4()
        send = {
            "user_id": str(user_id),
            "type": "ticket.assigned",
            "channel": "inapp",
            "title": "工单分派给你",
            "body": "新工单",
        }
        response = await client.post("/notifications", json=send)
        assert response.status_code == 202
        data = response.json()
        assert data["user_id"] == str(user_id)
        assert data["status"] == "pending"

        response = await client.get(
            "/notifications",
            headers={"x-user-id": str(user_id)},
        )
        assert response.status_code == 200
        page = response.json()
        assert page["total"] == 1
        assert page["unread_count"] == 1

    async def test_mark_read(self, client: AsyncClient, db: AsyncSession):
        user_id = uuid.uuid4()
        notification = await notifications.create_notification(
            db,
            schemas.NotificationSend(
                user_id=user_id,
                type="ticket.status_changed",
                channel="inapp",
                title="状态变更",
                body="",
            ),
        )
        await db.commit()

        response = await client.post(
            f"/notifications/{notification.id}/read",
            headers={"x-user-id": str(user_id)},
        )
        assert response.status_code == 204

        response = await client.get(
            "/notifications",
            headers={"x-user-id": str(user_id)},
        )
        assert response.json()["unread_count"] == 0

    async def test_policies(self, client: AsyncClient):
        policies = [
            {"role": "agent", "event_type": "ticket.assigned", "channel": "inapp", "enabled": True},
            {"role": "requester", "event_type": "ticket.created", "channel": "inapp", "enabled": False},
        ]
        response = await client.put("/notifications/policies", json=policies)
        assert response.status_code == 200

        response = await client.get("/notifications/policies")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2


class TestEventProcessing:
    async def test_event_idempotency(self, db: AsyncSession):
        user_id = uuid.uuid4()
        ticket_id = uuid.uuid4()
        event_id = uuid.uuid4()
        event = schemas.DomainEvent(
            event_id=event_id,
            event_type="ticket.assigned",
            occurred_at=datetime.now(timezone.utc),
            ticket_id=ticket_id,
            payload={"to_user_id": str(user_id)},
        )

        created1 = await event_processor.process_domain_event(db, event)
        await db.commit()
        assert len(created1) == 1

        # Reprocess the same event
        created2 = await event_processor.process_domain_event(db, event)
        await db.commit()
        assert len(created2) == 0

        # Verify only one notification in DB
        result = await notifications.list_notifications(db, user_id=user_id)
        assert result.total == 1

    async def test_ticket_created_notification(self, db: AsyncSession):
        user_id = uuid.uuid4()
        ticket_id = uuid.uuid4()
        event = schemas.DomainEvent(
            event_id=uuid.uuid4(),
            event_type="ticket.created",
            occurred_at=datetime.now(timezone.utc),
            ticket_id=ticket_id,
            payload={"requester_id": str(user_id), "title": "测试工单"},
        )

        created = await event_processor.process_domain_event(db, event)
        await db.commit()
        assert len(created) == 1
        assert created[0].type == "ticket.created"
        assert created[0].user_id == user_id

    async def test_policy_disables_notification(self, db: AsyncSession):
        user_id = uuid.uuid4()
        ticket_id = uuid.uuid4()
        await notifications.upsert_policies(
            db,
            [
                schemas.NotificationPolicy(
                    role="agent",
                    event_type="ticket.assigned",
                    channel="inapp",
                    enabled=False,
                )
            ],
        )
        await db.commit()

        event = schemas.DomainEvent(
            event_id=uuid.uuid4(),
            event_type="ticket.assigned",
            occurred_at=datetime.now(timezone.utc),
            ticket_id=ticket_id,
            payload={"to_user_id": str(user_id)},
        )
        created = await event_processor.process_domain_event(db, event)
        await db.commit()
        assert len(created) == 0
