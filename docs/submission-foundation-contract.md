# Submission / moderation / security foundation contract

This layer is domain-neutral. It MUST NOT own `lost_found_cases`, `lost_found_private_details`, `adoption_dogs`, shelter/OZ canonical data, or public lost/found/adoption routes.

## Resource identity

Supported initial `resource_type` values are:

- `LOST_FOUND_CASE`
- `ADOPTION_DOG`
- `ORGANIZATION_CHANGE`

`subject_id` is an opaque text identifier. There is deliberately no foreign key to a domain table. CREATE submissions may start with `subject_id = NULL`; the owning workstream may attach its stable subject identifier later.

## Moderation contract

Domain workstreams create a `moderation_submissions` record with `resource_type`, optional `subject_id`, `operation`, `submitter_type`, sanitized proposed patch JSON, and risk flags. Public content MUST NOT be published merely because a submission exists. Publication remains a domain operation triggered only after the submission has been approved.

All moderation state changes produce an append-only `moderation_events` entry. Audit payloads must pass through `safeAuditJson()` and must never contain plaintext email, telephone, exact address/location, token, password or encryption secret.

## PII contract

Domain workstreams store PII in their own private tables. Before persistence they use `encryptPii()` with `PII_ENCRYPTION_KEY`. Equality/deduplication/rate-limiting uses `hashPii()` with the independent `PII_HASH_KEY`; plaintext values must not be used as rate-limit keys.

Required secrets are 32 random bytes encoded as base64url. They must be configured as Worker secrets, never committed.

## Access-token contract

Magic/access links use at least 32 random bytes from `createOpaqueToken()`. Only the SHA-256 hash is stored in `resource_access_tokens`. Tokens are purpose-scoped, expiring, one-time and revocable.

After consuming a one-time token, the domain workstream creates a new random management session token, stores only its hash in `resource_management_sessions`, and returns it in a cookie created with `buildManagementSessionCookie()`: `HttpOnly; Secure; SameSite=Strict; Path=/`. Session lifetimes must not exceed seven days; domain MVPs should normally use 15 minutes for one-time links and 24 hours for management sessions.

## Turnstile contract

Every future anonymous/public submission endpoint MUST call `verifyTurnstile()` server-side before creating a durable submission or upload capability. Configure an expected hostname and a unique expected action per workflow. Verification fails closed on missing configuration, network errors, invalid JSON, failed Siteverify, hostname mismatch, action mismatch, stale challenges or replay.

Use `createD1TurnstileReplayStore()` so successful tokens are also claimed in `turnstile_token_uses`; this is defense in depth in addition to Cloudflare's one-time token behavior.

## Rate-limit contract

Use `deriveRateLimitKey()` with `PII_HASH_KEY` for email/phone/IP identifiers, then `enforceRateLimit(createD1RateLimitStore(...))`. Never persist a raw email, phone or IP address in `security_rate_limits`.

Honeypots remain a secondary signal and never replace Turnstile or server-side limits.

## Media contract

Public/browser-originated files MUST first enter a dedicated private R2 binding named `SUBMISSION_UPLOADS`; this bucket must not be routed through `/media/...` or exposed by an R2 public/custom domain.

`ingestPrivateImage()` accepts only JPEG/PNG/WebP, enforces an 8 MiB limit, validates magic bytes against declared MIME, stores the raw object under `quarantine/`, decodes through Cloudflare Images, scales down to at most 2000x2000, re-encodes to WebP with metadata disabled, and stores that output under `safe/`.

Only `safe/` keys can be passed to `publishSafeImage()`. Publishing copies the processed object into the existing public `BUCKET`; domain workstreams must do this only after their moderation policy permits publication.

## Feature flags

The foundation defines but does not enable these optional runtime variables:

- `LOST_FOUND_SUBMISSIONS_ENABLED`
- `ADOPTION_SUBMISSIONS_ENABLED`
- `ORGANIZATION_SUBMISSIONS_ENABLED`

Absent values mean disabled. This foundation adds no public form or domain submission route.

## Cloudflare configuration required before a domain rollout

Secrets:

- `TURNSTILE_SECRET_KEY`
- `PII_ENCRYPTION_KEY`
- `PII_HASH_KEY`

Bindings/vars:

- private R2 binding `SUBMISSION_UPLOADS` -> a dedicated non-public bucket
- existing Cloudflare Images binding `IMAGES`
- existing public R2 binding `BUCKET`
- Turnstile site key exposed only to the future public form
- feature flag for the domain being launched

Do not add the private bucket binding to production configuration until the bucket exists; otherwise a normal production deploy could fail before the domain feature is ready.
