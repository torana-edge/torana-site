#!/usr/bin/env bash
# Keep the CI entry point; fixtures run on macOS and Linux.
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec node --test "$script_dir/test-edge-links.mjs"
