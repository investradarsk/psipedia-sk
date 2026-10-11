# Gemini + Notion: independent GitHub Actions worker (opt-in)

## Ownership

- **Psipedia** keeps category/frequency/max settings, dispatches one GitHub Action, displays run history and an admin notification. It does not research, parse Gemini candidates, write Notion records or deduplicate.
- **GitHub Actions** runs `scripts/gemini-notion-agent.mjs` on `workflow_dispatch`, with Gemini 3.8 Flash + Google Search and two custom Notion tools.
- **Notion Free** remains the source of existing records and receives **draft-only** new pages.
- **Result** returns through a signed GitHub-worker callback to `/api/internal/gemini-agent/callback`. This is deliberately simpler than relying on Notion connection webhooks. A signed callback is not the same thing as a Notion webhook.
- The existing Notion synchronizations and legacy Gemini/manual queue remain in place for rollback, but the old Cloudflare Gemini sweep is bypassed when the external mode is enabled.

## Safe activation: NOT enabled by merge

Do NOT activate or conduct live paid testing without explicit owner approval.

1. Keep Cloudflare `GEMINI_EXTERNAL_AGENT_ENABLED` absent/false and GitHub Actions variable `GEMINI_AGENT_PAID_ENABLED` absent/false until explicitly approved.
2. On GitHub, provision secrets `GEMINI_AGENT_API_KEY`, `GEMINI_AGENT_NOTION_TOKEN`, `PSIPEDIA_AGENT_CALLBACK_SECRET` and variables `NOTION_DIRECTORY_DATA_SOURCE_ID`, `NOTION_EVENTS_DATA_SOURCE_ID`, `NOTION_HELP_DATA_SOURCE_ID` (the last only once the help data source is confirmed). Restrict the Notion integration to the three necessary data sources, not the entire workspace. Do not store credentials in the repository.
3. In Cloudflare, provision `GITHUB_ACTIONS_DISPATCH_TOKEN` (fine-grained credential restricted to this repository, Actions: write) and the identical `GEMINI_AGENT_CALLBACK_SECRET`; both must be secrets. Ensure the service endpoint accepts signed callbacks.
4. Confirm the Notion data-source schema for each category, particularly the title, draft state and category property options. The worker deliberately fails closed if title/status/draft cannot be mapped. Help's ID is not guessed.
5. Check Google AI Studio billing controls and a real quota appropriate to **EUR 5/month**. The code has a conservative maximum of **10 queued Gemini jobs per calendar month** across the existing shared queue (not a price guarantee). It caps new drafts at 5/job and model turns at 8.
6. Only after approval, enable `GEMINI_AGENT_PAID_ENABLED=true` in GitHub and `GEMINI_EXTERNAL_AGENT_ENABLED=true` in Cloudflare. Enable the chosen category within Psipedia. The existing 5-minute Cloudflare Cron dispatches due work; GitHub does all AI/Notion work.
7. First accepted live run should be manual with max 1, observed for duplicate protection, schema and genuine costs. No automatic retry on uncertain network outcomes.

## Risks and current constraints

- Gemini's built-in Google Search + custom functions operate through **Interactions API Preview**. The request format follows Google's September 2026 documentation but it has **not been production-tested** here.
- Preventing duplicates uses a full paginated snapshot of the target Notion data source plus a last-moment exact name/city/source check. Cross-data-source semantic duplicates are not guaranteed; human review is still required. If the scan is incomplete, the agent does not write.
- A failed or timed-out Notion POST is **not automatically retried**. A concept could have been created before the failure. Reconcile in Notion before manual restart. Ambiguous GitHub dispatches remain blocked.
- Event drafts require a concrete verified start date. All new pages are created with a Notion draft status; the agent never publishes.
- Notifications include counts and a link to Psipedia's Gemini run history, not an automatic import or a page-by-page Notion link.
- The monthly job fuse cannot provide a strict EUR billing cap. Provider-side billing limits or manual approval per run are still required.
- No database migration is required: this uses the **already applied migration 0119**. Do not reapply 0119.
- No new deployment, Notion change or Gemini request is part of creating/reviewing the PR.
