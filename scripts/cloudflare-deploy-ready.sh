#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_OUTPUT:?GITHUB_OUTPUT must name the workflow output file}"

configured=false
if [[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  configured=true
else
  message="CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must both be configured; the production build was still verified."
  echo "::notice title=Cloudflare deployment skipped::$message"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '### Cloudflare deployment skipped\n\n%s\n' "$message" >> "$GITHUB_STEP_SUMMARY"
  fi
fi

printf 'configured=%s\n' "$configured" >> "$GITHUB_OUTPUT"
