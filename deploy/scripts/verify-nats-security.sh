#!/usr/bin/env bash
# SUP-249: 验证 NATS 鉴权/TLS 收口 — 匿名连接应失败，core/insight 凭证按 ACL 工作。
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.canary.yml}"
NATS_CORE_PASSWORD="${NATS_CORE_PASSWORD:-changeme-core}"
NATS_INSIGHT_PASSWORD="${NATS_INSIGHT_PASSWORD:-changeme-insight}"

nats_cli() {
  docker compose -f "$COMPOSE_FILE" run --rm --no-deps --entrypoint nats nats-init "$@"
}

echo "==> waiting for nats health"
docker compose -f "$COMPOSE_FILE" exec -T nats wget -qO- http://127.0.0.1:8222/healthz >/dev/null

echo "==> anonymous TLS connect must fail"
if nats_cli --server "tls://nats:4222" --tlsca /etc/nats/certs/ca.crt pub smartdesk.ticket.created '{}' 2>/dev/null; then
  echo "FAIL: anonymous publish succeeded"
  exit 1
fi
echo "OK: anonymous rejected"

echo "==> core credential can publish"
nats_cli --server "tls://core:${NATS_CORE_PASSWORD}@nats:4222" \
  --tlsca /etc/nats/certs/ca.crt \
  pub smartdesk.ticket.created '{"probe":true}' >/dev/null
echo "OK: core publish"

echo "==> insight credential cannot publish core subject"
if nats_cli --server "tls://insight:${NATS_INSIGHT_PASSWORD}@nats:4222" \
  --tlsca /etc/nats/certs/ca.crt \
  pub smartdesk.ticket.created '{"probe":true}' 2>/dev/null; then
  echo "FAIL: insight over-publish succeeded"
  exit 1
fi
echo "OK: insight ACL enforced"

echo "==> insight credential can subscribe"
docker compose -f "$COMPOSE_FILE" run --rm --no-deps --entrypoint sh nats-init \
  -c "nats --server tls://insight:${NATS_INSIGHT_PASSWORD}@nats:4222 --tlsca /etc/nats/certs/ca.crt sub smartdesk.ticket.created --count 1 --timeout 3s >/dev/null"
echo "OK: insight subscribe"

echo "All NATS security checks passed."
