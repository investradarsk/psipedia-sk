#!/usr/bin/env bash
# Shared disposable review CI bootstrap. No remote database operations.
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }

[ "${GITHUB_ACTIONS:-}" = "true" ] || fail "GitHub Actions workspace required"
[ "${PSIPEDIA_E2E_LOCAL_BOOTSTRAP:-}" = "1" ] || fail "Local E2E bootstrap required"
[ "${E2E_BASE_URL:-}" = "http://localhost:5173" ] || fail "Only the isolated localhost server is allowed"

action="${1:-}"
profile="${2:-}"
case "$profile" in
  reviews-1b) ready_path="/adresar/veterinari/health-fixture-vet-rich" ;;
  reviews-2a) ready_path="/recenzia/prihlasenie" ;;
  reviews-2b) ready_path="/recenzia/napisat?resourceId=reviews-2b-directory-resource" ;;
  reviews-3) ready_path="/admin/recenzie-profilov" ;;
  *) fail "Unknown review E2E profile" ;;
esac
[ "$#" -eq 2 ] || fail "Expected action and profile"
artifact=".e2e-artifacts/$profile"
pid_file="$artifact/server.pid"
log_file="$artifact/server.log"

stop_server() {
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file")"
    [[ "$pid" =~ ^[1-9][0-9]+$ ]] || fail "Invalid local server PID"
    kill "$pid" 2>/dev/null || true
    rm -f "$pid_file"
  fi
}

case "$action" in
  migrate)
    [ -f dist/server/wrangler.json ] || fail "Local build configuration missing"
    # Adoption data migrations require different fixture prerequisites.
    # Preserve the two original exclusions without fixed /tmp filenames.
    backup="$(mktemp -d)"
    restore_migrations() {
      local status=$?
      trap - EXIT
      for file in 0038_adoption_staging_data.sql 0039_activate_canonical_adoptions.sql; do
        if [ -f "$backup/$file" ]; then
          if [ -e "drizzle/$file" ]; then
            printf 'Restore collision: %s (backup %s)\n' "$file" "$backup" >&2
            exit 1
          fi
          mv "$backup/$file" "drizzle/$file" || exit 1
        fi
      done
      rmdir "$backup" || exit 1
      exit "$status"
    }
    trap restore_migrations EXIT
    for file in 0038_adoption_staging_data.sql 0039_activate_canonical_adoptions.sql; do
      mv "drizzle/$file" "$backup/$file"
    done
    npx wrangler d1 migrations apply DB --local --config dist/server/wrangler.json --persist-to .wrangler/state
    ;;
  start)
    mkdir -p "$artifact"
    [ ! -e "$pid_file" ] || fail "Local server PID file already exists"
    # Never silently fall back to another port or adopt an unrelated server.
    if curl --silent --max-time 2 http://localhost:5173/ >/dev/null 2>&1; then
      fail "Local E2E port is already in use"
    fi
    nohup npm exec vite -- --host 127.0.0.1 --port 5173 --strictPort > "$log_file" 2>&1 &
    pid=$!
    printf '%s\n' "$pid" > "$pid_file"
    for attempt in $(seq 1 90); do
      if ! kill -0 "$pid" 2>/dev/null; then break; fi
      if curl --silent --fail --max-time 3 "http://localhost:5173$ready_path" >/dev/null; then
        exit 0
      fi
      sleep 1
    done
    tail -200 "$log_file" >&2 || true
    stop_server
    fail "Local review server failed readiness: $profile"
    ;;
  stop) stop_server ;;
  *) fail "Unknown review E2E action" ;;
esac
