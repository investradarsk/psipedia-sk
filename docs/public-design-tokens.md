# PSIPEDIA — Public Design Tokens (DS-1A)

**Status:** DS-1A semantic foundation; no component adoption or visual change.  
**Owner:** Public Design System (public-web design team; approvals through Riadiace centrum 1).  
**Reference:** `main` `c6ee039473083ac9a0de26fd24f0618677ddb58d`; file `app/design-system.css`.

## Purpose and layers

The public website already has brand/base values in `app/globals.css` and public geometry and layout values in `app/design-system.css`. DS-1A adds **semantic aliases only** inside the existing public token declaration block. It does **not** introduce another palette or change the visual language.

| Layer | Role | Example | Current owner |
| --- | --- | --- | --- |
| Base | Existing raw color, font, shadow and size sources | `--forest`, `--paper`, `--shadow-sm` | `app/globals.css` |
| Existing public/layout | Shared public sizing and page geometry | `--ps-content-max`, `--ps-radius-card` | `app/design-system.css` |
| Semantic | Expresses intent using base/public sources | `--ps-color-action-primary` → `--forest` | `app/design-system.css` |
| Component (future) | Opt-in CSS for a particular component | CTA, input, card, hero aliases; names TBD | DS-1B/DS-2+ with approved ownership |
| Responsive | Overrides of existing layout tokens | `--ps-radius-card` at ≤620px | Existing media block in `app/design-system.css` |

## Existing sources (unchanged)

The base palette is deliberately **not** copied into DS-1A's semantic layer. Source tokens keep their values and remain authoritative.

| Token | Base value | Token | Base value |
| --- | --- | --- | --- |
| `--ink` | `#17352b` | `--ink-2` | `#29483e` |
| `--forest` | `#174b38` | `--forest-dark` | `#0f392a` |
| `--sage` | `#dce8d8` | `--sage-light` | `#edf3e9` |
| `--cream` | `#f8f4eb` | `--paper` | `#fffdf8` |
| `--coral` | `#f47757` | `--coral-dark` | `#b94732` |
| `--gold` | `#e8b64c` | `--sky` | `#badde0` |
| `--muted` | `#52665d` | `--line` | `#dfe3d9` |
| `--white` | `#fff` | `--shadow-sm` | `0 8px 28px rgba(23,53,43,.08)` |
| `--shadow-lg` | `0 24px 70px rgba(23,53,43,.16)` | | |

Existing brand aliases `--brand-forest`, `--brand-canvas`, `--brand-surface`, `--brand-accent`, `--brand-accent-strong` and `--brand-focus` are also preserved. They are **not** renamed by DS-1A.

The 15 original public-layout tokens stay intact:

| Token | Desktop value | Mobile override (≤620px) |
| --- | --- | --- |
| `--ps-content-max` | `1180px` | — |
| `--ps-radius-control` | `12px` | — |
| `--ps-radius-filter` | `18px` | — |
| `--ps-radius-card` | `22px` | `18px` |
| `--ps-radius-media` | `0` | `18px` |
| `--ps-control-min-height` | `44px` | — |
| `--ps-card-padding` | `26px` | `20px` |
| `--ps-heading-section` | `clamp(2.2rem, 4vw, 3.75rem)` | — |
| `--ps-border-soft` | `rgba(23, 53, 43, 0.1)` | — |
| `--ps-border-strong` | `rgba(23, 75, 56, 0.18)` | — |
| `--ps-surface` | `var(--paper)` | — |
| `--ps-surface-raised` | `var(--white)` | — |
| `--ps-space-section` | `92px` | `64px` |
| `--ps-space-block` | `32px` | `24px` |
| `--ps-space-stack` | `20px` | `16px` |

## DS-1A semantic aliases (new; not yet consumed)

| New token | Exact source | Future intent |
| --- | --- | --- |
| `--ps-color-text-primary` | `var(--ink)` | Primary copy |
| `--ps-color-text-muted` | `var(--muted)` | Secondary copy |
| `--ps-color-action-primary` | `var(--forest)` | Primary action fill |
| `--ps-color-action-primary-hover` | `var(--forest-dark)` | Primary action hover fill |
| `--ps-color-action-primary-text` | `var(--white)` | Primary action text |
| `--ps-color-canvas` | `var(--cream)` | Canvas backdrop |
| `--ps-color-surface` | `var(--paper)` | Surface background |
| `--ps-color-border-subtle` | `var(--ps-border-soft)` | Subtle public border |
| `--ps-form-control-min-height` | `var(--ps-control-min-height)` | Compatible form control minimum touch height |
| `--ps-shadow-surface` | `var(--shadow-sm)` | Standard surface shadow |

### Naming and ownership rules

- Prefix these public semantic aliases with `--ps-`; use `--ps-color-<role>`, `--ps-form-<role>` and `--ps-shadow-<role>` where the role is unambiguous.
- Refer **only to authoritative existing custom properties**; no literal duplicate hex colors, radii or shadow definitions.
- Do not invent a global design decision for intentionally distinct components (pill CTA, editorial contrast, profile detail, gallery media).
- New component-specific aliases must be proposed by the owning phase; avoid names or dependencies that compete with DS-2 CTA/forms.
- Local `--pv-*`, `--detail-*`, `--public-*` and editorial accents are retained until opt-in component adoption.

### Responsive and visual exceptions

- DS-1A does not rewrite `@media` expressions, breakpoints, section spacing, touch heights or CSS selectors.
- The existing ≤620px overrides stay unchanged (including `--ps-radius-media`).
- Approved mobile full-width hero photos requiring zero border-radius are an **intentional exception**: never blindly apply the general media/card radius.
- Detail layouts have separate reading widths and visual accents; editorial pages keep their variants.

### Admin isolation

The root layout imports `app/globals.css` and `app/design-system.css`; admin routes can inherit both. The DS-1A aliases do not change the underlying base values. **Approved public-scoped adoption:** `app/design-system.css` provides DS-3 search styles, and `components/public-visual-system/public-visual-system.module.css` owns DS-2A CTA variants using matching semantic action tokens. No admin module may consume these aliases. Existing brand, section-tone and accessibility exceptions remain explicit.

### Adoption contract for DS-1B and later

1. First agree the owning primitive and variants (DS-2 for CTA/form controls; DS-3 for search/filters).
2. Demonstrate the new alias resolves to the same computed value **at every relevant viewport**.
3. Migrate small independently testable groups; explicitly retain visual exceptions.
4. Run source-contract, keyboard, mobile and browser screenshot regression tests before requesting approval.
5. The former **no-consumer** test now allows only the scoped canonical CTA module; additions need a separately reviewed ownership rule and value-equivalence test.

**The semantic foundation remains opt-in, not a global visual reset.** DS-3 search and canonical CTA variants now resolve their matching green and white values through the same semantic action aliases. The contextual banner reuses the existing public filter-radius token (18px). Other visual primitives, legacy controls and admin remain unchanged until explicitly migrated; no runtime, SEO, API, database, or feature flag changes are included.
