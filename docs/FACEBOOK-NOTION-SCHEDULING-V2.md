# FACEBOOK ↔ NOTION SCHEDULING V2 — isolated, OFF by default

Status: **Draft implementation only. Not approved for merge, deployment or activation.**
This branch changes only Facebook Images scheduling; no other Notion database or Gemini workflow is touched.

## Activation (requires separate approval)
The new behavior activates **only** when BOTH variables are valid:

- `NOTION_FACEBOOK_IMAGES_SCHEDULE_V2_ENABLED=true`
- `NOTION_FACEBOOK_IMAGES_SCHEDULE_V2_CUTOVER_AT=<explicit UTC ISO-8601 instant>`

Neither variable is set in the repository deployment configuration. With the flag off, existing legacy approval semantics remain unchanged. A missing/invalid cutover fails closed. Cutover is the timestamp after which a **Notion edit** can authorize a schedule; old Notion pages are not silently made publishable. Do **not** enable until the owner has reviewed all live D1 scheduled rows, Notion page identities, pending/uncertain attempts, the main STOP and Meta credentials. Existing historic due entries remain governed by their current D1 eligibility.

## Authorized operation
A new valid image and explicit timestamp from the dedicated Notion Facebook Images source authorize a D1 scheduled row after cutover. The separate Notion checkbox is informational and does not provide additional authority. Admin scheduling with a valid image and timestamp becomes approved under the same opt-in flag. The Meta publisher STILL requires main STOP=ON, valid technical credentials/flag, due time, a matching post version, and unique attempt claim. A date alone without an image is never publishable. Caption is optional and the internal title receives a safe fallback.

A Notion edit after cutover wins over an older Admin edit; otherwise D1 remains authoritative. Ambiguous/missing timestamps do not overwrite an admin-owned row. Incoming published/attempted records are immutable. Cancellation by clearing the Notion datetime (or changing a previously mirrored scheduled status to Concept) clears the D1 schedule and retains the post. Changing a pre-existing Notion page **after its due time** to introduce a past date is not treated as a trustworthy outage catch-up. Previously scheduled dates edited before the due time may catch up after a service outage.

## Time and media
Notion dates require an explicit zone offset; converted instants are stored in UTC. Admin continues using the existing validated Europe/Bratislava DST disambiguation. Notion file identity is stable across expiring signed file URLs; media are copied to R2 before the D1 schedule becomes eligible.

## Integration limitations and rollout checks
- The schedule writer may mirror state to Notion using the already existing sync pipeline; these are **production writes** and must remain disabled until separate owner approval.
- Notion conflict resolution uses record-level last-edit timestamps rather than per-field merges. The owner must review any unresolved concurrent edits during a pilot.
- Existing 100-item Notion import and 20-item admin outbound throughput limits remain; durable pagination is not introduced.
- No Meta POST, Notion PATCH, production D1 migration, deployment or flag activation is performed by the PR.
- Before any live pilot: read-only list of historical scheduled, uncertain and published D1 rows; verify Notion linkage, current Cloudflare deployment SHA, STOP and feature flags; then explicitly authorize exactly one controlled test item.
- Run `npm run test:notion-facebook-images`, `npm run test:facebook-images`, `npm run test:facebook-publisher`, `npm run build`, and review GitHub CI.
