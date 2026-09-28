# Automation entity enrichment

AUTOMATION-ENTITY-ENRICHMENT-2 adds a schema-first layer above the existing source-specific parsers. It does not replace specialized DIRECTORY, EVENT, ADOPTION, FOSTER, LOST_FOUND, or ORGANIZATION parsing.

## Pipeline

1. Existing source/detail parser extracts explicit evidence.
2. The entity template normalizes only canonical fields and classifies them as IDENTITY, HIGH_VALUE, or OPTIONAL.
3. Completeness determines which valuable enrichable fields are missing.
4. Bounded same-domain first-party follow-up runs where supported.
5. A targeted search may run only for a known entity and only when a compatible approved search root exists.
6. Search evidence passes the identity gate before it can fill a field.
7. Existing canonical matching decides NEW_ENTITY, POSSIBLE_UPDATE, duplicate, or skip.

DIRECTORY location remains a special case: generic enrichment does not run a second location search. Existing address evidence -> bounded address lookup when needed -> Geoapify exact verification remains authoritative.

## Evidence and conflicts

Evidence priority is intentionally conservative: verified provider, first-party structured data, first-party page, trusted register, source detail, then search snippet. Lower-priority conflicting evidence does not replace a stronger value. Missing evidence never proposes deletion of an existing canonical value.

Canonical descriptions are extracted/cleaned source evidence. The enrichment layer does not generate marketing copy.

## Budgets and failure behavior

Targeted search is grouped by CONTACT, DETAIL, or LOCATION rather than one request per field. A record can request at most two targeted searches. Search-root enrichment has a separate `entity-enrichment:*` usage family and a bounded per-root-run allowance; those requests are excluded from discovery counters.

First-party follow-up is bounded to semantic same-domain pages and uses the existing controlled HTML fetch policy. Enrichment is best-effort: a failed follow-up/search does not discard a primary record that still satisfies the entity draft minimum.

No enrichment path publishes a record or writes canonical updates directly. New entities remain DRAFTs; existing records produce the existing update-suggestion flow.
