# GEMINI Concept Manager V3 — návrh obnoviteľného koša (LEN NÁVRH)

Stav: **blokované do samostatného schválenia**. Tento dokument nemení API, D1 schému, Notion ani publikačné správanie.

## Prečo nie sú existujúce operácie zameniteľné
- **Odmietnutie (REJECTED):** redakčné rozhodnutie o konkrétnom subjekte, zachová dôvod, audit a dedupe identitu. Je reverzibilné len podľa existujúceho review kontraktu.
- **Kôš (TRASHED):** dočasné bezpečné vylúčenie konceptu zo zoznamu a synchronizácií, s kontrolovaným obnovením.
- **Trvalo odstrániť (PURGED):** osobitne schvaľovaný, nevratný proces; nikdy nesmie byť dostupný z obyčajného review modal-u ani pre publikovaný záznam.

## Navrhovaná identita a priorita
1. Jediný logický záznam určuje `(source_system, notion_page_id, stable_key/import_agenda)` plus existujúce canonical D1 `(entity_type, entity_id)` a dedupe identity. Notion URL a názov neslúžia ako identity.
2. Administrácia Psipedia je autoritatívna pri akciách Trash/Restore a publikačnom stave. Notion je synchronizačný zdroj údajov, nie nezávislá autorita na neúmyselné vzkriesenie odstráneného profilu.
3. Mutácia vyžaduje admin autentifikáciu, poslednú Notion revíziu, canonical optimistic version a existujúce review lock mechanizmy. Žiadne retry po neistej vzdialenej mutácii.

## Navrhované tombstone riadenie
- Nová D1 tabuľka `gemini_concept_tombstones` (návrh, ešte **neexistuje**) s unique Notion page ID + agenda/stableKey, voliteľným canonical ID, stavom `TRASHED|RESTORING|RESTORED|PURGE_PENDING`, časom, actor ID, revíziami Notion/D1, dôvodom a audit linkom.
- *Tombstone musí vzniknúť pred volaním Notion archivácie.* Import/worker/scheduler/dedupe musí tombstone konzultovať ešte pred CREATE/import/approve; blokovať reimport aj pri zmene Notion statusu alebo opakovaní udalostí.
- Po uloženom tombstone môže server bezpečne prejsť do Notion Trash iba u overenej Notion-only stránky a s explicitným požadovaným stavom; pri D1 canonical zázname najprv konzistentne deaktivovať iba koncept a nikdy nie publikovaný profil.
- Ak Notion PATCH zlyhá alebo skončí neurčito, stav zostáva blokujúci a vyžaduje read-only reconciliation, nie automatickú obnovu.
- D1 stránka (kanonický profil) sa **trvalo nemaže**. Pre obnovu sa získajú aktuálne Notion a D1 revízie, preverí sa konflikt, záznam sa prevedie do neverejného konceptu, synchronizácia sa explicitne povolí až po potvrdení. Pri duplicitnej identite sa zastaví.

## Migrácie / kontrakty vyžadujúce samostatný súhlas
- D1 migration: tabuľka tombstones, indexy, voliteľná história zmien, prípadné soft-delete pole canonical entity (len ak store neumožňuje existujúci neverejný stav).
- Spoločný API/worker kontrakt pre trash, restore, reconciliation a dedupe; Notion permission/schema kontrola, testy fail-closed pre stratené revízie.
- Vlastné UI Koša, filtre, zobrazenie dátumu a dôvodu, odlíšenie REJECTED vs TRASHED, dostupnosť Restore. Permanent delete samostatný autorizovaný proces.
- Testy: 22 kategórií, Notion-only/imported, duplicitné callbacky, concurrent edits, výpadok Notion, publikované profily, reimport po opakovaní cron-u, obnova po konfliktnom importe.

**Zakázané v #868:** produkčné D1/Notion zápisy, migrácie, nové verejné publikačné cesty, trvalé mazanie alebo vizuálne simulované aktívne tlačidlo Koša.
