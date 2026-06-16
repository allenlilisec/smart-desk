#!/usr/bin/env bash
# Switch canary traffic stage: c1 (5%), c2 (25%), c3 (100% canary), rollback (100% stable)
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.canary.yml}"
STAGE="${1:-c1}"

case "$STAGE" in
  c1)
    export GATEWAY_STABLE_WEIGHT=19 GATEWAY_CANARY_WEIGHT=1
    export WEB_STABLE_WEIGHT=19 WEB_CANARY_WEIGHT=1
    echo "Stage C1: ~5% canary (19:1)"
    ;;
  c2)
    export GATEWAY_STABLE_WEIGHT=3 GATEWAY_CANARY_WEIGHT=1
    export WEB_STABLE_WEIGHT=3 WEB_CANARY_WEIGHT=1
    echo "Stage C2: ~25% canary (3:1)"
    ;;
  c3)
    export GATEWAY_STABLE_WEIGHT=1 GATEWAY_CANARY_WEIGHT=1000
    export WEB_STABLE_WEIGHT=1 WEB_CANARY_WEIGHT=1000
    echo "Stage C3: ~100% canary (1:1000)"
    ;;
  rollback)
    export GATEWAY_STABLE_WEIGHT=1000 GATEWAY_CANARY_WEIGHT=1
    export WEB_STABLE_WEIGHT=1000 WEB_CANARY_WEIGHT=1
    echo "Rollback: ~100% stable (LKG)"
    ;;
  *)
    echo "Usage: $0 {c1|c2|c3|rollback}"
    exit 1
    ;;
esac

docker compose -f "$COMPOSE_FILE" up -d --force-recreate ingress
echo "Ingress weights updated. Verify with: curl -s http://localhost:\${INGRESS_PORT:-8080}/api/"
