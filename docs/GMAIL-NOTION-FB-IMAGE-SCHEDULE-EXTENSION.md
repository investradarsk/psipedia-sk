# Gmail → Notion FB obrázky: rozšírenie plánovania (30. 10. 2026)

## Čo je overené

- Príklad z Gmailu `psipedia.sk@gmail.com`: správa obsahuje JSON `PSIPEDIA_FB_IMAGE_V1` a reálnu PNG prílohu, Gmail ID `1a18c6aef846c4b3`, štítky SENT + INBOX.
- V Notione `Facebook obrázky` existujú zodpovedajúce záznamy s textom `Bridge ID: PSIPEDIA-GMAIL-<ID>` v poli `Poznámka`.
- Aktívne vlastnosti: `Názov` (title), `Obrázok` (files), `Text na Facebook` (rich_text), `Dátum a čas publikovania` (date), `Stav` (status), `Povoliť publikovanie` (checkbox), `Súhlas majiteľa – priame publikovanie` (checkbox), `Poznámka` (rich_text). **Nevytvárať nové polia.**
- V repozitári sa nenašiel Gmail poller ani Apps Script zdroj (`.gs`, `GmailApp`, `PSIPEDIA_FB_IMAGE_V1`). Tento doplnok nie je bez externého vloženia do bežiaceho Apps Scriptu nasadený.

## Rozsah

`scripts/apps-script/psipedia-fb-gmail-schedule-extension.gs` je zdrojový **doplnok** k existujúcemu Apps Scriptu. Nevytvára trigger, nový Gmail poller, nový Notion importer ani Meta publisher. Existujúce Gmail vyhľadávanie, spracovanie príloh, import do Notion a deduplikácia zostávajú na pôvodnom mostíku. Zdroj pôvodného mostíka nie je k dispozícii: nemožno potvrdiť jeho názvy funkcií ani vykonať automatický merge bez prístupu do Apps Script projektu.

Existujúci kód musí zavolať doplnok v tomto poradí (pseudokód; názvy existujúcich funkcií treba prispôsobiť):

```javascript
const existing = psipediaFbFindByGmailId_(message.getId()); // PRED POST /pages
if (existing && ['Naplánované','Publikované'].includes(existing.properties?.Stav?.status?.name)) return;
const bridgeId = 'PSIPEDIA-GMAIL-' + message.getId();
const note = 'Prijaté automatickým mostíkom. Bridge ID: ' + bridgeId;
// Len pri CREATE, nie pri otvorení už existujúceho záznamu:
const safeInitialProps = psipediaFbSafeDraftProperties_(note);
const pageId = existing?.id || existingCreateNotionPage({
  ...existingDraftProperties,
  ...safeInitialProps, // MUSÍ prepísať oba príznaky na false, stav Koncept, dátum null
}).id;
// Ak ide o opakovaný import, obnov chýbajúcu prílohu na tom istom pageId. Status Schválené/Naplánované/Publikované neupravovať.
// Existujúci uploader vráti potvrdený file property ID zo znovu načítanej stránky.
let attachedFileId;
try {
  attachedFileId = awaitExistingUploaderAndReadConfirmedNotionFileId(pageId,message);
} catch (error) {
  psipediaFbMarkUploadFailed_(message,pageId); // Zachová obidva súhlasy vypnuté
  throw error; // Pôvodný mostík musí povoliť opakovanie s tým istým pageId
}
const result = psipediaFbFinalizeSchedule_(message,pageId,{fileId:attachedFileId});
// Až po úspešnom dokončení importu označiť Gmail správu za vybavenú.
// Neposielať druhý e-mail. Pri chybe ponechať retry s tým istým Notion pageId.
```

**Nie je možné naslepo nahradiť pôvodnú funkciu existujúceho mostíka.** Pred vložením treba zosúladiť reálne argumenty a spôsob importu súborov. Deduplikácia prebieha vyhľadaním presného `PSIPEDIA-GMAIL-<Gmail Message ID>` v `Poznámka`; počet výsledkov väčší ako jeden je chyba, nie dôvod vytvoriť ďalší záznam.

## Kontrakt jedného e-mailu

Pôvodné tri polia zostávajú bez zmeny; nový kontrakt je rozšírený:

```json
{
  "marker": "PSIPEDIA_FB_IMAGE_V1",
  "title": "3 psie športy, 3 rôzne zážitky",
  "caption": "Kompletný slovenský Facebook popis",
  "publish_at": "2026-10-31T12:15:00+01:00",
  "schedule": true,
  "allow_publishing": true,
  "owner_approved": true
}
```

Len platný ISO lokálny čas **s explicitným offsetom zhodným s Europe/Bratislava**, budúci čas, neprázdny title/caption, priložený a úspešne uložený súbor, tri výslovné true a ostatné kontroly povoľujú plánovanie. Starý JSON, chybné údaje alebo neplatná príloha zostávajú bezpečným konceptom s oboma checkboxmi false a dôvodom v Poznámke. Doplnok nikdy neodosiela e-mail ani Facebook POST.

## Brand/logo — zásadná podmienka

Obrázok sám osebe, hodnota `owner_approved` ani názov súboru **nedokazujú** správne logo. Doplnok preto povoľuje plánovanie len ak SHA-256 *presných binárnych bajtov priloženého obrázka* už je v skriptovej vlastnosti `PSIPEDIA_FB_APPROVED_IMAGE_SHA256` (čiarkou alebo medzerou oddelený zoznam), ktorú má spravovať **nezávislý, existujúci schvaľovací proces** po vizuálnom overení loga. Nové obrázky majú spravidla nový hash: bez preukázaného externého schválenia automaticky nevznikne plánovaný príspevok. Hash nie je náhrada vizuálneho hodnotenia.

Ak aktuálny proces nemá takýto overiteľný záznam, plánovanie treba ponechať vypnuté a tento zdroj dôveryhodnosti doplniť samostatne; nie je bezpečné nahradiť ho `brand_verified:true` v e-maile.

## Nasadenie — iba po výslovnom schválení

1. Otvoriť **existujúci** Apps Script projekt, ktorý spracováva Gmail v `psipedia.sk@gmail.com`, urobiť verziovanú kópiu pôvodného scriptu.
2. Pridať nový súbor `psipedia-fb-gmail-schedule-extension.gs`. Nepridávať druhý trigger. Ponechať aktuálny uploader aj existujúcu deduplikáciu, doplniť uvedené tri volania.
3. `Project Settings → Script properties`: overiť `NOTION_API_TOKEN` (nepísať do GitHubu); `PSIPEDIA_FB_BRIDGE_SCHEDULE_ENABLED=false` do času akceptačného testu; schválené obrázky určiť cez `PSIPEDIA_FB_APPROVED_IMAGE_SHA256`.
4. Spúšťať pod účtom `psipedia.sk@gmail.com`. Pri detekcii odosielateľa sa kontroluje **Gmail API `users.messages.get(..., format=minimal)` a štítok `SENT` presne pre toto Gmail message ID**, nie iba hlavička From alebo výsledok vyhľadávania vlákien. `ScriptApp.getOAuthToken()` používa oprávnenia existujúceho Apps Scriptu; overiť, že script má Gmail API scope `https://mail.google.com/` (alebo kompatibilný `gmail.readonly`) a `script.external_request`. Pri neoverení sa plánovanie bezpečne odmietne.
5. Offline testy: `node --test tests/psipedia-fb-gmail-schedule-extension.test.mjs`. V samostatnom skúšobnom prostredí overiť bezpečné koncepty a výnimky; bez Meta publikovania.
6. Pred aktiváciou prečítať `docs/FACEBOOK-NOTION-SCHEDULING-V2.md` a `docs/FACEBOOK-IMAGES-V4-FINAL.md`. Aktuálny Notion importer **nemusí Notion checkboxy považovať za schvaľovanie**. Ak `NOTION_FACEBOOK_IMAGES_SCHEDULE_V2_ENABLED` nie je zapnuté s validným `NOTION_FACEBOOK_IMAGES_SCHEDULE_V2_CUTOVER_AT`, môže zostať D1 koncept, hoci Notion hovorí Naplánované. Neobchádzať bezpečnostné brány a nezapínať produkčné flagy bez osobitného rozhodnutia.
7. Až po kompletnom teste, kontrole plánovaných a publikovaných položiek a samostatnom schválení nastaviť `PSIPEDIA_FB_BRIDGE_SCHEDULE_ENABLED=true` v Apps Scripte. Globálny STOP Facebook publikátora pri teste nechať vypnutý.

## Spoľahlivosť a známe hranice

- `LockService` serializuje **tento** Apps Script; Notion však nemá unikátny transakčný constraint na publikačný termín a súčasné ručné/externé zápisy nie sú pod tým istým lockom. Absolútnu medzisystémovú atómovosť bez zmeny autoritatívnej D1 vrstvy nemožno garantovať. Preto pred produkčnou aktiváciou vylúčiť paralelný import/úpravu termínov inými writer-mi alebo doplniť samostatný D1-side guard v ďalšom schválenom kroku.
- Overovanie denného limitu počíta `Naplánované`, `Schválené` a `Publikované` s dátumom v daný kalendárny deň v Europe/Bratislava. Presný termín je rezervovaný po minútach. Ak je viac než 1000 načítaných záznamov, operácia zlyhá bezpečne namiesto odhadu.
- Identita importu je existujúce Gmail message ID v Poznámke. Opakované spracovanie `Naplánované`/`Publikované` záznamy nemení; nedokončené koncepty môžu pokračovať s rovnakým ID.
- Počiatočný import do Notion **musí** byť koncept s oboma checkboxmi false; inak existuje interval, keď externý synchronizátor uvidí neoverený príspevok.
- Žiadny existujúci Notion/D1 záznam sa týmto PR neupravuje; žiadny mail sa neodosiela; produkčné zmeny nenastávajú bez externého nasadenia.

## Testované scenáre

Starý JSON, validný plán, zlé/minulé dátumy, obsadený termín, denný limit, neplatná príloha, nesprávny odosielateľ, SENT check, duplicate ID, zlyhaný upload + retry, zimný/letný čas + DST medzery, neoverené logo, false flagy, neprázdne texty, opt-in flag. Testovací runtime používa simulované Gmail, Notion a Apps Script služby, nie živé Notion/Facebook volania. **Živú integráciu a správanie produkčného synchronizátora tieto jednotkové testy nedokazujú.**
