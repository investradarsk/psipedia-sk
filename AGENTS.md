# Psipedia.sk — AI engineering rules

## Source of truth and approval
- Canonical repository: `investradarsk/psipedia-sk`; `main` is the production branch. Compare with the latest `main` before starting.
- Implement only the requested scope in a topic branch and **Draft PR**. Group related changes, not unrelated features. Keep a clear checklist of completed and pending tasks.
- **Never merge, deploy, mutate production D1, or change production secrets/settings without the owner's explicit approval.** CI success is not approval. Do not push implementation changes directly to `main`.
- Do not update an existing unrelated PR or create a new Cloudflare project. Preserve existing production bindings and deploy safeguards.

## Before editing code
- Search for existing shared components, helpers, validators, security guards, event mappings, and tests. Reuse one canonical implementation instead of adding another copy.
- Maintain compatibility with deployed API contracts and stored data. Avoid new dependencies and new database migrations unless the task requires them.
- Keep modules focused: move unrelated responsibilities into small named helpers rather than expanding large mixed-purpose files.
- Follow surrounding TypeScript/React patterns, clear naming, explicit error handling, and small readable functions. Do not minify/condense statements into a single line.

## Shared policy and safety
- Use the canonical admin mutation authentication and origin policy in `lib/admin-auth.ts` / `lib/admin-mutation-origin.ts`. Preserve the strict partner-origin policy where it requires an explicit Origin; never weaken authorization or CSRF protection for convenience.
- Classify admin push events in `lib/admin-automation-push-policy.ts`; delivery code must consume that policy, not implement a second category map.
- Keep public API errors consistent: meaningful Slovak text, stable `{ error: string }` JSON responses, appropriate HTTP status, and no leaked stack traces/secrets. Reuse shared response helpers when available.
- Do not run `drizzle-kit generate` or regenerate Drizzle snapshots/journal. The hybrid SQL migration history is protected by MIG-0; use the existing reviewed migration process only when explicitly authorized.
- Never connect local/preview tests to production D1/R2 or enable scheduled external side effects in a preview.

## Formatting, tests, and review
- Use two spaces, double quotes, semicolons, and readable spacing. Follow `.prettierrc.json`. Format *only changed files* using `npx --yes --package=prettier@3.6.2 prettier --write <changed-paths>`; do not autoformat the whole legacy repo.
- Run relevant targeted tests during implementation; before review run the applicable lint/build/security/regression checks. Do not ignore a relevant failing required CI check before merge.
- Add regression coverage when changing a shared guard, event category, API contract, or bug. Document risks and which checks actually ran in the PR.
- Visual changes need a safe preview and owner approval before production. Never claim the preview, CI, or deploy passed unless verified.

## Deployment source
- Production runs on the existing Cloudflare Worker with the existing D1/R2 bindings. Follow `docs/DEPLOYMENT-SAFETY-SK.md` and `docs/MIGRATION-SAFETY-SK.md` for deployment and database changes.
- GitHub `main` stays the source of truth; if another checkout is in use, synchronize the exact approved main state without overwriting newer work.
