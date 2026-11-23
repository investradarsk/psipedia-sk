# Psipedia.sk — Partner podania — krok 2/8 (registrácia, návrat a typ hlásenia)

Dátum: 23. 11. 2026. Pracovný PR #1566 (Draft).

## Zmena vstupu, nie dátového modelu

- Zoznam **Stratené psy** otvára `/partner/koncepty/novy?typ=LOST_FOUND_DOG&druh=LOST`.
- Zoznam **Nájdené psy** otvára `/partner/koncepty/novy?typ=LOST_FOUND_DOG&druh=FOUND`.
- Spoločný banner „Stratil sa vám pes alebo ste psa našli?“ otvára `/partner/koncepty/novy?typ=LOST_FOUND_DOG`; používateľ zvolí LOST / FOUND vo formulári.
- Všetky tieto URL smerujú do EXISTUJÚCEHO partnerského editoru. Neprihlásený návštevník ide cez `requirePartnerPageIdentity({returnTo})` na prihlásenie; bezpečný návratový cieľ obsahuje zvolenú agendu aj druh psa.
- `app/partner/koncepty/novy/page.tsx` pred autentifikáciou normalizuje `typ` na uzavretý zoznam šiestich agend a `druh` iba na LOST/FOUND. Až potom konštruuje interný `returnTo`. `lib/partner-return-to.ts` ďalej zakazuje externé, admin/API a neplatné adresy.
- `PartnerCanonicalDraftForm` pre úplne nový LOST_FOUND_DOG koncept preberá predvolenú hodnotu z URL; hodnoty existujúceho uloženého konceptu majú prednosť. Pri prepnutí typu sa platné uložené hodnoty stále chránia potvrdením pred zahodením.
- Staré partnerské aliasy `/partner/profily/novy`, `/partner/podujatia/nove` a `/partner/pomoc/nova` rovno presmerujú na kanonický editor. Tým sa neodbočí na generický dashboard počas autentifikácie.
- Registrácia a login už explicitne komunikujú aj s nefiremnými majiteľmi psov; e-mailový vstup už nie je označený ako „Pracovný e-mail“.

## Cesty autentifikácie

Existujúca infraštruktúra prijíma a bezpečne prenáša `returnTo`:
1. **Heslo:** `components/partner-password-auth-form.tsx` po úspešnom login vie pokračovať priamo do pôvodného formulára, alebo cez onboarding.
2. **Magic link:** `components/partner-auth-form.tsx` posiela cieľ do request-link, `components/partner-verification.tsx` ho preberá z fragmentu.
3. **Google (ak je zapnutý):** `lib/partner-google-auth.ts` prenáša overený cieľ cez OAuth flow.
4. **Onboarding:** `components/partner-contact-profile-form.tsx` po doplnení kontaktného profilu otvorí pôvodný cieľ.
   
Poznámka: existujúce špeciálne ošetrenie Google identity, ktorá už patrí inému prepojeniu, môže vyžadovať dodatočné pripojenie Google účtu; krok 2 ho neprepisuje.

## Regresná ochrana

Pridaný `tests/partner-intake-step2.test.mjs`, upravený existujúci `tests/lost-found-public-submission.test.mjs` a selektory banneru v `tests/e2e/photo-banner-copy.spec.ts`; E2E kontroluje odkazy podľa LOST/FOUND v `tests/e2e/lost-found-dogs.spec.ts`.

Minimálne lokálne overenie:
```bash
node --experimental-strip-types --test tests/partner-intake-step2.test.mjs tests/lost-found-public-submission.test.mjs
```
E2E treba spustiť na izolovanom testovacom prostredí podľa existujúceho Playwright setupu; CI, build ani plný E2E nie sú týmto dokumentom deklarované za vykonané.

## Čo sa zámerne NEMENILO

- `POST /api/lost-found/submissions` aj jeho stará verejná stránka zostali v kroku 2 nedotknuté. Stará adresa môže byť stále navštívená priamo; **povinný Partner účet pre nové hlásenia nie je ešte úplne serverovo vynútený**. To sa musí dokončiť vo fáze 3/8 po mape súkromných kontaktov, bez straty už prijatých hlásení.
- Bez databázových migrácií, bez zmeny stavov moderácie, žiadna zmena Notion review-lock ani zmena vlastníctva existujúcich profilov.
- Bez úprav oddelených verejných redakčných tipov, obyčajných kontaktov, dopytov na služby a recenzií.
- PR zostáva Draft; nemergovať a nenasadzovať tento medzikrok samostatne, kým krok 3 nezablokuje nový anonymný CREATE a nezachová historické PENDING prípady.

## Ďalej 3/8

Zmapovať súkromné kontakty/telefóny/e-maily z anonymného LOST/FOUND formulára na bezpečný partnerský model bez automatického zverejnenia, zachovať údaje, fotografie, moderáciu a nespracované hlásenia. Až potom vypnúť verejný anonymný CREATE na API aj stránke a presmerovať historické URL na Partner účet.
