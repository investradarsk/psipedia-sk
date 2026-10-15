# GEMINI-NOTION-EDITOR-PARITY-ALL-1 — PR #838

**Current status (15 October 2026): BLOCKED / Draft. NO MERGE.**
Repository: investradarsk/psipedia-sk. Main: a8845ea710cfeb7c63aa1618fd2708d4593dfc7d after #841. The PR branch is already 0 commits behind this main. Previous historical design notes have been retained separately in GEMINI-NOTION-EDITOR-PARITY-ALL-1-historical.md; they are NOT the current release requirements.

## Implemented without production writes

- Existing 22-category worker, shared Notion review panel and original canonical/admin editors; merged #837 planner configuration and #841 worker improvements are preserved.
- Worker returns up to five confirmed Notion page identifiers in its existing HMAC-signed callback. The server verifies job/category, target canonical data source, exact UUIDs, remote Notion parent, and immutable ownership before registering them in the D1 receipt table.
- New additive migration 0127_gemini_notion_created_pages.sql is **PREPARED ONLY**. Its server-owned registry is never created by mutable Notion origin text. No historical backfill.
- Existing Directory and Events/Help sync paths use this registry as the trusted Gemini origin before allowing automatic D1 draft import. For a trusted record, canonical statuses are draft/DRAFT and publication remains an explicit admin action. Legacy manual records retain separate original sync behavior.
- Help review schema is already complete: 49 properties; Gemini kontrola select with Na kontrolu, Schválené, Odmietnuté, Dôvod odmietnutia rich text, public Psipedia stav unchanged.
- Lost/Found: unsafe private contact or exact location blocks unattended import; the draft adapter sanitizes exact coordinates, private/public contact notes and sensitive location. A production privacy acceptance still remains necessary.
- Existing notion-to-canonical mapping, changed-only editorial PATCH, conflicts and no-blind-POST recovery are reused. The 21 Directory category facets and native media widgets are optional enhancements, not base import blockers.

## Offline coverage: 22 keys, six destination agendas

| Source | Stable keys | Verified offline contracts |
| --- | --- | --- |
| Directory (10) | veterinari; treneri; kynologicke-kluby; chovatelske-kluby; chovatelske-stanice; salony-a-sluzby; hotely-a-opatrovanie; vencenie; fyzioterapia; dalsie-sluzby | Signed callback, real Notion parent verification with mocked provider, actual additive SQLite registry, duplicate receipts, source/category mismatch, existing Directory mapped sync and R2/GEO safety tests |
| Events (6) | vystavy; preteky; seminare; treningy; stretnutia; dalsie | Same signed callback and registry tests; actual canonical adapter called with mocked write boundaries and verified private draft status |
| Help (6) | adopcia; utulky; docasna-opatera; zbierky; stratene-a-najdene; dobrovolnictvo | Same signed callback and registry tests; actual canonical draft adapter for each sub-agenda, including Lost/Found privacy sanitizer and internal Help moderation |

Offline tests added/strengthened in this iteration:
- tests/gemini-notion-provenance.test.mjs: actual SQLite execution of migration 0127, 22 source-bound validated receipts, exact replay/no duplicate, FK/UNIQUE/CHECK failures.
- tests/gemini-external-agent.test.mjs: real callback handler with HMAC for all 22, signed replay and partial lost-D1-ack retry; foreign source read-back fails closed. No real provider calls.
- tests/gemini-notion-canonical-drafts.test.mjs: actual five canonical adapter functions with mocked canonical I/O for all 12 Events/Help categories, forced draft status and Lost/Found redaction. Existing Directory 10 are covered separately.
- tests for mapped-editor updates: canonical human edits push back to Notion if unchanged, divergent simultaneous edits cause a conflict; both sync paths persist canonical mappings before uncertain provider writeback. Existing tests cover R2 and Notion mapping failures.
- tests/production-d1-0127-readonly.test.mjs: original migration applied to *isolated local SQLite*, preflight no-table, partial state rejected, correct postflight.

**Scope of proof:** callbacks, registry, canonical adapter payloads and independent sync/adapter contracts are exercised offline. This is not a literal 22-way end-to-end service run with the production D1, external Notion and native editors. Full live operational acceptance remains BLOCKED until explicitly authorized; a green mocked CI cannot prove real runtime behavior.

## 0127: separately approved production rollout, NOT launched

The new .github/workflows/production-d1-0127-readonly.yml is **workflow_dispatch only**; it requires main, protected production environment, current SHA and exact typed authorization:
- AUDIT-0127-preflight-psipedia-sk-db
- AUDIT-0127-postflight-psipedia-sk-db

scripts/production-d1-0127-readonly.mjs permits exactly **two fixed SELECT statements** in the protected production D1: d1_migrations ledger and sqlite_master registry objects. Incorrect account, missing parent table, unexpected 0126 state, partial 0127 and incorrect postflight all fail closed. It cannot run migration apply.

**Production 0127 remains in PREPARED_PRODUCTION_TARGETS and is deliberately excluded from SUPPORTED_PRODUCTION_TARGETS and the existing APPLY workflow.** Thus a further separately approved change/activation is required before production apply. The preflight workflow cannot run from an unmerged PR branch because it explicitly requires current main. Nothing was dispatched in this task.

Release order after separate decisions:
1. Complete remaining offline evidence, then approve only a read-only D1 preflight. With workflow on main, use the protected manual action; beforehand an operator may execute equivalent read-only SQL in Cloudflare.
2. After ledger through 0126 and zero partial 0127 objects, separately approve/enable the **single 0127 apply** in the guarded production Actions rollout. Perform postflight on the exact resulting schema. Do not enable automatic worker execution.
3. Only then assess merging/deploying the app code in a controlled sequence; disable scheduled/paid dispatch. Require the registry table before readers activate.
4. Under fresh explicit approval, carry out one unpublished per-agenda live acceptance to verify actual original page ID, one D1 draft, existing admin editor, repeated sync, editor preservation and no public record. Review Lost/Found privacy before its live acceptance.
5. On any ambiguous Notion POST, D1 callback acknowledgement or conflicting revision: stop, reconcile immutable IDs and mapping; never blind retry a create.

## Salon pre psov Fen ix (Fénix): one-off draft adoption PENDING

Verified Notion page: 3fa793fc-1d18-8108-af1b-c7dd5414a0b9 in canonical Directory data source 84e0664c-ca47-405f-9d54-31b20287bc8c. Názov: Salón pre psov Fénix; category salony-a-sluzby; city Nitra; Stav Nápad; Psipedia stav Koncept; blank Psipedia ID and Slug. Website salonprepsovfenix.sk; stored creator text Gemini automatizácia is NOT a signed provenance registry receipt.

Read-only Notion duplicate search found FAWN FÉNIX with **Psipedia ID 873**, category chovatelske-stanice, city Nitra, same public telephone and website subpage salonprepsovfenix.sk/chovna-stanica/. This may be a separate service sharing an operator or a duplicate organization; adjudicate manually, do not assume.

**No direct production D1 read connection** was available to query directory_notion_sync and directory_profiles, so neither canonical mapping absence nor D1 duplicate absence is verified. No Fénix import was performed and no historical Gemini record was fabricated.

Before any separately authorized targeted import, run read-only (after checking actual production schema):

    SELECT notion_page_id,directory_profile_id,content_hash FROM directory_notion_sync
      WHERE notion_page_id='3fa793fc-1d18-8108-af1b-c7dd5414a0b9';

    SELECT id,name,slug,category,city,website_url,status FROM directory_profiles
      WHERE lower(name) LIKE '%fénix%' OR lower(name) LIKE '%fenix%'
         OR lower(website_url) LIKE '%salonprepsovfenix.sk%';

If already mapped, recover original mapping. If genuinely distinct and unmapped, use an operator-approved **one-page manual Directory draft adoption** using the existing editor/sync contracts with explicit duplicate resolution. Never backfill job provenance without historical authenticated receipt. Verify exactly one draft, one mapping, original Notion page, native admin editor and no public URL. Stop on any unresolved identity overlap.

## Release decision

**Code ready for technical review:** 22-key HMAC/category routing and signed receipts; 12 actual Events/Help draft payload adapters; existing 10 Directory sync and admin pathways; 0127 SQL + strict local SQLite tests; manual-only read-only pre/postflight. No automation activation or production writes.

**BLOCKED for the complete requested scope:**
1. 0127 is not yet production-applied, and the separately authorized APPLY step is not enabled.
2. Real, fully integrated import/sync/admin-editor acceptance for all 22 is still pending on controlled production-equivalent infrastructure; CI isolates side effects.
3. Fénix requires genuine read-only production D1 mapping checks and resolution of FAWN FÉNIX identity overlap.
4. Lost/Found requires explicit live privacy acceptance; Notion cross-writer page CAS remains a known limitation.

Remain Draft / BLOCKED rather than READY. No new PR, merge, migration apply, paid Gemini call, Notion/D1 production write, test concept or automatic publication occurred in this task.

## 15 October 2026 — final #838 hardening after #841 (no live side effects)

- Verified PR HEAD against current main `a8845ea710cfeb7c63aa1618fd2708d4593dfc7d`: branch is ahead with no missing main commits or merge conflicts. PR remains Draft, unmerged.
- Added an **offline 22-category provenance → canonical-ID mapping** regression in `tests/gemini-notion-canonical-drafts.test.mjs`. It executes the **actual 0127 SQL** on an isolated SQLite database, exercises the real signed-worker receipt parser/registration and the real Events/Help draft payload adapter at mocked canonical write boundaries, plus simulated Directory insertion with real SQLite uniqueness checks. Each of the 22 stable keys has an immutable page/job/source/agenda relationship, one canonical ID mapping, a safe retry after an uncertain Notion writeback, editor-side changes taking precedence, and dual edits triggering a conflict. It does not impersonate a real Cloudflare import service nor invoke paid Gemini.
- Added a source-state admission gate **before canonical creation** in `lib/notion-events-help-adapters.ts` and `lib/notion-events-help-sync.ts`: a trusted provenance row is insufficient if the Notion page is publicly published, archived or rejected. Events/Organizations/Adoptions accept only editorial draft/review/Ready source stages; Help cases require public `Psipedia stav=draft`; Lost/Found accepts only `DRAFT/PENDING` and additionally invokes its existing exact-location/contact privacy block. All **12** non-directory category cases have positive and negative admission tests.
- Added source assertions for all **22 existing native admin editor routes** in `components/admin-gemini-notion-drafts.tsx`, including Directory `AdminDirectoryEditor` and agenda-specific canonical editors. These tests prove routing/source contracts and real D1 uniqueness in isolation, **not a browser-operated full canonical editor workflow**.
- Existing tests remain responsible for the real signed HMAC callback handler, invalid foreign page/parent, collision between two jobs, callback replay, partial registry acknowledgement, live adapter errors, Directory R2/SQL/GEO, changed-only Notion reconciliation, Lost/Found privacy and migration 0127 preflight/postflight SQL. No application changes touched worker pricing/scheduling or enabled automation.

### Precise CI and coverage classification

When all checks pass on the final HEAD, this supports **offline technical readiness of registry registration, 22 routes, 12 real non-Directory canonical input adapters and isolated SQLite mapping behavior**. Notion page creation, canonical D1 insert, sync ledger update and actual editor open are **not yet covered by one single real end-to-end invocation for each of the 22 categories**. Do not describe them as end-to-end production proven. The protected environment migration remains intentionally disabled.

### Production 0127 release sequence — approved staging only; do not run now

1. **Read-only preflight**: `.github/workflows/production-d1-0127-readonly.yml`, `workflow_dispatch`, input `audit_mode=preflight`, `confirmation=AUDIT-0127-preflight-psipedia-sk-db`. Requires dispatch from the current `main`, protected production environment, exact current SHA, canonical Cloudflare account and secret. Existing workflow is already implemented; PR branch cannot run it.
2. Require an actual report `READY_FOR_SEPARATE_APPLY_APPROVAL` confirming 0126 is last applied, the parent `gemini_manual_background_jobs` exists, and no partial 0127 table/index/ledger entries exist. Read-only source SQL and a local SQLite simulation are already tested; they are **not proof about production** until the workflow runs.
3. **Separate explicit approval** is required to activate a **guarded, manual-only production APPLY-0127 path**. Currently `0127_gemini_notion_created_pages.sql` is intentionally in `PREPARED_PRODUCTION_TARGETS`, absent from the generic `SUPPORTED_PRODUCTION_TARGETS` and production D1 Apply dropdown. This PR deliberately does NOT introduce an unguarded way to run the migration. Activation must itself be separately reviewed against the migration runner's ledger, snapshot, account, Time Travel recovery, one-target-only and idempotence safeguards. Do not deploy code that queries the new table until migration order is assured.
4. **Read-only postflight**: same protected workflow, `audit_mode=postflight`, `confirmation=AUDIT-0127-postflight-psipedia-sk-db`; require `APPLIED_AND_VERIFIED`, 0127 exactly once in ledger, exact primary/foreign/unique constraints and both indexes. Then ensure newly created registry has no pre-populated historical Gemini IDs; do not backfill without independent authenticated proof.
5. A separate controlled app deployment and explicitly authorized single-page live acceptance are needed after successful production migration. No worker automation, scheduled paid calls, automatic publication or full-batch import activation is part of the migration approval.

### Fénix: read-only operational boundary

Notion page `3fa793fc-1d18-8108-af1b-c7dd5414a0b9` is an unpublished, unmapped **Notion-side** Salon Fénix draft (`Stav=Nápad`, `Psipedia stav=Koncept`, blank `Psipedia ID` and slug). The displayed `Vytvoril=Gemini automatizácia` is user-editable historical text and MUST NOT be inserted as a fabricated signed receipt in `gemini_notion_created_pages`. Because the current safe automatic importer rejects an unregistered Gemini-text-marked page, this case needs its own **explicit one-page operator-approved manual draft adoption**, not automatic provenance recreation.

The existing read-only audit flagged an overlapping FAWN FÉNIX listing (`Psipedia ID=873`) with the same phone/website domain, potentially a genuinely separate breeding service. **Production D1 mapping and duplicate queries have not been executed through a live D1 connection.** Until a human confirms identity separation and D1 rows for both profiles, no creation, Notion PATCH or transfer of canonical IDs is justified. Confirm `directory_notion_sync` by Fénix page ID and `directory_profiles` by name, phone, website and Nitra; then use existing canonical Directory editor and one-to-one mapping as a never-public draft only under separate operator approval. Verify source-image R2 provenance and exact address safeguards. No import in this task.

### Final boundary

**Code branch / offline tests may be reviewed. Deployment and fully automatic 22-category import remain BLOCKED** by production 0127 approval + rollout ordering, a true source-to-canonical end-to-end acceptance across the agendas, Fénix D1 identity checks and Lost/Found privacy acceptance. The 21 Directory-specific Notion filters are optional; no new PR, merge, production Cloudflare/Notion/R2 writes, paid model call, test concept or dispatch occurred.
