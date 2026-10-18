# Services V3 · Phase 3A — Admin API contract

This is a **preparation contract**, not rollout approval. No database migration, UI, public filter or Notion writer is added in this phase.

## Endpoints and authorization

| Endpoint | Request | Response | Guard |
|---|---|---|---|
| `GET /api/admin/service-catalog/options` | none | `{options: AdminCatalogOptionDto[]}` | verified Psipedia Admin |
| `POST /api/admin/service-catalog/options` | `CreateAdminCatalogOptionRequest` | HTTP 201 `{option: AdminCatalogOptionDto}` | verified Admin, same-origin mutation, **both** gates |
| `PATCH /api/admin/directory/{id}/service-options` | `SaveAdminServiceChoiceRequest` | `{selection: AdminServiceChoiceDto}` | verified Admin, same-origin mutation, **both** gates |

Both mutation routes require `SERVICE_CATALOG_ADMIN_WRITES_ENABLED==="true"` AND `SERVICE_CATALOG_NOTION_MIRROR_READY==="true"`. **Keep both unset.** Unauthorized requests are rejected before checking the rollout gates. Failure codes: 400 malformed/invalid input, 401 unauthenticated, 403 cross-origin, 409 duplicate/stale version, 503 disabled gate/unavailable schema or D1, 500 unexpected server error.

## New option payload

```json
{
  "name": "Konkrétna nová služba",
  "category": "veterinari",
  "kind": "service",
  "group": "Diagnostika",
  "meaning": "Presne vymedzená služba potvrdená administrátorom."
}
```

No client-supplied IDs, lifecycle states, mirror flags, versions or audit fields. A new option receives an immutable server-generated ID (`svc.admin.<uuid>` or `attr.admin.<uuid>`), version 1, `DRAFT`, `PENDING`. Global normalized names cannot collide with pre-existing static services, aliases, attributes or provider types, nor with another dynamic option (including other categories or kinds). D1 uniqueness resolves concurrent creation races.

`AdminCatalogOptionDto` contains `id, kind, label, group, meaning, categories, status, notionMirrorStatus, version`. The GET route currently lists **dynamic options only**, not the built-in static `serviceCatalog`. A future editor needs a separate intentional strategy for combined browsing.

## Choice semantics and concurrency

`SaveAdminServiceChoiceRequest` is `{optionId, choice: "yes" | "no", expectedVersion}` and the numeric `profileId` comes from the URL. `expectedVersion=0` inserts **only if absent**; subsequent updates require the exact positive current version and increment it. A stale version returns 409. Unknown is represented by **absence of the choice row**, never by `"no"`. It is not a permitted write value. `selectionForEditor(null)` returns `"unknown"`. There is not yet an API operation to revert an explicitly stored choice to unknown.

A dynamic service is eligible for a profile choice only with matching category and state **ACTIVE + SYNCED**. DRAFT, RETIRED, PENDING and CONFLICT are ineligible. Static registered services remain eligible by their built-in categories.

## Lifecycle for the future editor (not yet executable API)

The pure functions in `lib/service-catalog-admin-api-contract.ts` specify the intended transition rules: `DRAFT → ACTIVE` requires `SYNCED`; `DRAFT/ACTIVE → RETIRED` is allowed; `RETIRED` is terminal. Mirror states: `PENDING → SYNCED/CONFLICT`, `SYNCED → PENDING/CONFLICT`, `CONFLICT → PENDING` for explicit retry. A conflict must not silently become SYNCED. No-op state retention is permitted. Any future writer must validate expected version with an atomic D1 CAS update, audit the actor and repeat authorization.

**Important:** SQL migration 0133 only constrains legal state *values*. It does NOT enforce transition edges; there are currently no transition endpoints. The pure checks are not a substitute for server-side CAS/authorization in the next phase. Notion is a mirror, never a source of canonical ID creation. Until mirror reconciliation and transition handlers exist, do not enable the two write flags or treat the API as ready for operational editing.

## Validation

Run `node --experimental-strip-types --test tests/service-catalog-contract.test.mjs tests/service-catalog-admin-api-contract.test.mjs tests/service-catalog-d1-foundation.test.mjs`. Tests use in-memory SQLite for 0133; they do not touch production D1. Route tests in 3A check route contract/source, not an authenticated production HTTP round-trip.
