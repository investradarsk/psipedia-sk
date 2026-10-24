# PSIPEDIA — Open Source Production Integration 01

Continuation after merged PR #1033. This PR **actually changes existing canonical admin components** and keeps all database and API structures unchanged.

## Added to production

- **Fuse.js 7.1.0**: Gemini's "Všetky koncepty" keeps the existing accent-insensitive substring search. Only when that returns zero matches and the query is at least 3 characters is an additional typo-tolerant Fuse search performed. Category and review-state filters remain strict.
- **Zod 4.4.3**: Validation of photos added by URL in the canonical `AdminPhotoGallery` component. Promote the existing transitive locked Zod dependency to a direct dependency.
- **React Hook Form 7.91.0**: Manages the gallery's URL input without creating a nested form or changing the canonical profile save operation.
- **Lucide React 0.553.0**: Gallery arrows, remove and add icons. Existing descriptive aria labels and 44 px targets are preserved.
- Exact NPM package versions and SHA-512 lockfile integrities; no SaaS account or new authentication.

## Scope boundaries

No new Gemini API calls, no changes to D1 / R2 / Notion data models, no new sitemap generator, and no Cloudflare configuration changes.

**Remaining approved projects** — Radix, TanStack Table, TanStack Virtual, React Dropzone, dnd-kit and Lexical — are in the isolated proof-of-concept merged in #1033 and have NOT been deployed in canonical components yet. Their migrations need separate compatibility and regression verification (especially Lexical's article format).

SEO SiteOne Crawler and Linkinator tools from #1033 remain available; no duplicate crawler jobs or unnecessary Google API added.

## Acceptance

- `npm ci`, `node --experimental-strip-types --test tests/open-source-production-ui.test.mjs`, `npx eslint components/admin-photo-gallery.tsx components/admin-gemini-all-concepts.tsx lib/admin-photo-gallery-url.ts lib/gemini-concept-fuzzy-search.ts`, `npm run build`.
- Existing `node tests/admin-photo-gallery.browser.mjs` browser regression and manual 320/390px gallery verification.
- Review bundle-size impact from the four new production deps.
- No automatic merge or deployment.

Note: The existing repository-wide TypeScript check currently reports many unrelated baseline errors (including `TS5097` in legacy imports and old test fixtures). New PR checks use scoped ESLint, focused runtime tests and the actual production build; this PR does not purport to solve unrelated TS debt.
