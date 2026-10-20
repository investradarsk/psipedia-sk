# ADMIN LEGACY MUTATION CSRF HARDENING 01

Scope: one isolated Draft PR; no deployment, D1 migration, functional or visual changes.

## Auth and provenance
- Existing interactive Admin identity remains mandatory: configured allowlist or validated Cloudflare Access, with 401 before origin processing.
- Mutating endpoints accept exact request scheme/host/port Origin. If Origin is missing, require Sec-Fetch-Site: same-origin. Reject cross-site/same-site Fetch Metadata, missing both provenance signals, malformed/null Origin, scheme and port mismatches with 403.
- **Migrated legacy route handlers** fail closed when both headers are missing. The shared `requireAdminMutation` preserves the prior missing-header behavior for other, unmodified Admin callers until each family has been audited separately; no new service-account exemption was added. No separately authenticated server-to-server exceptions were established; no header-based internal bypass has been added. Read-only GET keeps existing authentication but no CSRF guard.
- Preserve preexisting extra JSON/Origin checks in event quick edit and organization Google Place; retain original input validations, CAS, publication, Notion writeback and error handling.

## Route inventory (34 newly hardened mutators across 26 route files)
- Directory: root POST, [id] PUT/PATCH/DELETE.
- Articles: root POST, [id] PUT/DELETE, content-qa-remediation POST, article-topics POST, article-topics/[id] PUT, article-feedback/[id] PUT. Article [id] PATCH was already guarded.
- Events: root POST, [id] PUT/PATCH/DELETE, bulk POST.
- Organizations: root POST, [id] PUT, bulk POST, publication PUT, google-place POST, fundraising POST, fundraising/[methodId] PUT/DELETE and verification PUT, locations POST, locations/[locationId] PUT/DELETE.
- Adoptions: root POST, [id] PUT.
- Breeds: root POST, [id] PUT/DELETE, bulk POST.
- Existing directory/[id]/service-options PATCH and articles/[id] PATCH guards were kept exactly as before; both remain authenticated and CSRF-protected under their original shared-guard policy.

## Tests and deployment boundaries
Run: `node --experimental-strip-types --experimental-loader ./tests/admin-legacy-csrf-loader.mjs --test tests/admin-legacy-mutation-csrf.test.mjs`.
Tests cover the real authentication wrapper with offline-only stubs, negative identity and Origin cases, missing headers, GET, invalid JSON and non-write behavior, every route's guard-before-parse contract, and key CAS/Notion invariants. Path-scoped Node 22 GitHub Actions job uses read-only permissions. Independent review and browser acceptance are still required before any merge or deployment.

## Compatibility follow-up
The first global strict-provenance revision broke existing Facebook Admin integration fixtures (403 on previously supported headerless calls). This PR narrows strict missing-header enforcement to the audited handlers, without weakening scheme/host/port matching for any supplied Origin. All other previously guarded Admin endpoints should be separately inventoried for a future controlled migration.

The two previously guarded PATCH handlers retain their original `requireAdminMutation(request)` invocation to preserve the service-catalog and calendar regression contracts; only newly migrated handlers opt into strict missing-header validation.
