#!/usr/bin/env bash
# Verify canary weights and stable/canary backend isolation in rendered K8s manifests.
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

extract_ingress_backend() {
  local name="$1"
  echo "$rendered" | awk -v name="$name" '
    BEGIN { RS="---"; FS="\n" }
    /kind: Ingress/ && $0 ~ ("name: " name) {
      for (i=1; i<=NF; i++) {
        if ($i ~ /^[[:space:]]*name: / && prev ~ /service:/) {
          gsub(/^[[:space:]]*name: /, "", $i)
          print $i
          exit
        }
        prev = $i
      }
    }
  '
}

extract_service_selector() {
  local name="$1"
  local key="$2"
  echo "$rendered" | awk -v name="$name" -v key="$key" '
    BEGIN { RS="---"; FS="\n"; in_selector=0 }
    /kind: Service/ && $0 ~ ("name: " name) {
      for (i=1; i<=NF; i++) {
        if ($i ~ /^spec:/) { in_selector=0 }
        if ($i ~ /^  selector:/) { in_selector=1; continue }
        if (in_selector && $i ~ ("^[[:space:]]*" key ":")) {
          gsub(/^[[:space:]]*[^:]*:[[:space:]]*/, "", $i)
          print $i
          exit
        }
        if (in_selector && $i !~ /^    /) { in_selector=0 }
      }
    }
  '
}

gateway_weight=$(extract_weight "gateway-canary")
web_weight=$(extract_weight "web-canary")
gateway_stable_backend=$(extract_ingress_backend "gateway")
gateway_canary_backend=$(extract_ingress_backend "gateway-canary")
web_stable_backend=$(extract_ingress_backend "web")
web_canary_backend=$(extract_ingress_backend "web-canary")

echo "Stage: $STAGE"
echo "Expected canary weight: $EXPECTED"
echo "Gateway canary weight: ${gateway_weight:-<missing>}"
echo "Web canary weight: ${web_weight:-<missing>}"
echo "Gateway stable ingress backend: ${gateway_stable_backend:-<missing>}"
echo "Gateway canary ingress backend: ${gateway_canary_backend:-<missing>}"
echo "Web stable ingress backend: ${web_stable_backend:-<missing>}"
echo "Web canary ingress backend: ${web_canary_backend:-<missing>}"

fail=0

if [ "${gateway_weight:-}" != "$EXPECTED" ] || [ "${web_weight:-}" != "$EXPECTED" ]; then
  echo "FAIL: weights do not match expected value"
  fail=1
fi

if [ "${gateway_stable_backend:-}" != "gateway-stable" ] || [ "${gateway_canary_backend:-}" != "gateway-canary" ]; then
  echo "FAIL: gateway ingress backends must point to gateway-stable / gateway-canary"
  fail=1
fi

if [ "${web_stable_backend:-}" != "web-stable" ] || [ "${web_canary_backend:-}" != "web-canary" ]; then
  echo "FAIL: web ingress backends must point to web-stable / web-canary"
  fail=1
fi

for pair in "gateway-stable:stable" "gateway-canary:canary" "web-stable:stable" "web-canary:canary"; do
  svc="${pair%%:*}"
  ver="${pair##*:}"
  got=$(extract_service_selector "$svc" "version")
  if [ "${got:-}" != "$ver" ]; then
    echo "FAIL: service $svc selector version=$ver expected, got ${got:-<missing>}"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "PASS"
