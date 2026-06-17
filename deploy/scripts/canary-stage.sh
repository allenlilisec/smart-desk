#!/usr/bin/env bash
# Switch canary traffic stage: c1 (5%), c2 (25%), c3 (100% canary), rollback (100% stable)
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.canary.yml}"
STAGE="${1:-c1}"

case "$STAGE" in
  c1)
    : ${GATEWAY_STABLE_REPLICAS:=19}; : ${GATEWAY_CANARY_REPLICAS:=1}
    : ${WEB_STABLE_REPLICAS:=19}; : ${WEB_CANARY_REPLICAS:=1}
    : ${CORE_STABLE_REPLICAS:=19}; : ${CORE_CANARY_REPLICAS:=1}
    : ${INSIGHT_STABLE_REPLICAS:=19}; : ${INSIGHT_CANARY_REPLICAS:=1}
    echo "Stage C1: ~5% canary (19:1 replica ratio)"
    ;;
  c2)
    : ${GATEWAY_STABLE_REPLICAS:=3}; : ${GATEWAY_CANARY_REPLICAS:=1}
    : ${WEB_STABLE_REPLICAS:=3}; : ${WEB_CANARY_REPLICAS:=1}
    : ${CORE_STABLE_REPLICAS:=3}; : ${CORE_CANARY_REPLICAS:=1}
    : ${INSIGHT_STABLE_REPLICAS:=3}; : ${INSIGHT_CANARY_REPLICAS:=1}
    echo "Stage C2: ~25% canary (3:1 replica ratio)"
    ;;
  c3)
    : ${GATEWAY_STABLE_REPLICAS:=0}; : ${GATEWAY_CANARY_REPLICAS:=1}
    : ${WEB_STABLE_REPLICAS:=0}; : ${WEB_CANARY_REPLICAS:=1}
    : ${CORE_STABLE_REPLICAS:=0}; : ${CORE_CANARY_REPLICAS:=1}
    : ${INSIGHT_STABLE_REPLICAS:=0}; : ${INSIGHT_CANARY_REPLICAS:=1}
    echo "Stage C3: ~100% canary (0:1 replica ratio)"
    ;;
  rollback)
    : ${GATEWAY_STABLE_REPLICAS:=1}; : ${GATEWAY_CANARY_REPLICAS:=0}
    : ${WEB_STABLE_REPLICAS:=1}; : ${WEB_CANARY_REPLICAS:=0}
    : ${CORE_STABLE_REPLICAS:=1}; : ${CORE_CANARY_REPLICAS:=0}
    : ${INSIGHT_STABLE_REPLICAS:=1}; : ${INSIGHT_CANARY_REPLICAS:=0}
    echo "Rollback: ~100% stable (LKG)"
    ;;
  *)
    echo "Usage: $0 {c1|c2|c3|rollback}"
    exit 1
    ;;
esac

export GATEWAY_STABLE_REPLICAS GATEWAY_CANARY_REPLICAS
export WEB_STABLE_REPLICAS WEB_CANARY_REPLICAS
export CORE_STABLE_REPLICAS CORE_CANARY_REPLICAS
export INSIGHT_STABLE_REPLICAS INSIGHT_CANARY_REPLICAS

# Apply replica counts via compose file envsubst (deploy.replicas).
# --force-recreate ingress rebuilds nginx upstream server list.
docker compose -f "$COMPOSE_FILE" up -d --force-recreate ingress

echo "Canary stage '$STAGE' applied."
echo "Verify with: ./deploy/scripts/verify-split.sh http://localhost:\${INGRESS_PORT:-19080}/api/ 40"
