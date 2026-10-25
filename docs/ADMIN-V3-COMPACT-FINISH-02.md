# ADMIN V3 — Compact Finish 02

**Workstream:** Vizuál administrácie · **Issue:** [#916](https://github.com/investradarsk/psipedia-sk/issues/916) · **PR:** [#1038](https://github.com/investradarsk/psipedia-sk/pull/1038)

This implementation follows merged #1029 (shared compact shell/editors) and #1030
(PR-head visual evidence). Keep all corrections in **PR #1038** until approved;
do not open an additional PR for the same compactness scope.

## Why a follow-up is necessary

The shared workspace styles are already compact, but scoped CSS Modules and
legacy admin CSS for specialized screens still contained 160–190px minimum card
heights, 16–22px padding, large KPI counters, isolated spacing systems or less
than 44px actions. Changing the shared shell alone does not affect those modules.

## Implementation checklist

- [x] **Kvalita údajov:** compact total/month counters, category filters, proposal
  cards and empty states; image previews use `object-fit: contain` to avoid crop;
  approve/reject touch targets are at least 44px.
- [x] **Pracovný prehľad:** activity feed, KPI links, filters and event rows use
  shared compact V3 spacing without changing push visibility/read state.
- [x] **Operácie:** reduce overview card height, state banner/section padding,
  alert queue rows and status counters; match Admin V3 font/radius.
- [x] **Pomoc psom & other section hubs:** compact shared `AdminSectionHub`;
  preserves all links and descriptions.
- [x] **Recenzie & Partneri:** compact card, list, review, detail, filter and
  pagination spacing; 44px main action links remain accessible.
- [x] **Organizácie, Plemená & Podujatia:** compact actual list rows, thumbnails,
  controls and responsive grid widths.
- [x] **E-shop editor:** denser panels, fields and previews; logo upload retains
  the visually-hidden input and 44px upload control.
- [x] **Galleries:** denser grids and previews without affecting image upload
  endpoints, ordering or dedicated drag handles.
- [x] **Mapy:** move outer/result grid and bulk-result spacing from inline styles
  to shared admin-only CSS. Do **not** change Google Places confirmation,
  canonical IDs, saved maps or server operations.
- [x] **Shared spacing:** reuse `--admin-v3-compact-gap` and
  `--admin-v3-card-padding` declared by the approved Admin V3 foundation.
- [x] **Static contract:** `tests/admin-v3-compact-finish-02.test.mjs` checks
  actual specialized modules, route evidence, safe controls and map invariants.
- [x] **Rendered evidence:** `tests/e2e/admin-ia-2.spec.ts` captures actual
  /admin, /admin/kvalita, /admin/operations and /admin/pomoc-psom pages at 1440,
  768, 390 and 320px and checks horizontal overflow. The ordinary PR Visual
  Evidence workflow also snapshots the same four routes at 1440 and 390px.
- [ ] CI must complete on current PR HEAD (node tests, build, lint, browser).
- [ ] Inspect actual screenshot artifact *from current HEAD*. Correct issues
  inside #1038 before requesting owner review.
- [ ] Additional manual visual assessment with **real data** after deployment
  or an authorized preview: empty local D1 screenshots cannot certify densely
  populated lists or every editor. Do not call these checks PASS without evidence.

## Safety / acceptance

- Keep all approvals, data writes, filters, redirects, Google Places ownership,
  Notion, Gemini, Facebook, R2 uploads and publication semantics unchanged.
- Responsive breakpoints: desktop 1440; tablet 768; mobile 390 and 320.
- No document-level horizontal scrolling; controls and main link targets ≥44px
  where amended. Do not hide content to make a screen look smaller.
- Static contracts and green CI are necessary but not sufficient for visual
  approval. GitHub Actions uses disposable local D1 and sample/empty records.
- No production deployment, no migration or Cloudflare preview worker creation.

## Next continuation

For any remaining discovered visual discrepancies, request **“pokračuj v #1038”**.
Work should add new commits to `codex/admin-v3-compact-finish-02`, update the
same test and screenshot evidence, then leave merge to the owner.
