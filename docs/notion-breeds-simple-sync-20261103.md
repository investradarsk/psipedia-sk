# Psipedia – Plemená: jednoduchá synchronizácia, pracovný PR

## Rozhodnutie majiteľa (3. 11. 2026)

- Cieľ: každé zo 109 polí v Notione má byť viditeľné v Admine a bežné rozdiely sa automaticky zosúladia podľa priority Notion / Admin / najnovšia.
- Minimálne ochrany: správne priradenie plemena, ochrana pred duplicitou, bezpečné opakovanie zápisu; žiadna manuálna kontrola pre obyčajný obsahový rozdiel.
- Rozsah: iba Plemená. Články, Facebook a katalóg služieb V3 sa nemenia.

## Stav pracovného PR

Prvá implementačná časť, nie potvrdenie úplnej obojsmernej synchronizácie 109/109 polí. Dopĺňa SEO, jednoduché priority, legacy replay a testy. NEMERGEovať pred doplnením ostatných polí, opačného smeru a CI.

Admin → Notion v pôvodnom kóde zrkadlí len vybrané textové polia konceptov. FCI/editorial Notion detailné stĺpce sú importované ako zoskupená štruktúra a nemajú ešte individuálnu prioritu.

## Jednoduchý kontrakt

1. Pre každé pole porovnať Notion a Admin hodnotu.
2. Pri zhode žiadny zápis; pri rozdiele smer podľa priority.
3. Pri safe/latest bez spoľahlivej časovej histórie existuje výslovný fallback Notion. Netváriť sa, že vieme čas úpravy samotného poľa.
4. Chyba v jednom obsahu nezastaví zvyšné polia.
5. Potvrdenie až po zápise; dočasné technické chyby opakovať.

## Inventár 109 polí

Mapované pole nemusí byť automaticky obojsmerné. Systémové polia (ID, Sync stav, Posledný sync) majú určený smer bez redakčného prepisovania.

| Notion pole | Typ | Súčasné mapovanie |
|---|---|---|
| Alt text obrázka | text | Media/relation special |
| Byt | number | Editor-mapped field |
| Deti | number | Editor-mapped field |
| Dĺžka života | text | Editor-mapped field |
| Editorial complete | checkbox | Review/metadata |
| Energia | number | Editor-mapped field |
| Farba akcentu | select | Review/metadata |
| FCI celkový vzhľad | text | FCI nested (one group) |
| FCI číslo | number | System/identity |
| FCI diskvalifikačné chyby | text | FCI nested (one group) |
| FCI farba | text | FCI nested (one group) |
| FCI historický súhrn | text | FCI nested (one group) |
| FCI hmotnosť pes kg | text | FCI nested (one group) |
| FCI hmotnosť suka kg | text | FCI nested (one group) |
| FCI chov poznámka | text | FCI nested (one group) |
| FCI chvost | text | FCI nested (one group) |
| FCI chyby | text | FCI nested (one group) |
| FCI koža | text | FCI nested (one group) |
| FCI krk | text | FCI nested (one group) |
| FCI lebka | text | FCI nested (one group) |
| FCI nomenklatúra URL | url | FCI nested (one group) |
| FCI oči | text | FCI nested (one group) |
| FCI pohyb | text | FCI nested (one group) |
| FCI povaha a temperament | text | FCI nested (one group) |
| FCI predné končatiny | text | FCI nested (one group) |
| FCI proporcie | text | FCI nested (one group) |
| FCI sekcia | text | Editor-mapped field |
| FCI sekcia číslo | text | Editor-mapped field |
| FCI sekcia názov | text | FCI nested (one group) |
| FCI skupina | number | Editor-mapped field |
| FCI skupina názov | text | FCI nested (one group) |
| FCI srsť | text | FCI nested (one group) |
| FCI status | text | FCI nested (one group) |
| FCI štandard JSON | text | Editor-mapped field |
| FCI štandard PDF | url | FCI nested (one group) |
| FCI telo | text | FCI nested (one group) |
| FCI tvár | text | FCI nested (one group) |
| FCI uši | text | FCI nested (one group) |
| FCI veľkosť a hmotnosť poznámka | text | FCI nested (one group) |
| FCI výška pes cm | text | FCI nested (one group) |
| FCI výška suka cm | text | FCI nested (one group) |
| FCI využitie | text | FCI nested (one group) |
| FCI zadné končatiny | text | FCI nested (one group) |
| FCI závažné chyby | text | FCI nested (one group) |
| FCI zdroj poznámka | text | FCI nested (one group) |
| Galéria JSON | text | Media/relation special |
| História | text | Editor-mapped field |
| Hlavný obrázok URL | url | Media/relation special |
| Hmotnosť | text | Editor-mapped field |
| Charakter | text | Editor-mapped field |
| Import kľúč | text | System/identity |
| Iné psy | number | Editor-mapped field |
| Intro | text | Editor-mapped field |
| Krajina pôvodu | text | Editor-mapped field |
| Lovecký pud | number | Editor-mapped field |
| Meta description | text | Editor-mapped field |
| Názov | title | Editor-mapped field |
| Odborný reaudit 2026 | checkbox | Review/metadata |
| Oficiálny FCI názov | text | Editor-mapped field |
| Platnosť FCI štandardu | date | Editor-mapped field |
| Pĺznutie | number | Editor-mapped field |
| Pohyb | text | Editor-mapped field |
| Posledný sync | date | System/identity |
| Potreby | text | Editor-mapped field |
| Poznámky | text | Review/metadata |
| Pracovná skúška | text | Editor-mapped field |
| Profil skvalitnený | checkbox | Review/metadata |
| Psipedia ID | text | System/identity |
| Redakcia hlavné vlastnosti JSON | text | Not covered by current sync |
| Redakcia chyby majiteľov | text | Editorial nested (one group) |
| Redakcia prehľad | text | Editorial nested (one group) |
| Redakcia spolužitie so psami | text | Editorial nested (one group) |
| Redakcia starostlivosť o srsť | text | Editorial nested (one group) |
| Redakcia tip pohyb | text | Editorial nested (one group) |
| Redakcia tip srsť | text | Editorial nested (one group) |
| Redakcia tip výcvik | text | Editorial nested (one group) |
| Redakcia tip zdravie | text | Editorial nested (one group) |
| Redakcia zaujímavosti | text | Editorial nested (one group) |
| Redakcia život v rodine | text | Editorial nested (one group) |
| Redakčné sekcie JSON | text | Editor-mapped field |
| Rodina | number | Editor-mapped field |
| SEO canonical URL | url | Editor-mapped field |
| SEO focus keyword | text | Editor-mapped field |
| SEO noindex | checkbox | Editor-mapped field |
| SEO OG description | text | Editor-mapped field |
| SEO OG title | text | Editor-mapped field |
| SEO title | text | Editor-mapped field |
| Skupina | text | Editor-mapped field |
| Slug | text | System/identity |
| Srsť | text | Editor-mapped field |
| Starostlivosť o srsť | number | Editor-mapped field |
| Stav | select | System/identity |
| Súvisiace články ID | text | Media/relation special |
| Súvisiace plemená ID | text | Media/relation special |
| Súvisiace profily služieb ID | text | Media/relation special |
| Sync chyba | text | System/identity |
| Sync stav | select | System/identity |
| Športy JSON | text | Editor-mapped field |
| Trénovateľnosť | number | Editor-mapped field |
| URL Psipedia | url | System/identity |
| Veľkosť | text | Editor-mapped field |
| Vhodné pre | text | Editor-mapped field |
| Výcvik | text | Editor-mapped field |
| Výška | text | Editor-mapped field |
| Zdravie | text | Editor-mapped field |
| Zdravotné riziká | text | Editor-mapped field |
| Zdroj obrázka | url | Media/relation special |
| Zdroje | text | Editor-mapped field |
| Zvážiť | text | Editor-mapped field |

## Podmienky pred merge

- [ ] Každé z 109 polí je spracované: redakčné, FCI, SEO, médiá, vzťahy, metadata, systémové.
- [ ] Všetky redakčné polia vrátane FCI a redakčných podpolí majú vlastné priority v Admin UI.
- [ ] Admin → Notion aj Notion → Admin funguje pre všetky podporované obsahové polia.
- [ ] Jedno pole neprepíše nesúvisiace údaje.
- [ ] Výslovné vymazanie je možné, neodoslané údaje sa nezmažú.
- [ ] Chybný obrázok alebo JSON neblokuje správny text.
- [ ] Bez ručných konfliktov pri rozhodnutej priorite.
- [ ] CI plus jeden schválený profil otestovaný až po dokončení implementácie.
