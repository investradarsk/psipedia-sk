# Psipedia Partner – 1/8: jediný externý správca záznamu

## Funkčný kontrakt

- Jeden registrovaný účet môže spravovať neobmedzený počet pridelených záznamov.
- Jeden kanonický záznam môže mať **najviac jedného aktívneho externého správcu** (bez ohľadu na to, či je jeho účet neskôr pozastavený).
- Nové prístupy sa prideľujú iba aktívnym účtom a výhradne ako interná rola `OWNER`, v rozhraní **Správca profilu**.
- Staré historické prístupy sa nemažú. Po aktivácii SQL 0171 sa všetky dnes aktívne `MANAGER`/`EDITOR` zmenia na `OWNER`; tento krok sa zaznamená do append-only auditu.
- Prenos správy prebieha iba explicitne: administrátor odvolá doterajší prístup a až potom pridelí nový. Odvolanie nezmaže profil ani jeho obsah.
- Partner po schválení dostane plné verejné editorové polia a priamy zápis **v krokoch 5 a 6**. Táto etapa nemení dnešnú moderáciu zmien ani Notion synchronizáciu.

## Pokrytie v kroku 1

Existujúce záznamy: `DIRECTORY_PROFILE` (Služby pre psov), `HELP_ORGANIZATION` a `MANAGED_EVENT` (Podujatia). Samostatné adopcie, stratené/nájdené psy a ostatné záznamy Pomoci psom sa doplnia v krokoch 3–5 podľa ich kanonických editorov; nepredstierame, že už sú podporované v partner_resources.

Chránené vstupy: ručné priradenie v administrácii, schválenie claimu, prepojenie nového návrhu s existujúcim profilom a prepojenie návrhu s existujúcim podujatím. Všetky vracajú 409 pri inom aktívnom správcovi. Databázový unikátny index `resource_id WHERE revoked_at IS NULL` je konečná poistka proti súbehu.

## Prechod databázy 0171 – výhradne manuálne

`0171_partner_single_manager.sql` je **UNACTIVATED_PRODUCTION_TARGET**, nie súčasť automatického nasadenia ani generického `production-d1-migrate` APPLY.

1. V produkčnej D1 vykonať read-only kontrolu:

```sql
SELECT resource_id,COUNT(*) AS active_count,GROUP_CONCAT(account_id) AS account_ids
FROM partner_memberships WHERE revoked_at IS NULL
GROUP BY resource_id HAVING COUNT(*)>1;

SELECT role,COUNT(*) AS active_count FROM partner_memberships
WHERE revoked_at IS NULL GROUP BY role;
```

2. Ak prvý dotaz vráti riadky, **neaplikovať 0171**. Rozhodnúť ručne, kto bude správcom, odvolať prebytočné prístupy cez auditovanú administráciu. Migrácia sama žiadny účet nezruší.
3. Urobiť bezpečnú zálohu a nasadiť 0171 len cez samostatný vlastníkom spustený chránený migračný postup. Overiť, že SQL fyzicky vytvorilo index `partner_memberships_one_active_resource` a oba triggery `partner_memberships_only_owner_*`; overiť aktívne roly `OWNER`.
4. Otestovať: druhý partner dostane 409, ten istý účet môže spravovať ďalšie záznamy, po odvolaní je možné priradiť nového správcu, audit zostáva zachovaný.

**Poradie:** najskôr nasadiť kompatibilný aplikačný kód, potom po preflight kontrolách manuálne aktivovať 0171. Žiadny automatický drop indexu ani rollback pri nasadení aplikácie.

## Nadväznosť

Táto vetva nadväzuje na PR #1434 (opravený detail účtov a zoznam). V krokoch 2–8 sa doplní samoobslužný dashboard, žiadosti, nové typy, spoločné editory a priame ukladanie. Nepridáva sa nový paralelný profilový datastore.
