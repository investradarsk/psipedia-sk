# NOTION-ARTICLE-SYNC-01 — editorial content writeback (Draft PR)

Baseline (2026-10-20): main c58aec64995d95eea0edce0805dd415775874da0. Related merged PRs: #806, #807, #826, #845. Coordination: #917.

## Field-level inventory

| Editorial data | Before | Draft implementation |
| --- | --- | --- |
| Notion title / Názov | Import only | Import + guarded Admin PATCH to existing Notion title |
| Intro / first paragraph | Import rich text | Import + guarded update of existing paragraph slot |
| H2/H3, paragraphs, quotes, callouts | Import | Same-slot update with order and rich text retained |
| Bullet/numbered lists | Import and grouping | Same-slot list-item edits/order only; additions/removals blocked |
| Image block URL/caption | Import external | Same-slot external HTTPS image edits; mismatched alt/caption blocked |
| Main image URL/alt/source | Import to R2 | Guarded Notion property PATCH; preserve origin when R2 source hash matches |
| SEO title, description, focus keyword | Import | Guarded property PATCH |
| OG title/description | Imported indirectly as SEO defaults | PATCH only if matching columns actually exist on Notion page |
| Canonical URL, noindex, OG image, editor-only taxonomies | Admin-only; no corresponding live Notion columns | Never fabricate Notion columns or silently round-trip |
| Published status, URL and date | Existing publish writeback | **Unchanged**, independent lifecycle |
| Slug, subsection, category | Import and canonical placement | No automatic reverse rewrite (identity, routing, public URL protection) |
| Notion-only QA, author person, research metadata | Remains in Notion | Preserved, never overwritten |
| Tables | Import | Read-only; changed table layout/data fail closed |
| Admin promo/gallery/CTA/source/related blocks | Notion manifest or Admin-only | Fail closed for editorial body writeback; no dropping or flattening |
| New/deleted blocks or changed block types | Not safely round-trippable atomically via Notion API | Fail closed; no destructive rearrangement |

This is a deliberately bounded implementation, **not** a claim that arbitrary article structures can already round-trip. In particular, structural insert/delete/reordering across different block types, table editing, and unsupported Notion annotations remain release blockers for fully general writeback.

## Execution, recovery and conflict safety

The editor's existing canonical PUT remains the only place where an Admin draft save occurs. The writeback is post-commit, best-effort and gated independently by \`NOTION_ARTICLE_CONTENT_WRITEBACK_ENABLED\` (unset/false by default) as well as existing \`NOTION_ARTICLE_SYNC_ENABLED\`. No scheduler or mass backfill invokes it.

1. Only an existing one-to-one mapping and live \`draft\` row with matching \`updated_at\` pass. Notion must still be \`Ready\` with explicit \`Odoslať na Psipedia\`, and its \`Psipedia ID\` cannot point elsewhere. Published, effectively published and scheduled content are excluded.
2. A fresh Notion content hash is compared with the last committed \`article_notion_sync.content_hash\`. An unknown baseline or a concurrent remote content edit results in conflict; changes to synchronization metadata alone do not count as human edits.
3. Construct a complete, fail-closed preflight plan; the core only PATCHes preexisting block IDs. Unsupported structural alterations reject the **entire** attempt before the first Notion PATCH. For supported updates, store original and target values in the new \`article_notion_editorial_outbox\` before any network mutation.
4. For each property and block, re-read the remote value. It must match the recorded preimage or the intended result. Unrelated values are a conflict. Re-read the authoritative D1 article revision before each mutation.
5. A failed API call leaves the journal in place. On retry of the **same** Admin revision, already updated fields are skipped and untouched fields may continue; subsequent Admin revisions cannot supersede the pending journal. Import sweep refuses pages with a pending journal. There is no false last-success marker on a partial mutation.
6. Read back the whole page and confirm the resulting supported projection. Only then update the existing mapping content hash (to prevent ping-pong import), write the Notion sync receipt and remove the journal. A failed receipt leaves the journal for a retry.

A single Notion page PATCH is atomic for the submitted properties, **but Notion does not provide CAS / multi-block transactions**. There is a residual final GET→PATCH race against a simultaneous human Notion edit. Do not enable automatically. Review this limitation and test the actual production schema/API behavior before any opt-in.

The importer remains draft-only. No automatic publication, status rollback, slug rewrite, manual conflict resolution, or requeue of 35 historical errors / 21 unlinked pages is authorized.

## Deployment and acceptance blockers

- The article outbox SQL is only a **staged proposal** at \`docs/proposals/0136_notion_article_editorial_outbox.sql\`, not in the active \`drizzle/\` production migration chain. Facebook PR #923 owns migration 0135 (merged to main); before activating article writeback, independently verify 0134/0135 production schema and approve a sequential 0136 migration as a separate rollout. This PR does not approve or apply any migration.
- Confirm live Notion Editorial Hub property types (especially OG) read-only, and verify real content block API semantics with synthetic pages, not published articles.
- Check the D1 mapping baseline, skipped blocks, R2 source fingerprints, articles with Notion manifests, table children and multimedia formats. Review any unsupported/partial cases individually.
- Validate the bounded test suite, CI build, and a read-only scan of draft mappings and outbox count. Start only with a specifically approved synthetic/controlled draft after separate authorization.
- The flag must remain **off** pending all acceptance checks. A Draft PR is not permission to merge or deploy.
- Do not label general two-way article content synchronization "complete" while unsupported structural round trips or last-millisecond Notion write races remain.

## Local/offline tests

\`node --experimental-strip-types --test tests/notion-article-content-writeback.test.mjs\`

\`node --test tests/notion-article-sync.test.mjs tests/article-publish-notion-reconciliation.test.mjs\`

Existing Notion sync CI must run tests, migration safety and full build. Record actual results in the PR once GitHub Actions publishes them.
