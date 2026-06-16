#!/usr/bin/env bash
# 一键回滚 dry-run — 对齐 specs/回滚预案.md §4.4、§1.2（RTO ≤15 min）
# 模式：停服 → 保持 LKG 镜像（无 schema down）→ 按序重启 → 探活冒烟
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALPHA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RECORD_DIR="$ALPHA_DIR/records"
mkdir -p "$RECORD_DIR"

cd "$ALPHA_DIR"
RECORD_FILE="${RECORD_DIR}/rollback-dry-run-$(date -u +%Y-%m-%d).md"
START_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_EPOCH=$(date +%s)

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

log "=== SmartDesk Alpha/Beta 回滚 dry-run 开始 ==="
log "LKG 清单: lkg/lkg-alpha-mvp.yaml"
log "记录文件: $RECORD_FILE"

# Phase 1: 决策模拟（dry-run 跳过人工等待）
log "Phase 1 决策模拟: 假设白帆已下达回滚指令 (≤3 min)"

# Phase 2: 停服止血（web → gateway → insight → core）
log "Phase 2 停服: web → gateway → insight → core"
docker compose stop web gateway insight core

# Phase 3: 切回 LKG（compose 本地 build：使用当前已构建镜像，模拟 tag 回退）
log "Phase 3 切 LKG: 按序 up --no-deps（本地 build = LKG 快照）"
docker compose up -d --no-deps web
docker compose up -d --no-deps gateway
docker compose up -d --no-deps insight
docker compose up -d --no-deps core

# 等待 healthy
log "等待服务就绪..."
sleep 15
docker compose ps

# Phase 4: 验证（§5 P0 子集）
log "Phase 4 P0 验证: 健康探针"
PROBE_START=$(date +%s)
if bash "$SCRIPT_DIR/health-probe.sh"; then
  PROBE_RESULT="PASS"
else
  PROBE_RESULT="FAIL"
fi
PROBE_END=$(date +%s)

END_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
END_EPOCH=$(date +%s)
ELAPSED=$((END_EPOCH - START_EPOCH))
RTO_OK="是"
if [[ "$ELAPSED" -gt 900 ]]; then
  RTO_OK="否（超过 15 min）"
fi

cat > "$RECORD_FILE" <<EOF
# Alpha/Beta 回滚 dry-run 记录

| 字段 | 值 |
|---|---|
| 执行人 | 万全 |
| 开始时间 (UTC) | $START_TS |
| 结束时间 (UTC) | $END_TS |
| 总耗时 | ${ELAPSED}s (~$((ELAPSED / 60)) min) |
| RTO 目标 (≤15 min) | $RTO_OK |
| LKG 清单 | \`lkg/lkg-alpha-mvp.yaml\` |
| 模式 | compose 停服 → 切 LKG tag（本地 build 保持）→ 按序 up --no-deps |
| DB 策略 | S1/S3：不执行 down 迁移 |
| P0 探活 | $PROBE_RESULT |

## 步骤时间线

| 阶段 | 目标 | 实际 |
|---|---|---|
| 决策 | ≤3 min | 模拟即时 |
| 执行（停服+切 LKG+重启） | ≤10 min | $((PROBE_START - START_EPOCH))s 至探活前 |
| 验证（P0 探活） | ≤5 min | $((PROBE_END - PROBE_START))s |
| 通报 | ≤2 min | 本记录归档 issue |

## P0 验证项

- [$( [[ "$PROBE_RESULT" == "PASS" ]] && echo x || echo ' ' )] V-01 四服务 /healthz + /readyz
- [ ] V-02 登录（需种子账号，SUP-211 后补测）
- [ ] V-03 建单（需种子账号，SUP-211 后补测）

## 备注

- 本 dry-run 验证**回滚编排与时限**，不执行 DB down 迁移。
- 登录/建单冒烟待 [SUP-211](SUP-211) 部署验证通过后追加。
EOF

log "=== dry-run 完成: ${ELAPSED}s, P0探活=$PROBE_RESULT, RTO=$RTO_OK ==="
log "记录已写入: $RECORD_FILE"

if [[ "$PROBE_RESULT" != "PASS" ]]; then
  exit 1
fi
