# Gemini concepts: published cleanup and future SEO slug migration

## New behavior (no production changes in this PR)

- The 22 Gemini review categories still use authenticated Notion-backed read endpoints; canonical D1 status is the only authority for publication. Notion **APPROVED** and canonical **IMPORTED** remain active.
- Canonical public status rules: directory `published`, events `published`, organizations `PUBLISHED`, adoptions `ACTIVE`, help-cases `published`, lost-found `ACTIVE`/`RESOLVED`. A mapped row must exist in the canonical table. Sync errors remain visible in the category editor.
- Default category and central views show active items and active counts; `Všetky stavy` and `Publikovaný` retain history. Concurrent/older HTTP responses cannot replace a state already confirmed as published in the same mounted view. A full reload uses fresh D1 authority.
- New provenance-verified Notion imports derive a Slovak-normalized slug from name and city, with a stable Notion identity suffix. When short suffix collides, use the full Notion ID; an unresolved collision fails without overwriting a profile. Custom non-`gemini-` slugs are preserved. D1 remains unique authority. Canonical slug for already imported Gemini records is not overwritten on later Notion pulls.
- Existing published addresses are **not** renamed. No migrations, Notion PATCH, deployment, paid Gemini calls or redirects are executed by this PR.

## Historical URL migration: separate approval required

1. **Read-only D1 audit:** on the actual production D1, run the following read-only count (no writes). Confirm schema and access before running. Count currently **unknown**; repository data cannot supply a production total.

```sql
SELECT 'directory' AS type, COUNT(*) AS total FROM directory_profiles WHERE status='published' AND slug LIKE 'gemini-%'
UNION ALL SELECT 'events', COUNT(*) FROM managed_events WHERE status='published' AND slug LIKE 'gemini-%'
UNION ALL SELECT 'organizations', COUNT(*) FROM help_organizations WHERE status='PUBLISHED' AND slug LIKE 'gemini-%'
UNION ALL SELECT 'adoptions', COUNT(*) FROM adoption_dogs WHERE status='ACTIVE' AND slug LIKE 'gemini-%'
UNION ALL SELECT 'help-cases', COUNT(*) FROM help_cases WHERE status='published' AND slug LIKE 'gemini-%'
UNION ALL SELECT 'lost-found', COUNT(*) FROM lost_found_dog_reports WHERE status IN ('ACTIVE','RESOLVED') AND slug LIKE 'gemini-%';
```

2. Export exact current URL, canonical ID/status, category/type, slug, canonical URL metadata, corresponding Notion mapping, source/trusted-provenance evidence and candidate destination. Include historical Gemini bridges and possible manually created `gemini-` slugs; avoid treating text-only Notion creator as trusted identity.
3. Dry-run proposed names. Check uniqueness across the corresponding entity namespace and destination public routes, existing redirects, portal reserved slugs, and whether two historical URLs would target the same destination. Require operator approval of every mapping.
4. In a separately reviewed PR, introduce **permanent HTTP 301** redirects before changing any published slug. Keep old routes resolving, avoid chains/loops, preserve query strings, and test exact variants including encoded characters. Store a stable old → new mapping with rollback support. Do not rely on temporary client redirects.
5. In a controlled, reversible release, update DB slug, canonical metadata, structured data, internal links, sitemap entries and Notion mirror mapping together. Ensure changes to Google-confirmed places, media or other protected fields are excluded. Validate public route 200 and old URL 301, GSC indexing/crawl behavior, analytics and sitemap. Do not use 404, 302, or mass rename without individual verification.
6. Roll out in small batches after verifying zero broken links and correct 301 targets. Preserve mappings indefinitely; stop and roll back if any 404 or canonical conflict appears.

No historical migration is implemented here. Audit coverage also needs inactive/archived Gemini pages when planning future restoration, although the live published count above scopes only public URLs.
