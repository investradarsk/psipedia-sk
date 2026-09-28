# Automation address review

DIRECTORY address automation has three explicit outcomes:

- **AUTO** — one strict provider result passes the existing exact-address gate and remains `VERIFIED_EXACT`.
- **MANUAL REVIEW** — two or more plausible strict exact candidates remain ambiguous; a bounded review case is created only after a canonical DIRECTORY target exists.
- **NO CASE** — provider failure, missing evidence, no safe candidate, or low-confidence-only results remain unconfirmed and do not create queue noise.

The review queue stores only normalized evidence and at most five bounded candidate snapshots. Selecting a candidate never trusts client-supplied address fields or stored latitude/longitude. The server reloads the stored candidate, checks stale canonical state and manual geo override, and performs a fresh exact provider verification before applying the canonical address bundle.

A successful apply preserves publication state, marks the service location confirmed, invalidates old exact geo coordinates in the same D1 batch, then reconciles and resolves GEO using the fresh verified provider result. Dismissal changes only the review case. The same dismissed fingerprint is not reopened; materially changed evidence or candidates produce a new fingerprint.
