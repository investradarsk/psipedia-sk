# Mapa: kontrola ALTHEA a DOGGIE Resort (13. 11. 2026)

Toto je **diagnostický plán bez produkčných zápisov**. Nemení žiadnu adresu ani nezlučuje profily.

## Overené v zdrojovom kóde

- Starý slug ALTHEA `/adresar/veterinari/veterinarna-poliklinka-althea` má explicitný HTTP 301 redirect na `/adresar/veterinari/veterinarna-poliklinika-althea` (starý route handler a alias v dynamickom detaile). Dva verejné slugy preto **nie sú samy osebe dôkazom dvoch dátových profilov**.
- Verejná mapa číta `geo_points` a `directory_profiles` v `lib/map-query.ts` spojením `g.directory_profile_id = d.id`. Zobrazovaná lokalita pri `EXACT_PUBLIC` vzniká z nezávislých polí `d.address`, `d.city`, `d.district`, `d.region`, spojených oddeľovačom. Deduplikácia rovnakých reťazcov nezaručuje geografickú konzistentnosť.

## Read-only overenie (proti správnej produkčnej D1, bez write ani editácie profilov)

```sql
SELECT id, name, slug, category, address, city, district, region, status, archived_at
FROM directory_profiles
WHERE category = 'veterinari' AND (LOWER(name) LIKE '%althea%' OR slug LIKE '%althea%')
ORDER BY id;

SELECT id, name, slug, category, address, city, district, region, status, archived_at
FROM directory_profiles
WHERE LOWER(name) LIKE '%doggie%resort%'
ORDER BY id;
```

Pri ALTHEA porovnať ID a príslušné `geo_points`; nerozhodovať podľa počtu URL. Pri DOGGIE Resort potvrdiť správnu obec a ulicu z dôveryhodného zdroja, porovnať aj `geo_points` a potvrdený Google Place ID, až potom vykonať prípadnú samostatnú dátovú korekciu. Automatický merge/mazanie alebo odhad správnej adresy nie sú súčasťou tohto PR.

## Bezpečnostná hranica

UI úpravy nemenia `lib/map-query.ts`, `geo_points`, `directory_profiles`, Notion synchronizáciu ani spôsob účtovania Google Maps. Renderer zostáva deaktivovaný až do explicitného kliknutia používateľa (PR #1354).
