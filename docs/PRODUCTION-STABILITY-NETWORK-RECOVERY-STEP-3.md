# Production Stability & Network Recovery — 3/7

Checkpoint: `65128f2b2705f1b89f61df5dbede24dc31fd5c0e`, common draft PR #1603.

## Implemented

- Shared optional-read fallback for known transient failures, preserving unknown, authorization, cancellation and framework exceptions. Essential data is not replaced with fictitious empty results.
- Public hero visuals use existing configured default on transient failure. Directory overview uses the already-loaded genuine listing if category previews fail; discovery can be omitted. Homepage optional event, help and directory teasers degrade independently; primary editorial collection remains essential. Breed editorial teasers, article author details and related event suggestions can be omitted on transient failure.
- Event SSR: preserve actual listing even when calendar reads fail; render explicit unavailable status with retry. Client calendar-only requests retain the existing listing on error; unavailable calendar data is not seeded into the successful client cache. Full-listing request failures keep existing explicit error behavior. No fabricated calendar day counts.
- Authenticated partner notifications and settings: isolate optional account reads after authentication, show unavailable status, and do not render editable forms using invented values. Authentication and authorization remain fail-closed. Existing Admin independent-read recovery preserved.
- Worker: HTML, media and hero cache match/put failures are best effort. Existing eligibility, privacy, keys, response status, and origin handling remain unchanged. Sitemap recovery unchanged.
- Existing directory regression contract updated and five targeted tests added.

## Verification and limitations

Five isolated Node 22 tests passed against exact Git blobs: optional helper `ec79bd62b015b8b92779a125f4f49d7ff031c9f5`, retry helper `5eadb5e826306adb37d7a3d44f6505424bf86ba8`, test `a5030c26f1b6b33cc4293e7a7dfbdf38d7813309`. Standalone strict TypeScript check of both helpers passed. This is not a full checkout build, UI test or repository CI result; integration, formatting and static source-contract checks still need verification. A degraded anonymous HTML response may use the existing short cache TTL; calendar recovery uses the JSON API to bypass that HTML cache. Optional fallbacks only cover verified transient errors, not every possible exception. Root session/security boundaries deliberately remain fail-closed. No changes to production, schema, Notion, or write retries. Exact fault source in the observed incident remains unconfirmed. Recheck overlap with other open PRs before merge.
