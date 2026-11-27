# Breed V2 legacy content

Existing text-only sports lists are imported with deterministic keys, original labels and null ratings. No editorial rating is invented. Admin can rate them explicitly; public detail does not display a numerical score for null. Existing rated JSON remains supported. Invalid/truncated/ambiguous lists stay under review.

Only exact historical concatenations with every suffix already present in the canonical independent field (and mapped Notion sibling where applicable) can be removed from the legacy Notion cell. Unknown/different content stays REVIEW. Check fresh mapping, revisions, receipts, scope invalidation, manual fences, reservation and post-write echo. Notion has no atomic CAS. Canonical D1 prose is untouched. This is not blanket D1-wins.

Breed recovery cursor encodes catalog signature + index in the existing field_offset integer; old offsets and changed catalogs restart the breed scan once, no SQL migration. Existing bounded cron unchanged. CI and production validation required; no live writes in this PR.
