# Services V3 — category inventory, uniqueness and safe reset gate (2026-10-29)

## Scope and evidence
- Inspected the repository's canonical static registry `lib/service-catalog-contract.ts`, Admin catalogue UI and profile editor, service-option governance, the D1 selection bridge, and the existing public `svc` filter contract.
- Notion "Adresár" (source `84e0664c-ca47-405f-9d54-31b20287bc8c`) contains two independent fields: legacy rich/plain text `Služby` and relation `Služby z katalógu`.
- Notion snapshots showed 1,835 published-or-ready Adresár profiles and a populated catalogue relation on only **one** of them. This does NOT measure actual D1 `service_profile_option_choices`: admin D1 values are not available from Notion.
- Sampled up to 35 Notion profiles per category via their views to compare real offerings against the canonical static registry; this is a **sample**, not a full audit of all 1,835 profiles.
- Live authenticated Psipedia Admin could not be opened through the browser connector in this session (it requires the originating browser context). The Notion SQL/rows query entitlement limit was reached during the deeper audit; view-mode remained available. Therefore **dynamic** Admin options and actual deployed D1 state are not certified by this document.

## Catalogue inventory — same IDs reused across categories
Initial static registry: 91 services, 28 attributes, 2 provider types, across 10 categories. The current proposed branch adds two genuinely distinct services, for 93 static services total.

| Category | Before | Proposed | Findings from Notion sample |
| --- | ---: | ---: | --- |
| Veterinári | 31 | 32 | Wide diagnostic/treatment coverage; **inhalation anesthesia** was mentioned but not represented by a dedicated selectable service |
| Tréneri | 25 | 25 | "Individuálny/skupinový výcvik" already belongs to attributes, not duplicate services |
| Kynologické kluby | 22 | 22 | Sports use shared IDs across trainers and clubs; generic "športová kynológia" must not imply a specific discipline |
| Chovateľské kluby | 3 | 3 | Bonitácia relates to existing chovná spôsobilosť; club events are already an attribute |
| Chovateľské stanice | 1 | 1 | Types of breeding, litter status and focus are properties, not new provided services |
| Salóny a služby | 8 | 8 | Grooming synonyms already covered; unclear "ozonoterapia" cannot be added without confirming a distinct, safe offering |
| Hotely a opatrovanie | 9 | 9 | Boarding/daycare and visit/home formats are separate; generic "hotel" is not another service |
| Venčenie | 3 | 3 | Puppy/senior acceptance is already represented by attributes; do not add duplicate walks |
| Fyzioterapia | 9 | 10 | **Magnetotherapy** is a named modality distinct from electrotherapy, lasertherapy and generic rehabilitation |
| Ďalšie služby | 7 | 7 | **Pet taxi vs Preprava psov** may overlap semantically; no new transport variants until canonical migration is reviewed |

The two proposed IDs preserve specialist meaning and require explicit confirmation per provider:
- `svc.vet.inhalation_anesthesia` — Inhalačná anestézia; does not follow from general surgery.
- `svc.physio.magnetotherapy` — Magnetoterapia; does not follow from lasertherapy/electrotherapy.

## Semantic overlap requiring OWNER review before bulk reset
The existing registry has no duplicate canonical IDs or exact conflicting aliases under its validation, but **semantic similarity is broader than exact string equality**. Candidate pairs requiring a merge-vs-distinct-service decision:
1. `svc.transport.dogs` / `svc.transport.pet_taxi` — near-duplicate user-facing transport names with different stated operational scope.
2. `svc.training.socialization` / `svc.training.social_walks` — both socialization, but walking sessions may be a distinct service format.
3. `svc.training.behavior` / `svc.training.reactivity` — broad behavioural support vs targeted reactivity; potentially too similar for an uncluttered user filter.
4. `svc.groom.brushing` / `svc.groom.dematt` — basic brushing vs removing mats; different actual method/intensity.
5. `svc.physio.rehabilitation` / `svc.physio.exercise` — umbrella rehabilitation vs specific therapeutic exercise.

DO NOT delete or rename established IDs just to hide a duplicated label: positive D1 choices, URL filtering, audit history and historical Notion projections may still reference them. A merge needs an explicit canonical target, a data-preserving migration and tested backward compatibility. New services may not be created as synonyms, broader/narrower variants or renamed copies of existing services, attributes or provider types.

## How the existing system works
1. The profile editor `AdminServiceProfileValues` uses canonical options and explicit `Áno/Nie` selections; missing row is `unknown`, **not** `Nie`.
2. `service_profile_option_choices` (D1) holds those explicit selections and powers public `svc` filtering when a positive choice is eligible.
3. The legacy `directory_profiles.services_json` holds text values for the older service view and Notion bridge.
4. `importNotionServiceChoices` maps only exact labels or aliases and resets matching canonical YES to unknown after an accepted, deliberate Notion field change. Other unrelated free text is preserved.
5. Static catalogue definitions can have multiple categories but one canonical ID. Dynamic options are administered in D1; Notion is only a mirror, not an authority to invent canonical IDs. A source-code addition is not equivalent to a production deployment or a verified Notion relation row.

## **BLOCKER — safe all-profile reset, NOT executed**
The user proposes erasing all services assigned to all directory profiles before one new controlled enrichment pass. This is a separate destructive operation, **not part of this PR**, and requires:
1. A read-only production D1 inventory: choices per category (`yes/no/unknown`), dynamic ACTIVE/SYNCED options, referenced option IDs, legacy service counts and current feature gates.
2. Export a restorable snapshot of `service_profile_option_choices` and `directory_profiles.services_json`, including profile/category, option/version, timestamps and existing Notion values and sync metadata. Keep evidence outside the repository; no secrets or personal details in a PR.
3. Define precisely whether free text is retained as evidence for new curation: deleting both Notion and D1 source data first destroys the material used for reclassification. Prefer preserving an immutable pre-reset source copy and clearing **selections**, not facts.
4. Block or coordinate **bidirectional Notion ↔ Admin service synchronization** during the reset. Otherwise old text can be projected back into D1 or overwritten from it, leading to repopulation and conflicts.
5. Dry run on a staging/local snapshot with per-profile change counts, audit trail, idempotency and rollback. Test `svc` filtering (must never silently broaden), legacy `service` filtering and recovery.
6. Separate owner-approved production execution, category-batched, verified after each batch. Do not convert unknown into explicit NO.
7. Only after the clean baseline, deploy the new per-profile enrichment workflow: verify offering on the actual provider's public source; map to existing canonical ID; write an explicit YES only on evidence; do not assert NO from silence; mark processed only after success.

## Tests and non-actions
- Registry regression test asserts two new IDs, category scope, and their distinction from existing surgery/electrotherapy.
- No production D1, Notion, admin UI, service choice or profile has been changed.
- No catalogue option has been approved in D1; no deployment or merge performed.
- Node/CI checks have not been independently executed in this connection; verify PR checks before merge.
