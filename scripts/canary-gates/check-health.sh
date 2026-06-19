#!/usr/bin/env bash
# check-health.sh - 健康检查脚本 (Liveness/Readiness)
# Usage: ./check-health.sh [gateway_url] [timeout_secs]
# Returns: 0=pass, 1=fail

set -euo pipefail

GATEWAY_URL="${1:-http://localhost:8080}"
TIMEOUT="${2:-10}"
FAILED=0

echo "=== Health Check ==="
echo "Gateway: $GATEWAY_URL"
echo "Timeout: ${TIMEOUT}s"
echo ""

# Check Liveness for all services
check_liveness() {
    local service=$1
    local url=$2
    local status
    
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" || echo "000")
    if [ "$status" = "200" ]; then
        echo "[PASS] $service Liveness: $status"
        return 0
    else
        echo "[FAIL] $service Liveness: $status (expected 200)"
        return 1
    fi
}

# Check Readiness for backend services
check_readiness() {
    local service=$1
    local url=$2
    local status
    
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" || echo "000")
    if [ "$status" = "200" ]; then
        echo "[PASS] $service Readiness: $status"
        return 0
    else
        echo "[FAIL] $service Readiness: $status (expected 200)"
        return 1
    fi
}

# Liveness checks (H-5 related)
echo "--- Liveness Checks ---"
check_liveness "gateway" "$GATEWAY_URL/healthz" || FAILED=1

# For compose environment, check individual services
if [ -n "${CORE_URL:-}" ]; then
    check_liveness "core" "$CORE_URL/healthz" || FAILED=1
fi

if [ -n "${INSIGHT_URL:-}" ]; then
    check_liveness "insight" "$INSIGHT_URL/healthz" || FAILED=1
fi

echo ""

# Readiness checks (H-3 related)
echo "--- Readiness Checks ---"
if [ -n "${GATEWAY_READY_URL:-}" ]; then
    check_readiness "gateway" "$GATEWAY_READY_URL/readyz" || FAILED=1
fi

if [ -n "${CORE_URL:-}" ]; then
    check_readiness "core" "$CORE_URL/readyz" || FAILED=1
fi

if [ -n "${INSIGHT_URL:-}" ]; then
    check_readiness "insight" "$INSIGHT_URL/readyz" || FAILED=1
fi

echo ""

if [ $FAILED -eq 0 ]; then
    echo "=== Health Check: PASS ==="
    exit 0
else
    echo "=== Health Check: FAIL ==="
    exit 1
fi
