# One-time breeder relations cutover (before #1414)

The production audit #44252717336 reported 223 old breed relations, 0 new station/club relations and 619 mapped profiles. Notion separately reported 32 non-empty text fields on 25 profiles. No profile, breed, service, or editorial record is to be removed.

1. Merge this workflow only after mandatory migration tests pass. No schema/data writes occur on merge.
2. Dispatch **audit** on main; compare latest report to the reviewed fingerprint.
3. Dispatch **freeze**, with that fingerprint and explicit confirmation. Six narrowly scoped D1 triggers prevent new/updated breed relations for stations/clubs, new/updated station-club relations, and modifications to the old station-club JSON key. Existing relations remain unchanged. A Time Travel bookmark is recorded. If any trigger fails, stop and audit; partial installation is visible and a subsequent reviewed freeze can complete it.
4. While frozen do not edit breed selections, breed records with old directory relations, or remove affected profiles/plemena. Existing normal profile fields can still be edited; the old breed editor rewrites relationships, so editing such a breed may be rejected. Existing deletes are not blocked by the freeze; any resulting drift invalidates the reviewed fingerprint. Do not run this cutover during unrelated migration/deploy work.
5. Verify and clear only the 32 historical Notion text fields (fresh count and identity check first). Re-read them and check for queued writebacks before proceeding. Neither this workflow nor a merge changes Notion. Keep editors from editing these two Notion fields until release.
6. Dispatch **reset** only after Notion verification, using the exact frozen fingerprint and dedicated verification confirmation. A single bound DELETE compares both exact full ordered row snapshots and the new table count in SQLite before deleting scoped rows. It cannot delete other categories or any profile/plemeno. Fresh receipt checks changed count, zero targeted links, unchanged other links, unchanged mappings, unchanged DDL and ledger. There is no generic migration or ledger write. A second invocation cannot reset an empty table or a different fingerprint.
7. Keep freeze guards installed until #1414 is deployed and tested. A separate reviewed release step must remove only the six exact named triggers after confirming the new runtime and absence of Notion replay. Do not lift the freeze just because reset succeeded.
8. Verify Admin, Notion and public web, then allow new manual links.

Recovery: before reset, a verified Time Travel bookmark is captured. If results differ, stop; do not retry blindly or restore the whole database without review. Existing profile records are not changed by these operations.

Cloudflare REST query calls use a single SQL statement each; the code does not assume atomicity across REST batch calls. The destructive statement is itself atomic. The workflow is manually dispatched, canonical account and database IDs checked, main-only protected environment, and serialized against existing D1 migration workflows.
