#!/usr/bin/env bash
# 四服务健康探针 — 对齐 specs/发布监控告警基线.md §2
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALPHA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ALPHA_DIR"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi

GATEWAY_PORT="${GATEWAY_PORT:-8080}"
WEB_PORT="${WEB_PORT:-3001}"

PASS=0
FAIL=0

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "[PASS] $name"
    PASS=$((PASS + 1))
  else
    echo "[FAIL] $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== SmartDesk Alpha/Beta 健康探针 ==="
echo "gateway port: $GATEWAY_PORT | web port: $WEB_PORT"
echo

# 对外：gateway
check "gateway /healthz" "curl -sf --connect-timeout 5 http://localhost:${GATEWAY_PORT}/healthz"
check "gateway /readyz"  "curl -sf --connect-timeout 5 http://localhost:${GATEWAY_PORT}/readyz"

# 对外：web（仅 healthz）
check "web /healthz" "curl -sf --connect-timeout 5 http://localhost:${WEB_PORT}/healthz"

# 内网：core / insight（经 gateway 容器探测）
check "core /healthz (internal)"  "docker compose exec -T gateway wget -qO- http://core:8081/healthz"
check "core /readyz (internal)"   "docker compose exec -T gateway wget -qO- http://core:8081/readyz"
check "insight /healthz (internal)" "docker compose exec -T gateway wget -qO- http://insight:8000/healthz"
check "insight /readyz (internal)"  "docker compose exec -T gateway wget -qO- http://insight:8000/readyz"

# 隔离：core 无宿主机端口
if curl -sf --connect-timeout 2 "http://localhost:8081/healthz" >/dev/null 2>&1; then
  echo "[FAIL] core exposed on host :8081 (should be blocked)"
  FAIL=$((FAIL + 1))
else
  echo "[PASS] core not exposed on host :8081"
  PASS=$((PASS + 1))
fi

echo
echo "=== 基础设施 healthcheck（compose ps）==="
docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || docker compose ps

echo
echo "结果: PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
