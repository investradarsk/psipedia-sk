# Psipedia.sk – Partneri V2, krok 3/8: detail partnera

Dátum: 20. 11. 2026
PR: #1467 (Draft, neslučovať ani nenasadzovať po samostatnom kroku 3).

## Výsledok

- Na `/admin/partners/accounts/[id]` pribudol account-centric pracovný detail: meno, e-mail, telefón, stav, **počet čakajúcich žiadostí a spravovaných záznamov**. Neprečítané správy: `—` s vysvetlením; chat v aktuálnej schéme ešte neexistuje.
- Päť záložiek v pôvodnej administrácii: **Žiadosti / Profily / Správy / Účet / História**. URL-parametre `?tab=...` a `?page=...` umožňujú zdieľanie konkrétnej záložky a stránkovanie bez nových rout.
- Predvolená záložka: **Žiadosti**, nie účet ani štatistiky. Partner bez návrhov zobrazí `Zatiaľ nepodal žiadnu žiadosť.`
- Žiadosti sú zoradené: čakajúce najprv, potom ostatné podľa času; zobrazujú typ, názov, stav, dátum, link na **existujúce rozhodovanie o žiadosti** a, ak má záznam bezpečne identifikovateľné kanonické ID, link na **existujúci Admin editor**. Toto zatiaľ NEPRESÚVA rozhodovanie do editora; implementačný krok 4.
- Serverové stránkovanie **naprieč všetkými agendami**: 50 žiadostí na stránku. Nestráca sa história, pretože nemá per-type LIMIT 300; total/pending sa číta nezávisle od stránky.
- `lib/partner-admin-dossier.ts` je **read-only**, prijíma DB dependency a account ID, všetky filtre viaže parametrizovane; nevytvára nové editorové kópie, kontá ani záznamy. API pre čítanie volá existujúci `lib/partner-admin-store.ts`.
- Pokrytie žiadostí:
  - `partner_claims` – vlastníctvo existujúcich Služieb, Organizácií a Podujatí.
  - `partner_help_claims` – prevzatie Pomoci psom/adopcií/stratených. Vylúčenie syntetických APPROVED ownership záznamov, ktoré automaticky vznikli po schválení nového CREATE; nie sú druhou žiadosťou.
  - `partner_new_profile_metadata` – nové služby/organizácie, `partner_profile_change_metadata` – historické moderované zmeny, `partner_event_submission_metadata` – podujatia, a samotné `moderation_submissions` – nové záznamy Pomoci psom.
  - `partner_resource_verifications` – overenie správcu; `partner_commercial_interests` – komerčné záujmy; `partner_commercial_agreements` – existujúce dohody, bez vymyslených detailových URL.
  - Malformované historické Help JSON návrhy nezrušia celý účet: používajú ochranu `json_valid` a ľudský fallback názov.
- Profily: `partner_memberships` s `revoked_at IS NULL` plus `partner_help_claims` `status='APPROVED'`; výsledky majú názov, agendu, stav a odkaz na kanonický editor. Historické odobraté prístupy nepatria medzi aktívne profily.
- Účet: pôvodné zobrazenie kontaktu, stavu, session, prihlásenia a všetky `AdminPartnerAccountActions` **bez zmeny oprávnení, auth a servisných API**.
- História: existujúce `partner_audit_events` z pohľadu partnera a administrátorských rozhodnutí nad jeho `moderation_submissions`, claimami, verifikáciami a membershipmi; read-only, vlastné stránkovanie. História prístupov ostáva k dispozícii aj pri odobratých členstvách. **Detailné hodnoty OLD → NEW** sú osobitne v kroku 5/8 a nie sú tu nepravdivo deklarované ako hotové.
- Správy: bezpečná statická záložka, **žiadne zavádzajúce unread číslo** a žiadne fiktívne odosielanie; živý D1 chat až v kroku 7/8.
- CSS doplnené len v `app/admin/partners/partners.css`, s kompaktným mobilným zobrazením vrátane päťzáložkovej navigácie.

## Overené kanonické editory

| Typ | Existujúca cesta |
| --- | --- |
| DIRECTORY_PROFILE | `/admin/adresar/:id` |
| HELP_ORGANIZATION | `/admin/organizacie/:id` |
| MANAGED_EVENT | `/admin/podujatia/:id` |
| ADOPTION_DOG | `/admin/adopcie/:id` |
| LOST_FOUND_DOG | `/admin/stratene-najdene/:id` |
| HELP_CASE | `/admin/pomoc/:id` |

V tomto kroku ide o čítanie a navigáciu. Každá žiadosť má pôvodný detail na schvaľovanie, ak ešte neexistuje partnerom vytvorený kanonický záznam.

## Testy pridané do PR

`tests/partner-admin-dossier.test.mjs` (SQLite):
- izolácia partner A/B, rôzne typy žiadostí, pending vs closed;
- odkazy na pôvodné žiadosti a kanonické editory, bezpečné null pre ešte nevytvorený kanonický draft;
- kombinované stránkovanie cez 65 záznamov, zobrazenie všetkých 65 bez duplicít;
- súhrn aktívnych membershipov a Pomoci psom, nezapočítanie revoked;
- história vrátane Admin rozhodnutí, bez ostatných partnerov;
- rozpoznanie syntetických ownership záznamov a neplatného starého Help JSON;
- statický kontrakt piatich záložiek, validných odkazov a neexistujúceho chatu.

```bash
node --experimental-strip-types --test tests/partner-admin-dossier.test.mjs
node --experimental-strip-types --experimental-loader ./tests/admin-events-loader.mjs --test tests/partner-admin-search.test.mjs
```

**Aktuálna validačná situácia:** kód bol uložený v GitHub pracovnej vetve; lokálny test runner a kompletné CI neboli potvrdené ako zelené. Partner platform workflow v Draft PR môže byť automaticky preskočený. Pred merge treba skutočné výsledky lint/build/SQLite/CI a kontrolu aktuálneho main.

## Bezpečnosť a spolupráca s inými PR

- Žiadne CREATE/UPDATE/DELETE v tomto kroku, len SELECT a zmenené React zobrazenie. Žiadne migrácie.
- Partner účty, historické žiadosti, prístupy a Notion review-lock sa nemenili. 0171/0172 už produkčne nasadené – nespúšťať znova.
- Pomoc psom paralelne mení draft PR #1463 – nezasahovať do jeho SQL cutover a zmien jeho tabuliek bez overenia schémy.
- Main sa počas vývoja posúva; pred spojením PR treba zosúladiť vetvu a znova pustiť regresiu.
- Vstup do detailu je stále za existujúcim `requireAdminPageUser`; SQL viaže konkrétne `accountId`; odkazy na interné editory vznikajú iba z podporovaných typov a bezpečného kladného ID.

## Stav

**3/8 implementované v PR #1467, Draft.**

Nasleduje **4/8**: kanonický partnerský draft pred odoslaním, priebežné úpravy počas review, návrat na doplnenie, schválenie + publikovanie v existujúcich editoroch. To už bude zmena doménovej logiky a vyžaduje samostatnú schémovú prípravu a regrese pre všetky agendy.
