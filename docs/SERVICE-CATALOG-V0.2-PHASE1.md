# PSIPEDIA — SERVICE CATALOG V0.2 / PHASE 1

**Approved by owner:** V0.2 and all six semantic rules. **Status:** static contract; no runtime integration.

## Six agreed rules
1. Multiple services: AND/all as default, OR/any when explicitly chosen; public filters unchanged in this phase.
2. Kennels: no mandatory services; breeds, breeding focus and litters are attributes; breeding advice only when confirmed.
3. Generic veterinary surgery does not prove any specific operation; specialization does not imply a procedure.
4. 'Psia škôlka' is not an automatic daycare alias until the same care scope is confirmed.
5. Pet taxi and general dog transport are distinct.
6. Explicit physio methods (Dorn, laser, hydro, etc.) may be searched independently, never inferred.

## Semantic contract
- Each svc.* ID occurs once globally and lists all eligible categories. Attribute attr.* and provider.* IDs are separate.
- Alias matching is exact after Unicode case/whitespace normalization; no free-text extraction from historical Notion or D1.
- 21 existing facets map: 11 service, 9 attribute, 1 provider type. Shared group training has one canonical target.
- Legacy yes/no/unknown are distinct. Explicit no -> not_offered; unknown/missing/invalid false -> unknown.
- No two independent editable toggles for a single fact. The mapping adapter is pure, without writes.
- Hotel service type/environment, supervision and availability must remain distinct.
- Future D1 canonical source: approved Admin edits take precedence over Notion; Gemini suggests EXISTING IDs only, cannot mint IDs. None of this is activated in Phase 1.

## Change boundary
Only this document, new library catalog, new tests and new scoped CI workflow. No D1 migrations/backfill, Notion, Gemini, editors, public filters, maps, SEO, deployment or merge. Leave Draft PR #864 untouched; do not alter PR #847 or #869 files.
CI: node --experimental-strip-types --test tests/service-catalog-contract.test.mjs tests/directory-filter-contract.test.mjs