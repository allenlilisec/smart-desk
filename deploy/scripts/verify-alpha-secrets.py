"""Quick verify for generated deploy/alpha/.env (local only)."""
from __future__ import annotations

import re
from pathlib import Path

import jwt

text = Path("deploy/alpha/.env").read_text(encoding="utf-8")


def get(key: str) -> str:
    match = re.search(rf"^{key}=(.+)$", text, re.M)
    if not match:
        raise SystemExit(f"missing {key}")
    value = match.group(1).strip().strip('"')
    return value.replace("\\n", "\n")


public_key = get("SERVICE_JWT_PUBLIC_KEY")
token = get("CORE_SERVICE_TOKEN")
claims = jwt.decode(
    token,
    public_key,
    algorithms=["RS256"],
    audience="core",
    issuer="smartdesk-gateway",
)
print("CORE_SERVICE_TOKEN OK")
print("sub=", claims.get("sub"))
print("aud=", claims.get("aud"))
print("iss=", claims.get("iss"))
print("roles=", claims.get("roles"))
print("org_id=", claims.get("org_id"))
