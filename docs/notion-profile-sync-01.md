# NOTION-PROFILE-SYNC-01 — authority and safety contract (Draft)

## Scope
One existing Directory synchronizer for 10 service categories; one existing
Events/Help synchronizer for 6 Event and 6 Help subcategories (organized through
the canonical adapters `events`, `organizations`, `adoptions`, `help-cases`,
`lost-found`). These are **not** separate new databases or editors.

| Agenda | Editable synchronized fields | Canonical-only / protected |
| --- | --- | --- |
| Directory (10 categories) | Name, excerpt, description, services, qualifications, price, website, public phone/email, socials, image, editable SEO | Psipedia ID, slug, category, public status, quality moderator decisions, featured/verified, internal contact, SEO noindex; exact canonical/GEO location when verified |
| Events (6 categories) | Name, dates, practical information, description, registration/website, media, editable SEO, unconfirmed location | Psipedia ID, slug, status, event type/category, current Google Place/address, GEO |
| Organizations | Name, legal name, description, website, socials, normal public metadata | Psipedia ID, slug, status, confirmed Google location, private GEO |
| Adoptions | Name, breed and dog description, non-sensitive editorial metadata, image | Psipedia ID, slug, status, organizational ownership/moderation, private contact |
| Help cases | Title, editorial explanation, CTA and allowed SEO, non-moderation fields | Psipedia ID, slug, status, category/domain ownership, resolved/urgent moderation |
| Lost / found | Name, editorial description and allowed public metadata | Psipedia ID, slug, type, status, sensitive last-seen place, exact coordinates, contact privacy, source identity |

The explicit field inventories remain defined in
`lib/notion-directory-sync.ts` (Directory snapshot) and
`agendaEditableFields` in `lib/notion-events-help-adapters.ts`.
The cross-system mapping tables remain `directory_notion_sync`,
`event_notion_sync` and `notion_agenda_sync`. No second public profile
catalog or new editor is introduced.

## Evidence model

- Hashes in existing mapping tables are **record-level** and are not a
  per-field change history.
- Notion page `last_edited_time` and D1 `updated_at` are insufficient for
  LWW because automated synchronization advances both timestamps.
- An optional new **verified common baseline** is stored in
  `notion_profile_field_baselines`, bound by agenda, canonical entity ID,
  Notion page ID and source hash. A mismatch disables automatic reconciliation.
- **No additional D1 migration is needed for one-sided changes.** When
  one current editorial snapshot hashes exactly to the last acknowledged
  mapping hash, that unchanged side authenticates the common baseline.
  One-sided changes can therefore reconcile safely using existing tables;
  explicit deletes and canonical-only fields still fail closed.
- If both current snapshots are identical, that equality independently proves
  their common values without overwriting either system.
- A stored, hash-verified per-field baseline is **optional** for merging
  independent changes when both sides diverge from the mapping hash. Without
  it, simultaneous divergent changes remain an explicit conflict for review.
  Neither record-level timestamp proves human edit order.
  **Current automatically resolved LWW fields: NONE.**
- Empty / omitted Notion values never prove explicit human deletion of filled
  content. An authorized field-specific deletion receipt would be required;
  this PR introduces no new such editor action or revision capture.
- Without either a hash-proven unchanged side or a verified stored baseline,
  two-sided divergent edits, wrong identity, same-field concurrent edits, or
  deletions without receipts require explicit human review. No speculative winner.
- Protected publication, identity, confirmed Google Places, sensitive GEO,
  canonical moderation decisions and private contacts cannot be modified
  through ordinary Notion synchronization.

## Migration activation

`docs/proposals/notion-profile-field-baselines-UNNUMBERED_PROPOSAL.sql` is **staged source**
outside `drizzle/`: it does not alter the pinned canonical production
migration chain or authorize an apply. **Production does not need this
proposal for existing one-sided synchronization.** The helper detects a
missing table and uses the authenticated unchanged side for that common
baseline; only two-sided divergent field merges still require separately
reviewed storage or manual conflict resolution.
Production API calls, sync, flag activation, migrations and deployment are
**out of scope for this Draft PR**.

## Further requirements before release

1. Confirm the existing D1 + Notion mapping audit, legacy conflicts,
   categories and canonical editor ownership across all 22 categories.
2. Implement trusted per-field human-edit receipts in **existing** Admin
   save flows and corresponding Notion change capture before permitting
   timestamp/revision-based LWW or explicit deletions.
3. Confirm that returned Notion PATCH properties match canonical snapshots
   before advancing baselines; rerun staging offline/fixture tests and
   independently review older mappings.
4. Review staged SQL and schema readiness; plan rollback, backup, sequencing
   and a separately approved D1 migration before enabling normal field merges.
5. Do not enable either existing Notion-priority feature flag as an alternative
   to provenance. Do not infer production acceptance from CI.
