# Production Stability & Network Recovery — step 6/7

Checkpoint: 56709e57761e17a4ed478841c90118e69a0f869f.

## Implementation

New server-side JSON event family `psipedia_stability`: bounded stage names, dependency (read/cache/worker), outcome, duration, optional retry attempt and transient classification, cache operation, HTTP status, request kind and area. Normal first-attempt successes are silent. Successful retries log info, degradation/retry/cancellation warn, and exhausted/non-retryable/failed/HTTP 5xx log error. Framework redirect/not-found control-flow is excluded from retry error reporting. Known operations use fixed stage labels; remaining legacy call sites are tagged unspecified. Existing directory failure diagnostic is retained. No raw URL, filter text, SQL, exception message, stack, token or account ID is emitted by the new event family. This is not a rewrite of unrelated existing logging.

The outer Worker observation preserves the original response or exception without retrying requests or changing status, headers or body. It identifies RSC/document/API/other and public/Admin/Partner/API by coarse categories. A response body or streamed RSC failure after fetch returns is not captured by this observer, and client-only navigation stalls are not reported to the server. Platform-side failures outside the application cannot be diagnosed by these logs alone. Correlation relies on Cloudflare invocation metadata, not visitor-supplied identifiers.

## Cloudflare investigation after deployment

In Workers Observability, filter for message containing psipedia_stability (or event = psipedia_stability when parsed JSON fields are available). Inspect the invocation/trace and worker revision. Filter by stage such as directory_listing or events_calendar and outcomes retrying, recovered, exhausted, degraded or server_error. Count unique invocations separately from log events: a retry can emit multiple events. Successful recoveries are not failed requests; HTTP 5xx and thrown fetches require independent review. Compare equivalent time windows before and after deploy. Existing Notion sync failures remain out of scope.

## Verification

Local Node 22: five targeted tests passed on exact Git blobs: stability-diagnostics.ts 189e6bd84a11120860b9960043d6f218fce84168, public-read-retry.ts 0ccbd13dd3ee484771e9eb13daf701a1f5ecc185, optional-read-recovery.ts 89e2a6328ea6e21f83a3882cfbe9f969f6a006c6, tests/stability-diagnostics.test.mjs d1f1e800398051bd207baf40cc0cbd665cc3c9c4. Standalone strict TypeScript check passed for all three helpers. Regression test added to performance suite. Complete checkout formatting/build/CI, exact revision screenshots and actual production event visibility remain unverified. No production deployment, SQL mutation or Notion changes.
