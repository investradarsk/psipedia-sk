# Services V3 Phase 3B — Admin editor (Variant A)

Owner approved **Variant A**: independent catalog workspace on desktop, a sequential list/detail on mobile, and separate profile values in the existing Directory editor. Admin Visual System V3 remains the source of styles and reusable EditorWorkspace/EditorActionBar components.

## Implementation
- Admin-only `/admin/sluzby-pre-psov/katalog` combines **built-in read-only** service/attribute definitions and canonical D1 dynamic records. Search, category/type/status filters, versioned detail, state/mirror badges, incomplete-load warning.
- The optional new-option modal uses shared AdminEditorWorkspace and real existing Admin API **only when both rollout gates are already true**. New IDs and DRAFT/PENDING are server-controlled.
- On the directory profile page the Services V3 card is separate from the canonical profile editor. It reads only explicitly saved option choices in 0133; no inference from legacy service descriptions or source JSON. Unknown = row absent, never No.
- When BOTH pre-existing flags are active, explicit Yes/No values use the guarded PATCH with expectedVersion (CAS). Partial-save failures remain visible. Already persisted Yes/No cannot be reset to Unknown until the API adds a safe deletion operation.
- Dynamic profile services must be ACTIVE/SYNCED; built-in services are allowed. Attributes are listed but not written: `service_profile_property_values` does not yet have operational editing endpoints.
- Edit/approve/retire/Notion retry controls are intentionally disabled and labeled pending the next authenticated CAS lifecycle API; do not pretend they work.

## Safety and non-goals
No migration, new write endpoint, production D1 write, deployment, flag change, Notion writer, public filter change, publication or hidden auto-sync. Both `SERVICE_CATALOG_ADMIN_WRITES_ENABLED` and `SERVICE_CATALOG_NOTION_MIRROR_READY` remain OFF; do not enable them for this PR. Never rerun 0133. Do not merge pending independent QA and owner acceptance.

## Follow-up before activation
1. Lifecycle CAS routes for approve/edit/retire/retry with actor audit and verified admin permissions.
2. Reset-to-unknown and tri-state attributes/property-value API with version semantics.
3. D1→Notion mirror reconciliation, conflict handling and explicit owner activation.
4. Authenticated browser checks for desktop/mobile, keyboard, performance and unsaved-changes navigation.
