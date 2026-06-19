#!/bin/sh
set -eu

CERT_DIR="${1:?certificate directory required}"
mkdir -p "$CERT_DIR"

cert_has_nats_san() {
  [ -f "$CERT_DIR/server.crt" ] && \
    openssl x509 -in "$CERT_DIR/server.crt" -noout -text 2>/dev/null | grep -q 'DNS:nats'
}

if cert_has_nats_san; then
  exit 0
fi

# Regenerate when missing or when legacy CN-only certs lack SAN for compose host "nats".
rm -f "$CERT_DIR/server.crt" "$CERT_DIR/server.key" "$CERT_DIR/server.csr"

openssl req -x509 -newkey rsa:4096 \
  -keyout "$CERT_DIR/ca.key" \
  -out "$CERT_DIR/ca.crt" \
  -days 3650 -nodes \
  -subj "/CN=smartdesk-nats-ca"

openssl req -newkey rsa:4096 \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.csr" \
  -nodes \
  -subj "/CN=nats.smartdesk.internal" \
  -addext "subjectAltName=DNS:nats,DNS:nats.smartdesk.internal,DNS:localhost"

openssl x509 -req \
  -in "$CERT_DIR/server.csr" \
  -CA "$CERT_DIR/ca.crt" \
  -CAkey "$CERT_DIR/ca.key" \
  -CAcreateserial \
  -out "$CERT_DIR/server.crt" \
  -days 3650 \
  -copy_extensions copy

rm -f "$CERT_DIR/server.csr"
chmod 600 "$CERT_DIR"/*
