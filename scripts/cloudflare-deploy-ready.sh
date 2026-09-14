#!/usr/bin/env bash
set -euo pipefail

fail() {
  local message=$1
  echo "::error title=Website deployment blocked::$message" >&2
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '### Website deployment blocked\n\n%s\n\nNo website was published. See the Cloudflare setup section in README.md.\n' "$message" >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 1
}

if [[ "${GITHUB_REF:-}" != refs/heads/main ]]; then
  fail "Production publishing must run from main. Select main when dispatching this workflow."
fi

missing=()
[[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || missing+=(CLOUDFLARE_API_TOKEN)
[[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]] || missing+=(CLOUDFLARE_ACCOUNT_ID)
if (( ${#missing[@]} )); then
  fail "Missing GitHub Actions secrets: ${missing[*]}. Configure them in torana-edge/torana-site; do not paste credentials into logs or issues."
fi
