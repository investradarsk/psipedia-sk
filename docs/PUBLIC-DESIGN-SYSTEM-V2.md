# Psipedia Public Design System V2 — Premium Editorial

Status: implementation stages 1–14 complete; stage 15 acceptance in progress. Approved visual direction: Premium Editorial prototype V9 (24 November 2026). One shared branch and one draft PR; do not merge until all 15 steps and final visual review are complete.

## Canonical foundation

`app/premium-foundation.css` is the single source for V2 public theme values. Existing V1 root defaults remain available for the internal Admin; public and Partner use the scoped V2 values. Do not change Admin, route behavior, authentication, data, SEO, Notion, publication logic or legal copy in this migration.

- Newsreader variable for display/editorial headings; Inter variable for body, controls, navigation, metadata and long-form prose. Both are local WOFF2 files with SIL OFL notices in `public/fonts/`. No external font requests. Normal faces are shipped in step 1; italic uses browser synthesis until an explicit italic face is needed.
- Brand forest #174D3A; brick #B44939; cream #F7F2E9; ink #17352B; paper #FFFDF9.
- Gradient: 115deg, #36735E at 0%, #235743 at 42%, #102F26 at 100%. Use for green editorial banners/panel headers, not indiscriminately on photos or ordinary controls.
- Dark surface title #FFFAF0, kicker cream without a label background, brick accent line. Do not use brick lettering on green: contrast is inadequate. Cream on the lightest gradient stop is about 4.99:1; check actual artwork and overlays independently.
- Large banner radius 18px, small banner 16px, card/panel 14px, media 10px, control 9px. Status chips and circular icon controls may retain their semantic shape. Preserve 44px minimum target size for existing public controls.
- Minimal shadows; shared motion tokens with reduced-motion support. Use explicit semantic state colors for urgent, error, success and warning; decorative brand colors must not obscure state meaning.
- Shared photo heroes retain real imagery, meaningful cropping, breadcrumbs, search functionality and legibility. Do not replace all photo heroes with a promotional banner.
- V2 deliberately supersedes the old V1 mobile appearance freeze only for this approved redesign. Keep mobile functionality and validate every changed family at 320, 390, 768, 1024, 1440 and 1920px.

## Migration checklist

1. Foundation and fonts (implemented in this PR; CI and browser verification pending).
2. Shared cards, controls, headings and forms (implemented in shared renderers; CI and browser validation pending).
3. Header, footer, navigation and search.
4. Banners, sidebar panels and rankings.
5. Homepage and section landing pages.
6. Articles, news, health, training and puppies.
7. Breed atlas, groups, profiles, FCI standards and comparison.
8. Directory, categories, regions and all profile variants.
9. Events listing, calendar and details.
10. Help: adoption, lost/found, organizations, other help and reporting.
11. Reviews, tests, e-shops and reviewer authentication.
12. All 27 Partner page templates, including authentication, onboarding, drafts, profile/event/help editing, claims, notifications, chat, settings and promotion.
13. Contact, about, terms of use, operator/legal, privacy, cookies, content policy, feedback.
14. Search results, favorites, map, name days, verification, outreach unsubscribe, 404, empty/loading/error states, overlays and legacy CSS cleanup.
15. Full visual and functional regression review, including authenticated Partner and internal Admin non-regression.

Audit baseline: 85 non-Admin page templates (58 public, 27 Partner), including dynamic routes; 93 CSS files outside explicitly named Admin paths. Re-enumerate the actual branch tree at final review to include newly added routes. Review at least one representative of every dynamic variant and all static templates. Record route, viewport and evidence. Existing tests that pin V1 appearance must be updated only where an approved V2 visual contract actually changes. Do not disable functional tests or lower unrelated thresholds.

## Font provenance

- Inter: rsms/inter, docs/font-files/InterVariable.woff2, upstream blob 5a8d3e72ad7ffb62af3b146e1b1f54ab5813a212.
- Newsreader: productiontype/Newsreader, fonts/variable/woff2/Newsreader[opsz,wght].woff2, upstream blob a505dbbcd93a7462b5b73c0ea55c90fb83897988.
- Font family aliases isolate the public font faces from Admin's existing system Inter fallback.

### Step 2: shared primitives

Shared component modules now consume the scoped font, radius, control, shadow and motion tokens. Editorial title roles use Newsreader; labels, metadata, actions and form controls use Inter. Keep featured media edge-to-edge inside its clipped card; thumbnails use the shared radius. Preserve component HTML, link semantics, GET params, labels, disabled/loading/invalid states, 44px public target sizes and forced-color focus. Context-specific variants and the partner/local page styling remain migration work in their respective stages.


## V2-15 integration preflight — 24 November 2026

All stage prefixes V2-01 through V2-14 are present in the PR commit list at `827be774de9958f811a3fa210460d76362cfc97c`; this is implementation evidence, not acceptance. Integrated PR #1582's scoped public-detail changes against its own base, preserving V2's 500 display weight, shared Newsreader role, gradient, radius tokens and small utility-label typography. The 15 non-overlapping files were checked against #1582's base blobs; the four overlapping CSS files were reconciled without replacing V2 with V1. Existing Partner ownership heading styling already satisfies the V2 font role. The review is still Draft pending CI and rendered evidence.

### Route inventory

85 non-Admin page files (27 Partner); dynamic patterns below are templates, not concrete data instances. `app/not-found.tsx`, if present, is an additional non-page state to audit. No claim of visual or functional verification is made.

- `/[section]/[slug]`
- `/[section]`
- `/adresar/[category]/[slug]`
- `/adresar/[category]/[slug]/upravit`
- `/adresar/[category]/kraj/[locationSlug]`
- `/adresar/[category]/mesto/[locationSlug]`
- `/adresar/[category]/okres/[locationSlug]`
- `/adresar/[category]`
- `/adresar/chovatelske-stanice/kraj/[regionSlug]`
- `/adresar/chovatelske-stanice/plemeno/[breedSlug]/kraj/[regionSlug]`
- `/adresar/chovatelske-stanice/plemeno/[breedSlug]`
- `/adresar`
- `/adresar/utulky-a-zachrana`
- `/clanky/[slug]`
- `/clanky`
- `/clanky/plemena`
- `/cookies`
- `/hladat`
- `/kontakt`
- `/mapa`
- `/novinky/poslat-tip`
- `/o-nas`
- `/oblubene`
- `/odhlasenie-osloveni/[token]`
- `/opravy-a-podnety`
- `/organizacie/[slug]`
- `/organizacie`
- `/overenie-profilu/[token]`
- `/`
- `/partner/google-navrat`
- `/partner/koncepty/[id]`
- `/partner/koncepty/novy/[kind]`
- `/partner/koncepty/novy`
- `/partner/nastavenia`
- `/partner/obnova-hesla`
- `/partner/onboarding`
- `/partner/overenie`
- `/partner`
- `/partner/podujatia/[resourceId]/upravit`
- `/partner/podujatia/nove`
- `/partner/podujatia`
- `/partner/pomoc/[resourceId]/upravit`
- `/partner/pomoc/nova`
- `/partner/prepojit-google`
- `/partner/prevziat-profil/[type]/[id]`
- `/partner/prevziat`
- `/partner/prihlasenie`
- `/partner/profily/[resourceId]/upravit`
- `/partner/profily/novy`
- `/partner/profily`
- `/partner/propagacia`
- `/partner/registracia`
- `/partner/spravy`
- `/partner/upozornenia`
- `/partner/zabudnute-heslo`
- `/partner/ziadosti`
- `/plemena/[slug]/[breed]/fci-standard`
- `/plemena/[slug]/[breed]`
- `/plemena/[slug]/fci-standard`
- `/plemena/[slug]`
- `/plemena`
- `/podmienky-pouzivania`
- `/pomoc-psom/[category]/[slug]`
- `/pomoc-psom/[category]`
- `/pomoc-psom/adopcia/[slug]`
- `/pomoc-psom/adopcia`
- `/pomoc-psom/nahlasit-psa-v-nudzi`
- `/pomoc-psom/najdene-psy/[slug]`
- `/pomoc-psom/najdene-psy`
- `/pomoc-psom`
- `/pomoc-psom/stratene-a-najdene/nahlasit`
- `/pomoc-psom/stratene-a-najdene`
- `/pomoc-psom/stratene-psy/[slug]`
- `/pomoc-psom/stratene-psy`
- `/porovnat-plemena`
- `/pravne-informacie`
- `/psie-meniny`
- `/recenzia/napisat`
- `/recenzia/overenie`
- `/recenzia/prihlasenie`
- `/recenzie/eshopy/[slug]/hodnotit`
- `/recenzie/eshopy/[slug]`
- `/sukromie`
- `/tema/[slug]`
- `/zasady-obsahu`

Required next checks: six viewport widths, authenticated Partner, Admin isolation, maps, contrast, keyboard, SEO/data integrity, and all failing CI. No screenshot or browser pass was established by this integration.

## Approved Premium Glass accent (25%)

The V9 editorial visual system is unchanged. Apply the 25% concept as a small family of shared interaction surfaces, not a literal opacity percentage. Canonical `--ps-glass-*` tokens live in `app/premium-foundation.css`: cream translucent chrome, restrained specular edges, gradient controls, dark green accents. Site header uses a pseudo-element for blur so fixed search and mobile navigation remain viewport-relative. Search panels, suggestions, menu, quick links, icon buttons, category arrows, ranking tabs, non-urgent banner action sheen (default dark banners also receive dark green glazed primary CTA; published desktop customization remains intact), consent surface, back-to-top and Partner workspace/auth selection and suggestions adopt those tokens. Preserve managed banner button colors, urgency and error semantics. No new fonts, media, scripts, external dependencies, route changes or Admin styling. Content surfaces, photos and long legal/editorial texts remain opaque. Reduced transparency and forced colors use solid fallbacks. Browsers without backdrop-filter use solid surfaces; mobile blur budget is reduced. The full responsive visual audit and CI are still required, especially overlay geometry and contrast.


## V2-15 evidence audit — 24 November 2026

Inspected revision `56c1dea35455f6c0988e311b69104feec886bf8d` (CI merge build `da7038a6c014f40a3a8d576ac0056faf81559b1f`). The built server's registered page paths independently confirm 85 non-Admin page files (58 public, 27 Partner). All 20 executed Actions workflows passed; 8 were skipped by workflow conditions. No failure was reported for this revision. This is scoped CI evidence, not a full production or all-route pass.

- [Visual evidence](https://github.com/investradarsk/psipedia-sk/actions/runs/45490453742): homepage, Directory, Events and Help rendered at 320/390/1440 px; 12/12 HTTP 200 and 0 px horizontal overflow. Viewport screenshots manually sampled at all three widths; editorial heading, cream/green palette and glass controls visibly present. Hero image availability varied between captures in the isolated runtime; this does not establish that production photos are preserved on every route.
- [Playwright and build](https://github.com/investradarsk/psipedia-sk/actions/runs/45490453567): lint/build and scoped regression suites, Directory desktop/mobile, search, lost/found and public detail accessibility passed. Admin services/profile screenshots sampled at desktop and mobile show the separate Admin layout and sans-serif typography; this is not complete Admin before/after or navigation-transition verification.
- [Partner](https://github.com/investradarsk/psipedia-sk/actions/runs/45490453642): isolated auth/security/build and desktop/mobile browser checks passed, not all 27 authenticated screens. [Map](https://github.com/investradarsk/psipedia-sk/actions/runs/45490453612): desktop/mobile map, filters, consent and rollback passed; visual samples reviewed. [Review submission](https://github.com/investradarsk/psipedia-sk/actions/runs/45490453657) and [DS-5](https://github.com/investradarsk/psipedia-sk/actions/runs/45490453593) passed.
- Detail fixture screenshots for Directory, Events, adoption, lost/found, other Help and organizations were sampled; the fixture bundle omitted the production premium foundation and local fonts. Consequently those screenshots cannot establish Premium V2 typography. Commit `508a0e9be68532555b3a4d65fe44c273d4be2e3d` repairs the fixture CSS imports, font asset handling and adds actual font-loading and computed typography assertions, preserving existing behavioral/accessibility checks. New CI and screenshot evidence required before acceptance.

Remaining acceptance gates: review regenerated detail screenshots; check every static page and representative dynamic variant across the requested six widths (320/390/768/1024/1440/1920); authenticated Partner and Admin transition/non-regression; browser Glass fallback and overlay geometry; SEO/data integrity; owner visual approval. The standard visual evidence workflow intentionally caps real routes at four, so the existing archive cannot establish that wider matrix. Do not mark V2-15 complete or merge based solely on green scoped CI. No deployment was performed.
