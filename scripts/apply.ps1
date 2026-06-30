# Applies the manifests in order to the current kubectl context.
# Usage:  ./scripts/apply.ps1
$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot ".."
$files = @(
  "k8s/00-namespace.yaml",
  "k8s/10-configmap.yaml",
  "k8s/20-cronjob-region-one.yaml",
  "k8s/21-cronjob-region-two.yaml"
)
foreach ($f in $files) {
  kubectl apply -f (Join-Path $root $f)
}
kubectl get cronjobs -n lead-engine
