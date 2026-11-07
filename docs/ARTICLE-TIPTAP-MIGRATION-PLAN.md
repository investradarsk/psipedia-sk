# Article editor replacement (Tiptap) — 5 steps

Audit baseline: main commit 2e6f5eb885032bae8285ae2c1c2311ccc833227e, 2026-11-07.
Status: STEPS 1–3 integrated; STEP 5 regression repairs in draft PR #1234. STEP 4 NOT implemented; no production deploy or merge. Full palette and real fullscreen preview pending.

## Decision: reuse a real open-source editor

Use the Tiptap OSS Simple Editor template (MIT) and its React/Next.js components.
Keep the approved Psipedia three-column page design, with one section displayed
at a time, not a new generic dashboard. A single sticky rich-text toolbar acts
on the active text editor/block; click/selection, undo and focus must be correct.

The Simple template has common formatting controls and mobile UI. Arbitrary
text colors can be implemented with the free TextStyle/Color extension, and
multicolor highlights with Highlight.configure({ multicolor: true }). No
paid/Cloud functionality is assumed. Pin exact package versions and update
package-lock.json at integration time, preserving MIT attribution.

Next.js/SSR: mount client-side with immediatelyRender: false.

Sources:
- https://tiptap.dev/docs/ui-components/templates/simple-editor
- https://tiptap.dev/docs/editor/getting-started/install/nextjs
- https://tiptap.dev/docs/editor/extensions/functionality/color
- https://tiptap.dev/docs/editor/extensions/marks/highlight

## What the current Psipedia code actually stores

1. Canonical rich-text JSON AST v1 in lib/editorial-content.ts: paragraph,
   H2/H3, bullet/numbered list, blockquote and info/tip/warning callout;
   inline text, hard break, bold, italic, safe link. No arbitrary colors.
2. Managed articles have legacy intro and takeaway strings plus optional
   intro_rich_text_json and takeaway_rich_text_json mirrors; see
   lib/article-store.ts. Legacy fallback is used when rich-text JSON is absent.
3. Body content is a typed array in blocks_json, normalized in
   lib/article-blocks.ts: text, H2/H3, image/gallery, list, tip/warning, quote,
   table, source, related article, Psipedia promo, CTA and external embed.
   Non-text blocks carry keys/IDs/metadata independent of the text editor.
4. Public rendering: components/editorial-rich-text.tsx,
   components/article-blocks.tsx, and article detail. React renders safe nodes;
   no raw untrusted HTML injection.
5. Notion: docs/notion-article-block-manifest.md describes native content
   and manifest-based custom blocks, stable Notion IDs and merge behaviour.
   Any new formatting must be compatible with this synchronization.
6. Current admin save builds intro, takeaway, blocks, media, metadata, SEO,
   related breeds, authors and publication state in one payload; full content
   validation, concurrency guards and Facebook scheduling must remain intact.

## Step 1 files: an isolated compatibility boundary

lib/tiptap-editorial-bridge.ts converts between current safe JSON and a
Tiptap-compatible JSON structure without depending on a running editor.

The bridge supports only the v1 features and a custom psipediaCallout node
that must be registered in the later editor integration.
Unknown elements/marks, invalid nested structures and unsafe URLs throw
rather than being silently dropped. Focused regression tests exercise the
round-trip and unsafe content. This adapter is deliberately unused by the
production article editor and API in step 1.

IMPORTANT: The existing v1 normalizer silently discards unrecognized marks.
New formatting such as textStyle color, highlight, underline and future marks
MUST NOT be enabled for saving until the canonical content contract has a
versioned, backward-readable update, the API/store preserves the values, and
the public React renderer displays them. Existing v1 documents must continue
to load unchanged. JSON TEXT columns may accommodate this without a destructive
database migration, but it must be proven by tests. Do not persist raw Tiptap
HTML or bypass the current URL sanitization.

## Step 3 implementation and explicit safety boundary

The article intro, takeaway and body rich-text blocks now use scoped open-source
Tiptap 3.33.0 instances with one shared sticky toolbar: bold, italic, H2/H3,
lists, quote, callout, safe links, undo and redo. This uses the Tiptap engine
and a Psipedia-specific toolbar, not a verbatim copy of the Simple template.
The plain excerpt stays a plain-text field. Images, metadata and all non-text
article blocks retain their existing components. The Tiptap packages and
transitive dependencies are pinned in package-lock.json.

The unrestricted native color inputs (text and background) are visible but
intentionally disabled. The v1 Psipedia AST cannot preserve these styles.
Step 4 must extend parsing, storage, rendering and Notion compatibility before
the color controls are activated. Unsafe rich-text changes block save instead
of silently dropping material. Browser tests and a real npm-ci install still
require verification before merge.

## Step 5 regression audit (partial, step 4 dependency still open)

The first PR #1234 CI pass exposed two `react-hooks/set-state-in-effect`
errors in the new Tiptap component and a historical test that expected a
Lexical editor. Both were corrected. The React lint stage subsequently
passed. The image/upload regression assertion now checks the canonical
rich-text bridge instead of requiring the old Lexical implementation.

The shared toolbar is now scoped to the active, visible left-navigation
section; hidden text blocks cannot accidentally receive its commands.
Mobile browser regression coverage checks this explicitly and verifies that
full-color controls are gated until the public data contract supports them.
The sticky position now respects the admin shell's sticky header stack.
Existing E2E selectors were changed to address the single shared toolbar.

Unverified: real browser E2E completion, complete suite, published/legacy
articles round-trip after Tiptap input, cursor and undo state under all focus
transitions, final responsive screen inspection and color/preview flows.
No assertion of full step 5 acceptance or merge-readiness is warranted until
step 4 lands and these checks pass.

## Remaining steps

Step 2 — Reorder left menu (Publikovanie, Autor, Nastavenia, SEO,
Prepojené plemená, Fotografie, Úvod a obsah, Bloky článku); clicking shows
one selected section. Remove repeated heading/intro copy; compact the
publishing, settings and SEO forms. Keep original fields and save logic.

Step 3 — Install/pin the reviewed OSS Tiptap template and implement one
shared sticky toolbar for the currently focused text block, including lists,
links, headings, callouts, full color picker, highlights and accessible
keyboard controls. Keep article blocks expanded and retain custom types.
Do not save unsupported styles to v1.

Step 4 — Safely extend versioned normalization, persistence, public rendering
and Notion compatibility to support all activated formatting. Add a
full-screen unsaved preview using real public article components, with
desktop/mobile modes; no forced draft save/publish and no loss of text on
return to editing.

Step 5 — Visual and functional regression checks on mobile/tablet/desktop:
old articles, draft/published/new article, stable block IDs, images, sources,
promos and video embeds, focus/caret, undo, unknown content handling,
Facebook/Notion/SEO, server-side validation, full-screen preview, and
accessibility. No merge before verifying actual browser behaviour.

## Non-negotiable protection

No destructive rewrite of existing articles, no dropped media references,
IDs or custom blocks, no implicit publication, no malformed links, and no
unnoticed removal of unsupported formatting.
