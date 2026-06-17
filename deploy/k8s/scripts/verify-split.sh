#!/usr/bin/env bash
# Verify canary weights in rendered K8s manifests for a given stage.
set -euo pipefail

OVERLAY_DIR="${OVERLAY_DIR:-deploy/k8s/overlays}"
STAGE="${1:-c1}"

case "$STAGE" in
  c1) EXPECTED="5" ;;
  c2) EXPECTED="25" ;;
  c3) EXPECTED="100" ;;
  rollback) EXPECTED="0" ;;
  *)
    echo "Usage: $0 {c1|c2|c3|rollback}"
    exit 1
    ;;
esac

rendered=$(kubectl kustomize "$OVERLAY_DIR/$STAGE")

extract_weight() {
  local name="$1"
  echo "$rendered" | awk -v name="$name" '
    BEGIN { RS="---"; FS="\n" }
    /kind: Ingress/ && $0 ~ ("name: " name) {
      for (i=1; i<=NF; i++) {
        if ($i ~ /nginx.ingress.kubernetes.io\/canary-weight:/) {
          gsub(/.*: /, "", $i)
          gsub(/"/, "", $i)
          print $i
          exit
        }
      }
    }
  '
}

gateway_weight=$(extract_weight "gateway-canary")
web_weight=$(extract_weight "web-canary")

echo "Stage: $STAGE"
echo "Expected canary weight: $EXPECTED"
echo "Gateway canary weight: ${gateway_weight:-<missing>}"
echo "Web canary weight: ${web_weight:-<missing>}"

if [ "${gateway_weight:-}" != "$EXPECTED" ] || [ "${web_weight:-}" != "$EXPECTED" ]; then
  echo "FAIL: weights do not match expected value"
  exit 1
fi

echo "PASS"
