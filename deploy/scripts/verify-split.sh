#!/usr/bin/env bash
# Sample ingress traffic and report stable vs canary ratio (±容差).
set -euo pipefail

URL="${1:-http://localhost:19080/api/}"
SAMPLES="${2:-40}"

stable=0
canary=0

for _ in $(seq 1 "$SAMPLES"); do
  body=$(curl -sfm 5 "$URL" || echo '{}')
  if echo "$body" | grep -q '"version": "canary"'; then
    canary=$((canary + 1))
  else
    stable=$((stable + 1))
  fi
done

total=$((stable + canary))
canary_pct=$(awk "BEGIN {printf \"%.1f\", ($canary/$total)*100}")

echo "Samples: $total"
echo "Stable:  $stable ($(( stable * 100 / total ))%)"
echo "Canary:  $canary (${canary_pct}%)"
