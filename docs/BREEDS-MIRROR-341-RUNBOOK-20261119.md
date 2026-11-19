# Plemená – doplnenie 341 zrkadiel, prevádzkový postup

## Zistená príčina / historické behy
- 2026-11-19 GitHub Actions run 44596760629: read-only audit SUCCESS, `existing=3, missing=341`.
- Run 44597176348: `BREED_MIRROR_SQL_INSERT_ONLY_REQUIRED`; chybný SQL guard zablokoval legitímnu SQLite funkciu `REPLACE()`. **SQL sa v tomto behu neodoslalo**.
- Run 44598545943: `BREED_MIRROR_REMOTE_WRANGLER_FAILED` v etape `apply`; detailný stderr bol v pôvodnom runneri zahodený, preto **neexistuje potvrdenie, či SQL v D1 niečo vykonalo**. Výpis `applied=false` znamená iba, že CLI nevrátil úspech. Veľkosť pôvodného SQL mohla presiahnuť D1 limit 100 KB, ale toto nie je potvrdená príčina bez stderr.

## Bezpečný read-only stav v Cloudflare Console

```sql
SELECT
  (SELECT COUNT(*) FROM managed_breeds) AS plemien_d1,
  (SELECT COUNT(*) FROM breed_notion_workcopy_links WHERE status='ACTIVE') AS aktivnych_notion,
  (SELECT COUNT(*) FROM breed_notion_controlled_values) AS zrkadiel_spolu,
  (SELECT COUNT(*) FROM breed_notion_controlled_values c
   JOIN breed_notion_workcopy_links l ON l.breed_id=c.breed_id
   WHERE l.status='ACTIVE') AS aktivnych_zrkadiel;
```

Tento SELECT nič nemení. Nenútiť ďalšie APPLY, kým nevieme reálny stav po poslednej chybe.

## Opravený owner-only workflow

- `audit` načíta 344 aktívnych stránok Notion, overí 12 polí a D1 identitu, zostaví **rovnaké SQL dávky ako `apply`**, overí ich veľkosť (max 60 KiB na jedno SQL, hlboko pod 100 KB stropom D1), nič nezapisuje.
- `apply` opakovane načíta Notion+D1; overí identitu a konzistenciu, získa D1 Time Travel recovery bookmark, postupne vykoná malé atomické `INSERT ... SELECT` príkazy iba pre aktuálne chýbajúce riadky.
- Každý SQL príkaz obsahuje kontrolu `347` plemien, `344` ACTIVE linkov, aktuálneho počtu zrkadiel, identity Notion page UUID a dáta source. **Nepoužíva UPDATE, REPLACE INTO ani DELETE**.
- Po každej úspešnej dávke prečíta uložené riadky a porovná ich do poslednej hodnoty s pripraveným snapshotom vrátane troch pôvodných záznamov a revízií.
- Ak Wrangler skončí chybou, runner vykoná iba **read-only** D1 kontrolu skutočného počtu uložených zrkadiel; nerozhoduje iba podľa `applied=false`.
- Ak sa proces preruší po úspešnej dávke, **celý import nie je jedna databázová transakcia**. Najprv re-audit; následné samostatné spustenie môže pokračovať iba pri plnej zhode už uložených zrkadiel a stále chýbajúcich ID.
- Po dokončení vyžadujeme `existing=344, missing=0` a rovnaké hodnoty v Notione. Ak sa Notion medzitým menil, musí sa konflikt manuálne posúdiť, nie automaticky prepísať.
- Tento proces neprenáša všetkých ~90 polí ani nerobí migráciu 0174; iba 12 štruktúrovaných polí do pomocnej D1 tabuľky.

## Spustenie

1. Overiť, že opravné PR má zelené testy a je zlúčené do main.
2. `mode=audit`, `confirmation=AUDIT-BREED-MIRRORS-344` v manual GitHub Actions `production-breed-controlled-mirrors.yml`.
3. Overiť read-only report `plannedChunks > 0`, `issues=[]`, `existing + missing = 344`.
4. Až potom `mode=apply`, `confirmation=APPLY-BREED-MIRRORS-344`. Počas behu minimalizovať editácie plemien v Notione a Admine; novšie zmeny počas importu treba prípadne znovu overiť.
5. Vyhodnotiť výsledné zrkadlá, potom pokračovať pôvodným bezpečným SQL/JSON plánom (#1449).
