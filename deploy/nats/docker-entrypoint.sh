#!/bin/sh
set -eu

CERT_DIR="/etc/nats/certs"
DATA_DIR="/data/jetstream"

mkdir -p "$CERT_DIR" "$DATA_DIR"

if [ ! -f "$CERT_DIR/server.crt" ]; then
  /usr/local/bin/generate-certs.sh "$CERT_DIR"
fi

: "${NATS_CORE_PASSWORD:=changeme-core}"
: "${NATS_INSIGHT_PASSWORD:=changeme-insight}"

export NATS_CORE_PASSWORD NATS_INSIGHT_PASSWORD

envsubst '${NATS_CORE_PASSWORD} ${NATS_INSIGHT_PASSWORD}' \
  < /etc/nats/nats-server.conf.template > /etc/nats/nats-server.conf

exec /nats-server "$@"
