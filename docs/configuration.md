# Psipedia configuration contract

CONFIG-1 defines ownership, not one universal config file. Values that have different lifecycle or security requirements stay separate.

## Canonical sources

| Concern | Canonical source | Notes |
| --- | --- | --- |
| Public/canonical site URL | `config/public-site.ts` | Imported by SEO and production smoke tooling. Do not duplicate the literal URL in scripts/workflows. |
| Cloudflare Worker/build/deploy config | `wrangler.jsonc` | Owns compatibility date, runtime bindings, D1/R2 physical resource identity and non-secret production Access vars. |
| OpenAI/Sites binding manifest | `.openai/hosting.json` | Required platform manifest. Its D1/R2 binding names must match `wrangler.jsonc`; the static config audit enforces this mirror. |
| Runtime env names and conditional requirements | `config/runtime-env.ts` | Owns required/optional/secret/CI-only env classification and fail-fast validation rules. |
| Local Vite/Miniflare config | `vite.config.ts` | Derives shared Cloudflare values from `wrangler.jsonc`; only local path overrides such as migration path and local E2E auth belong here. |
| Clean-D1 temporary config | `scripts/validate-clean-d1.mjs` | Generated local-only config. It derives binding and compatibility date from canonical sources; synthetic DB name/UUID remain test-only. |

## Environment contract

Production Cloudflare config requires `AUTH_MODE=cloudflare-access`, `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`. These are non-secret production runtime values owned by `wrangler.jsonc`.

The following values are secrets and must never be committed with production values: `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `PII_ENCRYPTION_KEY`, `PII_HASH_KEY`. They belong in Cloudflare Variables and Secrets (or ignored local env files). Public submission flags default off. If any submission flag is enabled, Turnstile and both PII keys become required and `validateRuntimeEnvironment` fails closed when they are missing.

Optional runtime values are `ADMIN_EMAILS`, `EDITORIAL_FROM_EMAIL`, and the three submission feature flags. CI/test-only variables include `E2E_BASE_URL`, `PSIPEDIA_E2E_LOCAL_BOOTSTRAP`, and `PSIPEDIA_ADMIN_EVENTS_E2E`; these are not production application configuration.

`.env.example` documents names only. Real `.env*` files remain ignored by Git. Production secret values are never read or written by CONFIG-1.

## Validation

`npm run config:check` performs a deterministic repository audit before build/lint CI paths. It checks Cloudflare binding/resource ownership, hosting-manifest parity, canonical URL usage, documented env names, and that secret names are not populated in tracked config.

`npm run test:config` covers missing required configuration, valid production configuration, conditional submission security requirements, the CI-only path, and the repository production-safe contract.

## Intentional separation

Do not unify `AUTH_MODE=local-e2e-preview` with production Cloudflare Access. Do not replace `E2E_BASE_URL` with the canonical site URL for local tests: local E2E needs localhost while production smoke derives its base URL from `config/public-site.ts`. Tooling variables such as `SITES_RUNTIME_ROOT`, `WRANGLER_LOG_PATH`, and `MINIFLARE_REGISTRY_PATH` are process-local tooling configuration, not application runtime config.

The clean-D1 synthetic database name and zero UUID are local validation fixtures, not production D1 identity.

## Deployment boundary

CONFIG-1 does not change deployment ordering. `deploy:cloudflare` still applies remote D1 migrations before the deploy command; fresh-artifact-before-DB-mutation belongs to DEPLOY-1 and must be handled separately.
