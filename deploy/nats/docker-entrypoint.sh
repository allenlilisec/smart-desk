#!/bin/sh
set -eu

CERT_DIR="/etc/nats/certs"
DATA_DIR="/data/jetstream"

mkdir -p "$CERT_DIR" "$DATA_DIR"

/usr/local/bin/generate-certs.sh "$CERT_DIR"

: "${NATS_CORE_PASSWORD:=changeme-core}"
: "${NATS_INSIGHT_PASSWORD:=changeme-insight}"

export NATS_CORE_PASSWORD NATS_INSIGHT_PASSWORD

envsubst '${NATS_CORE_PASSWORD} ${NATS_INSIGHT_PASSWORD}' \
  < /etc/nats/nats-server.conf.template > /etc/nats/nats-server.conf

NATS_SERVER_BIN="${NATS_SERVER_BIN:-/usr/local/bin/nats-server}"
if [ ! -x "$NATS_SERVER_BIN" ] && [ -x /nats-server ]; then
  NATS_SERVER_BIN=/nats-server
fi

exec "$NATS_SERVER_BIN" "$@"
