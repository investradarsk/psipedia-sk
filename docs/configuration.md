# Psipedia configuration contract

CONFIG-1 defines ownership, not one universal config file. Values that have different lifecycle or security requirements stay separate.

## Canonical sources

| Concern | Canonical source | Notes |
| --- | --- | --- |
| Public/canonical site URL | `config/public-site.ts` | Imported by SEO and the package-level production smoke runner. `E2E_BASE_URL` remains an environment-specific test target. |
| Cloudflare Worker static config | `wrangler.jsonc` | Owns compatibility date, ASSETS/IMAGES/version metadata bindings and non-secret production Access vars. It intentionally does **not** redeclare D1/R2 because the Sites/Vite build generates those bindings into the deploy artifact. |
| D1/R2 resource identity | `config/cloudflare-resources.json` | Owns D1/R2 binding names and physical non-secret resource identifiers. This is the canonical D1 binding/config source. |
| OpenAI/Sites binding manifest | `.openai/hosting.json` | Required platform mirror. Its D1/R2 binding names must match `config/cloudflare-resources.json`; the static config audit enforces parity. |
| Runtime env names and conditional requirements | `config/runtime-env.ts` | Owns required/optional/secret/CI-only env classification and fail-fast validation rules. |
| Local Vite/Miniflare config | `vite.config.ts` | Derives Worker settings from `wrangler.jsonc` and D1/R2 identity from `config/cloudflare-resources.json`; only local path/auth overrides stay local. |
| Clean-D1 temporary config | `scripts/validate-clean-d1.mjs` | Generated local-only config. It derives the D1 binding and compatibility date from canonical sources; synthetic DB name/UUID remain test-only. |
| Built deploy config | `dist/server/wrangler.json` | Generated artifact only. Runtime/deploy commands may consume it, but it is never a source of truth. |

## Environment contract

Production Cloudflare config requires `AUTH_MODE=cloudflare-access`, `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`. These are non-secret production runtime values owned by `wrangler.jsonc`.

The following values are secrets and must never be committed with production values: `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `PII_ENCRYPTION_KEY`, `PII_HASH_KEY`. They belong in Cloudflare Variables and Secrets (or ignored local env files). Public submission flags default off. If any submission flag is enabled, Turnstile and both PII keys become required and `validateRuntimeEnvironment` fails closed when they are missing.

Optional runtime values are `ADMIN_EMAILS`, `EDITORIAL_FROM_EMAIL`, and the three submission feature flags. `RESEND_API_KEY` remains secret and feature-dependent rather than globally required. CI/test-only variables include `E2E_BASE_URL`, `PSIPEDIA_E2E_LOCAL_BOOTSTRAP`, and `PSIPEDIA_ADMIN_EVENTS_E2E`; these are not production application configuration.

`.env.example` documents names only. Real `.env*` files remain ignored by Git. Production secret values are never read or written by CONFIG-1.

## Validation

`npm run config:check` performs a deterministic repository audit before build/lint CI paths. It checks resource ownership, hosting-manifest parity, generated-binding safety, canonical URL usage, documented env names, and tracked config/workflow surfaces for unintended secret assignments. The explicitly labelled deterministic PII fixtures in Playwright CI remain test-only and are allowed by name and location.

`npm run test:config` covers missing required configuration, valid production configuration, conditional submission security requirements, the CI-only path, and the repository production-safe contract.

## Intentional separation

Do not unify `AUTH_MODE=local-e2e-preview` with production Cloudflare Access. Do not replace `E2E_BASE_URL` with the canonical site URL for local tests: local E2E needs localhost, while package-level production smoke derives its target from `config/public-site.ts`. The central workflow may set its own explicit production `E2E_BASE_URL` because that variable describes the test target, not application canonical URL ownership.

Tooling variables such as `SITES_RUNTIME_ROOT`, `WRANGLER_LOG_PATH`, and `MINIFLARE_REGISTRY_PATH` are process-local tooling configuration, not application runtime config. The clean-D1 synthetic database name and zero UUID are local validation fixtures, not production D1 identity.

## Deployment boundary

CONFIG-1 does not change deployment ordering. `deploy:cloudflare` still applies remote D1 migrations before the deploy command; fresh-artifact-before-DB-mutation belongs to DEPLOY-1 and must be handled separately. CONFIG-1 only removes the hard-coded D1 binding from that command path.
