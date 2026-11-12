#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v timeout || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

echo "Running bounded vinext build..."
timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
  "${vinext}" build

"${script_dir}/validate-artifact.sh"

# TypeScript source imports used by these ESM test loaders require Node 22's
# opt-in type stripping. Pass it to subprocesses too (audit-breeds.mjs is
# spawned by breed-integrity.test.mjs), without affecting the vinext build.
NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }--experimental-strip-types" \
  node --experimental-loader ./tests/breed-store-loader.mjs --test tests/breed-integrity.test.mjs

NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }--experimental-strip-types" \
  node --experimental-loader ./tests/cloudflare-loader.mjs --test tests/breed-fci-import.test.mjs
