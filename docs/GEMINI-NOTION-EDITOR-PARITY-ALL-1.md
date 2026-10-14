# GEMINI-NOTION-EDITOR-PARITY-ALL-1 — audit and limitations

Base: main 2d8fd33921ec3d1637790d5d06b40478005e1e75. Scope: existing admin Notion concept component, existing Notion APIs, editor field adapters, and mocked tests. No new CMS, database migrations, Gemini calls, or Notion schema mutations.

## Category routing (22 catalog entries)

| Catalog section | Keys | Notion target | Admin review |
| --- | ---: | --- | --- |
| Directory | 10 | Configured \`NOTION_DIRECTORY_DATA_SOURCE_ID\` | Existing \`AdminDirectoryEditor\`, existing dedicated review/write-back |
| Events | 6 | Configured \`NOTION_EVENTS_DATA_SOURCE_ID\` | Shared panel with schema-backed fields from \`agendaEditableFields.events\` |
| Help — fostering, fundraising, volunteering | 3 | Configured \`NOTION_HELP_DATA_SOURCE_ID\` | Shared panel with \`agendaEditableFields.help-cases\` |
| Help — shelters/organizations | 1 | Canonical persisted \`notion_agenda_targets.organizations\` | Shared panel with \`agendaEditableFields.organizations\` |
| Help — adoptions | 1 | Canonical persisted \`notion_agenda_targets.adoptions\` | Shared panel with \`agendaEditableFields.adoptions\` |
| Help — lost/found | 1 | Only data source \`3ed793fc-1d18-8122-95b9-000b05c3c6bd\` in DB \`811d0659-7217-4914-a27c-1cd67bda3e0e\` | Shared panel with \`agendaEditableFields.lost-found\` |

Events map \`events.vystavy\`, \`events.preteky\`, \`events.seminare\`, \`events.treningy\`, \`events.stretnutia\`, \`events.dalsie\` to the existing singular Notion \`Typ podujatia\` values. No second category registry.

## Field audit

**Directory:** existing Notion-only editor covers title/slug/category, summaries/description, services/qualifications/pricing, region/district/city and address segments (street, number, ZIP, format), website/phone/email/social and internal email, main photo/asset key and separate logo, verification and featured flags, quality classifications, SEO/meta/OG/noindex. The existing save deliberately excludes status, source/provenance, Psipedia ID, and synchronization identity fields. It is a direct PATCH of the same Notion page. Canonical-only photo display settings are unavailable until import.

**Directory category filters:** \`directoryFilterRegistry\` marks proposed \`Filter · ...\` Notion fields \`not_provisioned\`. Accordingly \`AdminDirectoryEditor\` intentionally hides \`DirectoryCategoryFilterFields\` while editing \`notionDraft\`. **Not full parity.** The new review code does **not** invent fields or modify Notion schema. Implementing filters requires separately approved schema provisioning and existing Notion sync mapping; until then filters must not appear to have been saved.

**Events:** the existing adapter declares title, slug, status, event type, start/end date and time, location/venue/city/region/address, organizer, excerpt/description/practical info, web/registration, main image, cancellation and standard SEO fields. New panel renders supported Notion schema fields using the exact adapter field list; missing fields are explicitly reported and not included in writes. Editorial state/type are read-only on this review path; first-stage approval uses Notion Ready and canonical sync creates D1 draft (not immediate public publication).

**Organizations:** names and legal/registration data, description, website/social, locality, image, source; **no generic Event/Help SEO mapping in the existing Organization agenda schema**. Missing fields reported. The canonical Organization location and Google Places protections stay with existing sync.

**Adoptions:** dog profile name and descriptors, birthdate/estimated age, sex/size/weight, breed/mix/color, location, organization, description/temperament/activity/health/special needs, main image, source; **no generic Event/Help SEO contract**. Existing adoption data/relationship is unchanged.

**Help cases:** title/slug/category, excerpt/content, organization and dog attributes, location and reporting/deadline dates, call-to-action/contact, funds, image, urgency/resolution and SEO. The native \`Psipedia stav\` property is a **rich_text** draft/published lifecycle; it has no safe rejection/archiving state recognized by existing \`helpStatusFromNotion\`. **Reject is intentionally BLOCKED** (SCHEMA), rather than writing an invalid status or silently deleting records. Approval requires a nonempty slug, since \`readyForCreate\` requires it.

**Lost/Found:** existing adapter covers type/status, dog appearance/identifying details, event dates, broad location and optional precision, public contact note, source and image. This PR prevents editing the immutable source, category/type/status and never injects private contactName/Phone/Email or exact GPS values. The existing contract itself lists latitude/longitude but privacy review must separately verify release; **before PR #834 merges and canonical configuration is validated, category remains BLOCKED for live use**. Canonical data source and parent are pinned; sibling same-named database rejected. Source and evidence remain unchanged on save.

**Known schema limitations:** Some Notion data sources may lack optional SEO, photography, category-specific, or publication options. The UI returns \`missingFields\`, and the backend rejects unknown fields, unsupported property types, missing select options and invalid dates; it must not auto-provision schema or silently discard a submitted value. The existing Notion ↔ D1 sync remains the only import path. For rich text, data is chunked rather than truncated.

## Provenance and fail-closed behavior

The external Gemini worker writes a \`Vytvoril = Gemini automatizácia\` marker **only for Directory**. Events, Adoptions, Organizations, Help Cases and Lost/Found currently do **not** share an equivalent immutable origin marker or callback link. Thus the additional review reads those agenda pages from Notion and uses the worker's documented evidence formatting embedded in \`Popis\` as a *conservative candidate signature*, **not cryptographic/definitive attribution**. A manually created Notion page using the same formatting can theoretically match. The code labels this \`EVIDENCE_SIGNATURE_ONLY\`. An explicit and non-ambiguous ownership marker is a dependency before asserting fully verified end-to-end provenance. This PR **does not edit the parallel worker**.

No concept is created in D1 by opening or saving. Mutations use existing admin authentication and anti-CSRF gate, the existing D1 per-page lock, a last-edited-time check plus immediate pre-PATCH reread, and a single non-retrying PATCH. HTTP error/uncertain result keeps the lock for operator reconciliation. Notion does not expose atomic compare-and-swap for page properties; simultaneous external writes within the final read/PATCH window are an **unresolved concurrency limitation**, not a guaranteed transactional save. Do not rerun ambiguous requests blindly.

**Approval is explicit, distinct from draft save.** On event/organization/adoption pages this selects \`Ready\` (if the live Notion schema offers it); for help-cases it selects rich_text \`published\` only after slug validation; Lost/Found selects \`PENDING\` according to the existing Notion contract. These paths may require workflow and publication-policy review. Rejection selects \`Archív\` for applicable schemas, \`ARCHIVED\` for Lost/Found, and refuses to mutate unsupported help-case schema. Exact rejection reason is not persisted by the schema-backed generic path, so complete decline-reason parity is **not achieved**.

## Test coverage and release gates

Added \`tests/gemini-notion-agenda-review.test.mjs\` to existing Gemini CI (mock Notion API and D1 lock): catalog 10+6+6, 12 direct-source queries, category/source filtering, explicit edit/approve/reject/restore, unchanged publication on save, evidence protection, stale revision HTTP safety, blocked unsupported help rejection. Existing directory/Notion tests and UI modal test remain CI requirements. All real external calls are mocked; no paid Gemini test, production Notion write or D1 migration.

Pending release gates: CI + build/lint execution, schema option validation against actual Notion data sources by *read-only* inspection, definitive non-directory provenance, directory filter schema+sync provisioning, help-case rejection lifecycle, rejection reason contract, Lost/Found worker PR #834 integration and privacy signoff. This PR should remain a **draft/BLOCKED** until those are resolved. No merge or production publication is authorized by this document.
