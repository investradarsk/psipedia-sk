# Bulk Selection Foundation

PR 2 zavádza iba selection/snapshot/preflight infraštruktúru. Neobsahuje endpoint ani SQL, ktoré by hromadne menili `directory_profiles`.

## Kontrakty

- Directory membership identity je presne `{ category, status, q }`.
- `page` je pagination detail a nie je súčasťou fingerprintu ani `all-matching` snapshotu.
- Režimy výberu sú `explicit` a `all-matching`.
- `explicit` ID server vždy znovu načíta.
- `all-matching` neposiela autoritatívny zoznam ID z browsera. Server normalizuje filter a sám materializuje konkrétne matching ID.

## Snapshot

Migrácia `0033_admin_bulk_selection_foundation.sql` pridáva:

- `admin_bulk_selection_snapshots`
- `admin_bulk_selection_items`

Snapshot obsahuje modul, akciu, selection mode, normalizovaný membership filter, filter fingerprint, actor ref, počet, čas vzniku a expiráciu. Každá položka materializuje `record_id`, existenciu, zachytený `status` a `updated_at`, eligibility a prípadný skip reason.

TTL je 15 minút. Neskôr pridaný matching záznam sa do už vytvoreného snapshotu nepridá.

Snapshot tabuľky sú infraštruktúra pre bezpečný preflight. Nezapisujú moderation lifecycle eventy, pretože preflight nie je zmena profilu.

## API

`POST /api/admin/bulk/preflight`

Akceptuje iba explicitný `module`, `action` a selection contract. Aktuálny registry povoľuje iba:

- module: `directory`
- action: `publish` alebo `move-to-draft`

Akcie sa iba vyhodnotia; nevykonajú sa.

`POST /api/admin/bulk/preflight/revalidate`

Znovu overí krátkodobý snapshot pre rovnakého admin actora. Porovná aktuálny stav záznamov so zachyteným `status/updated_at` a vie označiť zmenu ako `record-changed-since-snapshot`. Ani tento endpoint nič nemutuje.

## Bezpečnostná hranica

Klient nikdy neposiela názov tabuľky, stĺpca ani SQL. Directory adapter vlastní SQL resolver, filter normalizáciu, povolené actions a eligibility pravidlá. Neexistuje generic `bulkUpdate(table, ids, values)`.

V tejto fáze neexistuje bulk execute endpoint, bulk delete ani `UPDATE directory_profiles ...` pre bulk operáciu.
