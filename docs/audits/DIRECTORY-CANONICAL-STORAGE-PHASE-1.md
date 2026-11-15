# Psipedia.sk — jeden zdroj údajov, fáza 1/4 (Adresár)

Dátum: 15. 11. 2026. PR je **bez produkčnej migrácie a bez produkčných zápisov**.

## Cieľ

Admin zobrazuje efektívne hodnoty profilu; ich uloženie nesmie neskôr
vrátiť zmazaný alebo zmenený kontakt z historického `source_data_json`.
D1 zostáva jediným trvalým úložiskom verejnej hodnoty; Notion a automatizácie
sú zdroje **jednotlivých zmien**, nie zámienka na opakovanie starých snapshotov.

## Zmenené správanie v tejto fáze

- Všetkých desať kategórií Adresára pri podpísanej Notion zmene kontaktu
  aktualizuje **iba dotknutý kontakt**.
- Pri aktualizácii konkrétneho kontaktu sa v jednom CAS D1 zápise odstránia
  jeho vlastné staré aliasy (`Telefon`, `phone`, `Email`, `email`,
  `Webstránka`) a zapíše sa jediná známa kľúčová hodnota. Ostatné importné
  údaje, galérie, ďalšie kategórie, vzťahy, SEO, fotky a Služby V3 ostávajú.
- Výslovné vymazanie kontaktu odstráni všetky jeho aliasy. Pri vymazaní webu
  sa zároveň vyprázdni `website_url`. Nevznikne záložná historická hodnota.
- Nereplayujú sa kompletné profily; zostáva kontrola `updated_at`,
  identity, kategórie a stavu archívu.
- Admin `PUT` už používa `mergeDirectoryPublicContactData`, ktoré aliasy
  odstráni pri explicitnej úprave. Táto zmena uzatvára rovnakú dieru v
  priamej Notion → Admin ceste.

**Táto fáza NEODSTRAŇUJE** `source_data_json` z D1: obsahuje stále aktívne
redakčné, katalógové a vzťahové metadáta. Nepremiestňuje tiež automaticky
všetky kontakty do samostatných SQL stĺpcov — to vyžaduje zvlášť schválený
dátový cutover po vyhodnotení konfliktov.

## Read-only preflight pred úplnou migráciou

Z autorizovaného read-only exportu D1 použite iba tieto stĺpce:

```sql
SELECT id, category, website_url, district, source_data_json
FROM directory_profiles
ORDER BY id;
```

Export vo formáte JSON môže byť pole riadkov, `{ "results": [...] }`
alebo štandardná odpoveď Wrangler D1 s poľom `results`.
Žiadny kód v preflight nástroji sa nepripája na D1.

```bash
node scripts/directory-canonical-storage-preflight.mjs /lokalna/cesta/adresar-export.json
```

Report uvádza len počty a maximálne 25 číselných ID na typ problému.
**Neobsahuje telefóny, e-maily, URL ani iný obsah profilov.**

Kontrolujú sa:
- staré aliasy telefónu, e-mailu a webu a rozdielne hodnoty v nich,
- rozdiel medzi `website_url` a importnými kľúčmi,
- okres uložený iba ako `source_data_json.Okres`,
- rozdiel `district` vs. starý `Okres`,
- neplatný či chýbajúci JSON a neplatné ID.

## Akceptačné podmienky

1. Zmena Facebooku nemení telefón, e-mail, web ani Instagram.
2. Zmena webu s `Webstránka` v starom JSON odstráni konflikt bez straty
   zvyšných metadát.
3. Explicitné vymazanie webu/telefónu/e-mailu nemôže obnoviť starý alias.
4. Súbežný starý zápis zlyhá na CAS; nesmie byť nahlásený ako úspech.
5. Preflight je čisto offline/read-only, rozpoznáva konflikty a neodhalí hodnoty.

## Čo ešte zostáva (ďalšie fázy)

- Zistiť výskyt konfliktov zo **skutočného read-only produkčného exportu**,
  rozhodnúť autoritatívnu hodnotu každého sporného profilu, pripraviť
  zálohovanú a idempotentnú migráciu so suchým behom.
- Kanonizovať `district` a ostatné historické redakčné fakty bez straty
  obsahu; natrvalo odstrániť ich verejné fallbacky až po parity kontrole.
- Zjednotiť public + Admin prezentáciu plemien, klubov, služieb a vzťahov.
- Overiť, že automatizácie/Notion netlačia starý snapshot; vykonať live
  test každej z desiatich kategórií. Zelené offline testy nie sú produkčné
  potvrdenie.
- Žiadna migrácia D1, zmena webhook subscription, produkčný deploy ani
  mazanie starých hodnôt nie sú súčasťou tohto PR.
