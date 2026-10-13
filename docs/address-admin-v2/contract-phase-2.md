# ADDRESS-ADMIN-CONTRACT-2 — interná validačná vrstva

Base main: `accb70e3d9f8e045bb77b78670003949d6c58170` (novší než SHA zo zadania).
Implementácia: [kontrakt](../../lib/admin-address-contract.ts),
[adaptéry](../../lib/admin-address-adapters.ts),
[cielené testy](../../tests/admin-address-contract.test.mjs).

Táto fáza pridáva iba čisté funkcie a typy. Existujúce editory, API, Google,
Notion, automatizácie ani verejné readers ich zatiaľ nevolajú. Ochrany sú
pripravené pre budúcu integráciu; neznamenajú opravu všetkých existujúcich write
ciest alebo produkčné overenie. Žiadna migrácia, provider request, schema write,
backfill, deploy či zmena CI.

## API a význam hodnôt

- `validateInternalAddress`: normalizovaný návrh + issues + completeness.
  Reuse existujúci slovenský snapshot a `resolveSlovakLocation`, postal normalizer
  a directory evaluator. Povolené formatting aliasy: veľkosť písmen, Unicode,
  diakritika, medzery/pomlčky/bodky a názov kraja bez suffixu „kraj“.
  Nie fuzzy matching, synonymá alebo hádanie obce/okresu; ambiguous/invalid do review.
  PSČ/číslo domu musia byť text, lomka ostáva. Chýbajúca ulica/číslo nie je
  automaticky invalid; existujúci evaluator určuje municipality-number/numberless.
- Režimy PHYSICAL / ONLINE / SERVICE_AREA sú interné, zatiaľ bez perzistencie.
  Online nepoužíva deviaty kraj a odmieta fyzické adresné údaje. Service area
  môže byť complete na úrovni kanonickej locality, bez exact GEO confirmation.
- `adaptDirectoryAddress`, `adaptEventAddress`, `adaptOrganizationAddress`
  čítajú súčasné modely. Snapshot zachováva originálne neprázdne legacy hodnoty
  aj keď sú invalid; issues ich označia. Preto invalid hodnota nie je missing
  a missing-only merge ju nesmie prepísať. Samotná validation funkcia nikdy
  nevloží unknown locality do canonical polí. Adaptér nemení verejný text.
- Event Online marker v region/city sa mapuje na interný mode, nie na fyzickú
  trojicu. Legacy online fyzický text zostáva s review flagom. Organization role
  SERVICE_AREA je oblasť; SITE/LEGAL_SEAT sa nesplošťujú do jedného záznamu.
  Identity lokality a organizácie sú oddelené; legal seat sa nikdy automaticky
  neoznačí za public SITE. Organization revision sa dodáva zvonka, keďže dnešný
  location model nemá vlastný updatedAt kontrakt.
- `adaptGoogleAddressProposal`: iba adresná evidence; neúplné components sú
  omitted, nie clear. Bez Place ID, súradníc alebo confirmation authority.
  Locality/sublocality stále vyžaduje platnú hierarchiu; žiadny guessed district.
- `planInternalAddressPatch`: unknown payload validácia, pure decision/diff.
  Omitted/undefined = nezmeniť; null = explicitne vymazať; prázdny string je
  invalid patch, nie implicitný clear. Pri no-op zachováva pôvodné hodnoty.
  Celý patch je odmietnutý pri konflikte; `next` je potom pôvodný snapshot.
  `changes` je len návrh diff, nesmie sa uložiť keď `allowed=false`.
- Current aj stale Google anchor, manual override, HIDDEN/explicit private a
  potvrdená prevádzka blokujú adresné zmeny. Žiadna bypass/force možnosť.
  Identický normalizovaný patch je no-op; neodoberá lock. `missingOnly` povoľuje
  iba doplnenie null fieldov, nie replacement/clear. Neplatný legacy návrh
  vyžaduje review pred ďalšou zmenou. `googlePlaceConfirmationState` je nezávislý
  od completeness a používa existujúce status/visibility/fingerprint pravidlá.
- GEO/identity/privacy/confirmation polia nie sú patch fields; injection sa
  odmieta. `expectedRevision`, ak dodaná, musí sedieť aj pri no-op. Funkcia
  nevykonáva transakciu; integrujúca API musí vyžadovať serverový snapshot,
  autorizáciu a atomický/recoverable guarded write. Klientsky snapshot nestačí.
- `projectLegacyAddressPatch`: whitelisted address-only patch do dnešných názvov,
  null → legacy `''`. Budúce event/location columns a mode transitions odmietne,
  namiesto tichého zahodenia. Nie kompletný payload pre full-profile save API.
  Confirmation ani GEO sa nikdy nevytvoria touto projekciou.

## Príklad budúceho použitia

```ts
const snapshot = adaptDirectoryAddress(profile, adaptAddressGeo(serverGeo, explicitPrivate));
const decision = planInternalAddressPatch(snapshot, { houseNumber: "12/A" }, {
  missingOnly: true,
  expectedRevision: profile.updatedAt,
});
if (!decision.allowed) {
  // Zobraziť conflicts; nič nepersistovať.
} else {
  const addressOnlyPatch = projectLegacyAddressPatch(snapshot.target.type, decision);
  // Budúca fáza: guarded merge do existujúceho store + existujúci GEO lifecycle.
}
```

## Nadväznosti

Po merge môžu paralelne bežať fáza 3 (additive D1) a fáza 4 (Notion schema
inventár/kontrakt). Integrácia spoločných guards, event Google address writes
patria do fázy 5 a sync protection do fázy 9. Manuálny override potvrdeného miesta
potrebuje osobitný explicitný review workflow; tento kontrakt ho neobchádza.
Build/test výsledky a CI stav sú uvedené v PR. Produkčné správanie nebolo overené.

## Lokálne overenie

- 58/58 cielených testov: 23 nových + existujúci directory evaluator a organization
  location admin; všetkých 8 krajov, 79 okresov a 2 927 obecných položiek.
- ESLint nových modulov/testov, relatívne odkazy a staged whitespace check: OK.
- Existujúci `npm run build`: OK, artifact validation a jeho dve vstavané breed
  test skupiny (14 testov) OK. Plný `npm test` sa nespúšťal.
- Samostatný project `tsc --noEmit` neprešiel: 1 886 existujúcich diagnostík,
  vrátane chýbajúcich Cloudflare/D1 typov. Porovnanie s rovnakou konfiguráciou,
  ktorá vylúčila oba nové moduly, dalo identických 1 886 diagnostík (0 pridaných,
  0 odstránených). Nové moduly nemajú vlastné diagnostiky.
