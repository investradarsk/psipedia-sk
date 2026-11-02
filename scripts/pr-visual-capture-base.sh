#!/usr/bin/env bash
# Compare real locally rendered pages at two exact Git revisions, with the
# same preconfigured test fixtures. No deployment or production data.
set -euo pipefail
if [[ "$PSIPEDIA_E2E_LOCAL_BOOTSTRAP" != "1" ]]; then
  echo "Local-only visual baseline requires PSIPEDIA_E2E_LOCAL_BOOTSTRAP=1" >&2
  exit 1
fi
if [[ ! "$VISUAL_BASELINE_SHA" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Missing verified shared-ancestor SHA" >&2
  exit 1
fi
if [[ -z "$VISUAL_SELECTED_ROUTES" ]]; then
  echo "No selected visual routes" >&2
  exit 1
fi
test -n "$GITHUB_WORKSPACE"
test -n "$RUNNER_TEMP"
BASE_DIR="$RUNNER_TEMP/psipedia-visual-base"
test -d "$BASE_DIR"
test "$(git -C "$BASE_DIR" rev-parse HEAD)" = "$VISUAL_BASELINE_SHA"
test -L "$BASE_DIR/node_modules"

cd "$BASE_DIR"
npm run build

# Two migrations intentionally require a separately seeded production-only
# adoption staging state. This screenshot runner uses disposable foundation D1.
MOVED="$RUNNER_TEMP/psipedia-visual-base-migrations"
mkdir -p "$MOVED"
for name in 0038_adoption_staging_data.sql 0039_activate_canonical_adoptions.sql; do
  mv "drizzle/$name" "$MOVED/$name"
done
restore_migrations() {
  for name in 0038_adoption_staging_data.sql 0039_activate_canonical_adoptions.sql; do
    if [[ -f "$MOVED/$name" ]]; then mv "$MOVED/$name" "drizzle/$name"; fi
  done
}
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
  restore_migrations
}
trap cleanup EXIT
npx wrangler d1 migrations apply DB --local --config dist/server/wrangler.json --persist-to .wrangler/state
node scripts/bootstrap-breed-e2e.mjs prepare

cat > .dev.vars <<'VARS'
WEB_PUSH_ENABLED=false
FACEBOOK_IMAGE_PUBLISH_ENABLED=false
NOTION_ARTICLE_SYNC_ENABLED=false
NOTION_DIRECTORY_SYNC_ENABLED=false
NOTION_EVENT_SYNC_ENABLED=false
NOTION_FACEBOOK_IMAGES_SYNC_ENABLED=false
GEMINI_EXTERNAL_AGENT_ENABLED=false
GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED=false
PSIPEDIA_E2E_LOCAL_BOOTSTRAP=1
VARS
mkdir -p "$GITHUB_WORKSPACE/.e2e-artifacts/pr-visual/site-before"
nohup npm exec vite -- --host 127.0.0.1 --port 5173 --strictPort > "$GITHUB_WORKSPACE/.e2e-artifacts/pr-visual/site-before-server.log" 2>&1 &
server_pid=$!
ready=0
for attempt in $(seq 1 120); do
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  if curl --silent --fail http://localhost:5173/ >/dev/null; then ready=1; break; fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  tail -150 "$GITHUB_WORKSPACE/.e2e-artifacts/pr-visual/site-before-server.log"
  exit 1
fi

E2E_BASE_URL=http://localhost:5173 node scripts/bootstrap-phase5-e2e.mjs sections-only
node scripts/bootstrap-breed-e2e.mjs seed
E2E_BASE_URL=http://localhost:5173 node scripts/bootstrap-phase5-e2e.mjs full

# The capture script is from the PR revision so before/after uses exactly the
# same Chromium configuration, selected routes and screenshot naming.
VISUAL_BASE_URL=http://localhost:5173 \
VISUAL_OUTPUT_DIR="$GITHUB_WORKSPACE/.e2e-artifacts/pr-visual/site-before" \
PR_HEAD_SHA="$VISUAL_BASELINE_SHA" \
node "$GITHUB_WORKSPACE/scripts/pr-visual-screenshots.mjs"
