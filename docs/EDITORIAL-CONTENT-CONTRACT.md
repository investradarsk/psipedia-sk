# FOUNDATION-EDITORIAL — Content & Editorial Contract

Source-of-truth baseline: `5b281ae18684aa1d3def10abdcf54718f37ad1a5`.

This foundation deliberately defines storage, normalization, safety and compatibility contracts only. It does not implement the future Word-like article editor, redesign the public article, or migrate other admin modules.

## Canonical rich-text contract

Canonical rich text is a versioned JSON AST (`version: 1`) defined in `lib/editorial-content.ts`.

Supported v1 blocks:

- paragraph,
- heading levels 2–3,
- bulleted and numbered lists,
- blockquote,
- callout with `info`, `tip` or `warning` tone.

Supported inline content:

- plain text,
- bold,
- italic,
- links,
- explicit safe line breaks.

Raw HTML is not part of the contract. Unknown nodes and marks are discarded by normalization. Link targets are restricted to internal single-slash paths or HTTP(S) URLs. The shared React renderer never uses `dangerouslySetInnerHTML`.

The existing Markdown-lite syntax remains a compatibility/input adapter. Existing article text is converted to the v1 AST at read/write boundaries without requiring a production content rewrite. The future WYSIWYG editor should read and write the AST directly instead of adding another storage format.

Article intro and takeaway retain their legacy text columns and gain nullable canonical JSON mirrors:

- `intro_rich_text_json`
- `takeaway_rich_text_json`

Body text/callout/quote blocks can carry the same `richText` document while keeping their legacy `content` string. This makes migration gradual and fail-safe.

## Optional-field decisions

### “To najdôležitejšie”

The takeaway is optional. Server validation no longer requires a minimum length, the current editor no longer marks it required, and the public article omits the box when it is empty.

### Sources

A generic article does not require an expert/source block. If a source block is present it must still contain a valid label and HTTP(S) URL.

The existing publication safety rule for **Novinky** is intentionally retained: a non-draft news item needs at least one verifiable source. That is a news publishing rule, not a global requirement for public text fields.

### Accent

`accent` is not a required API input; invalid/missing input safely falls back to `forest`. The database column remains `NOT NULL DEFAULT 'forest'` for backward compatibility because it is still consumed by existing placeholder/accent presentation code.

Decision: **optional compatibility token; candidate for later deprecation**. Do not remove the column until ARTICLE-PUBLIC / public visual work confirms that no remaining public or admin presentation depends on it.

## Author profile foundation

Canonical profiles live in `editorial_author_profiles` and support:

- `individual`, `team`, and `external` kinds,
- stable numeric ID and unique slug,
- display name,
- optional avatar,
- optional short bio,
- optional role,
- active/inactive state,
- one active default profile.

The migration creates only the safe default team profile `redakcia-psipedia` (“Redakcia Psipedia”). It intentionally does not invent personal or external-author records.

`managed_articles.author_profile_id` is nullable and uses `ON DELETE SET NULL`. The legacy `author` text column is preserved. Existing production articles are **not backfilled** and continue to render their legacy author text. New writes can resolve a canonical active profile; if no canonical relation exists, the legacy text remains a valid fallback.

The future ARTICLE-ADMIN workstream should add the profile picker and author-profile CRUD/management UX. This foundation does not add that UI.

## Media and video contract

The current upload endpoint accepts images only (JPG, PNG, WebP, AVIF). Therefore this foundation does **not** claim self-hosted video upload support.

External inline video is allowlist-based:

- YouTube / YouTube Shorts / `youtu.be`,
- Vimeo.

Only HTTPS URLs on exact approved hosts can produce iframe metadata. YouTube is normalized to `youtube-nocookie.com`. Arbitrary HTML, iframe snippets, `javascript:`, `data:`, lookalike domains and non-HTTPS video URLs cannot become inline players.

Existing safe but non-allowlisted HTTP(S) embed URLs retain backward-compatible link-only behavior rather than becoming iframes.

A future self-hosted video implementation must first add a dedicated upload/media contract covering accepted video MIME types, file-size limits, validation/transcoding strategy, storage lifecycle, delivery/range requests and cleanup semantics. It should then add a distinct self-hosted video representation rather than overloading arbitrary embed HTML.

## Reuse

The rich-text AST and renderer are intentionally article-agnostic. Later work may use the same contract for public text fields in Šteniatka, Adresár, Pomoc, Organizácie and other admin modules. This PR does not migrate those modules.

## Migration strategy

`drizzle/0043_editorial_content_foundation.sql` is a forward-only append following the repository's MIG-0 conventions. Drizzle journal/snapshots stay frozen.

The migration:

- creates `editorial_author_profiles`,
- seeds the default editorial team profile,
- adds nullable `author_profile_id`,
- adds nullable intro/takeaway rich-text JSON columns,
- adds indexes.

It does not drop or rewrite article content, does not backfill production articles, and does not remove legacy columns.

## Security model

Security is structural rather than based on accepting and cleaning arbitrary HTML:

- no raw HTML node exists in the AST,
- unknown/invalid rich-text nodes are dropped,
- malicious href schemes are rejected,
- rendering uses React nodes, not HTML injection,
- external video iframe URLs are generated only from the provider allowlist,
- invalid external video content falls back to a normal safe link only when the URL itself is HTTP(S).

Focused tests cover malicious links, script-like/iframe-like nodes, invalid video/embed input, valid YouTube/Vimeo input, author compatibility and the forward-only migration contract.

## ARTICLE-ADMIN follow-up

ARTICLE-ADMIN remains responsible for:

- Word-like/WYSIWYG editing UX over this AST,
- formatting toolbar and keyboard behavior,
- author profile selector and profile management,
- rich-text editing for article intro/body/takeaway without legacy textarea syntax,
- dedicated uploaded/self-hosted video UX only after media infrastructure supports it,
- any decision to hide/deprecate the accent control,
- editorial validation/error presentation around the canonical contract.
