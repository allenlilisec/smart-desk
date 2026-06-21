#!/usr/bin/env bash
# 验收探针：匿名被拒、越权 subscribe 被拒、TLS 明文被拒
set -euo pipefail

NATS_HOST="${NATS_HOST:-nats}"
NATS_TLS_PORT="${NATS_TLS_PORT:-4222}"
CA_FILE="${NATS_CA_FILE:-/etc/nats/certs/ca.crt}"
CORE_PASSWORD="${NATS_CORE_PASSWORD:?}"
INSIGHT_PASSWORD="${NATS_INSIGHT_PASSWORD:?}"

echo "== 1) anonymous connect should fail =="
if nats --server "tls://${NATS_HOST}:${NATS_TLS_PORT}" --tlsca "${CA_FILE}" \
  pub 'smartdesk.ticket.created' '{"probe":true}' 2>/dev/null; then
  echo "FAIL: anonymous connection succeeded" >&2
  exit 1
fi
echo "OK"

echo "== 2) core cannot subscribe smartdesk.> =="
CORE_SUB_OUTPUT="$(mktemp)"
timeout 5 nats --server "tls://core:${CORE_PASSWORD}@${NATS_HOST}:${NATS_TLS_PORT}" \
  --tlsca "${CA_FILE}" sub 'smartdesk.ticket.created' --count 1 >"${CORE_SUB_OUTPUT}" 2>&1 &
CORE_SUB_PID=$!
sleep 1
nats --server "tls://core:${CORE_PASSWORD}@${NATS_HOST}:${NATS_TLS_PORT}" \
  --tlsca "${CA_FILE}" pub 'smartdesk.ticket.created' '{"probe":true}' >/dev/null
if wait "${CORE_SUB_PID}"; then
  cat "${CORE_SUB_OUTPUT}" >&2
  rm -f "${CORE_SUB_OUTPUT}"
  echo "FAIL: core subscribe should be denied" >&2
  exit 1
fi
rm -f "${CORE_SUB_OUTPUT}"
echo "OK"

echo "== 3) insight can subscribe smartdesk.> =="
SUB_OUTPUT="$(mktemp)"
cleanup() {
  rm -f "${SUB_OUTPUT}"
}
trap cleanup EXIT

timeout 5 nats --server "tls://insight:${INSIGHT_PASSWORD}@${NATS_HOST}:${NATS_TLS_PORT}" \
  --tlsca "${CA_FILE}" sub 'smartdesk.ticket.created' --count 1 >"${SUB_OUTPUT}" 2>&1 &
SUB_PID=$!
sleep 1
nats --server "tls://core:${CORE_PASSWORD}@${NATS_HOST}:${NATS_TLS_PORT}" \
  --tlsca "${CA_FILE}" pub 'smartdesk.ticket.created' '{"probe":true}' >/dev/null
if ! wait "${SUB_PID}"; then
  cat "${SUB_OUTPUT}" >&2
  echo "FAIL: insight subscribe did not receive the probe event" >&2
  exit 1
fi
echo "OK"

echo "== 4) plaintext nats:// should fail =="
if nats --server "nats://${NATS_HOST}:4222" pub 'smartdesk.ticket.created' '{"probe":true}' 2>/dev/null; then
  echo "FAIL: plaintext connection succeeded" >&2
  exit 1
fi
echo "OK"

echo "all NATS security checks passed"
