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
- A verified common baseline permits independent edits to separate fields to
  merge in either direction. It does **not** prove edit order for changes to
  the same field. **Current automatically resolved LWW fields: NONE.**
- Empty / omitted Notion values never prove explicit human deletion of filled
  content. An authorized field-specific deletion receipt would be required;
  this PR introduces no new such editor action or revision capture.
- Without a baseline, conflicting snapshots, wrong identity, same-field
  concurrent edits, or deletions without receipts, reconciliation requires
  explicit human review. It must not select a winner.
- Protected publication, identity, confirmed Google Places, sensitive GEO,
  canonical moderation decisions and private contacts cannot be modified
  through ordinary Notion synchronization.

## Migration activation

`docs/proposals/notion-profile-field-baselines-UNNUMBERED_PROPOSAL.sql` is **staged source**
outside `drizzle/`: it does not alter the pinned canonical production
migration chain or authorize an apply. Until an independently reviewed and
approved rollout places an equivalent migration in that chain, the helper
detects that the table is missing and safely refuses divergent field merges.
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
