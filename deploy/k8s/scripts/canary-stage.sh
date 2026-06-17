#!/usr/bin/env bash
# Switch canary traffic stage for K8s: c1 (5%), c2 (25%), c3 (100% canary), rollback (0% canary)
set -euo pipefail

OVERLAY_DIR="${OVERLAY_DIR:-deploy/k8s/overlays}"
STAGE="${1:-c1}"

case "$STAGE" in
  c1|c2|c3|rollback)
    echo "Stage $STAGE: applying kustomize overlay $OVERLAY_DIR/$STAGE"
    ;;
  *)
    echo "Usage: $0 {c1|c2|c3|rollback}"
    exit 1
    ;;
esac

kubectl apply -k "$OVERLAY_DIR/$STAGE"

echo "Canary stage '$STAGE' applied."
echo "Verify ingress weights: kubectl get ingress -n smartdesk-canary"
