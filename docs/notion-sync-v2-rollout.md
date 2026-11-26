# Notion Sync V2 rollout (post-1606)

## Production evidence reported by owner
- 0178–0181 applied manually in D1 console. 8 tables, 3 indexes, 21 triggers; quick_check ok, foreign_key_check no rows.
- Admin status and conflicts screens report SQL evidence available, V2 OFF; eight agendas listed and no field evidence yet.
- These observations establish schema presence, not data parity or functional production testing. Actual DDL equivalence and trigger execution in D1 are not independently verified.
- d1_migrations last reported 0162 despite later manual changes. Do NOT run the full migration chain blindly or insert fabricated history. Reconcile historical drift separately.

## Release gate
- Numbered migrations are additive copies of reviewed proposals; no Drizzle journal/snapshot edits. Historical proposal files kept as reference, runtime regression tests read numbered migrations.
- Verify targeted CI and actual D1 trigger definitions. Test safely with isolated data; do not mutate live records merely to test triggers.
- Keep NOTION_UNIFIED_FIELD_SYNC_ENABLED unset/false until owner explicitly approves. Existing cron seeds at most one rotating new field per minute across all eight agendas; initial equality is not full-profile parity. Inspect diagnostics and progress, existing locks, manual transfer and provider errors.
- No atomic provider-side PATCH CAS; unproven concurrent edits must remain REVIEW. Partner/review unlock transitions, relation renames and external logo aliases remain explicit end-to-end checks.
- Coordinate/pause editorial writers for controlled pilot, test both directions in all eight agendas, check explicit clears and locks. Rollback by disabling V2; keep legacy adapters until parity verified. Do not remove legacy or enable V2 in this PR.
