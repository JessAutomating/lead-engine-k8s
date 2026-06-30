# Creates/updates the lead-engine-secrets Secret from the gitignored .env file.
# Only the four secret keys are pulled; non-secret values stay in the ConfigMap.
# Usage:  ./scripts/create-secret.ps1
$ErrorActionPreference = "Stop"

$envPath = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $envPath)) {
  Write-Error ".env not found. Copy .env.example to .env and fill in real values first."
}

$vars = @{}
Get-Content $envPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $i = $line.IndexOf("=")
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
    $vars[$k] = $v
  }
}

$keys = @("APIFY_TOKEN", "FIRECRAWL_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_ACCESS_TOKEN")
$literals = @()
foreach ($k in $keys) {
  if (-not $vars.ContainsKey($k) -or -not $vars[$k]) {
    Write-Error "Missing $k in .env"
  }
  $literals += "--from-literal=$k=$($vars[$k])"
}

# Idempotent apply: render the Secret and pipe through kubectl apply.
kubectl create secret generic lead-engine-secrets `
  --namespace lead-engine `
  $literals `
  --dry-run=client -o yaml | kubectl apply -f -

Write-Output "Secret lead-engine-secrets applied to namespace lead-engine."
