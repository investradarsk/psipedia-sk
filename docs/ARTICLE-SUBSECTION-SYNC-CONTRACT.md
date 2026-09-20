# CONTENT-SYNC-1 — Canonical Article Subsection Contract

## Purpose

Canonical article placement is explicit:

`Notion Kategória (section) + Podsekcia -> portalSection + portalSubpage -> public placement`.

Article titles are never used to infer placement. Invalid section/subsection pairs fail closed.

The existing Notion property `Kategória` remains the section selector for compatibility. New canonical records use a top-level section value plus the controlled `Podsekcia` select.

## Canonical combinations

### Zdravie a starostlivosť

- Zdravie -> `/starostlivost/zdravie`
- Výživa -> `/starostlivost/vyziva`
- Každodenná výchova -> `/starostlivost/vycvik`
- Správanie -> `/starostlivost/spravanie`
- Srsť a hygiena -> `/starostlivost/srst-a-hygiena`
- Psí senior -> `/starostlivost/senior`

### Výcvik a aktivity

- Psie športy -> `/aktivity/psie-sporty`
- Tréning -> `/aktivity/trening`
- Výlety so psom -> `/aktivity/vylety-so-psom`
- Dog-friendly miesta -> `/aktivity/dog-friendly-miesta`
- Dovolenka so psom -> `/aktivity/dovolenka-so-psom`

### Šteniatka

- Pred kúpou psa -> `/steniatka/pred-kupou-psa`
- Výber plemena -> `/steniatka/vyber-plemena`
- Výber chovateľa -> `/steniatka/vyber-chovatela`
- Prvé dni doma -> `/steniatka/prve-dni`
- Socializácia -> `/steniatka/socializacia`
- Hygiena -> `/steniatka/hygiena`
- Kŕmenie -> `/steniatka/krmenie`
- Očkovanie a zdravie -> `/steniatka/ockovanie-a-zdravie`
- Výcvik šteniatka -> `/steniatka/vycvik-steniatka`
- Rast a vývoj -> `/steniatka/rast-a-vyvoj`
- Puberta -> `/steniatka/puberta`

### Novinky zo sveta psov

- Záchrana a hrdinovia -> `/novinky/zachrana-a-hrdinovia`
- Veda a zdravie -> `/novinky/veda-a-zdravie`
- Pracovné a záchranárske psy -> `/novinky/pracovne-psy`
- Ochrana a právo -> `/novinky/ochrana-a-pravo`
- Zo sveta psov -> `/novinky/zo-sveta`
- Zaujímavosti -> `/novinky/zaujimavosti`

The non-content action `Pošli tip redakcii` is not a valid article subsection.

### Recenzie a testy

- Krmivá -> `/recenzie/krmiva`
- Maškrty -> `/recenzie/maskrty`
- Hračky -> `/recenzie/hracky`
- Postroje a vodidlá -> `/recenzie/postroje-a-vodidla`
- GPS lokátory -> `/recenzie/gps-lokatory`
- Pelechy -> `/recenzie/peleche`
- Cestovanie -> `/recenzie/cestovanie`
- Výcviková výbava -> `/recenzie/vycvikova-vybava`

## Routing and URL compatibility

`portalSubpage` controls subsection placement and listing membership. The article detail URL remains based on `portalSection + article slug`, so changing only a valid subsection does not rewrite an existing article URL.

Article slugs are still rejected when they collide with a subsection landing slug.

## Legacy compatibility

When `Podsekcia` is absent:

- legacy `Výživa` remains deterministically mapped to `starostlivost/vyziva`;
- legacy `Správanie` remains deterministically mapped to `starostlivost/spravanie`;
- existing mapped Drafts may preserve their already-valid subsection for the same canonical section during rollout;
- generic legacy buckets Plemená, Pomoc psom, Bezpečnosť and Zaujímavosti retain their existing `/clanky` placement;
- ambiguous new records in Zdravie a starostlivosť, Výcvik a aktivity, Šteniatka or Recenzie a testy fail closed until `Podsekcia` is supplied;
- unknown categories never fall back silently to `/clanky`.

## Publication safety

The sync still creates and updates only `draft` managed articles. A linked article that is no longer Draft is not overwritten. This workstream does not alter `Na kontrolu`, `Ready`, `Sync stav`, `Odoslať na Psipedia`, or the manual publication/writeback flow.

## Safe canonical mappings applied in Notion

The rollout updates only records with an unambiguous placement supported by their editorial brief:

- Ako čistiť psovi uši: bezpečný postup krok za krokom -> Zdravie a starostlivosť / Srsť a hygiena
- Ako čistiť psovi zuby: domáca dentálna starostlivosť krok za krokom -> Zdravie a starostlivosť / Srsť a hygiena
- Koľko krmiva má pes denne zjesť? Ako nastaviť správnu porciu -> Zdravie a starostlivosť / Výživa
- Strach u psa: ako mu pomôcť bez nátlaku a trestov -> Zdravie a starostlivosť / Správanie
- Starší pes: ako sa menia jeho potreby a kedy spozornieť -> Zdravie a starostlivosť / Psí senior
- Ako spoznať bolesť u psa: zmeny pohybu, správania a denných návykov -> Zdravie a starostlivosť / Zdravie
- Prvá pomoc psovi: čo robiť pri krvácaní, úraze, dusení a bezvedomí -> Zdravie a starostlivosť / Zdravie
- Socializácia šteniatka: kedy začať, čo mu ukázať a čomu sa vyhnúť -> Šteniatka / Socializácia
- Spoľahlivé privolanie psa: ako ho naučiť krok za krokom -> Výcvik a aktivity / Tréning

No article was published by these mapping changes.
