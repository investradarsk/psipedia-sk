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
