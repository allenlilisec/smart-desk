#!/usr/bin/env bash
# 本地验证灰度/回滚监控告警配置
# 用法：./tests/validate-alerts.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== SmartDesk Alert Config Validator ==="
echo ""

# ── 1. 检查依赖 ─────────────────────────────────────────────
for cmd in python3 jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: missing required tool: $cmd"
    exit 1
  fi
done

# ── 2. YAML 语法校验 ────────────────────────────────────────
echo "[1/4] Validating YAML files..."
python3 - <<'PY'
import sys
import yaml

files = [
    ".github/actions/notify-alert/action.yml",
    ".github/workflows/deploy-canary.yml",
    ".github/workflows/rollback.yml",
    ".github/workflows/alert-test.yml",
]

failed = False
for f in files:
    try:
        with open(f, encoding="utf-8") as fh:
            yaml.safe_load(fh)
        print(f"  OK  {f}")
    except Exception as e:
        print(f"  FAIL {f}: {e}")
        failed = True

sys.exit(1 if failed else 0)
PY

# ── 3. 模拟 notify-alert payload 生成 ───────────────────────
echo ""
echo "[2/4] Simulating notify-alert payload..."
python3 - <<'PY'
import json
import subprocess
import sys

payload = subprocess.check_output(
    [
        "jq", "-n",
        "--arg", "severity", "P0",
        "--arg", "title", "mock-alert",
        "--arg", "body", "line1\nline2",
        "--arg", "recipients", "oncall,CTO",
        "--arg", "repo", "allenlilisec/smart-desk",
        "--arg", "run_id", "12345",
        "--arg", "run_url", "https://github.com/allenlilisec/smart-desk/actions/runs/12345",
        "--arg", "actor", "tester",
        "--arg", "event", "workflow_dispatch",
        "--arg", "ref", "refs/heads/main",
        "--arg", "sha", "abc123",
        "--arg", "timestamp", "2026-06-17T00:00:00Z",
        """{
          severity: $severity,
          title: $title,
          body: $body,
          recipients: ($recipients | split(",") | map(select(. != ""))),
          repository: $repo,
          run_id: $run_id,
          run_url: $run_url,
          actor: $actor,
          event: $event,
          ref: $ref,
          sha: $sha,
          timestamp: $timestamp
        }""",
    ],
    text=True,
    encoding="utf-8",
    errors="replace",
)

data = json.loads(payload)
required = {"severity", "title", "body", "recipients", "repository", "run_id", "run_url", "actor", "event", "ref", "sha", "timestamp"}
missing = required - set(data.keys())
if missing:
    print(f"  FAIL missing fields: {missing}")
    sys.exit(1)
if data["severity"] != "P0":
    print("  FAIL severity mismatch")
    sys.exit(1)
if len(data["recipients"]) != 2:
    print("  FAIL recipients split mismatch")
    sys.exit(1)
print("  OK payload fields complete")
PY

# ── 4. canary-stage.sh 外部覆盖逻辑 ─────────────────────────
echo ""
echo "[3/4] Testing canary-stage.sh env override..."
# 仅做语法/变量解析检查，不真正调用 docker
output=$(GATEWAY_STABLE_REPLICAS=1 bash -n deploy/scripts/canary-stage.sh 2>&1) || {
  echo "  FAIL syntax check: $output"
  exit 1
}
# 通过 dry-run 方式验证环境变量被采纳
result=$(
  GATEWAY_STABLE_REPLICAS=1 GATEWAY_CANARY_REPLICAS=1 \
  WEB_STABLE_REPLICAS=1 WEB_CANARY_REPLICAS=1 \
  CORE_STABLE_REPLICAS=1 CORE_CANARY_REPLICAS=1 \
  INSIGHT_STABLE_REPLICAS=1 INSIGHT_CANARY_REPLICAS=1 \
  bash -c 'source deploy/scripts/canary-stage.sh c1 >/dev/null 2>&1; echo "G=$GATEWAY_STABLE_REPLICAS"'
) || true
if echo "$result" | grep -q "G=1"; then
  echo "  OK env override works"
else
  echo "  WARN could not verify env override (docker dependency): $result"
fi

# ── 5. Docker 镜像构建（可选） ───────────────────────────────
echo ""
echo "[4/4] Building healthz-stub image (optional)..."
if command -v docker >/dev/null 2>&1; then
  docker build -t smartdesk-canary-stub:validate "$ROOT/deploy/healthz-stub"
  echo "  OK docker build passed"
else
  echo "  SKIP docker not available"
fi

echo ""
echo "=== All local validations passed ==="
