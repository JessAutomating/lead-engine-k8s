#!/usr/bin/env bash
# Applies the manifests in order to the current kubectl context.
# Usage:  ./scripts/apply.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="${here}/.."
for f in 00-namespace.yaml 10-configmap.yaml 20-cronjob-region-one.yaml 21-cronjob-region-two.yaml; do
  kubectl apply -f "${root}/k8s/${f}"
done
kubectl get cronjobs -n lead-engine
