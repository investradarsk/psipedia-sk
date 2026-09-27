# ADDRESS-RESEARCH-IMPORT-1

Technický admin nástroj na kontrolovaný import canonical DIRECTORY SERVICE adries z jednorazových research datasetov.

## Tok dát

XLSX research sa **mimo aplikácie** prevedie na normalizovaný JSON. Aplikácia nečíta XLSX a nevytvára nové profily.

```
research XLSX
→ schemaVersion 1 JSON
→ admin Preview
→ Geoapify exact verification
→ explicitný Apply
→ existing DIRECTORY save flow
→ existing verified-address GEO lifecycle
```

## JSON contract

Top-level:

```json
{
  "schemaVersion": 1,
  "dataset": {
    "label": "Veterinári — ADDRESS RESEARCH",
    "createdAt": "2026-09-27T00:00:00.000Z"
  },
  "profiles": []
}
```

`dataset` je voliteľný. `schemaVersion` musí byť presne `1`. `profiles` musí byť array a `profileId` sa v jednom datasete nesmie opakovať.

Record:

```json
{
  "profileId": 123,
  "category": "veterinari",
  "name": "ABC Vet",
  "action": "UPDATE",
  "confidence": "HIGH",
  "sourceUrl": "https://example.sk/kontakt",
  "sourceType": "OFFICIAL_WEBSITE",
  "sourceEvidence": "Prevádzka: ...",
  "note": "",
  "expectedCurrent": {
    "region": "Nitriansky kraj",
    "district": "Nitra",
    "city": "Nitra",
    "postalCode": "",
    "street": "",
    "houseNumber": "",
    "addressFormat": "",
    "serviceAddressConfirmation": "LEGACY_UNCONFIRMED"
  },
  "proposedAddress": {
    "region": "Nitriansky kraj",
    "district": "Nitra",
    "city": "Nitra",
    "postalCode": "949 01",
    "street": "Štefánikova",
    "houseNumber": "12",
    "addressFormat": "STREET"
  }
}
```

Allowed actions: `KEEP`, `FILL_MISSING`, `UPDATE`, `REVIEW`, `NOT_FOUND`, `NO_PUBLIC_SERVICE_ADDRESS`.

Allowed confidence: `HIGH`, `MEDIUM`, `LOW`.

`proposedAddress` je povinný pre `UPDATE` a `FILL_MISSING`. Auto-apply eligibility má iba `HIGH + UPDATE` a `HIGH + FILL_MISSING`. Pre tieto kombinácie je povinná validná HTTP/HTTPS `sourceUrl`.

## Preview

Preview používa `profileId` ako primary identity a následne kontroluje exact category a bezpečne normalizované meno. Fuzzy matching sa nepoužíva.

Ak je prítomný `expectedCurrent`, canonical stav sa porovná semanticky (trim/case, normalizované PSČ; enums exact). Rozdiel dá `STALE_DATASET`.

Pred provider callom sa blokujú read-only akcie, MEDIUM/LOW confidence, neplatné adresy, `NO_CHANGE`, archived profily, identity mismatch, stale dataset a `FILL_MISSING` conflict.

Provider sa volá iba pre reálne eligible candidates. Preview používa bounded concurrency **4** a nevykonáva canonical ani GEO writes.

READY record dostane SHA-256 preview fingerprint nad current `updatedAt`, identity, current/proposed canonical adresou, action, confidence a source URL.

## Geoapify exact verification

Eligible structured adresa sa overuje cez existujúce `verifyDirectoryCanonicalAddress(...)`. Research JSON nikdy sám neautorizuje exact GEO.

Ambiguous/rejected/transient provider failure failuje closed; bez exact verification sa canonical write nevykoná.

## Apply safety

Apply:
- je admin-only a používa current same-origin mutation guard,
- vyžaduje presný token `ADDRESS-RESEARCH-IMPORT`,
- prijíma najviac **20 records/request**,
- UI po jednom kliknutí posiela interné batche sekvenčne,
- pred write znovu načíta profil a znovu kontroluje identity, expectedCurrent a preview fingerprint,
- provider verification vykoná znovu,
- pred samotným write ešte raz načíta profil a overí fingerprint,
- pri zmene dostane record `STALE_PREVIEW`.

## Canonical write a GEO lifecycle

Importer nekonštruuje vlastný SQL update. Z current `ManagedDirectoryProfile` zostaví plný existujúci payload, cez `withVerifiedDirectoryAddress(...)` zmení iba physical canonical address semantics a zavolá `updateManagedDirectoryProfile(...)`.

Tým zostávajú zachované name/slug/category/status/texty/služby/kontakty/images/SEO/verified/featured/online/source metadata.

Po úspešnom verified canonical write sa volá existujúce `applyVerifiedDirectoryAddressGeo(...)`. Lat/lng sa nikdy neprijímajú z JSON a importer ich priamo nezapisuje. Existing lifecycle zachová manual override protection, source fingerprint a exact-only semantics.

Google Place ID polia importer nemení. Existujúci fingerprint/staleness contract rozhoduje, či stará Place identity ostáva current.

## Idempotency

Pred provider callom aj pred write sa kontroluje semantic equality. Druhé spustenie rovnakého importu po úspechu končí `NO_CHANGE`, takže nevzniká zbytočný canonical/GEO/audit churn.

## Anonymný sample

```json
{
  "schemaVersion": 1,
  "dataset": { "label": "Sample" },
  "profiles": [
    {
      "profileId": 123,
      "category": "veterinari",
      "name": "Ukážková veterinárna ambulancia",
      "action": "FILL_MISSING",
      "confidence": "HIGH",
      "sourceUrl": "https://example.sk/kontakt",
      "sourceType": "OFFICIAL_WEBSITE",
      "sourceEvidence": "Verejná adresa prevádzky",
      "note": "",
      "proposedAddress": {
        "region": "Nitriansky kraj",
        "district": "Nitra",
        "city": "Nitra",
        "postalCode": "949 01",
        "street": "Ukážková",
        "houseNumber": "12",
        "addressFormat": "STREET"
      }
    }
  ]
}
```
