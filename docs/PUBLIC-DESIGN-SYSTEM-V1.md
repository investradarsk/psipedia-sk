# Psipedia Public Design System V1

**Approved visual reference: the existing homepage.** Desktop public section and category landing pages must use its design, not a series of similar independent designs. The existing mobile UI is frozen.

## Single canonical sources

- **Photo hero:** `UnifiedSectionHero` and `UnifiedSectionHeroShell`, including the homepage itself. The approved homepage supplies the 330px desktop image height, overlay, colors, typography and crop geometry. Each section supplies only image and crop, eyebrow/title/intro, breadcrumbs and applicable contextual tools. No route-specific rewrites of the shared hero.
- **Search:** `HomePortalSearch` owns the visual. Different routes supply only copy, submit action, field name, search scope, query filters and shortcuts. Never change the endpoint, hidden query parameters or suggestion behavior to achieve visual consistency.
- **Banners:** `PublicMagazineBanner` is the approved homepage-derived promotional layout. `ps-public-banner-frame` is the shared shell for contextual and alert variants. Do not create a new banner markup or colors per route.
- **Cards, section headings, buttons, subcategories and filter controls:** use public-visual-system components and common design tokens. Content may differ; rendered styling of the same component must not.

## Intentional distinctions

Photo landing heroes are for landing and listing pages, **not** article/profile/event detail headers. Pages without a hero (legal, contact/task screens) are not required to add one. Breadcrumbs can occupy their own row without changing the core image and title design.

## Strict mobile regression gate

Do not visually change any <=767px public route. The homepage retains its approved 318px mobile photo, bottom-aligned text and inset search form; other sections retain their existing mobile rules. Every shared UI PR needs real screenshots at 320px, 390px, 768px and 1440px from the PR revision, with original-to-new mobile comparison. A static source test is not sufficient evidence.

## Merge requirements

- Verify homepage, /clanky, /plemena, /podujatia and representative category landing pages at every width.
- Confirm no clipping at 768px, no horizontal overflow and stable mobile spacing.
- Confirm each scoped search, query string, active filters and results still work.
- Confirm public promotional banners, related links and CTA semantics still work.
- Keep Notion, SEO, production data and detail-page redesigns out of this PR.

**Pending inventory:** Some legacy topic/task pages use `SectionHero` or special-purpose headers. They are not automatically changed in this first migration, because it could silently alter the approved mobile designs. Their compliance must be reviewed and explicitly verified before describing the whole public site as fully migrated.

VISUAL_REVIEW_ROUTES: /,/clanky,/plemena,/podujatia
