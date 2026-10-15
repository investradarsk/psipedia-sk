# GEMINI-NOTION-EDITOR-PARITY-ALL-1 — audit and limitations

Base: current main a687d2e4d72cd7d2048c33003a5d402a0e322e21, integrated into existing PR #838, including #834, #836, #839, #840 (D1 0126 rollout) and now merged #837 Gemini scheduler. The PR #838 itself remains unmerged. Scope: existing admin Notion concept component, existing Notion APIs, editor field adapters, and mocked tests. No new CMS, database migrations, Gemini calls, or Notion schema mutations.

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

**Help cases:** title/slug/category, excerpt/content, organization and dog attributes, location and reporting/deadline dates, call-to-action/contact, funds, image, urgency/resolution and SEO. The existing public `Psipedia stav` remains exclusively `draft/published`. The review module now recognizes independently provisioned `Gemini kontrola` and `Dôvod odmietnutia` properties. If both valid properties do not exist, **approve/reject/restore fail closed**, although read-only listing and supported draft saving continue. If both exist, the editor writes only the separate review state + rejection reason; public publication is never changed. Slug edit becomes available only after valid review schema is verified. This implementation is conditional and does **not** mutate live Notion schema.


**Lost/Found:** existing adapter covers type/status, dog appearance/identifying details, event dates, broad location and optional precision, public contact note, source and image. This PR prevents editing the immutable source, category/type/status and never injects private contactName/Phone/Email or exact GPS values. The existing contract itself lists latitude/longitude but privacy review must separately verify release; **although PR #834 has merged, live configuration must still be checked read-only; category remains BLOCKED for live use until privacy acceptance**. Canonical data source and parent are pinned; sibling same-named database rejected. Source and evidence remain unchanged on save.

**Known schema limitations:** Some Notion data sources may lack optional SEO, photography, category-specific, or publication options. The UI returns \`missingFields\`, and the backend rejects unknown fields, unsupported property types, missing select options and invalid dates; it must not auto-provision schema or silently discard a submitted value. The existing Notion ↔ D1 sync remains the only import path. For rich text, data is chunked rather than truncated.

## Provenance and fail-closed behavior

The external Gemini worker writes a \`Vytvoril = Gemini automatizácia\` marker **only for Directory**. Events, Adoptions, Organizations, Help Cases and Lost/Found currently do **not** share an equivalent immutable origin marker or callback link. Thus the additional review reads those agenda pages from Notion and uses the worker's documented evidence formatting embedded in \`Popis\` as a *conservative candidate signature*, **not cryptographic/definitive attribution**. A manually created Notion page using the same formatting can theoretically match. The code labels this \`EVIDENCE_SIGNATURE_ONLY\`. An explicit and non-ambiguous ownership marker is a dependency before asserting fully verified end-to-end provenance. This PR **does not edit the parallel worker**.

No concept is created in D1 by opening or saving. Mutations use existing admin authentication and anti-CSRF gate, the existing D1 per-page lock, a last-edited-time check plus immediate pre-PATCH reread, and a single non-retrying PATCH. HTTP error/uncertain result keeps the lock for operator reconciliation. Notion does not expose atomic compare-and-swap for page properties; simultaneous external writes within the final read/PATCH window are an **unresolved concurrency limitation**, not a guaranteed transactional save. Do not rerun ambiguous requests blindly.

**Approval is explicit, distinct from draft save.** Events/Organizations/Adoptions use existing `Ready` state; Lost/Found uses existing `PENDING` state. Help-case approval/decline/restore is available only when live schema contains valid `Gemini kontrola` and `Dôvod odmietnutia` fields. Approval selects internal `Schválené`, rejection `Odmietnuté` with a required reason, restore `Na kontrolu` and clears reason. Help public `Psipedia stav` is never touched; existing `createCanonicalFromNotion` uses forceDraft=true. The legacy manual Notion import path remains while evidence-marked unapproved Gemini candidates are gated from new import.


## Test coverage and release gates

Added \`tests/gemini-notion-agenda-review.test.mjs\` to existing Gemini CI (mock Notion API and D1 lock): catalog 10+6+6, 12 direct-source queries, category/source filtering, explicit edit/approve/reject/restore, unchanged publication on save, evidence protection, stale revision HTTP safety, blocked unsupported help rejection. Existing directory/Notion tests and UI modal test remain CI requirements. All real external calls are mocked; no paid Gemini test, production Notion write or D1 migration.

Pending release gates: CI + build/lint execution, schema option validation against actual Notion data sources by *read-only* inspection, definitive non-directory provenance, directory filter schema+sync provisioning, help-case rejection lifecycle, rejection reason contract, Lost/Found #834 operator privacy signoff. This PR should remain a **draft/BLOCKED** until those are resolved. No merge or production publication is authorized by this document.

## Read-only verification against six live Notion data sources — 14 October 2026

The connected Notion workspace was inspected using **read-only fetch** (no schema edits or page mutations). Notion UI reports property type `text` for REST `rich_text`; all properties listed in `agendaEditableFields` for the five non-directory agendas are present in the canonical data source, with supported types. The actual data source IDs, not matching database titles, are authoritative.

| Agenda | Canonical data source | Live properties | Review status property | Caveat |
| --- | --- | ---: | --- | --- |
| Directory (10) | `84e0664c-ca47-405f-9d54-31b20287bc8c` | 72 | `Stav` select + `Psipedia stav` select | 0 `Filter ·` fields, requires independent schema and sync work |
| Events (6) | `76d9ccde-5816-422c-bcfe-863ab69db080` | 45 | `Stav` select (`Nápad`, `Na kontrolu`, `Ready`, `Publikované`, `Archív`) | Provenance marker missing |
| Organizations (1) | `6fbf8eb2-2f72-4d0c-b825-c46f6f72f92e` | 36 | Same five `Stav` choices | Provenance marker missing |
| Adoptions (1) | `ca3c57e7-1342-42cd-939e-967b63d3027c` | 31 | `Stav` select, also `Rezervované` | Provenance marker missing |
| Help cases (3) | `3ed793fc-1d18-819c-bb39-000b753d0002` | 47 | `Psipedia stav` text | **No distinct review/rejection state** |
| Lost/Found (1) | `3ed793fc-1d18-8122-95b9-000b05c3c6bd` | 39 | `Psipedia stav` text | Canonical source and parent verified; privacy constraints preserved |

The "Pomoc psom" parent database also exposes `01d07d71-88e7-45fc-8188-8de4146c5479`, an effectively empty `Name`-only source. **Never** use that source for help-case review based on the database title. Missing/wrong source returns a schema/configuration error.

**22 keys by section:** Directory `veterinari`, `treneri`, `kynologicke-kluby`, `chovatelske-kluby`, `chovatelske-stanice`, `salony-a-sluzby`, `hotely-a-opatrovanie`, `vencenie`, `fyzioterapia`, `dalsie-sluzby`; Events `vystavy`, `preteky`, `seminare`, `treningy`, `stretnutia`, `dalsie`; Help `adopcia`, `utulky`, `docasna-opatera`, `zbierky`, `stratene-a-najdene`, `dobrovolnictvo`. No competing catalog or CMS.

### Concrete safety corrections in existing PR

1. The shared agenda editor sends **only changed fields** on save. The Notion PATCH therefore leaves nonedited dates/datetimes, rich-text mentions/formatting, photographs, statuses and additional schema properties untouched. This closes a silent-loss bug caused by sending every form field unconditionally.
2. Editing a description must retain the *entire original evidence suffix*; merely adding a new unrelated HTTPS URL is no longer accepted. Original source fields remain immutable.
3. Long text preserves user-entered leading/trailing spacing and internal line breaks. Already-saved original rich-text blocks remain byte-for-byte unchanged unless that text was explicitly edited.
4. **Help-case decisions are schema-gated.** Without exact internal Notion fields approve/reject/restore fail closed; with both fields and allowed options, moderator actions change only `Gemini kontrola` and `Dôvod odmietnutia`, never public `Psipedia stav`. Existing sync now defers evidence-marked agent candidates lacking `Schválené` even if a slug exists; legacy manual pages without agent evidence remain compatible. Definitive ownership must still be supplied by worker follow-up.
5. Lost/Found data source is pinned to the #834 canonical source and parent. GPS, contact and precise location remain read-only; private text patterns are blocked on modified fields. The existing Notion sync now treats only the existing `PENDING` moderation state as eligible for first canonical import: a merely saved `DRAFT` with slug or rejected `ARCHIVED` page is never imported as a new D1 dog. This does not create a new worker or a new status.

### Minimal independent follow-on work — not part of PR #838

**HELP-REVIEW-STATE-CONTRACT-1 (Notion schema provisioning only):** The read/save/decision and import gate code is now implemented in #838. Operator must explicitly approve **exactly two Notion properties on the canonical Help cases data source only**: `Gemini kontrola` (select with values `Na kontrolu`, `Schválené`, `Odmietnuté`) and `Dôvod odmietnutia` (rich text). Do **not** modify the existing `Psipedia stav` draft/published field or change the unrelated one-column Help data source. Use a separate explicitly approved schema rollout; before that #838 stays Draft.


**DIRECTORY-FILTER-NOTION-PARITY-1 (new schema + registry sync):** Provision the proposed 21 `Filter · ...` fields with validated select options; map them through the existing Directory Notion and D1 `source_data_json` contract and editor. No production Notion schema modifications in this PR.

**GEMINI-WORKER-PROVENANCE-1 (existing worker, separate PR):** Write a consistent explicit origin marker or stable job ID to each supported Notion data source. The current evidence signature provides no cryptographic or complete provenance guarantee and must not be described as verified Gemini origin; do not add another worker.

**Review UX parity:** This PR now mounts the existing `AdminGeminiNotionDrafts` panel for all 22 category cards whenever external Gemini is enabled. This changes only the panel visibility condition in `components/admin-gemini-automation-settings.tsx`; no schedule, prompt, worker or dispatcher settings are changed. Merged #837 scheduler integration retains its cadence/prompt functionality and the #838 real shared review panel, with the temporary placeholder removed. The existing shared form uses `agendaEditableFields`: it exposes every other Notion schema field in an expandable read-only panel, renders schema-valid select choices and marks complex formatted rich text/date ranges read-only to prevent lossy writes; it does not replace a native Events/Help editor; exact visual feature parity (including R2 image upload, image cropping, Google place selection and custom field widgets) is therefore not achieved by #838.

**Release verdict: BLOCKED/DRAFT** until follow-on contracts, provenance and operator checks pass, notwithstanding green CI. Never merge solely because CI passes.


### Continuation changes — main #839 integration and complete field-view checks

- Main `c78b827caa78b0885059acf3c67c63308e69f927` was merged into the same PR branch with **no changes to the scheduler or worker**; #839 D1 rollout migration pipeline remains intact.
- Shared concept review card is now mounted in all 22 existing external-enabled Gemini category cards, rather than only the ten Directory cards. Do not enable billing or runs from this PR.
- The existing editor exposes all Notion schema properties, including status/metadata fields it cannot edit, under a labelled read-only section. Only fields in the **current** `agendaEditableFields` sync contract are editable; unsupported data cannot be accidentally sent on PATCH. Date ranges and decorated rich-text fields are deliberately read-only, with a link to the original Notion page for advanced editing. Select fields use the actual source schema options rather than a free-text box.
- Help-case `published` records are excluded from the draft queue. Help-case `Slug` remains read-only while the review fields are missing, then becomes editable when both required fields are verified. Saving does not publish; internal approval/rejection/restore is enabled only with a valid provisioned schema.
- The tests cover each of the 12 non-directory categories for saving, and all 22 keys for catalog routing, plus Notion source parent, evidence, rich formatting/date intervals, field omissions, published help records and Lost/Found privacy. Directory's original dedicated mocked contracts remain in place.
- **Explicit limitation:** Notion has no page-property CAS and non-directory provenance remains inferred from evidence signatures, not definitive. Native media upload/crop, Google Place picker and certain bespoke field widgets are not reproducible in this Notion-only path; do not claim full native UX parity. The proposed 21 directory filters remain absent from live Notion schema.


## PR #840 integration and conditional Help review — 15 October 2026

Merged the user-confirmed main `f9b9af89d414b7e20fb7c5f79e70d9b381a8f32c` into **the existing PR branch**. This preserves already merged #840 manual production migration 0126 workflow and tests. We did **not** execute, repeat or modify the production 0126 migration itself. PR #837 scheduler was subsequently merged into main and is now integrated into this existing PR branch, without changing its cadence or dispatch semantics.

### Minimal live Notion change requiring operator approval

**Canonical target:** `3ed793fc-1d18-819c-bb39-000b753d0002` (Pomoc psom – prípady only). The similarly titled `01d07d71-88e7-45fc-8188-8de4146c5479` is **not** a valid target.

| Property to add | Notion type | Exact values | Rule |
| --- | --- | --- | --- |
| `Gemini kontrola` | Select | `Na kontrolu`, `Schválené`, `Odmietnuté` | Internal moderation only; never public visibility |
| `Dôvod odmietnutia` | Rich text | Free-text, nonempty and at most 1000 chars on rejection | Persisted on rejection; cleared by restore/approval |

No new database, no D1 columns or migrations, no new worker. Until these properties are provisioned, the Help review API can open/edit/save the same Notion draft but cannot approve or reject it. An incomplete or wrong-type schema fails closed. Once both properties are present, the existing review API can approve, reject with reason, restore and update the same page; status `Psipedia stav` remains `draft`. The existing canonical sync checks `Gemini kontrola` before importing evidence-marked new pages and creates D1 **draft** only after `Schválené`. A legacy manual Notion page without the evidence signature and without review state retains the existing import path. Definitive differentiation between Gemini and human entries is deferred to the worker-origin follow-up, so operator must validate the dry-run cohorts before activating schema in production.

### 21 category filters: required vs optional

**Current core CRUD and Gemini draft review need zero new Directory properties.** All 21 are *enhancements* from `directoryFilterRegistry` to achieve **full structured filter parity with the native D1 category editor**. Do not assert that the 21 proposed facets are required for saving basic directory profiles.

| Existing category | Optional new `Filter ·` select properties |
| --- | --- |
| `veterinari` | `facility_type`, `emergency`, `home_visits` |
| `treneri` | `individual_training`, `group_training` |
| `kynologicke-kluby` | `trial_preparation`, `group_training` |
| `chovatelske-kluby` | `breeding_advice`, `member_events` |
| `chovatelske-stanice` | `visits_by_appointment`, `health_testing_information` |
| `salony-a-sluzby` | `nail_trimming`, `hand_stripping` |
| `hotely-a-opatrovanie` | `overnight_stays`, `daycare` |
| `vencenie` | `individual_walks`, `group_walks` |
| `fyzioterapia` | `hydrotherapy`, `home_visits` |
| `dalsie-sluzby` | `pet_transport`, `equipment_rental` |

Exact Notion names are `Filter · {category}.{field}` and options must match each definition's `allowedValues` (`yes/no/unknown` for tri-state, four prescribed options for veterinarian facility type). All 21 fields would be necessary only if the user explicitly approves **full category-filter parity**; a category-by-category schema rollout can provision the desired subset. Reuse existing `mergeDirectoryFilterValues`, `source_data_json`, and Directory Notion sync; do not create a new filter system, infer values from free text or coerce missing values to false. Separate schema + existing sync mapping PR required for this optional scope.

### Required existing-worker provenance follow-up (no worker changes in #838)

Update the **single existing Gemini Notion worker** to write explicit, stable ownership information to the canonical Events, Organizations, Adoptions, Help cases and Lost/Found data sources on new drafts. Proposed `Vytvoril` (rich text `Gemini automatizácia`) plus immutable `Gemini job ID` (rich text, stable task/run identity) requires its own schema approval, or an approved equivalent existing field per agenda. Review logic must select on the explicit marker **and** the canonical data source/category/draft status rather than using description evidence as definitive provenance. Existing manual records without that marker must remain invisible in agent-only queues, and historical agent candidates should require an explicit backfill review; no text guessing.

### PR #837 compatibility

**Resolved in existing branch:** #837 has merged to main and been integrated into #838 as a two-parent merge. The merged `components/admin-gemini-automation-settings.tsx` retains #837 cadence, custom minutes, weekdays, prompt link, run confirmation and external dispatch; removes its temporary Events/Help placeholder; and mounts precisely one real `AdminGeminiNotionDrafts` component for all external-enabled categories. No paid Gemini call or schedule activation was performed.


## Completed merge of #837 scheduler into existing #838 branch — 15 October 2026

- Main `a687d2e4d72cd7d2048c33003a5d402a0e322e21` includes merged PR #837. It has been integrated **into the existing #838 branch only**; no merge of #838 into main and no production writes.
- Resolved the sole overlapping settings UI component by retaining #837's `geminiSchedulerOptions`, custom minute interval, weekday configuration, recommended cadence, prompt link, save API `weekly_day` and manual search launch. Replaced #837's temporary non-directory placeholder with the **same real** `AdminGeminiNotionDrafts` component for all external-enabled categories. Exactly one review panel per category; no parallel worker or planner code copied.
- Added a regression contract covering the integration of the 22-category catalog, scheduling controls, prompts/manual action and one actual review panel with no placeholder. Existing mocked Notion tests cover title updates across all 12 non-directory categories and the original Directory tests cover the other ten.
- Read-only retrieval of canonical Help data source `3ed793fc-1d18-819c-bb39-000b753d0002` after #837 merger confirms 47 properties and **neither** `Gemini kontrola` nor `Dôvod odmietnutia`. Consequently internal Help decisions remain correctly **disabled** until a separate explicit schema approval; editing and saving supported fields do not publish.
- The evidence signature is still *candidate discovery only*, not an immutable ownership claim. Full Gemini worker provenance requires a separate change to the **existing** worker and likely schema approval.
- All 21 Directory category filter properties are optional for **basic profile editing**; they remain unprovisioned and full structured category-facet parity is not claimed. Advanced media widgets and Notion's lack of atomic page-property CAS are additional known limitations.

**Merge assessment:** Core review/edit preservation and scheduler UI integration are technically validated, but PR #838 remains **Draft / BLOCKED for the complete 22-category moderation promise** until canonical Help review schema is approved and a non-directory provenance contract is implemented. Do not treat current CI as proof of those missing production capabilities.
