# Psipedia.sk – Admin UI Unification, krok 5/18: ovládacie prvky a hlásenia

**Dátum:** 14. 11. 2026  
**Vzor:** existujúci editor článkov + kanonické `AdminActionButton`, `AdminFormFeedback`, formuláre V4.  
**PR:** #1369 (Draft). Zmena iba v admin CSS, kontrolnom teste a read-only CI workflow.

## Audítorské zistenie

Administrácia už vlastní jednotné interakčné komponenty (`components/admin-interaction-system.tsx` a `components/admin-form-feedback.tsx`), no CSS používalo rozdielne rozmery:
- `.action`: `padding: .65rem .9rem` a `border-radius: .7rem`;
- formuláre V4: `padding: 9px 12px`, `border-radius: 9px`, `min-height: 44px`;
- `AdminFormFeedback`: `margin: .65rem`, `padding: .7rem .85rem`, `border-radius: .7rem`;
- nástroje hromadných úprav: vlastný input radius `.65rem` a výstražné hlásenie s odlišnými farbami od ostatných chýb;
- shadcn-based field primitives používali samostatné hranice a rozmery.

Duplicitné DOM prvky alebo zbytočné JS implementácie sa **v tomto kroku nemažú**. Funkčné rozdiely patria do samostatného auditu.

## Zjednotené vizuálne tokeny

V `app/admin/admin-editorial-foundation.css`, **výhradne pod `[data-admin-workspace]`**, sú tokeny:
- `--admin-ui-control-padding-block: .55rem`;
- `--admin-ui-control-padding-inline: .75rem`;
- `--admin-ui-control-height: 44px`;
- existujúci `--admin-ui-field-radius: 9px`;
- `--admin-ui-feedback-space: var(--admin-ui-space-sm)`;
- `--admin-ui-error-text`, `--admin-ui-error-background`, `--admin-ui-error-border`.

Použité v existujúcich moduloch:
- `components/admin-interaction-system.module.css`: `AdminActionButton`/link a hromadné úpravy; päť farebných variantov zostalo rovnakých;
- `app/admin/admin-unified-forms.css`: V4 textové inputy, selecty a textarea, nie checkboxy/radio/file/hidden;
- `components/admin-shadcn-editor.module.css`: už existujúce adaptéry Input/Select/Textarea, tlačidlá a chybový text;
- `components/admin-form-feedback.module.css`: jednotné rozmery success/saving/error a field hint/error.

**Nemenené:** komponenty `.tsx`, React state, `onClick`/`onSubmit`, focus trap, `aria-live`, `role=alert/status`, validačné správy, loading, disable, ukladanie do D1, Notion, API, migrácie, public stránky, automatizácie.

## Bezpečnosť mobilu

- `AdminActionButton` má min. 44px dotykovú plochu a zachováva viditeľný focus.
- Polia vo V4 stále majú min. 44px; na mobile zostáva pre textové prvky `font-size:16px` kvôli Safari zoomu.
- Výberové polia, uploady, checkboxy a radio ovládanie sa nemenia na textové inputy.
- Nepridáva sa globálne `overflow-x:hidden`, žiadne nové `fixed` alebo `sticky` pravidlá.
- Skutočné pretekanie, soft keyboard a kolízie panelov ešte vyžadujú browser test na presnom PR HEAD.

## Overenie

Nový regresný test: `node --test tests/admin-controls-step5.test.mjs`.

Workflow `.github/workflows/admin-typography-contracts.yml` teraz spúšťa:
`node --test tests/admin-typography-step3.test.mjs tests/admin-density-step4.test.mjs tests/admin-controls-step5.test.mjs tests/admin-unified-ui-foundation.test.mjs tests/admin-editor-form-controls-step4.test.mjs tests/admin-ui-unification-inventory.test.mjs`

- [x] Kód má iba CSS, read-only CI a test/dokumentáciu.
- [x] Kontrola zdrojov: React handler a API súbory sa nemenili.
- [ ] Potvrdiť CI výsledok na aktuálnom HEAD.
- [ ] Screenshot a computed style na 1440/768/430/390/375/320px z presného PR HEAD.
- [ ] Zapracovať používateľom dodané konkrétne vizuálne výstupy z Work auditu.
- [ ] Pred merge odsúhlasiť reálne zobrazenie; GitHub Actions green nie je schválenie produkčnej zmeny.

**Status:** dokončená implementácia vizuálnych pravidiel; Draft PR, bez merge/deploy.

**Ďalej 6/18:** shell, sidebar, hlavička, sticky panel a správanie mobilného menu – len podľa overených vizuálnych nálezov a s bezpečnými E2E testami.
