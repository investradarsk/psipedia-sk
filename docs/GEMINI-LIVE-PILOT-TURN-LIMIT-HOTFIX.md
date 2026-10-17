# Live pilot turn-limit hotfix

## Forensics

Base: `e2d592a0126254d37c8c9306374540325c49cfbd` (includes #833).
Open #834 is the separate, inert Lost/Found contract, not a turn-limit fix.

- Salon run https://github.com/investradarsk/psipedia-sk/actions/runs/38626359623,
  job 116066412181: the log confirms `AGENT_TURN_LIMIT`, 9 requests,
  2 search calls, 1 duplicate, 0 concepts on this base.
- Club run https://github.com/investradarsk/psipedia-sk/actions/runs/38626563818,
  job 116067095992: Actions confirms successful exit on the same base. Its log
  does not emit success counters; the 3 requests / 2 searches / 0 concepts are
  operator-reported admin observations, not independently logged counters.
- The original loop accepts `completed`, otherwise executes tools and always
  continues until the seven-continuation boundary. A duplicate is merely a tool
  result; no identity/result progress history or completion guidance exists.
- At the failing boundary the provider still requested action. The logs do not
  include individual calls/arguments: repeated searches after the single
  duplicate are a plausible explanation, **not a proven production sequence**.
  A long sequence of distinct queries is also compatible with these counters.

## Behavior

- Keep the existing research/function split and nine-request ceiling. No new
  paid research pass, automatic retry, workflow, routing, or configuration.
- Explicitly instruct the model to move past a duplicate to another grounded
  candidate, or complete when the researched candidates are exhausted.
- Track normalized search identifiers plus actual result content, and confirmed
  duplicate candidates. Directory identity uses the existing identity helper;
  other categories only cache exact, recursively sorted arguments to avoid
  collapsing distinct events/dogs sharing a source. A changed non-directory
  payload still passes the existing category validator and fresh scan.
- Cached duplicates never POST again or inflate duplicate_count. New candidates
  still receive a fresh complete Notion scan and all existing category checks.
- Two consecutive turns without new information allow one final tool-free
  response, within the original budget. This is a continuation, not a retry.
  SUCCESS requires `completed` and exactly `{"outcome":"exhausted"}`; unresolved,
  malformed, or further action yields `AGENT_NO_PROGRESS`. Repetition alone is
  never success. This completion statement is a model assessment of the bounded
  research, not proof that the entire public web has no other candidates.
- An unresolved rejected candidate cannot be hidden by a normal completed
  response (`AGENT_CANDIDATE_UNRESOLVED`). Correcting that candidate can resolve
  the rejection. Reaching the requested confirmed concept count stops at once.
- Unresolved action at request nine stays `AGENT_TURN_LIMIT`, with no final
  unacknowledged Notion write. Uncertain POST results remain FAILED, no retry.
- Directory scans now retain locally confirmed drafts, matching Events/Help/
  Adoptions behavior, so a temporarily stale Notion scan cannot recreate them.
- Per-turn diagnostics contain only counts, turn index and progress boolean;
  no identity, query, prompt, raw source, record content or secrets.
- Callback code and the conditional completion/history transaction are unchanged.

## Offline validation

The subprocess preload replaces all fetch before importing the worker. Tests
exercise duplicate completion, repeated normalized identity, repeated queries,
new candidate after duplicate, empty results, immediate single draft, unresolved
nine-request exhaustion, refused/malformed completion, stale scans, uncertain
POSTs and signed callback. Existing callback replay/concurrency tests verify one
history entry. All 21 currently supported categories have mock draft coverage,
including Adoptions from #833. Lost/Found routing remains unchanged.

#834 only adds an import at the top of the worker suite; this patch appends tests
and adjusts an existing rejection assertion. It does not touch its new helper,
canonical target decision or routing.

No live Gemini calls, Notion writes, production callback, deployment, merge,
secret changes or scheduled activation are part of this task. The next manual
live test belongs to the operator after separately approved merge/deployment.
