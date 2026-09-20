# AUTOMATION-1 — Automated Public Data Research & Draft Review

## Safety contract

The pipeline is intentionally split into source observations, canonical entities and proposed changes.
A scheduled connector can create or refresh `automation_findings`, but it has no code path that writes
to canonical event, organization, help, adoption, lost/found or directory tables. A reviewer decision
also updates only the finding. Publication remains the responsibility of each existing module workflow.

## Scheduling

The existing Cloudflare hourly cron invokes one bounded automation sweep. Each source has its own
`cadence_minutes` and `next_check_at`; the sweep only takes the oldest due sources and each source
has a per-run record cap, timeout, retry/backoff and source-level error state. Recommended defaults:

- Events and Lost & Found: every 6 hours.
- Help / adoption / foster: every 12 hours.
- Organizations and Directory: weekly.

These are defaults, not a license to poll a source that forbids automated access. A source should stay
disabled until its terms, robots policy where applicable, stable public interface and throttle are reviewed.

## Connectors

V1 supports three adapter contracts:

- `STRUCTURED_JSON`: configurable records path and field mapping.
- `CONTROLLED_HTML`: only a named, code-reviewed parser registered by the caller; there is no generic
  scraper and no headless-browser/TinyFish production dependency.
- `MANUAL_IMPORT`: normalizes already acquired rows without scheduled network access.

No external source is seeded by this migration. Adding a production source is therefore an explicit
configuration step rather than an automatic crawl.

## Matching and dedupe

Matching is conservative. Exact source ID, canonical URL, import key, slug or registration number wins.
Selected modules also support exact multi-field identity (for example event title + date + organizer).
Multiple equally strong candidates become `DUPLICATE_CANDIDATE`; they never trigger a canonical update.

A finding fingerprint includes source, source record, finding type, canonical target and normalized
proposal hash. Repeated unchanged observations refresh the same finding. Rejected/ignored findings stay
closed until the source proposal changes; time suppression can reopen after its deadline, and a changed
proposal naturally receives a new fingerprint.

## Provenance and observability

Observations retain the raw payload JSON, normalized payload JSON, source record ID, source URL,
source timestamp, payload hash and detection time. Finding review shows the linked observation,
canonical target, before/proposed values and diff.

`automation_runs` and `automation_sources` keep checked/new/updated/error counts, duration, last
check, last success/error and next expected run. Structured logs are emitted per source and per sweep.

## Notifications and review

Findings are aggregated into the existing Admin Operations / Attention Center. High-priority new findings
(currently source errors and possible event cancellations) enqueue the existing `editorial_notifications`
outbox. Review actions are authenticated through the existing admin auth contract.

**NO AUTO-PUBLISH:** approve/reject/ignore/suppress actions never publish or mutate canonical records.
