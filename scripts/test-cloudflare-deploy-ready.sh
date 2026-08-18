#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
tmp_dir=$(mktemp -d)
trap 'rm -f "$tmp_dir/output" "$tmp_dir/summary"; rmdir "$tmp_dir"' EXIT

check() {
  local name=$1
  local want=$2
  local token=$3
  local account=$4

  : > "$tmp_dir/output"
  : > "$tmp_dir/summary"
  local log
  log=$(GITHUB_OUTPUT="$tmp_dir/output" \
    GITHUB_STEP_SUMMARY="$tmp_dir/summary" \
    CLOUDFLARE_API_TOKEN="$token" \
    CLOUDFLARE_ACCOUNT_ID="$account" \
    "$script_dir/cloudflare-deploy-ready.sh")

  local got
  got=$(<"$tmp_dir/output")
  if [[ "$got" != "configured=$want" ]]; then
    echo "$name: output $got, want configured=$want" >&2
    exit 1
  fi
  for secret in "$token" "$account"; do
    if [[ -n "$secret" && ( "$log" == *"$secret"* || "$(<"$tmp_dir/summary")" == *"$secret"* ) ]]; then
      echo "$name: credential leaked into workflow diagnostics" >&2
      exit 1
    fi
  done
  if [[ "$want" == false ]]; then
    [[ "$log" == *"Cloudflare deployment skipped"* ]] || {
      echo "$name: missing skip notice" >&2
      exit 1
    }
    [[ "$(<"$tmp_dir/summary")" == *"Cloudflare deployment skipped"* ]] || {
      echo "$name: missing skip summary" >&2
      exit 1
    }
  elif [[ -n "$log" || -s "$tmp_dir/summary" ]]; then
    echo "$name: configured credentials emitted a skip diagnostic" >&2
    exit 1
  fi
}

check neither false "" ""
check token-only false token-secret ""
check account-only false "" account-secret
check both true token-secret account-secret

echo "Cloudflare deployment credential gate: all four cases pass"
