"""NATS JetStream consumer for core domain events."""
from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from nats import connect as nats_connect
from nats.aio.client import Client as NatsClient
from nats.aio.subscription import Subscription
from nats.js import JetStreamContext
from nats.js.api import ConsumerConfig, DeliverPolicy

from app.config import settings
from app.db import AsyncSessionLocal
from app.schemas import DomainEvent
from app.services.event_processor import process_domain_event

logger = logging.getLogger(__name__)


@asynccontextmanager
async def nats_lifecycle() -> AsyncGenerator[NatsClient, None]:
    """Connect to NATS, set up stream/consumer, yield client."""
    client = await nats_connect(settings.nats_url)
    js = client.jetstream()

    await _ensure_stream(js)
    await _ensure_consumer(js)

    try:
        yield client
    finally:
        await client.close()


async def _ensure_stream(js: JetStreamContext) -> None:
    """Create the events stream if it does not exist (idempotent)."""
    try:
        await js.add_stream(
            name=settings.nats_stream,
            subjects=["smartdesk.ticket.*", "smartdesk.insight.*"],
            retention="limits",
            max_msgs=-1,
            max_bytes=-1,
        )
        logger.info("stream_created", extra={"stream": settings.nats_stream})
    except Exception as exc:
        logger.debug("stream_exists_or_error", extra={"stream": settings.nats_stream, "error": str(exc)})


async def _ensure_consumer(js: JetStreamContext) -> None:
    """Create a durable pull consumer if it does not exist."""
    try:
        await js.add_consumer(
            stream=settings.nats_stream,
            config=ConsumerConfig(
                durable_name=settings.nats_durable,
                deliver_policy=DeliverPolicy.ALL,
                ack_policy="explicit",
                max_deliver=3,
                filter_subject=settings.nats_subject,
            ),
        )
        logger.info("consumer_created", extra={"consumer": settings.nats_durable})
    except Exception as exc:
        logger.debug("consumer_exists_or_error", extra={"consumer": settings.nats_durable, "error": str(exc)})


async def consume_events(stop_after: int | None = None) -> None:
    """Main loop: pull messages and process them with idempotency."""
    async with nats_lifecycle() as client:
        js = client.jetstream()
        subscription = await js.pull_subscribe(
            subject=settings.nats_subject,
            durable=settings.nats_durable,
            stream=settings.nats_stream,
        )

        logger.info(
            "consumer_started",
            extra={
                "stream": settings.nats_stream,
                "subject": settings.nats_subject,
                "consumer": settings.nats_durable,
            },
        )

        processed = 0
        try:
            while True:
                if stop_after is not None and processed >= stop_after:
                    break
                messages = await subscription.fetch(batch=10, timeout=5)
                for msg in messages:
                    await _handle_message(msg)
                    processed += 1
        finally:
            await subscription.unsubscribe()


async def _handle_message(msg) -> None:
    """Parse, process, and ack/nak a single NATS message."""
    data = json.loads(msg.data.decode("utf-8"))
    event = DomainEvent.model_validate(data)

    async with AsyncSessionLocal() as db:
        try:
            await process_domain_event(db, event)
            await db.commit()
            await msg.ack()
            logger.info(
                "event_acknowledged",
                extra={"event_id": str(event.event_id), "event_type": event.event_type},
            )
        except Exception:
            await db.rollback()
            logger.exception("event_processing_failed", extra={"event_id": str(event.event_id)})
            await msg.nak()
