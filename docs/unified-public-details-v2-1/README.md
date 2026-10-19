# UNIFIED PUBLIC DETAILS V2.1 — Final Visual Polish

Presentation-only follow-up to merged PR #882. Existing 1120 px container, public data, SEO, permissions, map/GEO gates and action handlers are preserved.

## Visible differences versus V2

| Surface | V2 | V2.1 |
|---|---|---|
| Shared hero | Oversized long H1; tight padding | Balanced padding and compact long-title variant |
| Event facts | Narrow auto-fit tiles | Two columns; one below 440 px |
| Event statuses | Lifecycle and type look alike | Distinct current/past/cancelled colors; date logic unchanged |
| Directory services | Dense small tiles | Legible neutral cards; no speculative icons |
| Directory contact | Two-column table-like layout | Distinct full-width labelled rows |
| Opening hours | Source free text | Same source text safely wrapped; no invented schedule |
| Sidebar map | 300–430 px map | 270 px on desktop, 320 px mobile to preserve consent |
| Breed text | Possible `Kríženec · kríženec` | Duplicate generic prefix removed |
| Adoption gallery | Cover may crop dog | Contain shows full image |
| Shared cards/CTA | Small text and dense spacing | Consistent 44px controls and readable values |

## Visual evidence

**Before:** committed [directory 1440](../unified-public-details-v2/screenshots/directory-1440.png), [event 1440](../unified-public-details-v2/screenshots/event-1440.png) and [adoption 1440](../unified-public-details-v2/screenshots/adoption-1440.png), plus original 375/390 mobile shots in the V2 folder.

**After:** artifact `unified-public-details-v2-1-<run_attempt>` from the Draft PR's **SITEWIDE-AI-ENTITY-SURFACE-1** CI workflow. Isolated Playwright screenshots use real React components and anonymized read-only public snapshots at 320, 375, 390 and 1440 CSS px.

The suite asserts image natural ratio, fallback, missing media, mobile image-first order, no overflow, axe WCAG, keyboard focus, contacts, CTA, map consent, directory inquiry error/retry/success, fundraiser permissions, long titles, adoption breed label and cancelled event state. Existing local-D1 seeded Playwright checks are retained.

## Open limits

- Original design mockup image files are not available as overlays in this environment; manual owner visual review remains required.
- CACT remote image returned 403 in the V2 environment: existing labelled fallback remains; this does not prove a live-site image failure.
- AMIS, Zack and the October 17 event are intended for live read-only visual comparison; this PR makes no production deploy or write.
- No structured opening hours or event program is invented.
- CI is not declared green until checked for the final head SHA.
