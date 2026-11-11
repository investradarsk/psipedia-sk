# Služby V3 — jeden aktuálny katalóg vo všetkých konzumentoch (krok 3/6)

Dátum: 12. 11. 2026. Zmena v existujúcej vetve PR #1319 bez novej databázy, SQL migrácie a produkčných zápisov.

## Dátový kontrakt

- **Trvalé ID:** pôvodné `svc.*` alebo nové `svc.admin.*` zostáva nemenné. Nepárujeme služby podľa názvu.
- **Aktuálna definícia:** statický kanonický kontrakt + existujúca tabuľka `service_catalog_builtin_overrides` (0149) + aktívne dynamické služby v `service_catalog_admin_options`.
- **Alias po premenovaní:** pôvodný statický názov aj pôvodné aliasy sa pri importovaní staršieho textu stále mapujú na pôvodné ID; aktuálny zobrazovaný názov je z D1 override.
- **Kategórie:** override kategórií určuje oprávnenosť služby pri Notion relácii a pri profilovej textovej projekcii rovnako ako už existujúci verejný filter.
- **Fallback:** ak migrácia 0149 pri code-first rollout ešte nie je dostupná, použije sa nezmenený statický katalóg; chybný JSON v existujúcej tabuľke sa neprehliadne.

## Upravené konzumenty

| Konzument | Implementácia |
|---|---|
| Admin katalóg | `catalogEditorItems` používa `resolveBuiltInServiceDefinitions` |
| Textové služby profilu (D1 ↔ Notion) | `service-profile-notion-bridge` používa `loadResolvedServiceDefinitions` |
| Notion „Služby z katalógu“ | `canonicalItems` používa `loadResolvedServiceDefinitions` |
| Verejné `svc` filtre a mapové dotazy | Zachované existujúce SQL nad D1 override + aktívne profily; regresné testy dokazujú rovnaký názov a kategóriu |
| Automatický katalóg Notion | Päťminútový `runSimpleServiceCatalogSync` spracúva aj zmenené pôvodné **služby** v D1 override |

## Bezpečnostné opatrenia pri Notion katalógu

- Nové dynamické služby ostávajú v existujúcom jednosmernom toku D1 → Notion.
- Zmenené pôvodné služby sa aktualizujú **iba na už existujúcej Notion stránke so zodpovedajúcim `Option ID`**. Založenie ďalšej Notion stránky pre pôvodné ID je zakázané.
- Po PATCH nasleduje GET/readback a porovnanie aktuálneho názvu, skupiny, významu, kategórií a verzie.
- Ak pôvodná Notion stránka chýba, výsledok je `REVIEW / BUILTIN_NOTION_PAGE_MISSING`, nie neviditeľná duplicita.
- Originálne `svc.*` a dynamické `svc.admin.*` sa nemiešajú, nemení sa databázové ID ani auditná história.
- Automatický prenos pôvodných *vlastností* (`attr.*`) nie je súčasťou tejto zmeny; tento krok zjednocuje kanonické **služby** `svc.*`. Vlastnosti sa tým neprepisujú.

## Revízia verejného textu

- Pri výslovnom odobratí služby z profilu sa odstráni aktuálny názov aj rozpoznané predchádzajúce označenia **toho istého ID**, nie ostatný historický voľný text.
- Pri synchronizácii potvrdenej služby do `services_json` sa starý rozpoznaný názov nahradí aktuálnym na pôvodnej pozícii; nevytvorí sa druhá položka.
- Existujúce texty sa neprepisujú hromadne po úprave katalógu. Pri ďalšej cielenej synchronizácii profilu sa zosúladia; hromadné čistenie patrí do neskorších krokov s kontrolou konfliktov.

## Testy

- `tests/service-catalog-resolved.test.mjs`: premenovanie pôvodnej služby, zmena kategórie, súlad Admin/Notion/public dropdown, presmerovanie historických aliasov, zachovanie ostatného textu, fallback pri neaplikovanej 0149 a nesprávne kategórie.
- `tests/service-catalog-simple-sync.test.mjs`: overená aktualizácia existujúcej Notion stránky podľa ID bez duplikátu, opakovaná idempotentná synchronizácia, ďalšia verzia a chýbajúca stránka ako REVIEW.
- Existujúce `tests/service-catalog-public-filter.test.mjs` naďalej pokrývajú D1 override kategórií vo filtroch.
