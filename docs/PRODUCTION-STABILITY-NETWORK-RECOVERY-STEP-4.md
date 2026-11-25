# Production Stability & Network Recovery — step 4/7

Checkpoint: `3adfb6bd7e44a55164b5a514aefd7185543f3351`.

## Changes

- Article popularity: aggregate both 24-hour and 7-day rankings in one SQL query instead of two, preserving independent ranking, limits, publication eligibility, exclusion and ordering. The discovery sidebar now needs two D1 requests rather than three (including the existing profile rankings query).
- Directory search and breed filters: reuse the already loaded canonical breed IDs through bound json_each parameters instead of re-running canonical breed window expressions. Preserve category, legacy fallback and schema readiness checks. Skip the builtin service override schema check when service filters are not applicable.
- Events: skip the listing query when the count is zero.

## Verification

Local SQLite comparison of the combined popularity query on 40,097 synthetic hourly records returned identical rankings and counts in 108 comparisons. A repository regression test was added and existing source-contract tests updated. Production D1 metrics and full repository CI have not been verified. The request-count reductions apply to the named paths, not all page requests. No SQL migration, production changes or Notion changes. Other optimizations require production measurement and are not claimed complete.
