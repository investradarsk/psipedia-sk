# PSIPEDIA — Unified Admin Editor Design System V3 (foundation)

## Boundary and approved direction

A single compositional editor workspace inspired by the approved Psipedia Admin visual: wide modal on desktop; full-viewport modal and one column on mobile; live preview only if supported by the canonical editor; equivalent page layout for editors not opened in a modal.

This foundation is not a form engine. No changes to existing canonical editors, AdminShell, admin global CSS, public UI, rich-text serialization, API endpoints, D1, Notion, Gemini, migrations or deployments.

Reused shared primitives:
- AdminModalDialog for native showModal, keyboard focus management, Escape and focus restoration.
- AdminActionButton for existing action variants.
- AdminEditorSection, re-exported as EditorSection, for stable form sections.

New components in components/admin-editor-workspace.tsx:
- EditorWorkspace: modal/page presentation, optional preview and close-request guard.
- EditorHeader and EditorStatus: metadata/state.
- EditorSectionNavigation: in-workspace navigation without URL/hash mutation.
- EditorContent and EditorPreview: independent scroll and responsive preview toggle.
- EditorActionBar: arbitrary caller-supplied action slots; no built-in publishing.
- EditorUnsavedChangesGuard: explicit discard confirmation and browser beforeunload.

The new CSS is only components/admin-editor-workspace.module.css.

## Integration contract

1. Each canonical editor owns its form state, fields, validation, permissions, rich-text, media, SEO, relations, save and publish methods. Pass actual canonical children and preview, never copy them into a second form.
2. The host owns the modal open state. Pass an accurate dirty flag and onClose. Internal section navigation scrolls mounted sections; it never resets fields.
3. Save-as-draft remains separate from publish. The workspace does not save, reject, approve, publish or send requests. Each caller must explicitly confirm publishing and preserve its own validation.
4. The workspace protects its own close buttons and beforeunload. Full Next.js programmatic router navigation interception is out of scope until each canonical adapter can forward navigation to the same guard. Do not claim route-leave completeness based on this foundation alone.
5. Footer slots are optional. No irrelevant buttons are generated when a slot is absent.
6. Distinct simultaneous workspace instances need distinct DOM section IDs supplied by callers.

## Integration inventory for subsequent isolated PRs

| Module | Current verified file(s) | Guardrails |
| --- | --- | --- |
| Articles | components/admin-article-editor.tsx; components/admin-article-block-editor.tsx | Keep block editor, metadata, scheduling, preview, SEO and Notion parity |
| Breeds | components/admin-breed-editor.tsx | Keep FCI data, breed images, sports, health and relations |
| Directory profiles | components/admin-directory-editor.tsx | Keep address, trust, Google and category-specific fields |
| Events | components/admin-event-editor.tsx; components/admin-event-markdown-editor.tsx | Keep event lifecycle and registration |
| Generic help | components/admin-help-editor.tsx | Do not collapse adoption/lost-found/organization into generic Help |
| Organizations | components/admin-organization-editor.tsx | Keep publication policies and organization relations |
| Adoptions | components/admin-adoption-editor.tsx; components/admin-adoption-editor-profile.tsx; components/admin-adoption-editor-details.tsx | Keep adoption-specific validation and linking |
| Lost and found | components/admin-lost-found-editor.tsx | Keep privacy and status transitions |
| E-shops | components/admin-eshop-editor.tsx | Keep merchant fields and rating semantics |
| Reviews | components/admin-reviews-hub.tsx; components/admin-profile-review-actions.tsx | First identify where editing is implemented; avoid a generic replacement |
| Content sections | components/admin-section-editor.tsx; components/admin-puppy-area-editor.tsx | Keep portal content data types |
| Gemini concepts | components/admin-gemini-agenda-draft-editor.tsx; components/admin-gemini-concept-review.tsx | Defer to ongoing Gemini V3 implementation |
| Facebook images | components/admin-facebook-images.tsx | Retain queue, moderation, publish lifecycle |

Before each future integration compare with current main and the status of open PR #847 and concurrent Gemini changes.

## Isolated acceptance harness

The only new route is app/admin/editor-workspace-preview/page.tsx. It invokes notFound outside NODE_ENV=development. A local fake draft supports change persistence, independent save, preview, guarded close, explicit publish confirmation. No network persistence.

Contract: node --test tests/admin-editor-workspace-v3.test.mjs.
Browser: npx playwright test tests/e2e/admin-editor-workspace-v3.spec.ts --workers=1.
Acceptance covers modal/page desktop, mobile 390px and 320px, editing/section navigation, preview, confirm stay/discard, focus restore, explicit publish, and Axe serious/critical A/AA checks.

Local CI D1 schema setup is isolated only. No production writes.
