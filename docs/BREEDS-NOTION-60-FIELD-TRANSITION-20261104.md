# Psipedia – Plemená: zjednodušené zobrazenie 60 polí

> Stav 4. 11. 2026: realizované zjednodušenie rozhrania databázy Notion, NIE fyzická migrácia a mazanie stĺpcov.

## Zmeny

- Zostáva všetkých 109 fyzických Notion properties, bez mazania a bez prepísania dát.
- 60 polí vrátane názvu je v predvolenom zobrazení; 49 historických/systémových polí je skrytých iba v Notion page layout.
- FCI detaily sú v rozšírenej sekcii, prázdne FCI bunky sa nezobrazujú.
- Admin editor zobrazuje doplnkové redakčné texty v rozbaľovacích sekciách, ich hodnoty a verejné vykreslenie sa nemenia.
- Automatický Notion → Admin sync po novom ignoruje skutočne prázdne vstupy, vrátane FCI podpolí; checkbox `false` sa berie ako legitímna hodnota.
- Admin → Notion PATCH pri validácii HTTP 400 skúsi jednotlivé polia zvlášť; úspešné a neúspešné eviduje nezávisle. Pri 429 a serverových chybách nespúšťa záplavu samostatných requestov.

## Viditeľné polia v Notione

**Názov** je vždy viditeľný ako title. Ostatné sú rozdelené do sekcií:

### Základné údaje

`FCI číslo`, `FCI skupina`, `FCI sekcia`, `Krajina pôvodu`, `Oficiálny FCI názov`, `Veľkosť`, `Výška`, `Hmotnosť`, `Dĺžka života`, `Srsť`

### Povaha a hodnotenia

`Energia`, `Trénovateľnosť`, `Deti`, `Iné psy`, `Byt`, `Starostlivosť o srsť`, `Pĺznutie`, `Lovecký pud`

### Odborný profil

`Intro`, `Redakcia prehľad`, `Charakter`, `História`, `Pohyb`, `Výcvik`, `Zdravie`, `Zdravotné riziká`, `Vhodné pre`, `Zvážiť`, `Redakcia spolužitie so psami`, `Redakcia starostlivosť o srsť`, `Redakcia chyby majiteľov`, `Redakcia zaujímavosti`, `Redakcia život v rodine`

### Fotografie, športy a zdroje

`Hlavný obrázok URL`, `Galéria JSON`, `Športy JSON`, `Zdroje`

### Rozšírený FCI štandard

`FCI celkový vzhľad`, `FCI proporcie`, `FCI povaha a temperament`, `FCI lebka`, `FCI telo`, `FCI predné končatiny`, `FCI zadné končatiny`, `FCI pohyb`, `FCI srsť`, `FCI farba`, `FCI výška pes cm`, `FCI výška suka cm`, `FCI hmotnosť pes kg`, `FCI hmotnosť suka kg`, `FCI chyby`, `FCI závažné chyby`, `FCI diskvalifikačné chyby`, `FCI štandard PDF`, `FCI zdroj poznámka`

### Redakčné dokončenie a SEO

`Editorial complete`, `SEO title`, `Meta description`

## Skryté polia (dáta stále existujú)

`Alt text obrázka`, `FCI chov poznámka`, `FCI chvost`, `FCI historický súhrn`, `FCI koža`, `FCI krk`, `FCI nomenklatúra URL`, `FCI oči`, `FCI sekcia názov`, `FCI sekcia číslo`, `FCI skupina názov`, `FCI status`, `FCI tvár`, `FCI uši`, `FCI veľkosť a hmotnosť poznámka`, `FCI využitie`, `FCI štandard JSON`, `Farba akcentu`, `Import kľúč`, `Odborný reaudit 2026`, `Platnosť FCI štandardu`, `Posledný sync`, `Potreby`, `Poznámky`, `Pracovná skúška`, `Profil skvalitnený`, `Psipedia ID`, `Redakcia hlavné vlastnosti JSON`, `Redakcia tip pohyb`, `Redakcia tip srsť`, `Redakcia tip výcvik`, `Redakcia tip zdravie`, `Redakčné sekcie JSON`, `Rodina`, `SEO OG description`, `SEO OG title`, `SEO canonical URL`, `SEO focus keyword`, `SEO noindex`, `Skupina`, `Slug`, `Stav`, `Sync chyba`, `Sync stav`, `Súvisiace plemená ID`, `Súvisiace profily služieb ID`, `Súvisiace články ID`, `URL Psipedia`, `Zdroj obrázka`

## Po fyzickom zjednodušení – nevyhnutné podmienky

1. Pred zlúčením vytvoriť plnú zálohu všetkých 109 vlastností pre každý profil.
2. Samostatne migrovať texty (nespájať obsah bez zachovania odsekov a označenia zdroja), pole po poli. Príklady: `Potreby` + `Pohyb` + `Redakcia tip pohyb`; `Zdravie` + `Redakcia tip zdravie`; FCI chyby 3→1; hlava/tvár/oči/uši 4→1. Štruktúrované JSON a vzťahy vyžadujú adaptér.
3. Porovnať staré/nové hodnoty pre všetky plemená; žiadne tiché zmazanie nevyplnených údajov, nejednoznačný merge má byť len upozornenie.
4. Aktualizovať existujúce Notion kvalitné automatizácie a všetky Admin/Notion adaptery pred akýmkoľvek DROP COLUMN.
5. Až po otestovaní oboch smerov, médií, publikovania a verejného zobrazenia schváliť fyzické odstránenie nepotrebných stĺpcov.

## Nezmenené

- FCI číslo / Psipedia ID / slug / import key zostávajú chránenou identitou.
- Existujúce režimy priority údajov a databázové záznamy zostávajú bez prepisu.
- Nepúšťajú sa hromadné zápisy a nič sa automaticky nepublikuje.
