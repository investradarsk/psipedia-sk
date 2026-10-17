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


## 17 October 2026: Playwright hydration regression

Original run 39027180371 had 7 failures and 1 pass. Archived video, screenshots, trace events and browser-console messages establish that Playwright interacted with SSR-visible buttons/combobox **before Vite/React client hydration**. For instance, desktop clicked at trace time 2630.999 while Vite connected at 2655.544 and React DevTools information appeared at 2937.679. No page exception or failed development-only route was recorded. The select changed natively without updating editor mode; the button consumed a pre-hydration click without showing the modal.

Fix: the isolated demo detects hydration with useSyncExternalStore, disables SSR-visible actionable controls until hydrated and Playwright explicitly confirms readiness. The actual canonical editor workspace remains unmodified except for using a labelled section for the preview's accessible region semantics. This is **not** a timeout increase or removal of acceptance assertions.

Expanded acceptance verifies 1440, 390, and 320px, no document overflow, native Escape, Tab/Shift+Tab trapping, restored opener focus, navigation persistence, preview, draft-only save, publish confirmation, discard confirmation, Axe, no page JS errors and zero write-method browser requests. CI publishes real screenshots under artifact \`admin-editor-v3-visual-acceptance\` even on partial failure. Visual approval requires inspecting generated images; a passing test does not alone grant it.


## 17 October 2026: second CI run and isolated visual polish

Run 39044179888: 11/12 Playwright checks passed; the only failing check assumed the mobile inline/page preview region was visible without using the explicit "Náhľad" toggle. The UI intentionally hides its preview until the toggle is activated on mobile. The acceptance test now performs the actual user action before asserting the **same live content and region**; it does not remove the verification. This also exercises mobile page-mode preview accessibility.

Review of generated screenshot artifact 12104749798 found that global app typography was not suitable for the new isolated workspace: default serif headings, oversize heading hierarchy and unstyled input/textarea primitives. The workspace-only CSS adds accessible compact heading, label, input and preview card styling in its own CSS module; no PR #847 or existing editor files touched. Fresh screenshots are required before final visual verdict.
