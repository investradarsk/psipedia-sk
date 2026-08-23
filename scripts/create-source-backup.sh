#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
output_root="${1:-$repo_root/backups/source-$stamp}"

mkdir -p "$output_root"

git -C "$repo_root" bundle create "$output_root/psipedia-sk-$stamp.bundle" --all
git -C "$repo_root" archive \
  --format=tar.gz \
  --prefix="psipedia-sk/" \
  --output="$output_root/psipedia-sk-$stamp.tar.gz" \
  HEAD

(
  cd "$output_root"
  sha256sum ./* > SHA256SUMS
)

printf 'Záloha zdrojov je v: %s\n' "$output_root"
