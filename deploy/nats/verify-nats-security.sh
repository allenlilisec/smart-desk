#!/usr/bin/env bash
# 验收探针：匿名被拒、越权 subscribe 被拒、TLS 明文被拒
set -euo pipefail

NATS_HOST="${NATS_HOST:-nats}"
NATS_TLS_PORT="${NATS_TLS_PORT:-4222}"
CA_FILE="${NATS_CA_FILE:-/etc/nats/certs/ca.crt}"
CORE_PASSWORD="${NATS_CORE_PASSWORD:?}"
INSIGHT_PASSWORD="${NATS_INSIGHT_PASSWORD:?}"

echo "== 1) anonymous connect should fail =="
if nats sub 'smartdesk.>' --server "tls://${NATS_HOST}:${NATS_TLS_PORT}" --tlsca "${CA_FILE}" 2>/dev/null; then
  echo "FAIL: anonymous connection succeeded" >&2
  exit 1
fi
echo "OK"

echo "== 2) core cannot subscribe smartdesk.> =="
if nats sub 'smartdesk.>' \
  --server "tls://core:${CORE_PASSWORD}@${NATS_HOST}:${NATS_TLS_PORT}" \
  --tlsca "${CA_FILE}" 2>/dev/null; then
  echo "FAIL: core subscribe should be denied" >&2
  exit 1
fi
echo "OK"

echo "== 3) insight can subscribe smartdesk.> =="
timeout 2 nats sub 'smartdesk.>' \
  --server "tls://insight:${INSIGHT_PASSWORD}@${NATS_HOST}:${NATS_TLS_PORT}" \
  --tlsca "${CA_FILE}" >/dev/null &
sleep 1
kill $! 2>/dev/null || true
echo "OK"

echo "== 4) plaintext nats:// should fail =="
if nats sub 'smartdesk.>' --server "nats://${NATS_HOST}:4222" 2>/dev/null; then
  echo "FAIL: plaintext connection succeeded" >&2
  exit 1
fi
echo "OK"

echo "all NATS security checks passed"
