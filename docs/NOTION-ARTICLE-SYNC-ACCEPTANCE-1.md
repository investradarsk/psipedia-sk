# NOTION-ARTICLE-SYNC-ACCEPTANCE-1 — audit and safe importer recovery

Date: 2026-10-13. Baseline: `b352aac08c070ccf201d58c352a146aaf780d607` (`main`).
PR #793 and #796 were merged; 0 open PRs at the start of this audit.

## Read-only Notion evidence

Authoritative data source: Editorial Hub → Články,
`collection://ae042534-c878-427e-bc76-ef587a8c61cf`.
The following counts came from **current read-only grouped SQL**, not the 19-entry historical audit:

| Selection | Count | Interpretation |
| --- | ---: | --- |
| `Stav=Ready`, `Odoslať na Psipedia=true` | 19 | Eligible for automatic sync |
| Eligible + `Sync stav=Synchronizované` | 6 | Notion records contain Psipedia IDs 2237–2242; last sync 2026-10-13 21:00 UTC |
| Eligible + `Sync stav=Chyba` | 13 | All 13 have identical “missing Článok — draft” parser error, no Psipedia ID |
| Eligible + `Sync stav=Čaká na sync` | 0 | No eligible items in this Notion state |
| `Stav=Ready`, send disabled, `Sync stav=Chyba` | 30 | Historical errors; explicitly excluded by PR #793 |
| `Stav=Ready`, send disabled, `Sync stav=Synchronizované` | 3 | Not currently eligible; do not re-import |

All 13 failing Notion page bodies were inspected read-only. Each contains actual initial paragraphs and multiple H2 article sections, but does not begin with an H2 `Článok — draft`. This is an importer format incompatibility, not evidence of empty articles. Some include embedded tables, callouts and source references. Old marker-delimited documents remain supported. New markerless documents are accepted only if they begin with a nontrivial paragraph followed by >=2 H2 sections. Both formats stop before editorial-only `SEO`, `Pred publikovaním`, or `Psipedia bloky` headings; manifest parsing remains separate.

## Implementation safeguards

- The sync still reads no more than 100 Ready + explicitly opted-in articles per sweep.
- `article_notion_sync.notion_page_id` stays primary key; `article_id` stays unique, preserving one-to-one identity.
- Existing published/scheduled articles remain immutable to auto-import; all incoming articles are Draft.
- A mapped Draft that has been edited by a different Admin actor now **fails closed** on attempted changed-content replay. The original editor's changes are not overwritten.
- A mapped Draft updated between the sync read and DB write is rejected by the existing `updated_at` / Draft optimistic precondition. The prepared R2 image is cleaned up on failure.
- Existing promo-block preservation, current image, taxonomy and SEO safety remain in place.
- No automated Notion property changes, manual import, production D1 mutation, forced Ready status or publication were performed during this PR.

## Acceptance checks

```sh
node --test tests/notion-article-sync.test.mjs
```

Added regression coverage for markerless content, source boundaries, legacy markers, unsafe/incomplete bodies and admin-edit / concurrent-edit guards. Tests are code/fixture checks; they are **not** substitutes for a live D1 or Cloudflare runtime check.

## Remaining production acceptance (read-only first)

1. Verify the deployed Worker includes this commit and the configured full-hour Cron continues to run; inspect `notion_article_sync_started`, `notion_article_sync_sweep` and per-page error logs from PR #796.
2. Verify expected bindings (DB, R2, Notion token and data-source ID) by booleans in runtime logs, without disclosing secrets.
3. Query production D1 **read-only** for `article_notion_sync` rows and managed article statuses matching the 19 Notion IDs, to confirm absence of orphan/duplicate mappings and preserve existing Admin edits.
4. Only after merge/deployment, observe the next normal scheduled sweep and re-query Notion counts. Do not force an import or bulk edit without approval.
5. If any of the 13 still fail, triage per-page errors (remote image retrieval, slug conflicts, mapping conflicts, missing bindings, or unsupported blocks) independently; do not assert all 13 will import just because their root parser error is fixed.

**Blocker:** this ChatGPT session has no authorized production Cloudflare D1 / Worker deployment, binding or log reader. Therefore imported Admin/D1 counts and absence of duplicates in production are unverified. Six sync confirmations and 13 errors above are from Notion state only.
