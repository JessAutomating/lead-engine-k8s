#!/usr/bin/env bash
# Creates/updates the lead-engine-secrets Secret from the gitignored .env file.
# Only the four secret keys are pulled; non-secret values stay in the ConfigMap.
# Usage:  ./scripts/create-secret.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="${here}/../.env"

if [[ ! -f "${env_file}" ]]; then
  echo ".env not found. Copy .env.example to .env and fill in real values first." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "${env_file}"; set +a

keys=(APIFY_TOKEN FIRECRAWL_API_KEY ANTHROPIC_API_KEY GOOGLE_ACCESS_TOKEN)
args=()
for k in "${keys[@]}"; do
  v="${!k:-}"
  if [[ -z "${v}" ]]; then
    echo "Missing ${k} in .env" >&2
    exit 1
  fi
  args+=("--from-literal=${k}=${v}")
done

kubectl create secret generic lead-engine-secrets \
  --namespace lead-engine \
  "${args[@]}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secret lead-engine-secrets applied to namespace lead-engine."
