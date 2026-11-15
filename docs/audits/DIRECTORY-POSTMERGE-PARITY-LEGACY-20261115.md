# Psipedia.sk – po-merge audit 3/4/5 (15. november 2026)

**Referenčný merge:** PR #1384, `5a0e4be221c6bf35c9ac04cc5cb513b14cc5da1b`.
**Zásada:** iba čítanie, regresné testy a čistenie redundantných pravidiel.
Bez produkčného D1 zápisu, bez migrácie, bez hromadného mazania historického JSON.

## 3. Verejný profil ↔ Admin ↔ Notion

### Dostupné Notion údaje (z databázy Editorial Hub / Adresár)
Dňa 15. 11. 2026 sa cez Notion read-only SQL potvrdilo:
- **1 852** všetkých záznamov,
- **1 789** označených ako Synchronizované + Publikované,
- **21** Synchronizované + Koncept, **2** Synchronizované + Archív,
- **30** v stave Chyba (19 publikovaných + 11 konceptov),
- **10** bez Psipedia ID a verejnej URL; sú to koncepty bez stavu sync.

To sú údaje Notionu, **nie live D1 parity výsledky**. Stav „Synchronizované“
nie je nezávislý dôkaz, že obsah každého D1 JSON kľúča je identický.

### Kontrolované vzorky
- **BONBOLERA:** Notion Psipedia ID **1077**, chovateľská stanica,
  publikované, Sync stav Synchronizované. Verejná URL
  `https://psipedia.sk/adresar/chovatelske-stanice/bonbolera`.
- **Akadémia Sirius:** Psipedia ID **552**, tréneri, publikované,
  Sync stav Synchronizované. V Notione sú vyplnené Organizácia a Zameranie.
- **Kynologický klub Topoľčany:** Psipedia ID **82**, kynologické kluby,
  publikované, Synchronizované, **Organizácia v Notione prázdna**.
  Vyhľadávací index má staršiu verejnú verziu, kde je Organizácia „ZŠK SR“.
  **Nevydávame to za potvrdenú aktuálnu produkčnú nekonzistenciu.**
  Overiť live detail a D1 kanonický kľúč / `Zastrešujúca organizácia`.

**Obmedzenia:** priamy autorizovaný produkčný D1 reader a prihlásený Admin
nie sú z tejto relácie dostupné. Externé verejné výsledky môžu byť cachované.
Ďalšia Notion SQL analýza počas auditu narazila na dočasný workspace SQL limit.
Preto nie sú k dispozícii spoľahlivé počty D1 konfliktných aliasov, a nie
je možné potvrdiť celú tri-strannú produkčnú paritu.

### Kritériá akceptácie na reálnom profile
1. Porovnať **D1 aktuálne pole**, skutočný `source_data_json` alias a
   zobrazenú hodnotu na verejnom detaile, potom aktuálny Notion stĺpec.
2. Admin musí ukazovať aktívny zdroj kľúča aj pri starom aliasovom importe.
3. Upraviť Facebook bez straty telefónu, mailu či webu.
4. Vymazať iba jedno odborné pole; vedľajšie kontakty a vzťahy musia zostať.
5. Prejdenie zoznamov a filtrov všetkých desiatich kategórií, najmä okres,
   organizácia, plemená, FCI, typ poskytovateľa a Services V3.
6. Tam, kde je vlastník dát rozdielny (katalóg V3/relácia vs historický text),
   nepovažovať textové zobrazenie za kanonické potvrdenie.

## 4. Historický JSON – čo ešte ostáva

| Oblasť | Súčasná priorita | Riziko pri odstránení |
|---|---|---|
| Okres | D1 `district` pred JSON `Okres` | Prázdny D1 okres nemá tombstone; legacy_only sa musí preskúmať |
| Organizácia | `Organizácia` pred `Zastrešujúca organizácia` | Starý alias môže byť jediný nevymazaný zdroj |
| Plemeno a FCI | potvrdené vzťahy a hlavné kľúče pred historickým textom | Text nesmie automaticky vytvoriť ID plemena alebo klubu |
| Otváracie hodiny | `Ordinačné hodiny` pred 4 aliasmi | Úmyselné prázdne hlavné pole musí vypnúť fallback |
| Pokrytie | `Pokrytie` pred aliasmi | Potrebné zachovať starý alias do revízie |
| Technické `_psipedia_*` | rôzne funkčné registre | Filtre, kategórie, galérie a väzby sa nesmú odstrániť |

**Existujúci agregovaný report**: `node scripts/directory-legacy-cutover-readiness.mjs`.
Tlačí SQL iba so súhrnnými počtami.

**Nový report presných kandidátov**:
```bash
node scripts/directory-legacy-cutover-candidates.mjs > directory-cutover-candidates.sql
```
Oba výstupy sú iba `SELECT`, ktoré vykoná oprávnený správca nad
**read-only produkčným D1 prístupom**. Nový výstup poskytne maximálne 500
záznamov rozlišujúcich `legacy_only`, `conflict`,
`explicit_clear_with_legacy` a `invalid_json`. Každý riadok obsahuje
iba `psipedia_id`, kategóriu, stav, kľúč a pevný typ problému.
Nedá sa z neho vyčítať kontakt, meno či skutočná textová hodnota.

**Výstup nie je migračný skript:** pred zásahom treba konkrétny profil
otvoriť a posúdiť, či je stará hodnota pravdivá. Ak je hlavný kľúč
výslovne prázdny, skrytý alias sa nesmie automaticky obnoviť.

## 5. Nedestruktívne čistenie v tomto PR

1. `lib/directory-public-facts.ts`: jediný resolver vráti aj skutočný
   kľúč pôvodu, nie iba verejnú hodnotu.
2. `lib/directory-detail-presentation.ts`: odstránené dva nezávislé
   cykly na výber hodín a organizácie; používa zdieľaný resolver.
3. **Zistená dodatočná odchýlka:** partner editor preferoval staré
   `Otváracie hodiny`, ktoré vypisoval odlišne ako Admin/public.
   `lib/partner-profile-changes.ts` teraz číta kanonickú prioritu;
   pri schválenej úprave vymaže iba aliasy hodín a **vždy** zapíše
   `Ordinačné hodiny` vrátane úmyselného `""`.
4. Regresné testy pre aliasy, explicitne prázdne hodnoty, D1 SQL preflight
   aj partnerovský editor bez straty ostatných JSON polí.

## Čo zostáva podmienené produkčnými údajmi

**Nerobiť teraz:** `DELETE source_data_json`, hromadné `json_remove`,
automatický backfill, zmazanie platných historických textov,
prepis Notion/D1 podľa starých cache alebo odstránenie `district` fallbacku.

**Poradie po produkčnom D1 preflighte:**
1. Schválená záloha pred akýmkoľvek zápisom.
2. Per-ID manuálne rozlíšiť platné `legacy_only`, skutočné konflikty
   a úmyselné vymazania. Publikované profily riešiť pred draftmi.
3. Schválená idempotentná migrácia konkrétneho poľa (nie celého JSON).
4. Porovnať počty, verejné hodnoty a filtre pred/po.
5. Až pri **nulovom počte aktívnych legacy_only** pre konkrétny fallback
   odstrániť príslušné čítanie; technické `_psipedia_*` ponechať.
6. Každú kategóriu otestovať samostatne, vrátane mobilu a Notion sync.

**Dôležité:** Žiadna vykonaná produkčná D1 migrácia ani skutočné
počty legacy-only závislostí sa týmto PR nepredstierajú.
