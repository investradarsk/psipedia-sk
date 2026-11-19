# Plemená – krok 1/6: audit historických JSON (19. 11. 2026)

## Výsledok
**Krok 1 je read-only inventúra**, nie migrácia a nie vymazanie z produkcie.
Z aktuálneho repozitára sa nepotvrdil **žiadny samostatný historický dátový JSON súbor plemien** vhodný na zmazanie. Živé údaje plemien sú primárne v D1 SQL; časť SQL stĺpcov obsahuje JSON text. Testovacie JSON schémy Notionu **nie sú historická databáza psov**.

Vlastná príprava migrácie 0173, ktorá bez výnimky zakazovala JSON a predčasne zapisovala do nových tabuliek, bola odstránená **len z tejto rozpracovanej PR vetvy**. Nikdy nebola nasadená na produkciu.

## Rozdelenie nájdených zdrojov

| Zdroj / pole | Dnešné použitie | Rozhodnutie pre krok 1 |
|---|---|---|
| `managed_breeds.gallery_json` | galéria vo verejnom profile, editor | **zachovať** |
| `managed_breeds.fci_standard_json` | FCI štandard aj verejný profil, Admin/Notion | **zachovať** |
| `managed_breeds.editorial_json` | texty verejného profilu, editor, Notion | **zachovať** |
| `managed_breeds.sports_json` | športy v profile, editor/Notion | **zachovať** |
| `managed_breeds.related_breeds_json` | podobné plemená na verejnom webe | **zachovať**, potom posúdiť SQL vzťahy |
| `managed_breeds.health_risks_json` | zdravotné riziká | **zachovať** |
| `managed_breeds.good_for_json` | pre koho sa plemeno hodí | **zachovať** |
| `managed_breeds.consider_json` | na čo si dať pozor | **zachovať** |
| `managed_breeds.sources_json` | citované zdroje v profile | **zachovať** |
| `managed_breeds.seo_json` | metadata, canonical/noindex, sitemap | **zachovať**, dôležité pre indexáciu |
| `breed_notion_controlled_values.values_json / notion_values_json` | verejné filtrované fakty a nové Notion hodnoty | **zachovať** |
| `tests/fixtures/breed-notion-workcopy-74-schema.json` | test staršej schémy | **nezamieňať s dátami** |
| `tests/fixtures/breed-notion-workcopy-90-schema.json` | test aktuálnejšej schémy | **nezamieňať s dátami** |
| `lib/content.ts` a `seedBreeds` | fallback pri chýbajúcej D1 väzbe / build | **zatiaľ zachovať**, nie je samostatný JSON |

## Čo ešte nemožno tvrdiť
- Tento audit prehľadáva **zdrojový kód a Git súbory**, nie obsah živej Cloudflare D1 databázy.
- Bez read-only dotazu na produkčné D1 nemožno potvrdiť, že historické JSON hodnoty, ktoré nie sú používané, neexistujú v riadkoch.
- Polia, ktoré dnes nie sú viditeľné na verejnom webe, môžu stále slúžiť Notion synchronizácii a Adminu. Samotná neviditeľnosť nie je dôkaz, že sa dajú vymazať.
- Žiadny z uvedených aktívnych JSON stĺpcov nesmie krok 1 odstrániť; o ich konečnej SQL/JSON podobe sa rozhodne v kroku 2.

## Read-only kontrola produkčnej D1 – pripravená, ešte nespustená

Po mergeri tohto PR sa dá v GitHub Actions spustiť **Production Plemená JSON – READ ONLY audit (manual)**. Zadaj potvrdenie `AUDIT-BREED-JSON-READONLY`. Workflow vykoná iba agregované `SELECT` dotazy nad živými stĺpcami `managed_breeds` (počet riadkov, vyplnených a poškodených JSON hodnôt) a uloží report. Nikdy nevypisuje osobné alebo celé textové údaje, nič nemení a nepovoľuje `DROP`.

**Pozor:** samotný počet vyplnených JSON hodnôt nie je dôkaz, že ide o historické alebo nepotrebné údaje. Read-only report doplní rozhodnutie v kroku 2.

## Ako overiť
```bash
node scripts/audit-breed-json-legacy.mjs
node --test tests/breed-json-legacy-audit.test.mjs
```

## Pravidlo ďalšej migrácie
V produkcii bude existovať **jedna autoritatívna hodnota** pre každé verejne používané pole. Keď bude nový čítací a zapisovací kód hotový a skontrolovaný, až potom odstránime preukázateľne nepotrebné historické úložisko.
