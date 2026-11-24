# V6-08: read-only Notion audit incident analysis (2026-11-24)

The classifier emitted 20 fixed error kinds, but triage accepted only 17. MISSING_VERIFIED_BASELINE, SERVICE_RELATION_UNVERIFIED_DELETE and SERVICE_RELATION_SYNC_ERROR raised INVALID_NOTION_QUALITY_EVIDENCE, caught at TRIAGE as NOTION_AUDIT_UNAVAILABLE.

A separate read-only Notion connector query of the first 100 directory records ordered by createdTime returned aggregate counts only: 8 matching unverified service-relation deletions, 0 baseline-unavailable and 0 other matching relation errors. This confirms a real trigger in that sample, not the stage of a particular production HTTP incident. Equal timestamps and concurrent edits can change the API sample.

All six canonical schemas were found in Editorial Hub. Help cases and Lost/Found each have a legacy Name-only data source and a separate source with Názov, Psipedia ID, URL Psipedia and sync fields. Directory, Events, Organizations and Adoptions have the expected identity and title fields. Connector permissions are independent of the Worker token.

## Read path

Admin auth and dry-run validation -> configured or persisted source/limited schema discovery -> Notion API 2025-09-03 data-source query, max 100, created-time order -> envelope and cursor validation -> bounded D1 identity/baseline reads -> independent analysis and triage -> sanitized receipt. Two passes are observations, not a stable snapshot.

| Agenda | Canonical D1 | Mapping |
| --- | --- | --- |
| Directory | directory_profiles | directory_notion_sync |
| Events | managed_events | event_notion_sync |
| Organizations | help_organizations | notion_agenda_sync |
| Adoptions | adoption_dogs | notion_agenda_sync |
| Help cases | help_cases | notion_agenda_sync |
| Lost/found | lost_found_dog_reports | notion_agenda_sync |

Shared mapping is scoped by agenda. Existing reader selects IDs and baseline metadata, not retired JSON columns. Existing migration-based SQLite tests check mapping columns. Incomplete D1 responses are UNKNOWN. Discovery caps: five search pages, eight candidates, 30-second Notion budget, SDK timeout up to eight seconds per call, no automatic retry; pacing and D1 latency can add elapsed time. Client deadline 45 seconds. No unbounded candidate scoring scans.

## Production blocker

Worker logs, live D1 schema, deployed secrets/bindings and the failing request are unavailable. No production endpoint, import, export, sync, manual transfer, migration, database repair or Notion mutation was invoked. Production incident closure requires an authorized post-deployment read-only verification. No IDs, private content or credentials recorded here.
