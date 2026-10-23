#!/usr/bin/env bash
# Isolated local D1 only; no Cloudflare credentials or deployed preview needed.
set -euo pipefail
if [ "${PSIPEDIA_E2E_LOCAL_BOOTSTRAP:-}" != "1" ]; then
  echo 'PSIPEDIA_E2E_LOCAL_BOOTSTRAP=1 is required' >&2
  exit 1
fi
mkdir -p .e2e-artifacts/public-regression
cat > .dev.vars <<'VARS'
PII_ENCRYPTION_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY
PII_HASH_KEY=ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA
TURNSTILE_SITE_KEY=1x00000000000000000000AA
PSIPEDIA_E2E_LOCAL_BOOTSTRAP=1
VARS
npm run build
# These two production data migrations require adoption staging prerequisites.
# Public directory/SEO fixtures use foundation schema, as other local CI jobs do.
migration_backup="$(mktemp -d)"
restore_migrations() {
  for migration in "$migration_backup"/*.sql; do
    [ ! -f "$migration" ] || mv "$migration" drizzle/
  done
  rmdir "$migration_backup"
}
trap restore_migrations EXIT
for migration in 0038_adoption_staging_data.sql 0039_activate_canonical_adoptions.sql; do
  mv "drizzle/$migration" "$migration_backup/"
done
npx wrangler d1 migrations apply DB --local --config dist/server/wrangler.json --persist-to .wrangler/state
restore_migrations
trap - EXIT
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file tests/fixtures/public-regression-ci.sql
nohup npm exec vite -- --host 127.0.0.1 --port 5173 --strictPort > .e2e-artifacts/public-regression/server.log 2>&1 &
server_pid=$!
echo "$server_pid" > .e2e-artifacts/public-regression/server.pid
for attempt in $(seq 1 120); do
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  if curl --silent --fail http://localhost:5173/adresar/veterinari > /dev/null; then
    # Public readers do not create managed section rows on an empty database.
    E2E_BASE_URL=http://localhost:5173 node scripts/bootstrap-phase5-e2e.mjs sections-only
    exit 0
  fi
  sleep 1
done
tail -200 .e2e-artifacts/public-regression/server.log
kill "$server_pid" 2>/dev/null || true
exit 1
