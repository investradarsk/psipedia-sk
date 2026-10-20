# TECH-20261020-GEMINI22-DEDUPE-01 — identity creation gate

Scope: **one Draft PR**. No Gemini/Notion/production writes, migrations, publishing or flag activation.

## Existing integration reused
- Existing full paginated Notion data-source scan; before each attempted create the worker
  re-reads the data source and includes locally acknowledged writes.
- Existing D1 directory dedupe (`checkGeminiCandidateDedupe`) and events dedupe
  (`checkGeminiEventDedupe`), not another identity registry.
- Help 6/6 now use **read-only** comparisons against their actual canonical D1 models:
  generic `help_cases` (3 keys), `help_organizations` + Directory cross-check
  (shelters), `adoption_dogs` and `lost_found_dog_reports`. Every historical
  status counts, including unpublished, adopted, resolved and archived.
  Help requires appropriate public identity evidence; weak/incomplete identity
  yields BLOCKED, same source with uncertain identity yields POSSIBLE_DUPLICATE.
  No private contacts, street addresses, exact GEO or user edits are queried.
- Existing signed machine-to-machine callback secret and running-job identity.
  A separate, narrow **read-only** preflight endpoint returns only an enum.
- D1 system still owns canonical IDs, Google-place confirmation and human edits;
  the worker is never permitted to modify them.

## Decisions
- Confirmed Notion/D1 match: no Notion create.
- Possible match: **BLOCKED / manual identity review**; no merge and no create.
- NEW requires fresh complete Notion scan **and** signed current canonical D1 NEW.
- Rejected identity: no create. Absent/invalid token, unknown job, stale timestamp,
  missing identity evidence, D1 outages or unsupported canonical models: BLOCKED.
- Never send full candidate details, notes, contacts, unpublished GEO or D1 rows to
  the public endpoint response. HTTP no-store.
- **Directory (10 categories):** when the signed read-only preflight finds a
  certain canonical duplicate, the worker may submit only business-public Web,
  phone, e-mail, Facebook and Instagram as a **separately HMAC-signed review
  proposal**. The receiving D1 service repeats authenticated job admission and
  exact canonical identity checks (name + city + category + verified dedupe);
  only then does it call existing `upsertDirectEntityUpdateSuggestion` to add an
  OPEN `POSSIBLE_UPDATE` item in the existing **Kvalita údajov** section.
  Nothing is published, automatically merged or overwritten. Stale or
  uncertain identities, nonpublic/GEO fields, URL/phone validation failures and
  unavailable D1 **fail closed**. Existing human decisions remain protected
  by the original value-bound review mechanism.
- **Events and Help (12 categories):** confirmed/possible duplicates still block
  Notion creation, but the new Directory-only update-proposal endpoint refuses
  them: `automation_update_suggestions` is schema-scoped to Directory and
  organizations. Their feed-source findings require real registered source
  provenance; do not invent or reuse unrelated source identities. Thus automated
  field update ingestion for Events/Help remains **NOT IMPLEMENTED**.
- No external worker gets D1 access, canonical IDs or admin approval rights.

## Known blockers before production acceptance
1. Help 6/6 now has dedicated D1 read-only preflight and offline tests, but
   **real schema/identity acceptance is still UNKNOWN**. Lost/Found requires
   explicit LOST/FOUND type, event date, city and source URL; adoption requires
   organization and public source. Unresolved identity fields BLOCKED rather
   than forcing an unsafe NEW. Existing generic Help has no canonical source URL
   column (only an action URL); cross-source identity is necessarily conservative.
2. Directory and events rely on available public identity fields; insufficient
   name/city/date/source/organizer yields BLOCKED. Rebrands and verified Google
   place IDs require a separate conservative matching review, not implicit merge.
3. A read-only gate cannot serve as a cross-system Notion transaction. Race between
   independent human Notion writes and worker POST remains a residual risk.
   Validate production sequencing and reconciliation before approving rollout.
4. The existing Notion sync and callback mapping need authenticated, read-only
   production acceptance. CI alone is not proof of production behavior.
5. The Directory review proposal route requires offline HMAC and idempotency
   tests, and live read-only category identity acceptance before rollout.
6. Production release cannot be approved until new Worker endpoints are deployed,
   the GitHub workflow gate is updated on main, and approved read-only canary checks
   demonstrate stable API decisions. Prior versions of workflow may still run.

## No activation implied
This PR does not enable flags, dispatch paid workers, create Notion concepts or
submit changes to Kvalita údajov. **No merge without independent review.**

### Feed-source quality proposals — Events 6/6 and Help 6/6
- The existing signed `/api/internal/gemini-agent/update-proposal` route now accepts
  public-only, allowlisted proposal fields for all six Events and six Help categories.
  Exact canonical identity is revalidated **after** the original signed duplicate gate,
  then linked to an existing **enabled, approved automation source** with a matching
  `automation_observations` record and `canonical_external_provenance` receipt.
- The handler uses existing `automation_findings` with `POSSIBLE_UPDATE`,
  `EXACT_SOURCE_ID` and immutable, value-versioned fingerprints. Those findings
  already appear in the existing **Kvalita údajov → FEED_SOURCE** field review and
  never perform a canonical UPDATE or Notion publish themselves.
- Incomplete, conflicting or unregistered provenance **returns BLOCKED**; no fake
  source registration, new D1 migration, alternate editor, private location,
  phone/contact or personal information is created. Previously reviewed values
  are not reopened by a repeat candidate.
- Added offline tests for all 12 category proposal field maps, valid provenance,
  missing/ambiguous source, unchanged field, protected private fields and
  review-only database writes. Production read-only verification remains required
  before activating external Gemini runs.
