# MIG-0 – bezpečnostný kontrakt databázových migrácií

Tento dokument opisuje **preventívne guardrails**, nie opravu migračnej histórie.
Repozitár má historický hybridný stav, ktorý MIG-0 zámerne nemení.

## Potvrdená MIG-0 baseline

Baseline je deklarovaná v `migration-safety.baseline.json` a je súčasťou CI kontraktu.
Pri zavedení MIG-0 platí:

- SQL migrácie v `drizzle/` tvoria súvislú sekvenciu `0000` až `0039`,
- `drizzle/meta/_journal.json` končí na `0023_big_shinko_yamashiro`,
- Drizzle snapshoty končia na `0023_snapshot.json`,
- SQL migrácie `0024` až `0039` sú historicky mimo Drizzle journalu a snapshotov.

Tento rozdiel je **známy technický dlh**. MIG-0 ho nepovažuje za zdravý stav a
neopravuje ho dopĺňaním journalu, regenerovaním snapshotov ani úpravou existujúcich SQL.

## `drizzle-kit generate` je momentálne zakázaný

Kým nebude migračný systém opravený v samostatnej fáze, nepoužívajte:

```bash
npm run db:generate
npx drizzle-kit generate
```

`npm run db:generate` je zámerne nahradený fail-fast blockerom a nevykoná žiadnu
generáciu. Priamy `drizzle-kit generate` je rovnako zakázaný projektovým kontraktom.
Dôvodom je riziko, že Drizzle pri dnešnom nekonzistentnom meta stave posunie alebo
prepíše journal/snapshoty spôsobom, ktorý nezodpovedá už existujúcej SQL histórii.

CI navyše odmietne neočakávaný posun journalu alebo snapshotov, takže náhodne
vygenerované meta zmeny sa nemajú dostať do `main` bez vedomej migration-repair fázy.

## Ako sa kontroluje migration chain

Statický checker spustíte:

```bash
npm run db:check-migrations
```

Checker nepoužíva D1, secrets ani Cloudflare. Číta iba súbory v repozitári a overuje:

- formát názvov `NNNN_popis.sql`,
- unikátnosť numerických indexov,
- súvislú SQL sekvenciu bez gaps,
- že historická SQL baseline neklesla pod `0039`,
- že Drizzle journal zostáva zmrazený na deklarovanom indexe/tagu `0023`,
- že journal entry `0000–0023` stále zodpovedajú názvom príslušných SQL migrácií,
- že Drizzle snapshoty zostávajú zmrazené na `0023` a sú súvislé,
- aktuálny najvyšší SQL migration index.

Nový, vedome reviewovaný SQL migration súbor za baseline je povolený iba ako ďalší
súvislý index (`0040`, potom `0041`, ...), s platným názvom a **bez posunu Drizzle
journalu/snapshotov**. Toto pravidlo iba bráni ďalšiemu neviditeľnému driftu; nie je
tvrdením, že hybridný migration model je správny alebo opravený.

## CI kontrakt

Relevantné PR CI už spúšťa `npm run lint`. MIG-0 pridáva npm lifecycle `prelint`,
ktorý pred lintom automaticky spustí `npm run db:check-migrations`.
Focused testy sú v `tests/migration-safety.test.mjs` a sú zapojené do
`test:foundation`, takže ich spúšťa všeobecný PR validation flow aj foundation test flow.

CI fail znamená, že sa zmenil migration kontrakt alebo vznikla štrukturálna chyba,
napríklad duplicita, gap, neplatný názov, odstránenie historickej baseline alebo
neočakávaný posun Drizzle journalu/snapshotov. Taký fail sa nemá obchádzať zmenou
baseline bez samostatne reviewovaného rozhodnutia o migration architektúre.

## Čo MIG-0 nerieši

- Nevaliduje celý SQL chain proti čistej D1 od nuly; to patrí do **MIG-1**.
- Neopravuje `drizzle/meta/_journal.json` ani snapshoty; migration metadata repair je
  samostatná fáza.
- Nezjednocuje Cloudflare/Wrangler config source of truth; to patrí do **CONFIG-1**.
- Nemení poradie databázových migrácií a Worker deployu; to patrí do **DEPLOY-1**.
- Neprerába celý CI systém; širšie CI zmeny patria do **CI-1**.

Ak je potrebné meniť baseline alebo znovu povoliť Drizzle generation, najprv musí
existovať samostatná migration-repair fáza s explicitnou validáciou a review.
