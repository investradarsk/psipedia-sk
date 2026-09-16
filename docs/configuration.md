# Psipedia configuration contract

CONFIG-1 defines ownership, not one universal config file. Values that have different lifecycle, environment or security requirements stay separate.

## Canonical sources

| Concern | Canonical source | Notes |
| --- | --- | --- |
| Public/canonical site URL | `config/public-site.ts` | Imported by SEO and the package-level production smoke runner. `E2E_BASE_URL` remains an environment-specific test target. |
| Cloudflare Worker static production config | `wrangler.jsonc` | Owns the production compatibility date, ASSETS/IMAGES/version metadata bindings and non-secret production Access vars. It intentionally does **not** redeclare D1/R2 because the Sites/Vite build generates those bindings into the deploy artifact. |
| D1/R2 resource identity | `config/cloudflare-resources.json` | Owns D1/R2 binding names and physical non-secret resource identifiers. This is the canonical D1 binding/config source. |
| OpenAI/Sites binding manifest | `.openai/hosting.json` | Required platform mirror. Its D1/R2 binding names must match `config/cloudflare-resources.json`; the static config audit enforces parity. |
| Runtime env names and conditional requirements | `config/runtime-env.ts` | Owns required/optional/secret/CI-only env classification and fail-fast validation rules. |
| Local Cloudflare tooling compatibility | `config/local-cloudflare-tooling.json` | Explicit local-only compatibility target for the currently resolved Vite/Miniflare/workerd stack. This is deliberately separate from the production Worker date and is consumed by `vite.config.ts`; the literal does not live in Vite. |
| Local Vite/Miniflare config | `vite.config.ts` | Derives D1/R2 identity from `config/cloudflare-resources.json`, static Worker metadata from `wrangler.jsonc`, and the explicitly named local tooling compatibility target from `config/local-cloudflare-tooling.json`. Local path/auth overrides stay local. |
| Clean-D1 temporary config | `scripts/validate-clean-d1.mjs` | Generated local-only D1 config. It derives the D1 binding and production compatibility date from canonical sources; it does not start the application Worker. Synthetic DB name/UUID remain test-only. |
| Built deploy config | `dist/server/wrangler.json` | Generated artifact only. Runtime/deploy commands may consume it, but it is never a source of truth. |

## Why local compatibility is intentionally different

The repository currently resolves `@cloudflare/vite-plugin 1.37.1` -> `wrangler 4.92.0` / `miniflare 4.20260515.0` -> `workerd 1.20260515.1`. When CONFIG-1 first made Vite consume the production `2026-08-23` compatibility date, that workerd binary failed before the local app could start and reported that its newest supported date is `2026-05-22`.

A dependency update was evaluated before introducing a separate target. The last reviewed Miniflare 4 Vite-plugin line still resolves a July 2026 workerd and therefore cannot represent `2026-08-23`; newer Vite-plugin lines move local execution onto Miniflare 5 alpha. That is a materially larger local-runtime/tooling migration than CONFIG-1 needs, so CONFIG-1 does not silently perform it.

`config/local-cloudflare-tooling.json` therefore records the reviewed local target `2026-05-22`. This is not a second production source of truth: production remains owned by `wrangler.jsonc`. `npm run config:check` reports the resolved Cloudflare toolchain from `package-lock.json`, verifies that both dates are explicit and ordered, and verifies that `vite.config.ts` consumes the named local contract rather than hard-coding either date. When the Cloudflare toolchain is upgraded and validated separately, this local target can be advanced or removed deliberately.

The conscious limitation is that local Vite E2E executes the May compatibility semantics rather than production's August semantics. Read-only production smoke remains the check against the deployed production runtime.

## Environment contract

Production Cloudflare config requires `AUTH_MODE=cloudflare-access`, `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`. These are non-secret production runtime values owned by `wrangler.jsonc`.

The following values are secrets and must never be committed with production values: `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `PII_ENCRYPTION_KEY`, `PII_HASH_KEY`. They belong in Cloudflare Variables and Secrets (or ignored local env files). Public submission flags default off. If any submission flag is enabled, Turnstile and both PII keys become required and `validateRuntimeEnvironment` fails closed when they are missing.

Optional runtime values are `ADMIN_EMAILS`, `EDITORIAL_FROM_EMAIL`, and the three submission feature flags. `RESEND_API_KEY` remains secret and feature-dependent rather than globally required. CI/test-only variables include `E2E_BASE_URL`, `PSIPEDIA_E2E_LOCAL_BOOTSTRAP`, and `PSIPEDIA_ADMIN_EVENTS_E2E`; these are not production application configuration.

`.env.example` documents names only. Real `.env*` files remain ignored by Git. Production secret values are never read or written by CONFIG-1.

## Validation

`npm run config:check` performs a deterministic repository audit before build/lint CI paths. It checks resource ownership, hosting-manifest parity, generated-binding safety, production/local compatibility ownership, resolved Cloudflare toolchain visibility, canonical URL usage, documented env names, and tracked config/workflow surfaces for unintended secret assignments. The explicitly labelled deterministic PII fixtures in Playwright CI remain test-only and are allowed by name and location.

`npm run test:config` covers missing required configuration, valid production configuration, conditional submission security requirements, the CI-only path, the repository production-safe contract, and the explicit local Cloudflare tooling target.

## Intentional separation

Do not unify `AUTH_MODE=local-e2e-preview` with production Cloudflare Access. Do not replace `E2E_BASE_URL` with the canonical site URL for local tests: local E2E needs localhost, while package-level production smoke derives its target from `config/public-site.ts`. The central workflow may set its own explicit production `E2E_BASE_URL` because that variable describes the test target, not application canonical URL ownership.

Tooling variables such as `SITES_RUNTIME_ROOT`, `WRANGLER_LOG_PATH`, and `MINIFLARE_REGISTRY_PATH` are process-local tooling configuration, not application runtime config. The clean-D1 synthetic database name and zero UUID are local validation fixtures, not production D1 identity.

## Deployment boundary

CONFIG-1 does not change deployment ordering. `deploy:cloudflare` still applies remote D1 migrations before the deploy command; fresh-artifact-before-DB-mutation belongs to DEPLOY-1 and must be handled separately. CONFIG-1 only removes the hard-coded D1 binding from that command path.
