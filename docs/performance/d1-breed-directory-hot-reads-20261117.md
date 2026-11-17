# PSIPEDIA — D1 canonical breeds / directory hot reads (2026-11-17)

## Production evidence (before any changes)

Source: owner-supplied `wrangler d1 insights psipedia-sk-db --time-period 1d --sort-type sum --sort-by reads --sort-direction DESC --limit 20`. The export is a **top-20 ranking**, not a complete D1 invoice. Aggregate D1 dashboard showed approximately 646M rows read and 1.16M queries in the same displayed period; actual windows must be aligned before claiming precise shares.

| SQL family | Executions | Rows read | Average rows per execution | Avg SQL duration |
| --- | ---: | ---: | ---: | ---: |
| Canonical breeder filter option names | 1,762 | 333,144,286 | 189,071 | 36.51 ms |
| Directory source metadata facet aggregation | 1,994 | 69,047,959 | 34,627 | 73.48 ms |
| Linked breeder-card breed names | 2,500 | 18,949,552 | 7,579 | 10.45 ms |

The first two families alone read **402,192,245 rows**. This is strong evidence of inefficient **read projections**, not evidence that the data is corrupt or that Gemini/Notion caused `Network connection lost`.

## Root cause in the repository

The public directory reuses `canonicalBreedIdsSql` (three window minima over all eligible `managed_breeds`) within:

1. `loadCanonicalBreedOptions`, evaluated on public directory listing reads.
2. `DIRECTORY_SOURCE_FACETS.breed` inside `directorySourceFacetStatement`, which aggregates over published directory profiles.
3. `attachBreederCardBreeds`, invoked for breeder cards.

The same canonical eligibility and three identity keys are correct semantically but expensive to recalculate repeatedly inside these hot paths.

## Change

- Preserve **exact SQL eligibility** via `canonicalBreedEligibilitySql` in one narrow, read-only D1 projection: `id, fci_number, slug, TRIM(import_key)`.
- Compute minimum ID for each identity key over **all eligible rows**, not just winners; a losing row still disqualifies a later candidate sharing another key.
- Pass only the resulting canonical IDs through a parameterized `json_each(?)` list to the hot directory queries; reuse this read once for both option queries and displayed breeder cards on the same listing.
- Keep source-data fallback semantics, category-scoped options and secondary category membership.
- No cross-request cache, no schema migration, no Admin/Notion authority change, no D1 writes, no retry/fallback introduced.

## Verification

- `node --experimental-strip-types --test tests/d1-canonical-breed-cost.test.mjs tests/directory-read-facets.test.mjs tests/directory-breeder-preview-step3.test.mjs`
- Local SQLite equivalence test includes duplicates by FCI, slug and normalized import key, ineligible/noindex rows and a profile in multiple categories. Local SQLite performance *cannot establish production D1 row counts or network errors*.
- Review `EXPLAIN QUERY PLAN` for the prepared parameterized public option queries; the hot SQL should no longer contain three `MIN(...) OVER (PARTITION BY ...)` windows.
- After review and deployment, capture D1 Insights over an equivalent 24-hour period (similar requests and URL mix). Compare **per-execution rows read**, SQL duration and total execution count for the three SQL families. Also compare Workers 5xx/error-rate independently.
- Acceptance requires unchanged visible breeder/card/category filters, canonical winners and published SEO eligibility. Production reduction is **unverified until measured**.

## Separate unresolved incidents

- Cloudflare `Network connection lost` was seen on public `.rsc` requests. A link to this SQL cost has **not** been proven.
- Hourly `notion_article_publication_reconciliation_failed` messages were observed; their root exception category is unavailable in the supplied logs. Do not automatically alter publication state or Notion data during this performance change.
