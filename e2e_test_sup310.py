"""End-to-end smoke test for SUP-310 cross-tenant notification guard.

Spins up smartdesk-core (Go) and smartdesk-insight (FastAPI) and verifies:
- same-tenant POST /notifications returns 202
- cross-tenant POST /notifications returns 403
"""
from __future__ import annotations

import asyncio
import json
import os
import signal
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

ROOT = Path(__file__).resolve().parent
CORE_DIR = ROOT / "src" / "smartdesk-core"
INSIGHT_DIR = ROOT / "src" / "smartdesk-insight"

CORE_ADDR = "127.0.0.1:18080"
INSIGHT_ADDR = "127.0.0.1:18081"
CORE_URL = f"http://{CORE_ADDR}"
INSIGHT_URL = f"http://{INSIGHT_ADDR}"


def _ensure_test_keys() -> tuple[str, str]:
    """Generate a temporary RSA key pair for service-jwt signing/verification."""
    private_path = ROOT / "tmp_core_private.pem"
    public_path = ROOT / "tmp_core_public.pem"
    if private_path.exists() and public_path.exists():
        return private_path.read_text(), public_path.read_text()

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    private_path.write_text(private_pem)
    public_path.write_text(public_pem)
    return private_pem, public_pem


PRIVATE_PEM, PUBLIC_PEM = _ensure_test_keys()


def service_token(*, sub: str, org_id: str, roles: list[str]) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": sub,
            "org_id": org_id,
            "roles": roles,
            "aud": "core",
            "iss": "smartdesk-gateway",
            "iat": now,
            "exp": now + timedelta(hours=1),
        },
        PRIVATE_PEM,
        algorithm="RS256",
    )


def insight_token(*, sub: str, org_id: str, roles: list[str]) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": sub,
            "org_id": org_id,
            "roles": roles,
            "aud": "insight",
            "iss": "smartdesk-gateway",
            "iat": now,
            "exp": now + timedelta(hours=1),
        },
        PRIVATE_PEM,
        algorithm="RS256",
    )


async def wait_for_url(url: str, timeout: float = 30.0) -> None:
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get(url)
                if r.status_code == 200:
                    return
        except Exception:
            pass
        await asyncio.sleep(0.5)
    raise RuntimeError(f"service at {url} did not become ready")


async def main() -> int:
    env_core = os.environ.copy()
    env_core["CORE_HTTP_ADDR"] = CORE_ADDR
    env_core["CORE_ORG_ID"] = "default"
    env_core["CORE_SERVICE_JWT_PUBLIC_KEY"] = PUBLIC_PEM
    env_core["CORE_SERVICE_JWT_AUDIENCE"] = "core"
    env_core["CORE_SERVICE_JWT_ISSUER"] = "smartdesk-gateway"

    env_insight = os.environ.copy()
    env_insight["ENV"] = "test"
    env_insight["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
    env_insight["SERVICE_JWT_ALGORITHM"] = "RS256"
    env_insight["SERVICE_JWT_PUBLIC_KEY"] = PUBLIC_PEM
    env_insight["SERVICE_JWT_AUDIENCE"] = "insight"
    env_insight["SERVICE_JWT_ISSUER"] = "smartdesk-gateway"
    env_insight["CORE_SERVICE_URL"] = CORE_URL
    env_insight["CORE_SERVICE_TIMEOUT_SECONDS"] = "5"
    env_insight["CORE_SERVICE_TOKEN"] = service_token(
        sub=str(uuid.uuid4()), org_id="default", roles=["service"]
    )
    env_insight["PORT"] = INSIGHT_ADDR.split(":")[-1]

    core_log = open(ROOT / "core_e2e.log", "w")
    insight_log = open(ROOT / "insight_e2e.log", "w")
    core_proc = subprocess.Popen(
        ["go", "run", "./cmd/smartdesk-core"],
        cwd=CORE_DIR,
        env=env_core,
        stdout=core_log,
        stderr=subprocess.STDOUT,
    )
    insight_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", INSIGHT_ADDR.split(":")[-1]],
        cwd=INSIGHT_DIR,
        env=env_insight,
        stdout=insight_log,
        stderr=subprocess.STDOUT,
    )

    try:
        await wait_for_url(f"http://{CORE_ADDR}/healthz")
        await wait_for_url(f"http://{INSIGHT_ADDR}/healthz")

        admin_token = service_token(sub=str(uuid.uuid4()), org_id="default", roles=["admin"])

        async with httpx.AsyncClient() as client:
            # Create same-tenant user
            r = await client.post(
                f"{CORE_URL}/config/users",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "username": "same",
                    "display_name": "Same Org User",
                    "email": "same@example.com",
                    "roles": ["requester"],
                    "org_id": "default",
                },
            )
            print("create same-org user:", r.status_code, r.text)
            assert r.status_code == 201, r.text
            same_org_user = uuid.UUID(r.json()["id"])

            # Create cross-tenant user
            r = await client.post(
                f"{CORE_URL}/config/users",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "username": "other",
                    "display_name": "Other Org User",
                    "email": "other@example.com",
                    "roles": ["requester"],
                    "org_id": "other-org",
                },
            )
            print("create other-org user:", r.status_code, r.text)
            assert r.status_code == 201, r.text
            other_org_user = uuid.UUID(r.json()["id"])

            # Verify core returns org_id via internal user directory
            r = await client.get(
                f"{CORE_URL}/internal/users/{same_org_user}",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            print("get same-org user:", r.status_code, r.json())

            caller_id = uuid.uuid4()
            insight_tok = insight_token(sub=str(caller_id), org_id="default", roles=["agent"])

            # Same-tenant notification should succeed
            r = await client.post(
                f"{INSIGHT_URL}/notifications",
                headers={"Authorization": f"Bearer {insight_tok}"},
                json={
                    "user_id": str(same_org_user),
                    "type": "ticket.assigned",
                    "channel": "inapp",
                    "title": "test",
                    "body": "test",
                },
            )
            print("same-tenant notification:", r.status_code)
            assert r.status_code == 202, f"expected 202, got {r.status_code}: {r.text}"

            # Cross-tenant notification should be blocked
            r = await client.post(
                f"{INSIGHT_URL}/notifications",
                headers={"Authorization": f"Bearer {insight_tok}"},
                json={
                    "user_id": str(other_org_user),
                    "type": "ticket.assigned",
                    "channel": "inapp",
                    "title": "test",
                    "body": "test",
                },
            )
            print("cross-tenant notification:", r.status_code)
            assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

        print("\nSUP-310 e2e smoke test passed")
        return 0
    finally:
        core_proc.send_signal(signal.SIGTERM)
        insight_proc.send_signal(signal.SIGTERM)
        try:
            core_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            core_proc.kill()
        try:
            insight_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            insight_proc.kill()
        finally:
            core_log.close()
            insight_log.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
