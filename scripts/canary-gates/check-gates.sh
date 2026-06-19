#!/usr/bin/env bash
# check-gates.sh - G1-G5 检查清单脚本
# Usage: ./check-gates.sh [gate] [options]
#   gate: g1|g2|g3|g4|g5|all
# Returns: 0=pass, 1=fail

set -euo pipefail

GATE="${1:-all}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
PROM_URL="${PROM_URL:-http://localhost:9090}"

echo "==================================="
echo "SmartDesk M4 灰度发布 G1-G5 检查清单"
echo "==================================="
echo ""

PASS=0
FAIL=0
TOTAL=0

check_item() {
    local desc="$1"
    local result="$2"
    local required="$3"
    
    TOTAL=$((TOTAL + 1))
    
    if [ "$result" = "PASS" ]; then
        echo "[PASS] $desc"
        PASS=$((PASS + 1))
    else
        echo "[FAIL] $desc"
        if [ "$required" = "required" ]; then
            FAIL=$((FAIL + 1))
        fi
    fi
}

# G1: Pre-canary checks
check_g1() {
    echo "=== G1: 灰度启动前检查 ==="
    echo "确认人: CTO"
    echo ""
    
    # G1-1: LKG清单确认
    check_item "G1-1: LKG 版本清单已确认" "${G1_LKG_OK:-FAIL}" "required"
    
    # G1-2: 策略文档签字
    check_item "G1-2: 灰度发布策略 v1.0 已签字" "${G1_STRATEGY_SIGNED:-FAIL}" "required"
    
    # G1-3: dry-run计划确认
    check_item "G1-3: Staging dry-run 计划已确认" "${G1_DRYRUN_PLAN_OK:-FAIL}" "required"
    
    # G1-4: 告警基线就绪
    check_item "G1-4: 发布监控告警基线已配置" "${G1_ALERTS_READY:-FAIL}" "required"
    
    # G1-5: 回滚预案就绪
    check_item "G1-5: 一键回滚预案已验证" "${G1_ROLLBACK_READY:-FAIL}" "required"
    
    echo ""
}

# G2: C1 (5%) launch checks
check_g2() {
    echo "=== G2: C1 (5%) 启动检查 ==="
    echo "确认人: CTO"
    echo ""
    
    # G2-1: 预发验证通过
    check_item "G2-1: Staging 预发验证通过" "${G2_STAGING_OK:-FAIL}" "required"
    
    # G2-2: 四服务镜像就绪
    check_item "G2-2: 四服务 (gateway/core/insight/web) 镜像已就绪" "${G2_IMAGES_READY:-FAIL}" "required"
    
    # G2-3: 健康检查通过
    if command -v ./check-health.sh &> /dev/null; then
        if ./check-health.sh "$GATEWAY_URL" 2>/dev/null; then
            check_item "G2-3: 健康检查通过" "PASS" "required"
        else
            check_item "G2-3: 健康检查通过" "FAIL" "required"
        fi
    else
        check_item "G2-3: 健康检查脚本存在" "FAIL" "required"
    fi
    
    # G2-4: 监控就绪
    check_item "G2-4: Prometheus/Grafana 监控就绪" "${G2_MONITORING_OK:-FAIL}" "required"
    
    echo ""
}

# G3: C1 -> C2 promotion checks
check_g3() {
    echo "=== G3: C1 → C2 (5% → 25%) 推进检查 ==="
    echo "确认人: CTO"
    echo ""
    
    # G3-1: C1观测窗口完成
    check_item "G3-1: C1 观测窗口 (15min) 已完成" "${G3_C1_WINDOW_OK:-FAIL}" "required"
    
    # G3-2: P0清零
    check_item "G3-2: P0 告警已清零" "${G3_P0_CLEAR:-FAIL}" "required"
    
    # G3-3: P1清零
    check_item "G3-3: P1 告警已清零" "${G3_P1_CLEAR:-FAIL}" "required"
    
    # G3-4: SLI-01达标
    check_item "G3-4: SLI-01 (建单成功率) ≥ 99.9%" "${G3_SLI01_OK:-FAIL}" "required"
    
    # G3-5: SLI-03达标
    check_item "G3-5: SLI-03 (事件消费滞后) < 60s" "${G3_SLI03_OK:-FAIL}" "required"
    
    echo ""
}

# G4: C2 -> C3 promotion checks
check_g4() {
    echo "=== G4: C2 → C3 (25% → 100%) 推进检查 ==="
    echo "确认人: CTO"
    echo ""
    
    # G4-1: C2观测窗口完成
    check_item "G4-1: C2 观测窗口 (30min) 已完成" "${G4_C2_WINDOW_OK:-FAIL}" "required"
    
    # G4-2: P0清零
    check_item "G4-2: P0 告警已清零" "${G4_P0_CLEAR:-FAIL}" "required"
    
    # G4-3: P1清零
    check_item "G4-3: P1 告警已清零" "${G4_P1_CLEAR:-FAIL}" "required"
    
    # G4-4: SLI-05达标
    check_item "G4-4: SLI-05 (读路径 P95) < 500ms" "${G4_SLI05_OK:-FAIL}" "required"
    
    # G4-5: 金丝雀对比正常
    check_item "G4-5: 金丝雀 vs Stable 指标对比正常" "${G4_CANARY_COMPARISON_OK:-FAIL}" "required"
    
    echo ""
}

# G5: C3 full rollout approval
check_g5() {
    echo "=== G5: C3 (100%) 全量发布检查 ==="
    echo "确认人: CTO"
    echo ""
    
    # G5-1: C3观测窗口完成
    check_item "G5-1: C3 观测窗口 (60min) 已完成" "${G5_C3_WINDOW_OK:-FAIL}" "required"
    
    # G5-2: 全量指标达标
    check_item "G5-2: 全量流量下所有 SLI 达标" "${G5_SLI_ALL_OK:-FAIL}" "required"
    
    # G5-3: 无异常告警
    check_item "G5-3: 无 P0/P1 异常告警" "${G5_NO_ALERTS:-FAIL}" "required"
    
    # G5-4: CTO确认
    check_item "G5-4: CTO 人工确认 (multica-test@hotmail.com)" "${G5_CTO_APPROVED:-FAIL}" "required"
    
    echo ""
}

# Run selected gates
case "$GATE" in
    g1|G1)
        check_g1
        ;;
    g2|G2)
        check_g2
        ;;
    g3|G3)
        check_g3
        ;;
    g4|G4)
        check_g4
        ;;
    g5|G5)
        check_g5
        ;;
    all|ALL)
        check_g1
        check_g2
        check_g3
        check_g4
        check_g5
        ;;
    *)
        echo "Usage: $0 [g1|g2|g3|g4|g5|all]"
        exit 1
        ;;
esac

# Summary
echo "==================================="
echo "检查完成: $PASS/$TOTAL 项通过"
echo "==================================="

if [ $FAIL -eq 0 ]; then
    echo "结果: PASS (所有必检项通过)"
    exit 0
else
    echo "结果: FAIL ($FAIL 项必检项未通过)"
    exit 1
fi
