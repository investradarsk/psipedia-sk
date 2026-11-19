# Plemená — krok 5/6: kontrolovaný presun do SQL (pripravený, NIE vykonaný)

**Dátum:** 19. 11. 2026.
**GitHub:** PR #1449.
**D1 produkcia:** bez zápisov; migrácia 0174 je zatiaľ v `pending-migrations/`.

## Čo sa presúva

Starý model `managed_breeds` sa nevymaže. D1 ostáva jediným produkčným úložiskom; Notion slúži ako overovaný editor a poskytovateľ 12 typed polí cez aktuálne synchronizované `breed_notion_controlled_values.values_json`.

| Existujúci zdroj | Nový SQL cieľ | Stav |
|---|---|---|
| `managed_breeds.fci_standard_json` | `breed_fci_standard` (33 samostatných FCI stĺpcov) | Zostavený a otestovaný import |
| `managed_breeds.editorial_json` | `breed_editorial_text` (6 samostatných textov) | Zostavený a otestovaný import |
| `managed_breeds.seo_json` | 8 SQL `seo_*` stĺpcov `managed_breeds` | Zostavený a otestovaný import; **doplnený `seo_og_image`**, aby sa nestratila OG fotografia |
| `breed_notion_controlled_values.values_json` | `breed_public_facts` (6 čísel + 3 JSON multi-selecty) | Zostavený a otestovaný import výhradne pre ACTIVE Notion prepojenia |
| `managed_breeds.related_breeds_json` | `breed_related_breeds` (cieľ + 0-based poradie) | Zostavený a otestovaný import šiestich dnešných väzieb |

**Tri ďalšie controlled hodnoty** (`fciGroupSelect`, `fciSectionSelect`, `sizeSelect`) už majú svoje SQL stĺpce `managed_breeds.fci_group`, `fci_section_number`, `size`. Krok 5 ich **zatiaľ neprepisuje**, lebo verejný web ich už číta a Notion môže byť novší. Pred jedinou autoritou v kroku 6 sa musia zhodovať s aktualizovanou D1 a Notion sidecar.

**Zachované:** `gallery_json`, `sports_json`, `sources_json`, `health_risks_json`, `good_for_json`, `consider_json`, staré SEO/FCI/editorial JSON a všetky žijúce ID. Historické `editorial.heroTraits`, `exerciseTip`, `trainingTip`, `healthTip`, `coatTip` sa v kroku 5 **nemažú**; v kroku 6 treba zistiť ich skutočné použitie.

## Nový kód

- `lib/breed-sql-v2-backfill.mjs` obsahuje presne päť **stabilných, statických SQL príkazov**. Zdrojové hodnoty sa čítajú pri vykonaní z D1: neexistuje medzičasom zastaraný JSON export na disku.
- `BREED_V2_PREFLIGHT_SQL` je read-only kontrola identity, typov dát, Notion ACTIVE väzieb, prázdnych cieľových tabuliek, všetkých vzťahov a stavu per-field Notion synchronizácie.
- `BREED_V2_POSTFLIGHT_SQL` porovnáva každý nový údaj s jeho pôvodným D1/Notion zrkadlom, vrátane oboch smerov SQL relačných väzieb, bez sprístupnenia textov v logoch.
- `scripts/production-breed-sql-v2-backfill.mjs` je owner-only audit/apply runner, vyžaduje aktuálnu vetvu main, presnú D1 databázu, výslovné potvrdenie a pred zápisom Time Travel recovery bookmark.
- `.github/workflows/production-breed-sql-v2-backfill.yml` je **iba** manuálny `workflow_dispatch` s chráneným prostredím production; predvolený mód je audit. Merge PR ho automaticky **NESPÚŠŤA**.
- `tests/breed-sql-v2-backfill.test.mjs` simuluje **347** D1 záznamov, **344** ACTIVE väzieb (vrátane 12 typed Notion zrkadiel), presných **3** nenaviazaných ID `5,13,14`, šesť vzťahov a chráni OG obrázok aj všetok starý obsah.

## Bezpečnostná brána pred akýmkoľvek APPLY

1. **Najskôr** dokončiť partner migračné PR #1437 (0171/0172), adresár PR #1451 (0173) a fyzicky overiť ich tabuľky v D1. Následne po merge PR #1449 samostatne nasadiť **schema-only 0174**. Nevynechávať migračné čísla a nepoužívať `wrangler migrations apply` naprieč starým backlogom.
2. Pri audit móde skontrolovať **347** plemien, **344** ACTIVE unikátnych Notion prepojení, presne tri nenaviazané ID `5,13,14`, **344** kompatibilných D1 Notion controlled zrkadiel, nulové pending zmeny a žiadne chybné JSON/FCI/SEO hodnoty a chybné väzby. Nesúlad = **STOP**.
3. **Pred produkčným APPLY je potrebné nezávisle potvrdiť aktuálny stav Notionu**, aby D1 zrkadlo nebolo zastarané. Skript samotný nevolá živé Notion API; kontroluje jeho aktuálny D1 mirror a synchronizačné konflikty. Nevyhlasovať plnú Notion paritu len na základe počtu ACTIVE linkov.
4. Pred spustením **dočasne pozastaviť konkurenčné Admin/Notion zápisy plemien**, alebo nasadiť overené transakčné per-field shadow writes. Bez jednej z týchto podmienok nie je možné garantovať, že zdroj sa v čase piatich SQL príkazov nezmení. Postflight síce zachytí rozdiel, ale nie je to zámok proti súbehu.
5. Zabezpečiť produkčný Time Travel recovery bookmark. Manuálne `apply` vyžaduje potvrdenie `APPLY-BREEDS-V2-344-347`; samotný script ešte pred zápisom opätovne vykoná preflight.
6. Po `apply` vykonať **všetky** SQL paritné kontroly. Ak je hociktorá odlišná, **STOP**, neprepínať reader ani sync; staré JSON ostávajú použiteľné, nevracať migráciu mechanicky bez analýzy.
7. Pred verejným cutoverom osobitne overiť `seo_json`, noindex, OG image, sitemap, FCI profily, Admin detail a Notion polia. Aktivácia v2 reader/writer a čistenie legacy patria až do **6/6**.

## Ako spustiť po dokončení závislostí

V GitHub Actions zvoliť **Breed SQL 0174 – guarded 344/347 backfill (manual)**.

**Najprv:** `mode=audit`, `confirmation=AUDIT-BREEDS-V2-344-347` – iba SELECT, bez zápisov.

**Až po kompletnom schválenom preflighte, schéme 0174, Notion parite a zastavení konkurenčných zápisov:** `mode=apply`, `confirmation=APPLY-BREEDS-V2-344-347`.

Na produkčnej Cloudflare Console **teraz nevykonávať žiadny `INSERT`, `UPDATE`, `ALTER` ani `DROP` kvôli tomuto PR**. Samotný fakt, že je offline test zelený, nedokazuje pripravenosť živej Notion synchronizácie.

## Offline testy

```bash
node --test tests/breed-sql-v2-backfill.test.mjs
node --test tests/breed-sql-0174-foundation.test.mjs
node --test tests/breed-sql-v2-bridge.test.mjs
npm run db:check-migrations
```

Žiadne aktívne hodnoty `status`, `published_at`, `slug`, `updated_at`, `seo_json`, `editorial_json` alebo `fci_standard_json` sa počas kopírovania nemenia; import vypĺňa len nové SQL 0174 polia a tabuľky. Pred dokončením synchronizácie a odstránením starých zdrojov nie je nová SQL vrstva samostatným produkčným masterom.
