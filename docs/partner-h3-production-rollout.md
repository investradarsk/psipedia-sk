# PARTNER-H3 production rollout requirements

This document is intentionally operational only. PARTNER-H3 implementation does not apply migration 0070 and does not enable Google OAuth.

## Database

Target migration:

`0070_partner_multimethod_auth.sql`

Before application:

1. fresh production preflight and D1 Time Travel recovery point;
2. confirm production migration history ends at 0069;
3. snapshot counts/digests for `partner_accounts`, `partner_notification_outbox`, `partner_audit_events`, memberships, sessions and claims;
4. apply only 0070 through the guarded production migration workflow after that workflow has been extended in a separate rollout change;
5. verify row preservation, append-only audit triggers, new tables/indexes and existing Partner session semantics.

Do not deploy application code that relies on 0070 before the production database has the H3 schema.

## Google Cloud

Create an OAuth 2.0 Client ID of type **Web application**.

Authorized JavaScript origin:

`https://psipedia.sk`

Exact authorized redirect URI:

`https://psipedia.sk/api/partner/auth/google/callback`

Scopes requested by Psipedia:

- `openid`
- `email`
- `profile`

No Drive, Calendar, Contacts, Gmail or other Google API scope is required.

## Cloudflare bindings

Variable:

`GOOGLE_OAUTH_CLIENT_ID=<Google Web client ID>`

Secret:

`GOOGLE_OAUTH_CLIENT_SECRET=<Google Web client secret>`

Feature flag:

`GOOGLE_OAUTH_ENABLED=false`

Do not commit either credential. Do not paste the client secret into issue/PR/chat logs.

The existing Partner secrets remain required:

- `PII_ENCRYPTION_KEY`
- `PII_HASH_KEY`
- Turnstile and Resend bindings already used by Partner auth

## Controlled enablement

1. apply and verify migration 0070;
2. deploy H3 with `GOOGLE_OAUTH_ENABLED=false`;
3. production-smoke magic link, password registration/login/reset/settings and existing Partner routes;
4. configure the Google OAuth client ID and secret;
5. verify the exact callback URI in Google Cloud;
6. set `GOOGLE_OAUTH_ENABLED=true`;
7. smoke Google REGISTER with a new verified Google e-mail;
8. smoke Google LOGIN for that linked `sub`;
9. smoke an existing Partner e-mail collision and confirm that no duplicate account or automatic link is created;
10. smoke authenticated Settings → Prepojiť Google účet;
11. re-run desktop/mobile Partner and production security smokes.

Rollback of the feature flag is immediate: set `GOOGLE_OAUTH_ENABLED=false`. Existing password and magic-link login remain available.
