# Psipedia.sk — Notion articles: media, promo and published links

## Scope

This is a **Notion → Admin draft import** change only. It does not publish
articles, send emails, change the Facebook-image importer, or create articles.

### One-time Notion setup (after merge)

Add **Titulný obrázok** as a **Files & media** property to the existing
**Články** database (do not create another database). The importer treats
this property as optional so existing pages remain backward-compatible.

- Existing **Hlavný obrázok URL** wins if populated, preserving the existing
  editor ↔ Notion writeback and link-based workflows.
- Otherwise, the first and **only** entry in **Titulný obrázok** is used,
  whether uploaded to Notion or registered as an external file.
- The source image must be retrievable over HTTPS in JPG, PNG, WebP or AVIF,
  up to 8 MB. Existing redirect / image-byte validation is reused.
- Signed Notion downloads use the **stable Notion file ID** as the R2 cache
  fingerprint, so refreshed download signatures do not cause repeated uploads.
- The URL, ALT and source credit fields remain supported. A file-backed hero
  also becomes the article's OG image by default, as before with URL heroes.
- Do not paste expiring Notion signed URLs into `Hlavný obrázok URL`; use
  the Files property instead.

**Delivery from Gmail to Notion:** the user has an established email-based
delivery workflow for Facebook images. That workflow lives outside this
repository and **is not implemented or modified by this PR**. For an article
hero, the delivered image must actually appear on that article's Notion
`Titulný obrázok` property. Merely emailing an image does not create this
association automatically through this code. Verify the chosen email→Notion
delivery step before enabling a completely unattended article automation.

### "Psipedia bloky" article composition (already implemented)

Use Notion page content:

1. H2 `Článok — draft` followed by an actual introductory paragraph and at
   least two article H2 headings.
2. Regular paragraphs, H2/H3, lists, native external HTTPS images as needed.
3. An H2 `Psipedia bloky` containing a **JSON code block** with an array of
   supported Admin blocks. The manifest is editorial metadata, not prose.

Example (all URLs and article titles are illustrative and MUST be replaced
with real, currently published targets):

```json
[
  {
    "type": "psipedia-promo",
    "promoKey": "veterinari",
    "variant": "auto",
    "afterSection": "Kedy navštíviť veterinára"
  },
  {
    "type": "cta",
    "text": "Vyhľadajte odbornú pomoc v adresári Psipedia.",
    "buttonText": "Zobraziť veterinárov",
    "url": "/adresar/veterinari",
    "newTab": false,
    "sponsored": false,
    "position": "end"
  },
  {
    "type": "related",
    "title": "Skutočne publikovaný súvisiaci článok",
    "href": "/starostlivost/skutocny-publikovany-slug",
    "position": "end"
  }
]
```

- `promoKey` must be a key in `lib/article-promo.ts`.
- The Admin article editor already has an internal published-only picker.
  **New guard:** on Notion import, a `related` manifest block must point to
  a **currently publicly accessible** article at its **canonical Psipedia
  article URL**. Drafts, wrong routes, external URLs, fragments, and self-links
  are rejected. The import reports an error; it does **not** publish a
  dangling link.
- Existing contextual promo in the public article sidebar continues to work.
  Existing admin-created promo blocks are still preserved on reimport.
- This PR does not add automatically inserted galleries. The article-writing
  automation should instead put a brief gallery suggestion in the Notion
  `Poznámky` property and its hourly report when appropriate.

### Editorial approval gate (unchanged)

To import a new article **as an Admin draft**, set Notion properties:

- `Stav = Ready`
- `Odoslať na Psipedia = checked`

This is **not public publication**. Admin users review and publish manually.
Do not set editorial / SEO review checkboxes without actual human review.

### Validation

Run:

```sh
node --experimental-strip-types --test tests/notion-article-image-source.test.mjs tests/notion-article-related-publication.test.mjs
node --test tests/notion-article-sync.test.mjs
```

After deployment, test a single new Ready article that contains one Notion
Files hero, an internal promo and one link to a published article. Verify
image, OG fallback, draft status and no duplicate R2 upload after Notion's
signed URL rotates. Avoid touching the Facebook-image flow.
