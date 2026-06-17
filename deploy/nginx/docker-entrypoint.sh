#!/bin/sh
set -eu

# Read desired replica counts (must match docker-compose.canary.yml deploy.replicas).
GATEWAY_STABLE_REPLICAS="${GATEWAY_STABLE_REPLICAS:-19}"
GATEWAY_CANARY_REPLICAS="${GATEWAY_CANARY_REPLICAS:-1}"
WEB_STABLE_REPLICAS="${WEB_STABLE_REPLICAS:-19}"
WEB_CANARY_REPLICAS="${WEB_CANARY_REPLICAS:-1}"

# Generate a single upstream server entry when the service has replicas.
# Docker DNS resolves the service name to all replica IPs; nginx creates one
# peer per IP with equal weight, so traffic ratio equals replica ratio.
server_entry() {
  host="$1"
  port="$2"
  count="$3"
  if [ "$count" -gt 0 ]; then
    printf '        server %s:%s;\n' "$host" "$port"
  else
    printf ''
  fi
}

GATEWAY_STABLE_SERVER=$(server_entry gateway-stable 3000 "$GATEWAY_STABLE_REPLICAS")
GATEWAY_CANARY_SERVER=$(server_entry gateway-canary 3000 "$GATEWAY_CANARY_REPLICAS")
WEB_STABLE_SERVER=$(server_entry web-stable 3000 "$WEB_STABLE_REPLICAS")
WEB_CANARY_SERVER=$(server_entry web-canary 3000 "$WEB_CANARY_REPLICAS")

export GATEWAY_STABLE_SERVER GATEWAY_CANARY_SERVER WEB_STABLE_SERVER WEB_CANARY_SERVER

envsubst '${GATEWAY_STABLE_SERVER} ${GATEWAY_CANARY_SERVER} ${WEB_STABLE_SERVER} ${WEB_CANARY_SERVER}' \
  < /etc/nginx/templates/nginx.conf \
  > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'
