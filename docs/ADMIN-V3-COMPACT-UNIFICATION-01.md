# Admin V3 — Compact Unification 01 (single Draft PR)

Coordination: [#916](https://github.com/investradarsk/psipedia-sk/issues/916)

## Objective

Make the existing Admin Visual System V3 substantially denser on desktop
and mobile without a visual redesign or duplicating editors, data models,
API handlers or existing components. One owner-controlled Draft PR contains
the entire visual change. No deployment or merge is authorized by this document.

## Implementation checklist

- [x] Main work overview: compact priority counters, queues, cards and panels;
      preserve status indicators, links and user-facing values.
- [x] Common desktop/mobile shell and accordion sidebar: narrower desktop
      sidebar, less padding; retain fixed mobile drawer clearance and keyboard focus.
- [x] Shared headers, stats, search/filter toolbars, rows, forms, pagination and
      Data Quality list/image review rows; styles remain scoped to `/admin`.
- [x] Unified EditorWorkspace: compact header, tabs, section spacing, content,
      previews and sticky actions, preserving dirty-state/publishing behavior.
- [x] Directory editor and Services V3 catalog/profile values: denser forms,
      list/detail and mobile filter layouts, with existing 44px select/controls.
- [x] Gemini dashboard and concepts CTA: smaller panels, whitespace and cards.
- [x] Facebook Images V3: smaller cards, filters and sections while preserving
      calendar cells and confirmation controls.
- [x] Admin Mapy and Pomoc psom receive the shared admin form/list/card density.
      Their distinct map/geo behavior and per-editor implementation are untouched.
- [x] Static regression contract in the existing Admin V3 workflow.
- [ ] Review real screenshots and keyboard/scroll behavior at 1440, 768, 390,
      and 320px: main dashboard, article/breed, directory, maps, Help,
      Services V3, Gemini, FB Images and quality review.
- [ ] Independently validate browser flow, screenshot diff and CI HEAD before
      considering owner approval; unknown checks must not be called PASS.

## Safety constraints

- Do not shrink actual touch targets below 44px; Facebook mobile day cells
  remain 49px and sidebar desktop leaf links retain 40px minimum.
- Do not hide content/overflow to simulate compactness; allow wrapping and
  scrolling. Do not alter the protected R2 image picker/upload presentation,
  Google Place confirmation, map selection, gallery state, statuses or errors.
- No D1 migrations, API modifications, Notion/Gemini/Facebook automation changes,
  feature flags or Cloudflare preview build activation.
- Only inherited V3 CSS tokens and scoped style overrides; new visual issues
  should be corrected **in the same PR**, not another initiative.
