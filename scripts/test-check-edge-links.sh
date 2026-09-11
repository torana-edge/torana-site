#!/usr/bin/env bash
# Pins the states that matter for check-edge-links.mjs, because the value of
# that check is entirely in what it does when it CANNOT do its job. An earlier
# version exited 0 on a missing checkout, which is a green CI step reporting
# nothing — the silent hole the check exists to close.
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
checker="$script_dir/check-edge-links.mjs"

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

run() {
  local want=$1
  shift
  local log status
  set +e
  log=$(cd "$repo_root" && node "$checker" "$@" 2>&1)
  status=$?
  set -e
  if [[ "$status" != "$want" ]]; then
    echo "FAIL: [$*] exited $status, want $want" >&2
    echo "$log" >&2
    exit 1
  fi
  printf '%s\n' "$log"
}

# 1. A supplied path that does not exist must FAIL. This is the regression.
out=$(run 1 "$tmp_dir/no-such-checkout")
[[ "$out" == *"cannot verify"* ]] || { echo "FAIL: missing checkout gave no diagnostic: $out" >&2; exit 1; }

# 2. --optional is the developer escape hatch, and only it may skip.
out=$(run 0 --optional "$tmp_dir/no-such-checkout")
[[ "$out" == *"skipping (--optional)"* ]] || { echo "FAIL: --optional gave no skip notice: $out" >&2; exit 1; }

# 3. No path at all is a usage error, distinct from both.
run 2 >/dev/null

# 4. A checkout containing every linked file passes. Built from the links this
#    site actually publishes, so the fixture cannot drift away from them.
fake="$tmp_dir/edge"
mapfile -t targets < <(grep -rhoP 'https://github\.com/torana-edge/torana-edge/blob/main/\K[^"'"'"'\s)>]+' "$repo_root/src" | cut -d'#' -f1 | sort -u)
if [[ ${#targets[@]} -eq 0 ]]; then
  echo "FAIL: the site publishes no torana-edge links; this test guards nothing" >&2
  exit 1
fi
for target in "${targets[@]}"; do
  mkdir -p "$fake/$(dirname "$target")"
  : > "$fake/$target"
done
out=$(run 0 "$fake")
[[ "$out" == *"all resolve"* ]] || { echo "FAIL: complete checkout did not report success: $out" >&2; exit 1; }

# 5. Remove one of them and it must fail, naming the file.
rm -f "$fake/${targets[0]}"
out=$(run 1 "$fake")
[[ "$out" == *"${targets[0]}"* ]] || { echo "FAIL: broken link not named: $out" >&2; exit 1; }

echo "check-edge-links: all five cases pass (${#targets[@]} link target(s) exercised)"
