# Public profile visual fixes — 17 November 2026

Base: 8de51b2a62476af17de1aaa3956cefcc225fe1e0. Production observed at 1348px.

## Implemented

- Directory natural photographs use up to 340px of desktop width and their own aspect ratio, preserving custom crop modes and organization logos.
- Directory contact/expertise values use 16px text and readable line height. Long values wrap; narrow layouts remain one column.
- Breeder qualifications are available in a collapsed “Viac o chovateľovi” disclosure instead of repeating the whole biography in the initial sidebar. Structured breeding facts remain visible and unchanged. Semantic editorial duplicates are not automatically deleted or inferred from prose.
- Breed page/section headings use the same PublicHeading component as directory details.
- Height now uses the same complete-note disclosure as weight/lifespan. No measurement or explanation is invented.

## Production content still requires explicit recovery

These are already-truncated persisted/read-path values, not CSS clipping. The current main already preserves long specialist list items (`lib/breed-long-description.ts`) and accepts a 1000-character height. A UI deployment alone cannot restore lost text.

Source: https://app.notion.com/p/40f793fc1d1881759816dfa16becdf31, Psipedia ID 3246. Public: `/plemena/chrty/irsky-vlkodav`.

1. Height publicly ends `požaduje priemerná výška a`. Notion's complete existing value is:

   > Minimálna výška v kohútiku podľa FCI: pes 79 cm, suka 71 cm; pri psoch sa požaduje priemerná výška aspoň 86 cm.

2. Health risks publicly ends the first bullet `alebo výrazn`; the next starts `rovnako`. Notion's complete existing paragraph is:

   > Medzi významné sledované problémy patria ochorenia srdca vrátane kardiomyopatie, portosystémový skrat, osteosarkóm (zhubný nádor kostí) a akútne rozšírenie či pretočenie žalúdka (GDV). Náhle neúspešné dávenie, nafúknutie brucha alebo výrazný nepokoj vyžadujú okamžitú veterinárnu pomoc; rovnako treba bezodkladne vyšetriť pretrvávajúce krívanie. Tieto riziká sú známe na úrovni plemena, nie sú predpoveďou zdravotného stavu jednotlivca.

These are verbatim restoration candidates, not newly researched medical/FCI claims. Before writing, read current Admin/D1 values and field timestamps, confirm identity 3246, export the full record, and restore only these fields via the existing authenticated editor/sync path with optimistic conflict protection. Verify the complete record and public cache afterwards. No production D1/Notion values were changed in this PR. Browser authentication remains unavailable.

## Validation

20 targeted tests passed (including height explanation preservation); changed TypeScript files pass ESLint. Application build and its bundled breed integrity/import checks passed. Whole-repository TypeScript diagnostics are compared against the exact base separately; no unrelated type cleanup is included.

Visual evidence must come from this PR revision. The CI fixture may not contain Malkia Garden or Irish wolfhound; missing production-specific content must be explicitly reported, never treated as a passing visual check. No merge/deploy is authorized by this document.
