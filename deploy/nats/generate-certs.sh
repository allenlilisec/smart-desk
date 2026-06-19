#!/bin/sh
set -eu

CERT_DIR="${1:?certificate directory required}"
mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/ca.crt" ] && [ -f "$CERT_DIR/server.crt" ]; then
  exit 0
fi

openssl req -x509 -newkey rsa:4096 \
  -keyout "$CERT_DIR/ca.key" \
  -out "$CERT_DIR/ca.crt" \
  -days 3650 -nodes \
  -subj "/CN=smartdesk-nats-ca"

openssl req -newkey rsa:4096 \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.csr" \
  -nodes \
  -subj "/CN=nats.smartdesk.internal"

openssl x509 -req \
  -in "$CERT_DIR/server.csr" \
  -CA "$CERT_DIR/ca.crt" \
  -CAkey "$CERT_DIR/ca.key" \
  -CAcreateserial \
  -out "$CERT_DIR/server.crt" \
  -days 3650

rm -f "$CERT_DIR/server.csr"
chmod 600 "$CERT_DIR"/*
