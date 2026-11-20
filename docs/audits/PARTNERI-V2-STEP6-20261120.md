# Psipedia.sk – Partneri V2, krok 6/8: jednotné formuláre, galérie, náhľady a save

Dátum: 20. 11. 2026
PR: #1467, Draft. **Nezmergované, neotestované na produkčnej D1, nenasadené.**

## Implementované v pracovnej vetve

- Staré odkazy \`/partner/profily/novy\`, \`/partner/podujatia/nove\`, \`/partner/pomoc/nova\` presmerované na \`/partner/koncepty/novy?typ=...\`. Výsledkom je jedna cesta cez existujúce \`createPartnerCanonicalDraft\`, jeden záznam v pôvodnej D1 SQL tabuľke, jedna moderátorská žiadosť. Staré backendové endpointy sú zatiaľ zachované kvôli historickej kompatibilite, nie ako odporúčaná cesta.
- Nová definícia \`lib/partner-canonical-form-fields.ts\` prevzala verejné polia existujúcich partnerských editorov \`partner-profile-changes\`, \`partner-event-fields\`, \`partner-help-editor-fields\`. Kategória/technický typ je jediný povinný výber pri koncepte; ostatné obsahové polia sa môžu doplniť neskôr. SEO, interné číslo organizácie, stav publikácie, owner a neverejné kontakty nie sú editovateľné.
- \`components/partner-canonical-draft-form.tsx\`: šesť typov, spoločný mobilný responzívny formulár, súkromný lokálny náhľad, súkromné nahrávanie fotiek a galérie, \`Uložiť koncept\`, \`Odoslať na schválenie\`, stavy odoslania/vrátenia, pred/po revízia a chyby bez tichého zahodenia dát. Bez autosave.
- \`lib/use-partner-unsaved-guard.ts\`: potvrdenie pri odchode s neuloženými zmenami pri zatvorení/reloade a pri kliknutí na interný odkaz. Neimplementuje univerzálnu ochranu každého programatického presmerovania.
- \`lib/partner-canonical-workflow.ts\`: prísny allowlist public polí, typed help text/number/boolean/nullable/dátum, atomické porovnanie \`updated_at\`/CAS. Ukladá do existujúcej kanonickej D1 entity a nie do duplicitného JSON súboru.
- \`lib/partner-canonical-relations.ts\`: relačné zápisy sekundárnych kategórií, 0170 filtrov, 0173 galérie a hodín pre Adresár. Zachovaná nevyhnutná kompatibilitná projekcia \`source_data_json\` počas SQL cutover. Pri čítaní SQL-first s kompatibilitným fallbackom.
- \`lib/partner-canonical-media.ts\`: nahraté obrázky sú uložené ako private pending/attached \`media_assets\`. Samotný draft ich zobrazuje len cez autentifikované preview. Pri Admin APPROVE sa skopírujú bezpečne spracované R2 súbory, v D1 transakcii sa priradí verejná URL a označí schválený asset. Pri REJECT sa prílohy označia odmietnuté. Existujúce URL galérie pri pridaní zostávajú zachované.
- Použité existujúce limity (max 6 galéria, 8 MB jedna fotka), nie nové libovolné číselné limity. Rozhranie galérie používa stabilné \`useId\` a obnovuje pripojené nahraté fotky.
- Žiadna nová SQL migrácia. Produkčných tabuliek/Notion sa tento PR priamo nedotýka.

## Skutočný stav bezpečnosti

**Kód je napísaný a commitnutý do Draft PR, nie je potvrdený green build, D1 staging ani E2E.** Keďže používateľ nechce čakať na testy v tejto fáze, pri kroku 6 sa testy NEVYHODNOCUJÚ ako hotové, testovací release gate sa výslovne prenáša do kroku 8.

### Blokery kroku 8 – pred akýmkoľvek merge/deploy

1. Overiť TS build/lint, všetky branch CI. Vyladiť importy, názvy D1 stĺpcov, dátumové/číselné formáty, presné public allowlisty proti aktuálnej produkčnej schéme.
2. Na izolovanom D1 staging pre všetkých šesť typov: CREATE -> SAVE mult-field -> reload -> SAVE s R2 foto+galériou -> SUBMIT -> RETURN s dôvodom -> SAVE -> SUBMIT -> APPROVE / REJECT; overiť FK, \`changes()\` guard a žiadne duplikácie.
3. Overiť bezpečnosť obrázkov (cudzí asset, dvojité použitie, vymazanie pripojenej fotky, nesprávny typ, ukladanie prevzatého obrázka, re-approval, limit 6). R2 kopírovanie nie je atómové s D1 (prípadná osirelá public kópia má byť neodkazovaná). Overiť cleanup a konzistentný stav.
4. \`source_data_json\` v adresári je počas 0170/0173 cutover iba kompatibilitná projekcia, kanonický čítač SQL sa musí overiť voči aktuálnej vetve \`main\`. Skontrolovať kategórie mimo \`serviceFilterCategories\`.
5. Priamy editor schváleného partnera stále používa pôvodné endpointy, ktoré môžu mať **iné validačné pravidlá, názvy polí a obmedzenia**, než nový koncept. Úplnú zhodu s každým Admin-only public poľom nemožno deklarovať bez E2E verifikácie.
6. Úplná ochrana pred odchodom cez všetky programatické navigácie Next nie je zaručená len native beforeunload a klik-handlingom.
7. Krok 4: zabrániť manuálnemu zverejneniu partnerského draftu cez bežný Admin editor mimo approval, a všetkým historickým vetvám duplicít.
8. Pred merge rebase/merge aktuálne \`main\` – paralelné Adresár/Help/Plemená SQL migrácie môžu mať odlišnú schému či čítací kontrakt.

## Stav

**6/8 – implementácia zapracovaná v Draft PR #1467. Nenasadené.**
Nasleduje **7/8 – súkromný D1 chat s prílohami a voľby notifikačných kanálov**.
