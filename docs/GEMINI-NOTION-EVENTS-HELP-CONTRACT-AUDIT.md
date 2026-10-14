# GEMINI-NOTION-EVENTS-HELP-CONTRACT-1 — audit, 2026-10-14

**Scope:** Read-only Notion metadata + fresh GitHub main. No Notion writes, Gemini billing, worker changes, migrations, runtime activation or automatic publishing.

## Confirmed live Notion sources

| Agenda | Data source ID | Verified |
| --- | --- | --- |
| Podujatia | 76d9ccde-5816-422c-bcfe-863ab69db080 | Názov title; Typ podujatia text; Začiatok/Koniec date; Stav select |
| Pomoc psom — help cases | 3ed793fc-1d18-819c-bb39-000b753d0002 | Názov title; Kategória/Psipedia stav text |
| Pomoc psom — wrong sibling source | 01d07d71-88e7-45fc-8188-8de4146c5479 | Only Name title; **never** route help cases here |

These IDs are **diagnostic only**. The worker must read metadata from the *configured* data source, not route by a compiled ID. The Notion search connector labels text fields as text; Notion REST uses rich_text.

### Exact Notion property matrix

| Property | Podujatia | Pomoc psom — help cases |
| --- | --- | --- |
| Názov | title | title |
| Typ podujatia | text | absent |
| Kategória | absent | text |
| Stav | select: Nápad, Na kontrolu, Ready, Publikované, Archív | absent |
| Psipedia stav | absent | text; canonical adapter accepts draft/published |
| Sync stav | select: Neodoslané, Čaká na sync, Synchronizované, Chyba | select: Synchronizované, Chyba |
| Začiatok, Koniec | date | absent |
| Čas začiatku, Čas konca | text | absent |
| Mesto, Miesto, Perex, Popis, Slug | text | text |
| Organizátor | text | absent |
| Organizácia, Kontakt | absent | text |
| Web, Registrácia, Zdroj dát | URL | absent |
| CTA URL | absent | URL; **action, not necessarily a source** |
| Zrušené | checkbox | absent |
| Urgentné, Vyriešené | absent | checkbox |

Schema metadata does not establish that any particular field is populated or encode global required-field rules; operational requirements come from canonical adapters and the external validator. Sync stav is **not** editorial approval.

### Existing taxonomy, code and category routing

* lib/events.ts defines six types: Výstava, Preteky, Seminár, Tréning, Stretnutie, Iné. scripts/gemini-notion-category.mjs already maps the six public slugs to those exact singular strings. **Typ podujatia is text, not select**. Unknown slugs must fail.
* lib/help-admin-query.ts: generic help-case categories are **docasna-opatera, zbierky, dobrovolnictvo**. The catalog also contains **adopcia, utulky, stratene-a-najdene**, which use distinct existing adoption, organization and lost-found sync definitions in lib/notion-events-help-sync.ts. They must not be sent to the help-case data source. The helper rejects them rather than silently misclassifying records.
* lib/notion-events-help-adapters.ts maps event Nápad/Na kontrolu/Ready to canonical draft and Publikované to published. Help-case canonical creation requires title, **slug** and category. The external help-case draft helper intentionally omits Slug so human review is required before sync can import it.
* lib/gemini-automation-event-contract.ts, lib/gemini-automation-event-dedupe.ts and lib/gemini-automation-event-bridge.ts apply to the older, **internal D1-first Gemini event flow**. They are **not** imported by the external Notion-first agent and were not duplicated or altered.
* The external scripts/gemini-notion-agent.mjs currently requires a select/status editorial field and is incompatible with the live **text** Psipedia stav in Help. Its tool arguments also lack field-linked evidence and an explicit event organizer. **Task 06 must integrate and supply these generic-worker requirements** before Events/Help can be enabled. This task deliberately does not edit the generically owned script.

### Actual Notion row checks and limits

A read-only grouped query of Podujatia returned the event types Preteky, Výstava, Iné and Tréning, with editorial states Publikované, Nápad and Archív. This does not imply all six supported types have existing rows.

The Notion query_data_sources usage limit was reached before the help-case row query. **Still unverified:** live distinct values of Help Kategória and Psipedia stav, existing-page duplicates and contacts, slug uniqueness and configured integration-token access. The complete live acceptance cannot be claimed. No field, value, select option or source was invented.

### New pure worker-facing helper (NOT connected yet)

scripts/gemini-notion-events-help-fields.mjs exports:

* **buildNotionEventsHelpDraft({ section, subcategory, args, properties, rows, scanComplete, today })**: validates category, content, linked evidence, Notion REST property types/options and returns draft-only Notion REST properties. Requires fresh live data-source metadata, a complete paginated page snapshot, and an explicit real Europe/Bratislava date for event comparisons.
* **assertNotionEventsHelpUnique({ section, args, rows, scanComplete })**: conservatively blocks same-name/date/city/source or ambiguous duplicates. A full scan is compulsory. It is **not** a replacement for the worker's final fresh scan immediately before create, nor for existing internal D1 duplicate detection.

Candidate args.evidence must list source_url + fields for every essential fact and resolve to direct public HTTPS documents in source_url / optional source_urls. This is a **shape/provenance validation**, not proof an AI's claim is true: task 06 must establish genuine Search evidence before invoking this helper. Missing organizer/location, invalid/past start date, unverified optional field, unsupported field types, unknown options, unsafe source URLs and incomplete duplicate scans all throw specific GEMINI_NOTION_CATEGORY_* codes.

Events serialize singular text type, exact start date and Stav=Nápad. Help cases serialize Kategória and **text** Psipedia stav=draft; source links are appended to Popis because the live Help data source has no Zdroj dát field. Help drafts intentionally omit Slug. Neither flow writes Publikované, Ready or Sync stav; no HTTP call or publish operation occurs in this helper.

### Required follow-up and acceptance

1. **Task 06:** wire this pure helper into the existing generic worker after extending function arguments for evidence and event organizer, supporting the live text Help draft status, obtaining a genuine Bratislava date and enforcing a fresh final complete duplicate scan. Preserve generic continuation, callback, safety toggles and billing protections.
2. **Notion:** retry read-only Help data-row verification after query quota resets and confirm deployed NOTION_HELP_DATA_SOURCE_ID points to the multi-field source. Route dedicated help categories only to the correct **already existing** agendas, after a separate audit.
3. **Tests:** run node --test tests/gemini-notion-events-help-fields.test.mjs and affected repository CI. After integration and Notion acceptance, require a separately approved one-concept manual live test. Do not enable paid or scheduled execution here.

**Safety boundary:** only an isolated category helper, offline unit tests and this audit. No PR merge, production writes, auto-publishing, migrations or paid API calls.
