# REVIEWS-0 — Fresh Audit & Review Engine Architecture

Status: architecture-only audit. No production review behavior, no review migration, no public review form, no fake ratings, no ranking or Premium changes.

Audit base: main at 5dfd9b3598041aacc7c1482b94d3e1c5c5c2d091 (PARTNER-1D #257), verified after main advanced during the audit.

## 1. CURRENT MAIN

Relevant current foundations on main:

- PARTNER-1B (#241): passwordless Partner identity/authentication.
- PARTNER-1C (#254): partner_resources, memberships, role/permission engine, Partner dashboard/admin foundations, Partner audit.
- PARTNER-1D (#257): commercial-interest leads and concrete Attention Center integration.
- Submission/moderation/security foundation: moderation_submissions, moderation_events, resource access tokens/sessions, D1 rate limiting and Turnstile replay protection.
- Canonical directory_profiles and help_organizations public-profile foundations.
- Existing editorial Recenzie a testy section remains a different product surface.

Latest SQL migration at audit time is 0061_partner_commercial_interests.sql. The repository intentionally uses an append-only SQL migration chain while Drizzle journal/snapshots remain frozen at 0023 under MIG-0 guardrails.

## 2. CURRENT ARCHITECTURE

### Directory/resources

directory_profiles is the canonical service profile table. It has a stable integer primary key independent from slug/URL and covers veterinarians, trainers/dog schools, kennels/clubs, salons, hotels/care, walking, physiotherapy and other services.

help_organizations is the canonical organization profile table. It also has a stable integer primary key and may optionally link to one directory profile through directory_profile_id.

partner_resources already provides a typed, stable text UUID resource anchor with physical foreign keys to:
- DIRECTORY_PROFILE -> directory_profiles.id
- HELP_ORGANIZATION -> help_organizations.id
- MANAGED_EVENT -> managed_events.id

The table enforces exactly one typed target and unique partial indexes per target.

Important limitation: partner_resources is currently provisioned lazily when a Partner membership is created. It is therefore not yet a complete registry of all public profiles.

Important deletion constraint: directory profiles currently have a real hard-delete admin path. partner_resources points to directory_profiles with ON DELETE RESTRICT. Backfilling a partner_resources row for every directory profile before fixing this lifecycle would make all directory hard-deletes fail.

### Public profiles

Directory service profiles use /adresar/[category]/[slug] and the reusable DirectoryProfileDetail presentation/components.

Organization profiles use /organizacie/[slug] and shared detail primitives.

The current directory JSON-LD uses VeterinaryCare for veterinarians, Organization for selected clubs and LocalBusiness for other service profiles. No review/aggregate rating markup is currently emitted.

### Auth

There is no consumer/public-user account system on current main.

There are three distinct existing identity/security contexts:
- Admin auth through ChatGPT/Cloudflare Access.
- Partner accounts using verified email magic links.
- Generic resource access token and resource management session primitives.

Partner accounts must not be reused as consumer review authors. Their semantics and permissions are provider-side.

### Partner platform / Permission Engine

Current roles:
- OWNER
- MANAGER
- EDITOR

Current central authorization primitives:
- requirePartnerMembership(accountId, resourceId)
- requirePartnerRole(...)
- requirePartnerPermission(...)

Current permissions:
- RESOURCE_VIEW
- MEMBERSHIP_VIEW
- PROFILE_SUBMIT_CHANGE
- EVENT_SUBMIT
- COMMERCIAL_INTEREST_CREATE
- MEMBERSHIP_MANAGE

Provider review replies should add an explicit permission rather than rely on role names at call sites.

### Attention Center

Attention Center is an adapter/read-model architecture, not a dedicated inbox table. Current sources include moderation, tips, directory changes/inquiries, article feedback, stale adoptions, automation findings and, since PARTNER-1D, Partner commercial leads.

It already supports:
- HIGH/MEDIUM/LOW priorities
- NEW/IN_PROGRESS/RESOLVED/DISMISSED states
- deep links
- active/history/all views
- exact active counts for the admin notification bell

Reviews should plug into this model. Do not create a second review inbox.

### Admin/design system

Existing reusable admin components include:
- AdminShell
- AdminActionButton/AdminActionLink
- bulk toolbar
- modal and destructive-confirm dialogs
- drawer
- pagination
- shared table/form patterns
- focus restoration and mobile handling

Public profile pages already use shared detail primitives and the public visual system. Review UI should be another reusable profile module, not a category-specific design language.

### Audit

There are two relevant audit foundations:
- partner_audit_events: DB-enforced append-only and intentionally Partner-specific.
- moderation_events: generic event model with resource_type, subject_id, actor, from/to state, reason, changed fields and request id.

Review moderation should reuse moderation_events. Before relying on it as a compliance-grade log, REVIEWS should harden it with no-update/no-delete triggers after confirming no current mutation path depends on updates/deletes.

Partner account/membership lifecycle remains in partner_audit_events.

### DB conventions

Observed conventions:
- Cloudflare D1 / SQLite.
- Integer autoincrement IDs for many canonical content entities.
- Text UUID IDs for workflow/security/audit/Partner entities.
- ISO timestamps stored as text.
- CHECK constraints for bounded enums.
- Explicit ON DELETE behavior.
- Partial unique indexes for active records.
- D1 batch/CAS patterns for atomic workflow transitions.
- Append-only SQL migrations; no drizzle-kit generate while MIG-0 is active.

## 3. KEY FINDINGS

Reusable foundations:
- partner_resources is already the closest thing to a canonical resource registry.
- Partner permission checks can safely gate provider replies.
- resource access tokens/sessions can back lightweight consumer verification without reusing Partner accounts.
- pii-crypto, HMAC rate-limit keys, Turnstile and replay protection can be reused.
- moderation_events and Attention Center can be extended rather than duplicated.
- public/admin design primitives are sufficient.

Missing:
- complete resource anchors for all reviewable profiles.
- consumer review-author identity.
- review domain tables/read model.
- explicit review reply Partner permission.
- review moderation/report Attention adapters.
- review-specific admin workspace.

Technical blocker before using partner_resources for every review:
- directory hard delete conflicts with ON DELETE RESTRICT after a full resource-anchor backfill.

Naming collision:
- /recenzie already means editorial Recenzie a testy.
- /admin/hodnotenia already means article feedback.
The profile-review engine must use separate internal and admin naming.

## 4. REVIEWABLE ENTITY DECISION

Recommendation: reuse and generalize existing partner_resources as the stable review target anchor. Do not store only slug/URL and do not create a second polymorphic reviewable_resources registry.

Required prerequisite in REVIEWS-1A:
1. Treat partner_resources in application architecture as the shared canonical resource anchor, while retaining its database name for compatibility.
2. Backfill one resource row for every reviewable DIRECTORY_PROFILE and HELP_ORGANIZATION that does not already have one. Existing resource IDs must remain unchanged.
3. Ensure all future directory/organization creation paths create an anchor.
4. Reviews reference partner_resources.id by physical FK.
5. Application/DB validation must reject MANAGED_EVENT as a review target until events are intentionally made reviewable.
6. Fix directory deletion semantics before the full backfill: replace unsafe hard deletion with archive/tombstone behavior, or otherwise preserve the canonical anchor and review history.

Linked help_organizations and directory_profiles are not automatically merged into one review scope. The relationship does not prove identical customer-service context. Each canonical public profile keeps its own resource identity unless a later explicit alias/merge feature is designed.

Why this wins:
- stable across slug/URL changes;
- physical FK to a resource anchor;
- immediately compatible with Partner membership permissions;
- avoids a parallel polymorphic registry;
- query-efficient by resource_id;
- works naturally with Attention/admin deep links.

## 5. REVIEW AUTHOR / AUTH DECISION

Recommendation: lightweight verified-email consumer identity, separate from Partner accounts, reusing the existing generic token/session/security primitives.

Proposed behavior:
- Clicking Napísať recenziu starts lightweight email verification if no active review-author session exists.
- A magic link verifies the email and creates/activates a review-author session.
- The user returns to the intended profile and submits the review.
- No password and no social-network profile are required.
- Review author and Partner provider identities remain separate even if the same email happens to be used.

Why not the alternatives:
- Full login-only consumer accounts: too much scope before Psipedia needs a consumer account platform.
- Completely unverified guest reviews: weak abuse control and poor ownership/edit/delete semantics.
- One-off guest token only: awkward for duplicate prevention, helpful votes, reports and future edits.

This is a B/D hybrid: lightweight persistent review identity with account-like ownership, but no broad consumer-account product.

## 6. DATABASE DESIGN

### review_authors

Purpose: minimal consumer identity for review ownership and abuse controls.

Key fields:
- id TEXT UUID PK
- email_ciphertext TEXT NOT NULL
- email_hash TEXT NOT NULL UNIQUE
- display_name TEXT NULL
- status CHECK PENDING_VERIFICATION/ACTIVE/SUSPENDED/DEACTIVATED
- email_verified_at
- created_at, updated_at, deactivated_at

PII:
- plaintext email is never stored.
- email is encrypted for required account/recovery communication and HMAC-hashed for lookup/deduplication.
- public UI never exposes the email.

### profile_reviews

Purpose: canonical user review.

Key fields:
- id TEXT UUID PK
- resource_id TEXT NOT NULL FK partner_resources(id) ON DELETE RESTRICT
- author_id TEXT NOT NULL FK review_authors(id) ON DELETE RESTRICT
- overall_rating INTEGER NOT NULL CHECK 1..5
- body TEXT NOT NULL with bounded length
- service_month TEXT NULL (YYYY-MM, preferred over an exact service day for data minimization in v1)
- service_type_key TEXT NULL
- rating_schema_version INTEGER NOT NULL DEFAULT 1
- status CHECK PENDING_REVIEW/VISIBLE/HIDDEN/REJECTED/AUTHOR_DELETED/REMOVED
- risk_flags_json TEXT NOT NULL DEFAULT []
- created_at, updated_at, published_at, deleted_at

Constraints/indexes:
- UNIQUE(resource_id, author_id): one durable review identity per author/profile. Delete/restore updates that row instead of enabling delete/recreate spam.
- INDEX(resource_id, status, created_at)
- INDEX(author_id, created_at)
- INDEX(status, created_at)

Only VISIBLE rows affect public aggregates.

### profile_review_rating_values

Purpose: optional category-specific dimensions.

Fields:
- review_id FK profile_reviews(id)
- dimension_key TEXT
- rating INTEGER CHECK 1..5
- PRIMARY KEY(review_id, dimension_key)

Do not add hard-coded columns such as communication_rating or environment_rating.

Initial dimension definitions should live in a typed, versioned configuration module keyed by canonical category/type. This is schema-driven without introducing an admin-managed dimension CMS prematurely. rating_schema_version preserves historical interpretation. A DB dimension-definition table can be added later if runtime admin configuration becomes a real requirement.

### profile_review_provider_replies

Purpose: provider response.

Fields:
- id TEXT UUID PK
- review_id TEXT NOT NULL UNIQUE FK profile_reviews(id) ON DELETE RESTRICT
- partner_account_id TEXT NOT NULL FK partner_accounts(id) ON DELETE RESTRICT
- partner_membership_id TEXT NOT NULL FK partner_memberships(id) ON DELETE RESTRICT
- body TEXT NOT NULL
- status CHECK VISIBLE/HIDDEN/REMOVED
- created_at, updated_at, removed_at

One current provider reply per review in v1. Provider cannot modify or delete the user review.

### profile_review_helpful_votes

Purpose: deduplicated helpful votes.

Fields:
- review_id FK profile_reviews(id)
- author_id FK review_authors(id)
- created_at
- PRIMARY KEY(review_id, author_id)

Rules:
- verified review-author identity required in v1;
- author cannot helpful-vote their own review;
- hidden/non-visible review cannot accept a vote.

### profile_review_reports

Purpose: reports against a review or provider reply.

Fields:
- id TEXT UUID PK
- review_id TEXT NOT NULL FK profile_reviews(id)
- provider_reply_id TEXT NULL FK profile_review_provider_replies(id)
- target_type CHECK REVIEW/PROVIDER_REPLY
- target_key TEXT NOT NULL
- reporter_type CHECK REVIEW_AUTHOR/PARTNER
- reporter_key TEXT NOT NULL
- reason_code TEXT NOT NULL
- detail TEXT NULL
- status CHECK OPEN/IN_REVIEW/RESOLVED/DISMISSED
- resolved_by, resolved_at
- created_at, updated_at

Constraints:
- UNIQUE(target_key, reporter_key) prevents repeated reporting of the same target by one identity.
- indexes on status/created_at and review_id/status.

### Deliberately deferred tables

profile_review_revisions:
- add before enabling material review edits;
- snapshots the previous rating/body/dimension values for dispute/audit context.

profile_review_verifications:
- future Overená skúsenosť evidence/attestation table.
- must be independent from author email verification and independent from Premium.

There is no review_aggregates table in v1 and no duplicate review_moderation_events table.

## 7. PERMISSION MODEL

Public review author:
- create only with ACTIVE, email-verified review-author session;
- one review per resource;
- manage/delete only own review;
- helpful/report only from own verified review-author identity;
- cannot moderate, reply as provider or alter aggregates.

Provider:
- require active Partner account;
- require active membership for the exact review.resource_id;
- add REVIEW_REPLY_MANAGE permission;
- initial role mapping: OWNER and MANAGER allowed; EDITOR denied by default.
- can create/manage its provider reply subject to moderation policy;
- can report a review;
- cannot edit, hide, delete or change the user's review/rating.

Admin:
- existing admin auth;
- can moderate review/reply, resolve reports and restore where policy allows;
- every state change writes audit event.

Attention Center:
- read-model only; no bypass of admin authorization.

Premium/promoted:
- no rating power, no moderation power, no negative-review suppression.
- promoted placement stays visibly separate from organic review trust.

## 8. REVIEW LIFECYCLE

Recommended domain states:

PENDING_REVIEW:
- review passed identity validation but automated checks require manual review;
- not public; not aggregated.

VISIBLE:
- public and included in aggregates.

HIDDEN:
- temporarily not public, usually while a report/risk is actively reviewed;
- not aggregated;
- can return to VISIBLE.

REJECTED:
- rejected before publication or after a moderation decision;
- not aggregated.

AUTHOR_DELETED:
- author requested removal;
- public content removed/tombstoned according to retention policy;
- audit retained.

REMOVED:
- final admin removal, spam or legal/privacy removal;
- content visibility and retention depend on reason policy;
- audit retained.

Transitions are explicit and audited. Restoration is allowed only through defined admin/author flows, never by direct status writes.

Profile/entity unpublished or archived:
- reviews stay attached to the resource anchor but are not rendered while the canonical profile is not public.
- do not cascade-delete reviews just because the public profile leaves the catalog.

Editing policy:
- do not ship unrestricted editing in the first submission release.
- before edit is enabled, add review revisions.
- meaningful edits re-run validation/anti-abuse; risky edits return to moderation.
- provider replies stay linked and UI can disclose that the review was edited after the reply.

## 9. AGGREGATE STRATEGY

Recommendation for v1: compute aggregates from indexed VISIBLE reviews at read time. Do not introduce denormalized aggregate state before volume proves it necessary.

Per-resource queries:
- COUNT(*)
- AVG(overall_rating)
- conditional counts for ratings 1..5
- GROUP BY dimension_key for dimension averages

Advantages:
- one source of truth;
- no drift/rebuild problem;
- hidden/rejected rows are naturally excluded;
- edits/moderation immediately reflect correct totals;
- expected Psipedia scale does not justify transactional aggregate maintenance yet.

Evolution path:
- keep the read-model API stable;
- add a denormalized/cache table later only if D1 latency/volume measurements justify it.

Display:
- inputs are integer 1..5.
- average displays to one decimal.
- distribution percentages are derived from visible counts; accessible text also exposes counts.
- no arbitrary minimum review count is required to show a truthful aggregate, but count is always displayed.

## 10. PUBLIC UI ARCHITECTURE

Reusable components, independent from profile category:
- ProfileReviewSummary
- RatingDistribution
- DimensionAverages
- ProfileReviewList
- ProfileReviewCard
- ProviderReply
- HelpfulReviewAction
- ReportReviewDialog
- ReviewForm

Integration:
- directory profile and organization profile pages pass the stable resource/read model into the same module.
- no duplicate veterinarian/hotel/trainer review components.

Mobile/accessibility:
- native form semantics with fieldset/legend for ratings;
- touch targets at least aligned with existing action controls;
- keyboard-selectable rating options;
- screen-reader labels such as 4 z 5;
- focus moved/restored correctly for dialogs;
- clear loading/error/empty states;
- no horizontal overflow;
- do not rely on star color alone.

Zero-review state must be honest and must not emit fake stars or fake aggregate markup.

## 11. ADMIN / ATTENTION ARCHITECTURE

Because /admin/hodnotenia is already article feedback, use a distinct workspace such as:

/admin/recenzie-profilov
/admin/recenzie-profilov/[id]

Workspace capabilities:
- search
- status filters
- target profile/category
- author reference
- rating
- reports count
- created date
- moderation actions
- provider reply
- audit/history

Reuse AdminShell, admin table/pagination/action/dialog primitives.

Attention Center additions:
- PROFILE_REVIEW_MODERATION for suspicious/pending/hidden review work.
- PROFILE_REVIEW_REPORT for open reports; target may be REVIEW or PROVIDER_REPLY.

Deep links go to the canonical admin review detail. The Attention Center remains the queue/triage surface; /admin/recenzie-profilov is the full searchable workspace, not a second inbox.

Priority examples:
- HIGH: legal/privacy risk, coordinated/multiple reports, severe automated flag.
- MEDIUM: ordinary report or review requiring manual moderation.
- LOW: low-confidence automated signal.

## 12. ANTI-ABUSE MODEL

Reuse current primitives:
- same-origin JSON mutation guard
- Cloudflare Turnstile with action/hostname/replay validation
- D1 fixed-window rate-limit store
- HMAC-derived identifiers instead of raw IP in rate-limit keys
- verified email identity

Create review:
- Turnstile
- per-author and per-HMAC-client limits
- one review per resource+author
- bounded rating/body/context
- normalized duplicate-text fingerprint as a risk signal, not automatic guilt
- risk flags can route to PENDING_REVIEW

Helpful:
- unique review+author
- no self-vote
- rate limit burst behavior

Report:
- unique target+reporter
- per-reporter/per-client daily limits
- repeated/mass reporting increases risk rather than automatically hiding content

Provider reply:
- active session + exact membership + REVIEW_REPLY_MANAGE
- bounded text
- rate limit
- no HTML
- reportable/moderatable

Do not store raw IP or full user-agent history in review rows.

## 13. PRIVACY / PII MODEL

Store:
- encrypted author email
- keyed email hash
- optional display name
- review content/rating
- minimal service context
- audit actor references using non-plaintext IDs/hashes

Public:
- chosen display name or a neutral pseudonymous label
- never email
- service month/type only where user chose to provide it

Do not persist:
- raw IP in review records
- Turnstile token plaintext
- unnecessary device fingerprint
- precise dog/medical/client details as structured fields

Text reviews can contain accidental PII. Form copy should discourage posting phone numbers, addresses, medical/client identifiers or other unnecessary personal data, and moderation may flag likely PII.

Retention must be reason-aware:
- security rate-limit/replay data short-lived;
- author identity retained only while needed for account/review ownership/legal obligations;
- author deletion removes public identity/content as policy requires while retaining the minimum audit facts needed to prove moderation actions.

## 14. SEO / STRUCTURED DATA FINDINGS

Current Google Search Central guidance permits Review/AggregateRating for Organization and LocalBusiness in a third-party review context, but adds strict rules:
- marked-up reviews/aggregate must be visibly available on the page;
- review information must be about a specific item, not a category/list;
- ratings for local businesses must be sourced directly from users;
- editors must not create/curate compiled local-business ratings;
- a business/organization controlling reviews about itself is ineligible for the self-serving star feature;
- do not aggregate ratings from other sites;
- fake or undisclosed incentivized reviews are prohibited.

Official references:
- https://developers.google.com/search/docs/appearance/structured-data/review-snippet
- https://developers.google.com/search/docs/appearance/structured-data/local-business
- https://developers.google.com/search/docs/appearance/structured-data/organization

Implication for Psipedia:
- provider reply rights are compatible with third-party review architecture only if providers cannot suppress/edit user reviews.
- do not implement Review/AggregateRating JSON-LD until real VISIBLE first-party Psipedia user reviews exist and are visibly rendered.
- initial structured-data rollout should favor truthful AggregateRating only where current Google eligibility is re-verified; individual Review markup can wait until author/display-name rules are satisfied.
- keep editorial /recenzie product reviews and profile user reviews semantically separate.
- re-check Google guidance at REVIEWS-SEO implementation time because rich-result policy can change.

## 15. TEST PLAN

Unit:
- resource target resolution and allowed target types
- rating/config validation
- lifecycle transitions
- aggregate calculation and rounding
- hidden/rejected exclusion
- review-author authorization
- provider permission matrix
- duplicate review/helpful/report prevention
- report state mapping

Integration/D1:
- resource FK integrity
- reject MANAGED_EVENT targets
- resource backfill idempotency
- directory archive/delete lifecycle compatibility
- author email unique hash
- exact membership resource enforcement for provider reply
- audit write + state transition atomicity
- report/review Attention queries and exact notification counts
- migration-safety contract

E2E:
- veterinarian profile: verify identity -> create review
- hotel/trainer/other category reuse same UI
- organization profile reuse same UI
- duplicate review blocked
- helpful toggle/dedupe
- report
- own provider reply succeeds
- foreign/revoked/EDITOR provider reply fails
- admin hide/restore/remove
- provider reply report
- mobile 390px no overflow
- keyboard rating/form/dialog
- axe accessibility

Production smoke:
- existing directory/organization pages still render when there are zero reviews
- existing /recenzie editorial hub unaffected
- existing /admin/hodnotenia unaffected
- no fake rating/JSON-LD when zero visible reviews
- profile contact/inquiry flows unaffected

## 16. PROPOSED WORKSTREAM

### REVIEWS-1A — Resource + database foundation

Scope:
- fix directory deletion lifecycle prerequisite;
- generalize/backfill partner_resources anchors for reviewable profiles;
- add review domain schema, typed category rating config and domain validation;
- harden shared moderation audit if safe.

Dependencies: current Partner 1B/1C/1D and MIG-0 rules.

Tests: migration safety, clean D1, FK/constraint/idempotency tests.

Does not do: public CTA, consumer auth, provider reply, SEO markup.

### REVIEWS-1B — Public read model + profile UI shell

Scope:
- review read repository;
- runtime aggregate queries;
- reusable zero/summary/list components wired to directory and organization profiles.

Dependencies: 1A.

Does not do: submission.

### REVIEWS-2A — Review-author identity

Scope:
- review_authors;
- dedicated magic-link/session flow reusing generic token/session primitives;
- Turnstile/rate limits;
- dedicated review session cookie.

Dependencies: 1A.

Does not do: full consumer social account or Partner identity reuse.

### REVIEWS-2B — Submission + automated safety

Scope:
- create review;
- one-per-resource rule;
- dimensions/service context;
- risk flags;
- clean -> VISIBLE, risky -> PENDING_REVIEW;
- feature remains non-public or gated until admin moderation is ready.

Dependencies: 1B, 2A.

### REVIEWS-3 — Admin moderation + Attention Center

Scope:
- /admin/recenzie-profilov;
- moderation actions/history;
- PROFILE_REVIEW_MODERATION and PROFILE_REVIEW_REPORT Attention adapters;
- exact bell counts and deep links.

Dependencies: 2B.

Release gate: public submission should not be broadly enabled before this phase is operational.

### REVIEWS-4 — Helpful + reports

Scope:
- helpful votes;
- review/provider-reply report model and UI;
- mass-report protections.

Dependencies: 3.

### REVIEWS-5 — Provider replies

Scope:
- REVIEW_REPLY_MANAGE Partner permission;
- OWNER/MANAGER reply flow;
- foreign-resource denial;
- reply moderation/reporting.

Dependencies: 3, 4.

### REVIEWS-6 — Editing/revisions, deletion hardening, SEO and performance

Scope:
- review revisions before enabling meaningful edits;
- author deletion/restore retention workflows;
- future verification extension points;
- structured-data rollout after policy re-check;
- performance measurement and optional aggregate cache only if justified.

Dependencies: stable production review lifecycle.

## 17. RECOMMENDED NEXT STEP

Proceed with REVIEWS-1A only.

The first implementation prompt should be deliberately narrow:
1. re-audit current main;
2. make directory profile removal lifecycle compatible with persistent resource anchors;
3. generalize/backfill partner_resources safely and idempotently;
4. add the review database/domain foundation;
5. add tests and migration-safety validation;
6. no public form, no fake reviews, no provider reply and no structured-data rating yet.

This resolves the only material architecture blocker before review features start.

## 18. GIT STATUS

This document is the only intended REVIEWS-0 repository change.

Branch: codex/reviews-0-architecture-audit

The PR must remain Draft/open. Do not merge and do not enable auto-merge.
