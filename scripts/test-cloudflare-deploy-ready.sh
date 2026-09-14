#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
tmp_dir=$(mktemp -d)
trap 'rm -f "$tmp_dir/summary"; rmdir "$tmp_dir"' EXIT

check() {
  local name=$1
  local want_status=$2
  local token=$3
  local account=$4
  local ref=$5

  : > "$tmp_dir/summary"
  local log status=0
  log=$(GITHUB_REF="$ref" GITHUB_STEP_SUMMARY="$tmp_dir/summary" \
    CLOUDFLARE_API_TOKEN="$token" \
    CLOUDFLARE_ACCOUNT_ID="$account" \
    "$script_dir/cloudflare-deploy-ready.sh" 2>&1) || status=$?

  if [[ "$status" != "$want_status" ]]; then
    echo "$name: status $status, want $want_status" >&2
    exit 1
  fi
  for secret in "$token" "$account"; do
    if [[ -n "$secret" && ( "$log" == *"$secret"* || "$(<"$tmp_dir/summary")" == *"$secret"* ) ]]; then
      echo "$name: credential leaked into workflow diagnostics" >&2
      exit 1
    fi
  done
  if [[ "$want_status" != 0 ]]; then
    [[ "$log" == *"::error title=Website deployment blocked"* ]] || {
      echo "$name: missing failure annotation" >&2
      exit 1
    }
    [[ "$(<"$tmp_dir/summary")" == *"No website was published"* ]] || {
      echo "$name: missing failure summary" >&2
      exit 1
    }
  elif [[ -n "$log" || -s "$tmp_dir/summary" ]]; then
    echo "$name: configured production deployment emitted a failure diagnostic" >&2
    exit 1
  fi
}

check neither 1 "" "" refs/heads/main
check token-only 1 token-secret "" refs/heads/main
check account-only 1 "" account-secret refs/heads/main
check both 0 token-secret account-secret refs/heads/main
check wrong-branch 1 token-secret account-secret refs/heads/feature
check tag 1 token-secret account-secret refs/tags/v0.1
check no-ref 1 token-secret account-secret ""

echo "Cloudflare production deployment gate: all seven cases pass"
