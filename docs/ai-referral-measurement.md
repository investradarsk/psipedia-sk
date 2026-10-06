# AI referral measurement

Workstream: `AI-REFERRAL-MEASUREMENT-1`

## What is being measured

**AI referral** means a user clicked a link in an AI product and the browser arrived on Psipedia with an identifiable HTTP referrer.

**AI citation** means an AI system used or displayed Psipedia as a source. A citation can exist without a click, so citation/impression counts must never be reported as referral traffic.

This implementation measures only post-click referral traffic.

## What Psipedia measures today

The public site already has a GA4 layer in `components/cookie-consent.tsx`:

- GA4 is loaded only after the user chooses analytics or advertising consent.
- Page views are sent manually with `send_page_view: false`.
- Admin, partner and review-auth routes are excluded from public analytics.
- Devices marked as internal traffic disable GA4.
- Google Signals and ad-personalization signals are disabled.
- No D1 traffic database is required for this workstream.

Cloudflare Worker observability is enabled in `wrangler.jsonc`, but Worker logs are not the same thing as browser referral analytics. The repository does not contain a Cloudflare Web Analytics beacon or a repo-managed Cloudflare Web Analytics configuration. If Web Analytics is enabled at zone/dashboard level, that remains an external reporting surface.

## Automated AI referral classification

`lib/ai-referral.ts` is the centralized classifier. It matches exact hostnames and real subdomains only.

| Source | Accepted hostname roots |
| --- | --- |
| ChatGPT | `chatgpt.com`, legacy `chat.openai.com` |
| Claude | `claude.ai` |
| Gemini | `gemini.google.com` |
| Microsoft Copilot | `copilot.microsoft.com` |
| Perplexity | `perplexity.ai` |

The classifier intentionally does **not** classify broad domains such as `google.com`, `bing.com`, `microsoft.com`, or `facebook.com` as AI.

Spoof-like names such as `chatgpt.com.evil.example` are rejected.

To add another provider later, add one normalized source key and its unambiguous hostname roots to `AI_REFERRAL_HOSTNAMES`, then add tests.

## GA4 event

When the existing consented page-view path sees an identifiable AI `document.referrer`, it emits:

- event: `ai_referral_visit`
- event parameter: `ai_referral_source`
- event parameter: `landing_page_path`

The event is emitted at most once per document lifecycle. Internal SPA navigation does not create additional AI visits.

The implementation does not send the raw referrer URL as a custom parameter, does not fingerprint the user, does not add cookies or local-storage identifiers, and does not bypass the existing consent or internal-traffic exclusions.

## GA4 dashboard configuration that remains external

Code can send `ai_referral_source`, but the GA4 property must expose it for convenient reporting.

In GA4 Admin, create an event-scoped custom dimension:

- Dimension name: `AI referral source`
- Scope: Event
- Event parameter: `ai_referral_source`

Then use an Exploration or report filtered to `event_name = ai_referral_visit`, broken down by `AI referral source`. Event count answers how many consented, identifiable AI referral landings were measured.

GA4 Acquisition reports can also show ordinary referral source/medium from referrers, but the custom event provides a stable normalized classification for the explicitly supported AI hostnames.

This dashboard configuration is not automated from the repository because there is no GA4 Admin API credential/configuration in the application, and adding one is unnecessary for traffic collection.

## Cloudflare and other external surfaces

- **Cloudflare Web Analytics**, if enabled externally for the zone, can provide independent referrer-level traffic reporting. Its dashboard configuration is outside this repository.
- **Cloudflare Worker observability/logs** can help with operational request debugging, but they are not treated as a canonical AI referral counter here.
- Provider-specific citation/visibility dashboards, where a provider offers them, measure a different concept from post-click traffic and must be reported separately.
- There is no universal, repo-controlled API that turns ChatGPT/Claude/Gemini/Copilot/Perplexity citations into a trustworthy cross-provider impression count. This workstream therefore does not claim such automation.

## Measurement limits

A browser may suppress or strip the `Referer` header. Direct/no-referrer traffic cannot safely be inferred to be AI traffic and remains unclassified.

Consent also matters: users who do not allow analytics are not sent to GA4. Therefore GA4 AI referral counts are consented measurable clicks, not a guaranteed total of every AI-originated click.

## Tests

`tests/ai-referral.test.mjs` covers:

- valid AI sources,
- real subdomains,
- spoof hostnames,
- normal Google,
- normal Facebook,
- direct/no referrer,
- full referrer URL parsing,
- the GA4 integration contract.

Run:

```bash
npm run test:ai-referral
```

The dedicated pull-request workflow also runs the existing monetization/privacy contracts, lint and a production build.
