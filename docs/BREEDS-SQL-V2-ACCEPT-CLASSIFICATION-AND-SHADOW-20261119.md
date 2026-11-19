# Plemená – rozhodnutie o SQL v2 po audite 2026-11-19

## Overené fakty

Posledný read-only audit (GitHub Actions run 44625785007) potvrdil:

- 347 plemien, 347 FCI riadkov, 347 editorial riadkov, 344 typed facts riadkov;
- 344 aktívnych Notion D1 zrkadiel, 0 čakajúcich D1→Notion kontrolovaných polí;
- 6/6 skupín SQL parity bez rozdielu (FCI, editorial, SEO, fakta, related edges oboma smermi);
- 6 súvisiacich väzieb (edges), bez potvrdenej straty údajov;
- klasifikačné nezhody oproti historickým SQL parent scalar poliam:
  FCI skupina 1, FCI sekcia 2, veľkosť 247.

## Výslovné rozhodnutie vlastníka

Tieto tri skupiny klasifikačných nezhôd **neblokujú krok 3/6**. Nie sú
dôvodom na ručné prepisovanie 247 plemien. Notion typed selects zostanú
v `breed_notion_controlled_values` a historické parent hodnoty zostanú
v `managed_breeds`; nič sa hromadne neprepisuje. Pri ďalšej explicitnej
zmene konkrétneho poľa vykoná aktualizáciu per-field CAS engine.

## Implementácia

- `assessBreedSqlV2ShadowReadiness` prijíma akýkoľvek **validný**
  počet klasifikačných rozdielov (0..344), zobrazuje čísla v reporte,
  ale stále **blokuje** poškodené alebo chýbajúce metriky, ktorúkoľvek z
  6 SQL/JSON skupín parity, chybný počet plemien/zrkadiel, pending sync
  a cudzie kľúče.
- `wrangler.jsonc`: `BREED_SQL_V2_WRITE_MODE=shadow`, t.j. pri každej
  **novej** zmene zapíše legacy JSON + nový SQL príslušného poľa naraz
  cez existujúci CAS-guarded D1.batch.
- Read-only audit možno znova vykonať s prepínačom `off` aj `shadow`.
- To **nie je** verejný SQL-primary read cutover, Notion full snapshot
  ani zmazanie starých JSON stĺpcov. Pokračujeme krokmi 4/6 až 6/6.
- Po merge a deploy overiť Cloudflare Workers + test jednej Admin,
  jednej Notion a jednej controlled editácie, potom zopakovať audit.
  Ak parity 6/6 prestane sedieť, vrátiť flag na `off`, neprepisovať dáta
  hromadne, preveriť jednotlivé neskoršie zápisy.
