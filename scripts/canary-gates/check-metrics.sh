#!/usr/bin/env bash
# check-metrics.sh - Prom 指标检查脚本
# Usage: ./check-metrics.sh [prometheus_url] [stage]
# Returns: 0=pass, 1=hold (H-*), 2=rollback (R-*)

set -euo pipefail

PROM_URL="${1:-http://localhost:9090}"
STAGE="${2:-c1}"
TIMEOUT="${3:-30}"

# Thresholds from 灰度发布策略.md §5
H1_5XX_THRESHOLD="0.01"        # 1%
H1_5XX_BASELINE="0.005"        # 0.5% above baseline
H2_P95_THRESHOLD="0.8"         # 800ms
H2_P95_BASELINE="1.3"          # 30% above baseline
H4_LAG_THRESHOLD="60"          # 60s

R1_5XX_THRESHOLD="0.05"        # 5%
R1_5XX_BASELINE="0.03"         # 3% above baseline
R2_SUCCESS_RATE="0.99"         # 99%

# SLI thresholds
SLI01_THRESHOLD="0.999"        # 99.9%
SLI03_THRESHOLD="60"             # 60s
SLI05_THRESHOLD="0.5"            # 500ms

STATUS="PASS"
VIOLATIONS=""

echo "=== Prom Metrics Check ==="
echo "Prometheus: $PROM_URL"
echo "Stage: $STAGE"
echo ""

# Query Prometheus API
query_prom() {
    local q="$1"
    curl -s --max-time "$TIMEOUT" "${PROM_URL}/api/v1/query?query=$(echo "$q" | jq -sRr @uri)" 2>/dev/null | jq -r '.data.result[0].value[1] // "null"'
}

# Check 5xx error rate (H-1, R-1)
echo "--- 5xx Error Rate (H-1/R-1) ---"
error_rate=$(query_prom 'sum(rate(gateway_http_requests_total{status=~"5.."}[5m])) / sum(rate(gateway_http_requests_total[5m]))' || echo "null")

if [ "$error_rate" != "null" ] && [ -n "$error_rate" ]; then
    echo "Current: $error_rate"
    
    # R-1 check
    if (( $(echo "$error_rate > $R1_5XX_THRESHOLD" | bc -l) )); then
        echo "[ROLLBACK] R-1: 5xx rate $error_rate > $R1_5XX_THRESHOLD (5%)"
        STATUS="ROLLBACK"
        VIOLATIONS="${VIOLATIONS}R-1;"
    # H-1 check
    elif (( $(echo "$error_rate > $H1_5XX_THRESHOLD" | bc -l) )); then
        echo "[HOLD] H-1: 5xx rate $error_rate > $H1_5XX_THRESHOLD (1%)"
        [ "$STATUS" != "ROLLBACK" ] && STATUS="HOLD"
        VIOLATIONS="${VIOLATIONS}H-1;"
    else
        echo "[PASS] 5xx rate within threshold"
    fi
else
    echo "[WARN] Could not query 5xx rate"
fi
echo ""

# Check P95 latency (H-2)
echo "--- P95 Latency (H-2) ---"
p95=$(query_prom 'histogram_quantile(0.95, sum(rate(gateway_http_request_duration_seconds_bucket[5m])) by (le))' || echo "null")

if [ "$p95" != "null" ] && [ -n "$p95" ]; then
    p95_ms=$(echo "$p95 * 1000" | bc)
    echo "Current: ${p95_ms}ms"
    
    if (( $(echo "$p95 > $H2_P95_THRESHOLD" | bc -l) )); then
        echo "[HOLD] H-2: P95 ${p95_ms}ms > ${H2_P95_THRESHOLD}s (800ms)"
        [ "$STATUS" != "ROLLBACK" ] && STATUS="HOLD"
        VIOLATIONS="${VIOLATIONS}H-2;"
    else
        echo "[PASS] P95 within threshold"
    fi
else
    echo "[WARN] Could not query P95 latency"
fi
echo ""

# Check event consumer lag (H-4)
echo "--- Event Consumer Lag (H-4) ---"
lag_core=$(query_prom 'core_event_consumer_lag_seconds' || echo "null")
lag_insight=$(query_prom 'insight_event_consumer_lag_seconds' || echo "null")

if [ "$lag_core" != "null" ] && [ -n "$lag_core" ]; then
    echo "Core lag: ${lag_core}s"
    if (( $(echo "$lag_core > $H4_LAG_THRESHOLD" | bc -l) )); then
        echo "[HOLD] H-4: Core lag ${lag_core}s > ${H4_LAG_THRESHOLD}s"
        [ "$STATUS" != "ROLLBACK" ] && STATUS="HOLD"
        VIOLATIONS="${VIOLATIONS}H-4;"
    fi
fi

if [ "$lag_insight" != "null" ] && [ -n "$lag_insight" ]; then
    echo "Insight lag: ${lag_insight}s"
    if (( $(echo "$lag_insight > $H4_LAG_THRESHOLD" | bc -l) )); then
        echo "[HOLD] H-4: Insight lag ${lag_insight}s > ${H4_LAG_THRESHOLD}s"
        [ "$STATUS" != "ROLLBACK" ] && STATUS="HOLD"
        VIOLATIONS="${VIOLATIONS}H-4;"
    fi
fi

echo ""

# Check SLI-01: Ticket creation success rate
echo "--- SLI-01: Ticket Creation Success ---"
success_rate=$(query_prom 'core_tickets_created_total{result="success"} / core_tickets_created_total' || echo "null")

if [ "$success_rate" != "null" ] && [ -n "$success_rate" ]; then
    echo "Current: $success_rate"
    if (( $(echo "$success_rate < $R2_SUCCESS_RATE" | bc -l) )); then
        echo "[ROLLBACK] R-2: Success rate $success_rate < $R2_SUCCESS_RATE (99%)"
        STATUS="ROLLBACK"
        VIOLATIONS="${VIOLATIONS}R-2;"
    elif (( $(echo "$success_rate < $SLI01_THRESHOLD" | bc -l) )); then
        echo "[WARN] SLI-01: Success rate $success_rate < $SLI01_THRESHOLD (99.9%)"
    else
        echo "[PASS] SLI-01: Success rate OK"
    fi
else
    echo "[WARN] Could not query SLI-01"
fi
echo ""

# Summary
echo "=== Metrics Check Result: $STATUS ==="
if [ -n "$VIOLATIONS" ]; then
    echo "Violations: $VIOLATIONS"
fi

case "$STATUS" in
    "ROLLBACK")
        exit 2
        ;;
    "HOLD")
        exit 1
        ;;
    *)
        exit 0
        ;;
esac
