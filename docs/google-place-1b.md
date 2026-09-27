# GOOGLE-PLACE-1B — controlled matching

This canary uses Google Places API (New) Text Search only to identify an existing Google Place for an already-resolved exact DIRECTORY_PROFILE location.

## Runtime secret

Server-side secret name:

`GOOGLE_PLACES_API_KEY`

Provision after merge with Cloudflare/Wrangler for the production Worker environment. Do not reuse or broaden the browser Google Maps key.

Example manual command from an authenticated operator environment:

`npx wrangler secret put GOOGLE_PLACES_API_KEY`

The key must be restricted in Google Cloud to the Places API (New) as appropriate for the server-side Worker credential.

## Safety contract

- canonical address + Geoapify GEO remain authoritative
- Google coordinates are validation-only
- preview writes nothing
- apply is explicit, max 5, and accepts MATCH only
- apply re-reads the target and reruns Google matching
- writes are limited to `google_place_id`, `google_place_source_fingerprint`, `google_place_matched_at`
- no migration, cron, Tavily, bulk rollout, or background matching in 1B
