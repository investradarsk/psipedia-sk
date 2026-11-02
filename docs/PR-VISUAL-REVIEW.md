# Psipedia – automatická vizuálna kontrola každého vizuálneho PR

Cieľ: pred zlúčením vidieť **skutočný výsledok pracovnej verzie** a porovnať ho
s rovnakou stránkou zo spoločného Git predka. Automatická kontrola neznamená
automatické schválenie vzhľadu.

## Ako to funguje

1. Keď PR zmení súbory verejného vzhľadu alebo administrácie, workflow
   `PR Visual Evidence` sám vyberie najviac **4 relevantné stránky**
   (napríklad homepage, Podujatia, Adresár, Pomoc psom alebo Admin).
   Nemeniteľné backendové a dokumentačné úpravy nevyvolajú nákladný prehliadač.
2. Ak chce autor presné stránky, v popise PR môže uviesť
   `VISUAL_REVIEW_ROUTES: /,/podujatia,/adresar,/pomoc-psom`.
   To má prednosť pred automatickým výberom. Voliteľný riadok
   `VISUAL_ACCEPTANCE_ROUTES:` doplní ďalšie cesty, spolu najviac štyri.
3. Na GitHub Actions sa pripraví lokálna PR verzia aj lokálna verzia
   spoločného Git predka. Použije sa **oddelená lokálna databáza D1**,
   rovnaké testovacie príklady a Chromium. Bez produkčných údajov,
   vzdialených zápisov alebo nasadenia webu.
4. Každá vybraná stránka sa odfotí v šírkach **1440, 390 a 320 px**.
   Pre každú vznikne obrázok viditeľnej časti aj celej stránky.
5. Porovnanie vytvorí prehľad **Pred / Po / Rozdiel**:
   `site-before/<stranka>/<viewport>-viewport.png`,
   `site-after/<stranka>/<viewport>-viewport.png` a pri rozdiele
   `site-diff/<stranka>/<viewport>-viewport.png`.
   Rovnaké súbory vznikajú aj pre plnú stránku.
   Červená v rozdielovom obrázku ukazuje zmenené pixely.
6. Odkaz na výsledné obrázky je v **GitHub Actions → Artifacts**
   príslušného PR. Číselný prehľad je v **Summary** toho istého behu.

## Vyhodnotenie

- Zmena vzhľadu je pri plánovanom PR prirodzená. Preto samotný rozdiel
  stránok znamená **potrebuje vizuálnu kontrolu**, nie automatickú chybu CI.
- Chýbajúce porovnávacie obrázky, neplatné URL alebo neúspešné načítanie
  kontrolovanej stránky sú chyby, ktoré kontrola nesmie zamlčať.
- Existujúce **deterministické testy šablón** zostávajú prísne: nečakaný
  rozdiel vo fixných testovacích obrázkoch naďalej zlyhá v CI.
- Niektoré produkčné obrázky a záznamy nemusia byť dostupné v izolovanom
  prostredí. Také stránky vyžadujú aj manuálnu kontrolu naživo.
- Náklady predstavujú minúty GitHub Actions. Workflow je obmedzený na
  štyri stránky a PR z rovnakého repozitára, nie na externé forky.

## Dôležité obmedzenia

Pred vytvorením PDF/screenshotov sa nikdy nečítajú súkromné dáta z produkcie
a prehliadač blokuje externé požiadavky aj zápisové HTTP metódy.
Screenshoty sa neuverejňujú na verejnej Psipedii. Vizuálna kontrola
nikdy sama nezlúči PR a nemení existujúce publikovanie, Notion ani SEO.

Ak potrebuješ overiť konkrétnu produkčnú stránku s reálnymi údajmi, použi
samostatné čisto čítacie produkčné screenshoty alebo ju skontroluj ručne;
nepripájaj produkčné tajomstvá k PR workflow.
