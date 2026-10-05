# Notion → Psipedia article block manifest

The Notion article body remains human-readable. The section `## Článok — draft` is synchronized until `## SEO`.

Rich text annotations in the draft are mapped to Psipedia editorial rich text:
- bold
- italic
- internal and external links
- paragraph/callout/quote formatting

Native draft blocks supported directly:
- H2 / H3
- paragraphs
- bulleted and numbered lists
- quote
- callout (⚠️ = warning, other callouts = tip)
- external HTTPS image
- external video/embed
- Notion table

## Psipedia bloky manifest

For Admin-only article blocks, add a top-level section named either:

`## Psipedia bloky`

or

`## Redakčné prvky pre Psipedia Admin`

Inside that section, add one top-level JSON code block containing an array. Each item is normalized through `normalizeArticleBlocks`, so only existing safe Admin block types and valid URLs/promo keys survive.

Placement keys are metadata for the sync and are removed before normalization:

- `afterSection`: insert after the full matching H2/H3 section
- `beforeHeading`: insert immediately before the matching H2/H3
- `position`: `start` or `end`; default is end

Example:

```json
[
  {
    "type": "psipedia-promo",
    "promoKey": "treneri",
    "variant": "auto",
    "afterSection": "Kontakty s inými psami: kvalita je dôležitejšia než počet"
  },
  {
    "type": "related",
    "title": "Socializácia šteniatka",
    "href": "/steniatka/socializacia-steniatka",
    "description": "Ako budovať bezpečné skúsenosti v citlivom období.",
    "afterSection": "Čo sa počas dospievania mení v správaní"
  },
  {
    "type": "source",
    "label": "Asher et al. (2020)",
    "url": "https://doi.org/10.1098/rsbl.2020.0097",
    "note": "Peer-reviewed výskum adolescentnej fázy."
  }
]
```

The manifest may use every block type supported by `ArticleBlock`: text, h2, h3, image, gallery, bullet-list, numbered-list, tip, warning, quote, table, source, related, psipedia-promo, cta and embed.

Notion-owned manifest blocks receive stable `notion-` IDs. On later syncs they are replaced from Notion rather than preserved as manual Admin promos. Manual Admin promo blocks remain preserved.

## Image rules

The main image continues to use the Notion properties:
- `Hlavný obrázok URL`
- `Alt text obrázka`
- `Zdroj obrázka`

The source must be a public HTTPS image. The sync copies it to R2. ALT and source URL are synchronized even when the image bytes are unchanged.

Native inline Notion images are accepted only when their source is an external public HTTPS URL. Notion-hosted signed file URLs are intentionally not persisted because they expire.
