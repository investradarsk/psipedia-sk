# Automation operations metrics

AUTOMATION-OPERATIONS-2 adds a read-only operations view under `/admin/automatizacie/prehlad`.
The dashboard reads stored automation history only. Opening it must never run discovery,
source monitoring, Tavily, Geoapify, or canonical writes.

## Metric definitions

- `requestCount`: actual provider requests from `automation_search_usage.request_count`.
- `resultCount`: provider search results from `automation_search_usage.result_count`.
- `candidateCount`: candidates after discovery normalization/filtering.
- `canonicalDuplicateCount`: a candidate matched an existing canonical record.
- `newEntityCount`: a new canonical DRAFT was actually created by DIRECT_ENTITY ingestion.
- `updateSuggestionCount`: an update suggestion was actually created/refreshed.
- `possibleDuplicateCount`: a new DRAFT was created with a possible-duplicate warning.
- FEED_SOURCE `new_finding_count` is labelled **Nové zistenia**, not **Nové koncepty**,
  because the historical counter is not a canonical CREATE_DRAFT counter.

Search usage with `operation_key LIKE 'address-enrichment:%'` is shown separately from
normal discovery search usage.

## Historical NULL semantics

Columns introduced by AUTOMATION-OPERATIONS-2 are nullable intentionally.

- `0` means the metric was recorded and its value was zero.
- `NULL` means that run predates the instrumentation or the value was unavailable.

No historical backfill invents zeros from current canonical state.

## DIRECT_ENTITY yield

Useful yield is `newEntityCount + updateSuggestionCount`. Duplicate ratio uses a documented
processed denominator and is never inferred from provider result count.

## Cadence recommendations

Recommendations are deterministic and advisory only. They never modify a schedule.

- fewer than four healthy comparable runs: `INSUFFICIENT_DATA`;
- four healthy zero-yield runs with a high duplicate ratio: `CONSIDER_SLOWER`;
- repeated healthy high-yield/cap-saturated runs: `CONSIDER_FASTER`;
- otherwise: `KEEP_CURRENT`.

Provider failures, budget-blocked runs and failed runs are excluded from zero-yield evidence.

## Direct refresh progress

`cursor_entity_id` is an ID, not a count. Progress is computed using the same eligibility
predicate as the refresh candidate query and counts eligible IDs at or below the cursor.
A zero cursor after a successful cycle is shown as a completed cycle, not as 0%.

## Sources

- discovery run history: `automation_discovery_runs`
- provider/search usage and daily budgets: `automation_search_usage`
- recurring source runs: `automation_runs`
- source state: `automation_sources`
- direct refresh state: `automation_direct_refresh_settings`
- direct update suggestions: `automation_update_suggestions`
- bounded recent DIRECT_ENTITY outcomes: `automation_discovery_outcomes`

## Aktivácia migration 0097

Rozšírené operations metriky sú po dokončení paralelných workstreamov aktivované ako canonical migrácia `drizzle/0097_automation_operations_metrics.sql`.

Pôvodne pending SQL bolo pripravené pod rezervovaným indexom 0098, ale finálny canonical chain po merge ostatných workstreamov skončil na 0096 a žiadna samostatná 0097 nevznikla. Preto bol pending súbor presunutý bez zmeny SQL obsahu na 0097, aby zostal MIG-0 chain súvislý bez umelej prázdnej migrácie.

Kód zostáva code-before-migration kompatibilný: pred produkčným apply 0097 dashboard funguje v reduced režime a historické/rozšírené metriky ostávajú `NULL`, nie vymyslené nuly. Produkčný rollout používa explicitný guard `APPLY-0097-psipedia-sk-db`.
