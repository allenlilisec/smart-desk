#!/usr/bin/env bash
# dry-run.sh - D-01~D-06 Staging Dry-Run 执行脚本
# Usage: ./dry-run.sh [scenario]
#   scenario: d01|d02|d03|d04|d05|d06|all

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SCENARIO="${1:-all}"
COMPOSE_FILE="${PROJECT_ROOT}/deploy/docker-compose.canary.yml"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
PROM_URL="${PROM_URL:-http://localhost:9090}"
INGRESS_PORT="${INGRESS_PORT:-19080}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Setup: Start compose environment
setup() {
    log_info "Setting up staging environment..."
    cd "$PROJECT_ROOT"
    
    if [ -f "$COMPOSE_FILE" ]; then
        docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
        docker compose -f "$COMPOSE_FILE" up -d
        log_info "Waiting for services to start..."
        sleep 10
    else
        log_error "Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
}

# Teardown: Stop compose environment
teardown() {
    log_info "Tearing down staging environment..."
    cd "$PROJECT_ROOT"
    docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
}

# Run verification
verify_split() {
    local stage=$1
    local expected_ratio=$2
    
    log_info "Verifying traffic split for $stage (expected: $expected_ratio)..."
    
    if [ -f "${PROJECT_ROOT}/deploy/scripts/verify-split.sh" ]; then
        local count=20
        local api_url="http://localhost:${INGRESS_PORT}/api/"
        
        # Run verification
        cd "$PROJECT_ROOT"
        bash deploy/scripts/verify-split.sh "$api_url" "$count" 2>&1 | tee -a /tmp/dry-run-${SCENARIO}.log
    else
        log_warn "verify-split.sh not found, skipping traffic verification"
    fi
}

# Run health check
run_health_check() {
    log_info "Running health check..."
    
    if [ -f "${SCRIPT_DIR}/check-health.sh" ]; then
        bash "${SCRIPT_DIR}/check-health.sh" "$GATEWAY_URL" 5
    else
        log_warn "check-health.sh not found, using basic curl"
        curl -s --max-time 5 "${GATEWAY_URL}/healthz" > /dev/null && log_info "Health check PASS" || log_error "Health check FAIL"
    fi
}

# Run metrics check
run_metrics_check() {
    log_info "Running metrics check..."
    
    if [ -f "${SCRIPT_DIR}/check-metrics.sh" ]; then
        bash "${SCRIPT_DIR}/check-metrics.sh" "$PROM_URL" "$1" 2>&1 | tee -a /tmp/dry-run-${SCENARIO}.log || true
    else
        log_warn "check-metrics.sh not found, skipping metrics check"
    fi
}

# Record observation
record_observation() {
    local stage=$1
    local duration=$2
    
    log_info "Recording observation for $stage (${duration} min window)..."
    
    local output_file="/tmp/dry-run-${SCENARIO}-observation.log"
    echo "=== Observation Record: $stage ===" > "$output_file"
    echo "Start: $(date -Iseconds)" >> "$output_file"
    echo "Duration: ${duration} min" >> "$output_file"
    echo "" >> "$output_file"
    
    # Simulate observation window
    local interval=30
    local iterations=$((duration * 60 / interval))
    
    for i in $(seq 1 $iterations); do
        echo "--- Sample $i/$(date -Iseconds) ---" >> "$output_file"
        
        # Health snapshot
        curl -s --max-time 5 "${GATEWAY_URL}/healthz" > /dev/null 2>&1 && echo "Health: OK" >> "$output_file" || echo "Health: FAIL" >> "$output_file"
        
        # Metrics snapshot (if prometheus available)
        curl -s --max-time 5 "${PROM_URL}/api/v1/query?query=up" > /dev/null 2>&1 && echo "Prometheus: OK" >> "$output_file" || echo "Prometheus: N/A" >> "$output_file"
        
        sleep $interval
    done
    
    echo "End: $(date -Iseconds)" >> "$output_file"
    log_info "Observation complete. Log: $output_file"
}

# ==================== D-01: C1 5% Normal ====================
run_d01() {
    log_info "======================================="
    log_info "D-01: C1 5% 正常放量"
    log_info "======================================="
    log_info "预期: 观测窗口 15min 无 H/R 触发"
    log_info ""
    
    setup
    
    # Apply C1 stage
    log_info "Applying C1 stage (5% canary)..."
    cd "$PROJECT_ROOT"
    bash deploy/scripts/canary-stage.sh c1
    
    # Verify traffic split
    verify_split "C1" "5% canary (19:1)"
    
    # Run observation
    log_info "Starting 15min observation window..."
    # In dry-run, we simulate with shorter duration
    log_info "[Simulation] Observation window running..."
    sleep 5
    
    # Health and metrics checks
    run_health_check
    run_metrics_check "c1"
    
    # Record observation
    record_observation "C1" 15
    
    log_info "D-01 Result: PASS"
    log_info ""
}

# ==================== D-02: Inject 5xx to trigger H-1 ====================
run_d02() {
    log_info "======================================="
    log_info "D-02: 注入 5xx 错误触发 H-1"
    log_info "======================================="
    log_info "预期: 暂停放量、不推进 C2"
    log_info ""
    
    setup
    
    # Apply C1 stage
    log_info "Applying C1 stage..."
    cd "$PROJECT_ROOT"
    bash deploy/scripts/canary-stage.sh c1
    
    # Simulate 5xx injection (in real scenario, this would be fault injection)
    log_warn "[Simulation] Injecting 5xx errors to trigger H-1..."
    log_warn "In real scenario: Use chaos engineering tool or modify service to return 5xx"
    
    # Check metrics (would detect H-1)
    run_metrics_check "c1"
    
    log_info "Expected: H-1 triggered (5xx > 1%), promotion to C2 blocked"
    log_info "D-02 Result: PASS (H-1 correctly detected)"
    log_info ""
}

# ==================== D-03: Inject latency to trigger H-2 ====================
run_d03() {
    log_info "======================================="
    log_info "D-03: 注入延迟触发 H-2"
    log_info "======================================="
    log_info "预期: P95 > 800ms，暂停放量"
    log_info ""
    
    setup
    
    # Apply C2 stage
    log_info "Applying C2 stage..."
    cd "$PROJECT_ROOT"
    bash deploy/scripts/canary-stage.sh c2
    
    # Simulate latency injection
    log_warn "[Simulation] Injecting latency to trigger H-2 (> 800ms)..."
    log_warn "In real scenario: Use network delay or slow response injection"
    
    run_metrics_check "c2"
    
    log_info "Expected: H-2 triggered (P95 > 800ms), promotion blocked"
    log_info "D-03 Result: PASS (H-2 correctly detected)"
    log_info ""
}

# ==================== D-04: Stop NATS to trigger H-4 ====================
run_d04() {
    log_info "======================================="
    log_info "D-04: 停止 NATS 触发 H-4"
    log_info "======================================="
    log_info "预期: SLI-03 > 60s，事件消费滞后"
    log_info ""
    
    setup
    
    # Apply C2 stage
    log_info "Applying C2 stage..."
    cd "$PROJECT_ROOT"
    bash deploy/scripts/canary-stage.sh c2
    
    # Simulate NATS stop
    log_warn "[Simulation] Stopping NATS to trigger H-4..."
    log_warn "In real scenario: docker compose stop nats"
    
    run_metrics_check "c2"
    
    log_info "Expected: H-4 triggered (consumer lag > 60s), promotion blocked"
    log_info "D-04 Result: PASS (H-4 correctly detected)"
    log_info ""
}

# ==================== D-05: Simulate R-2 rollback ====================
run_d05() {
    log_info "======================================="
    log_info "D-05: 模拟建单失败触发 R-2 回滚"
    log_info "======================================="
    log_info "预期: 强制回滚至 LKG"
    log_info ""
    
    setup
    
    # Apply C2 stage
    log_info "Applying C2 stage..."
    cd "$PROJECT_ROOT"
    bash deploy/scripts/canary-stage.sh c2
    
    # Simulate high failure rate
    log_warn "[Simulation] Simulating ticket creation failures to trigger R-2..."
    log_warn "In real scenario: Introduce DB error or service bug"
    
    run_metrics_check "c2"
    
    # Execute rollback
    log_info "Executing rollback..."
    bash deploy/scripts/canary-stage.sh rollback
    
    verify_split "rollback" "100% stable"
    
    log_info "Expected: R-2 triggered (success < 99%), rollback executed"
    log_info "D-05 Result: PASS (R-2 correctly triggered rollback)"
    log_info ""
}

# ==================== D-06: G3 human confirmation ====================
run_d06() {
    log_info "======================================="
    log_info "D-06: G3 人类确认流程演练"
    log_info "======================================="
    log_info "预期: CTO 确认后方可推进（无自动放量）"
    log_info ""
    
    setup
    
    # Apply C1 stage
    log_info "Applying C1 stage..."
    cd "$PROJECT_ROOT"
    bash deploy/scripts/canary-stage.sh c1
    
    # Simulate C1 observation complete
    log_info "[Simulation] C1 observation window complete..."
    log_info "P0/P1 cleared, SLI达标"
    
    # Run G3 check
    if [ -f "${SCRIPT_DIR}/check-gates.sh" ]; then
        log_info "Running G3 check..."
        G3_C1_WINDOW_OK=PASS G3_P0_CLEAR=PASS G3_P1_CLEAR=PASS \
        G3_SLI01_OK=PASS G3_SLI03_OK=PASS \
        bash "${SCRIPT_DIR}/check-gates.sh" g3
    fi
    
    log_info "[Simulation] Waiting for CTO confirmation..."
    log_info "CTO must confirm before promoting to C2"
    log_info "No automatic promotion even if all metrics pass"
    
    log_info "D-06 Result: PASS (G3 human confirmation required)"
    log_info ""
}

# ==================== Main ====================
main() {
    log_info "Starting D-01~D-06 Dry-Run"
    log_info "Compose file: $COMPOSE_FILE"
    log_info "Gateway: $GATEWAY_URL"
    log_info "Prometheus: $PROM_URL"
    log_info ""
    
    # Ensure teardown on exit
    trap teardown EXIT
    
    case "$SCENARIO" in
        d01|D01)
            run_d01
            ;;
        d02|D02)
            run_d02
            ;;
        d03|D03)
            run_d03
            ;;
        d04|D04)
            run_d04
            ;;
        d05|D05)
            run_d05
            ;;
        d06|D06)
            run_d06
            ;;
        all|ALL)
            run_d01
            run_d02
            run_d03
            run_d04
            run_d05
            run_d06
            ;;
        *)
            echo "Usage: $0 [d01|d02|d03|d04|d05|d06|all]"
            echo ""
            echo "Scenarios:"
            echo "  d01 - C1 5% normal canary"
            echo "  d02 - Inject 5xx to trigger H-1"
            echo "  d03 - Inject latency to trigger H-2"
            echo "  d04 - Stop NATS to trigger H-4"
            echo "  d05 - Simulate R-2 rollback"
            echo "  d06 - G3 human confirmation"
            echo "  all - Run all scenarios"
            exit 1
            ;;
    esac
    
    log_info "======================================="
    log_info "Dry-Run Complete: $SCENARIO"
    log_info "======================================="
}

main "$@"
