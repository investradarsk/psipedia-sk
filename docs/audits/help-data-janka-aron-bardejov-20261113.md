# Pomoc psom: read-only zdrojová kontrola (13. november 2026)

Rozsah: Janka (adopcia), zbierka Áron a dobrovoľnícka pomoc Bardejov. **Tento PR nevykonáva produkčné zápisy ani externé overovanie.**

## Janka – vek

- Kanonická tabuľka `adoption_dogs` uchováva `birth_date` a `approximate_age_months`. Zobrazovanie používa `adoptionAgeMonths` v `lib/adoption.ts` a `formatAdoptionDetailAge` v `lib/adoption-detail.ts`.
- Vypočítaných 0 mesiacov z existujúceho platného dátumu narodenia môže zodpovedať veku menej ako mesiac. **Samostatná približná hodnota 0 bez dátumu narodenia tento záver nedokazuje.** V takom prípade verejný detail uvádza „Vek: neoverený“, nie domyslený údaj.
- Samotné hodnoty profilu Janka v produkčnej D1 a externý zdroj **nie sú overené**. Na verifikáciu použite read-only dotaz a až potom porovnajte údaj so zdrojom alebo potvrdením organizácie.

```sql
SELECT id, name, slug, status, birth_date, approximate_age_months, updated_at
FROM adoption_dogs
WHERE slug = 'janka-brezno-410793fc1d18';
```

## Zbierka Áron – dátum sumy

- `help_cases` ukladá `goal_amount`, `raised_amount`, `verified` (publikačná/verifikačná politika odkazu) a všeobecný `updated_at`.
- **Nie je tam osobitný `raised_amount_verified_at`** ani iný jednoznačný dátum overenia finančnej sumy. `updated_at` nie je dôkazom kontroly sumy. Preto ho tomuto účelu nepriraďujeme.
- Detail pri uvedenej vyzbieranej sume pravdivo upozorní, že dátum jej samostatného overenia nie je evidovaný. Číselnú hodnotu PR nemení.
- Pre budúce zobrazovanie skutočného dátumu by bolo nutné v samostatnej schválenej zmene navrhnúť datovaný dôkaz, editáciu a synchronizáciu; dátum sa nesmie odvodiť z `updated_at`.

```sql
SELECT id, slug, title, category, goal_amount, raised_amount, verified, updated_at
FROM help_cases
WHERE category = 'zbierky' AND slug = 'pomozme-aronovi-znovu-behat';
```

## Dobrovoľníctvo Bardejov – lokalita

- `help_cases.location_note` je voľný text. Ak obsahuje zjavné inštrukcie na odovzdanie pomoci, zobrazíme ho oddelene ako „Pokyny na poskytnutie pomoci“ a ako lokalitu len kanonické `city` a `region`.
- Nezáväzné krátke spresnenie polohy zostáva súčasťou lokality. Obsah sa nepremiestňuje v databáze a nemení sa Notion schéma.

```sql
SELECT id, slug, title, category, city, region, location_note, updated_at
FROM help_cases
WHERE category = 'dobrovolnictvo' AND slug = 'materialna-pomoc-pre-oz-druha-sanca-bardejov';
```

**Otvorená dátová otázka:** aktuálnosť adopcie Janka a externá vyzbieraná suma zbierky Áron neboli potvrdené. Žiadne automatické mazanie, odhady alebo zmeny stavov.
