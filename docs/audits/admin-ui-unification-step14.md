# Psipedia.sk – krok 14/18: Gemini, Facebook a sociálne nástroje

**PR:** #1369 (Draft), vetva `chore/admin-visual-unification-step2-audit-20261114`. **Žiadne spojenie do main ani produkčný deploy.**

## Východisko: audit skutočných zdrojov

- `/admin/automatizacie-gemini` už má **hlavný STOP**, bezpečný stav nedostupnej D1, manuálne spustenie so schvaľovaním, plánovanie v 22 kategóriách, prehľad FIFO a chyby platených behov. Žiadna nová automatizácia ani prepínač nie sú potrebné. Predchádzajúci CSS mal 16–32px medzery, 17–20px padding kariet, vstupy v kompaktnej kategóriovej sekcii s výškou 40px a niekoľko rozdielnych focus štýlov.
- `/admin/automatizacie-gemini/koncepty` používa existujúce API pre všetkých 22 kategórií, manuálny prenos do Adminu, filtrovanie, stránkovanie a potvrdenie presunu do Notion koša. Existujúcu širokú tabuľku treba ponechať v lokálne posúvateľnom regióne a zvýrazniť stĺpec Akcie; neprepisovať synchronizáciu.
- `/admin/automatizacie-gemini/prompty` má funkčný dvojpanelový editor kategórií a ručné ukladanie. Dôležité je aby sa na mobile nevytvorila ďalšia vnorená scroll oblasť.
- `/admin/facebook-obrazky` už má mesačný **aj týždenný** kalendár, stavové filtre, nadchádzajúce príspevky, Notion sync, STOP/approval, bezpečné retry stavy, tvorbu a inline úpravu príspevkov. Používateľské operácie sa nesmú meniť ani zjednocovať s nekontrolovaným okamžitým publikovaním.
- `AdminFacebookGraphicEditor` a `AdminFacebookWeeklyPlanner` podporujú pôvodné ovládanie dotykom/prstom, Konva canvas, orez a posun loga v pevnom rámiku, profily, tri vizuálne varianty loga, export PNG a uloženie grafiky do konceptu. V tomto kroku sa mení iba štýl.

## Implementované

### Gemini

1. `AdminGeminiAutomationSettings`: `data-admin-content-module="gemini-automation"`, opt-in označenia STOP, metrík a dvojstĺpcového priestoru. Menšie marginy, paddingy, fonty a karty, spoločné admin tokeny a min. 44px kontroly. Vizuálne upozornenie **Hlavný STOP Gemini** zostáva stále nad metrikami aj pri 320px. Na mobile sú panely v jednom stĺpci.
2. `AdminGeminiAllConcepts`: prístupný filtrovací landmark `role=search`, focusovateľný `role=region` na lokálne posúvateľnej tabuľke, dostupné stránkovanie. Stĺpec **Akcie** má na desktope opt-in CSS sticky s `right: 0`; všetky pôvodné statusy, uloženie/Notion/koš zostávajú.
3. `AdminGeminiQuickSettings` a `AdminGeminiCategoryPromptEditor`: kompaktné 44px akcie a labely, na mobile 16px vstupy a rozloženie do jedného stĺpca. Žiadne zmeny request payloadov, plánovania, potvrdenia ani `dirty` ochrany.

### Facebook

4. `AdminFacebookImages`: opt-in `data-admin-content-module="facebook-posts"`, markery metrík, kalendára, zoznamu a stránkovania, zrozumiteľnejší nadpis „Plánovanie Facebook príspevkov“. Menšie panely, ale stále dobre čitateľné stavy, 44px akcie a lokálne posúvateľné kontrolné oblasti.
5. Samotný Facebook editor príspevku: kompaktný dialóg a formuláre, 16px textové inputy na mobile, 44px operácie, zachované `save("draft")`, `save("scheduled")`, publikovanie vyžadujúce schválenie, história a odporúčania pri neistom odoslaní.
6. `AdminFacebookGraphicEditor`: opt-in markery editora, ovládačov a náhľadu; kompaktnejšie fieldsety, dotykové plochy, bezpečné odsadenie náhľadu pri sticky hlavičke a safe-area vo fullscreen náhľade. **Konva transformácie, výrez, logo, PNG a použitie v príspevku zostali bez úpravy.**
7. `AdminFacebookWeeklyPlanner`: min. 44px tlačidlá v editácii slotov, 16px mobilné vstupy, kompaktný grid; zachovaný týždenný 2-týždňový plán a existujúce akcie.

## Bez zásahov do logiky a dát

Bez zmien D1/R2, Notion sync, Gemini GitHub workflow, platených operácií, FIFO, plánovača, bezpečnostného globálneho STOP, Meta tokenov, schvaľovania a súhlasu vlastníka, retry logiky, publikovania, dátumových prechodov CET/CEST, API volaní, GDPR alebo grafického canvasu. Nezavádza sa nový cron, migrácia ani automatické generovanie alebo zverejnenie.

## Testovanie

- `tests/admin-social-visual-step14.test.mjs` – 6 read-only kontraktov pre Gemini STOP, frontu, 22 kategórií, CSS, import/koš a Facebook approval/export.
- `tests/e2e/admin-social-visual-step14.spec.ts` – izolované localhost Playwright scenáre pre 320/390/768/1440px. Overenie STOP tlačidla **bez kliku**, Gemini filtrov, týždenného/mesačného prepínača Facebooku a otvorenia grafického editora **bez uloženia/odoslania/exportu**.
- CI `.github/workflows/admin-typography-contracts.yml` rozšírený o nové súbory a read-only zdrojový test.

## Otvorené pred merge

- [ ] Posledný HEAD: TypeScript, zdrojové testy, Playwright a relevantné Facebook/Gemini CI.
- [ ] Skutočný iOS Safari pri 320/375/390px: zmena mesiaca/týždňa, otvorenie dialógu, full-screen crop, safe-area a soft keyboard.
- [ ] Vizuálne screenshoty desktop 1440px; test príliš dlhých názvov a neúplných/pending chybových stavov.
- [ ] Konflikty s aktuálnym `main` a účelný rebase pred merge (vetva zaostáva a súbežné PR aktualizujú admin).
- [ ] Výslovný súhlas vlastníka pred merge; #1368 je samostatný Knip read-only audit pre krok 17.

**Nasleduje 15/18:** Kvalita údajov, mapy a technické nástroje.
