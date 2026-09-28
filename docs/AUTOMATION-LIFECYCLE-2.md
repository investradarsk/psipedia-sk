# AUTOMATION-LIFECYCLE-2

FEED_SOURCE lifecycle automation is review-only until an administrator explicitly accepts a lifecycle suggestion.

Flow:

```
SOURCE EXPLICIT SIGNAL
→ normalized lifecycle signal
→ deterministic canonical match
→ lifecycle suggestion in automation_findings
→ explicit admin review
→ existing domain transition service
→ canonical lifecycle change
```

Supported V1 signals:

- EVENT_CANCELLED → managed event `cancelled=false → true`; publication status is unchanged.
- ADOPTION_ADOPTED → adoption status ADOPTED through the existing adoption transition authority.
- ADOPTION_RESERVED → adoption status RESERVED only from explicit reservation evidence.
- FOSTER_RESOLVED → help case `resolved=false → true`; publication status is unchanged.
- LOST_FOUND_RESOLVED → RESOLVED through the existing LOST/FOUND transition authority.

Safety invariants:

- Absence from a source or one missed run is never a lifecycle signal.
- `type=FOUND` is not a resolution signal.
- POSTPONED, DATE_CHANGED and VENUE_CHANGED are not EVENT_CANCELLED.
- Detection alone never mutates canonical lifecycle or publication state.
- Lifecycle review and ordinary content-field review remain separate, so both can coexist for one source run.
- Accept/reject decisions are bound to a lifecycle fingerprint containing entity, canonical id, signal, target, source identity and material evidence.
- Rejected unchanged evidence does not reopen. Materially changed evidence produces a different fingerprint and may be reviewed again.
- Apply reloads current canonical state and uses the current domain transition authority; stale or invalid transitions fail closed.
- The client sends only the action and expected fingerprint. Target state is read from the stored server-side suggestion.
- No bulk accept is provided.
- Existing deterministic legacy POSSIBLE_CANCELLED/POSSIBLE_INACTIVE lifecycle findings remain readable; generic inactive findings without a specific lifecycle target do not gain a one-click action.

Persistence reuses `automation_findings`; no lifecycle-specific migration is required.
