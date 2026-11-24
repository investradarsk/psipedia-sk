# Admin V6-09 — Diagnostika manuálnych Notion mapovaní

## Použitie

Admin → Nastavenia → Notion → Manuálny prenos. Vyber oblasť, podkategóriu a rozsah. **Skontrolovať mapovania v D1** vykoná autentifikované GET, maximálne 50 riadkov na stranu. Nevytvára journal, náhľad ani prenos. Pre jeden jednoznačný, lokálne platný a neuzamknutý profil je voliteľné **Overiť aj Notion identitu**, ktoré používa existujúci read-only inspector. Nesprístupňuje UUID, tokeny, provider odpoveď ani hodnoty polí.

Päť oblastí, osem typov identity: plemená (aktívna pracovná kópia), adresár (primárna kategória), podujatia, e-shopy, organizácie, adopcie, ostatná pomoc a stratené/nájdené. Rovnaké numerické ID v dvoch tabuľkách nie je kolízia. Dvojité mapovanie normalizovaného UUID naprieč aktívnymi väzbami je blokujúca chyba. Historické kompaktné UUID je podporované len existujúcim adaptérom pracovnej kópie plemien; ostatné adaptéry naďalej vyžadujú pôvodný formát a presnú identitu.

## Bezpečnosť

- Lokálny report rozlišuje chýbajúce mapovanie, prázdne/neplatné UUID, nepodporovaný formát, chýbajúci kanonický záznam, neaktívnu pracovnú kópiu, kolíziu a nejednoznačné mapovanie. Zobrazuje aktuálnu kategóriu, očakávaný zdroj a bezpečný odkaz na existujúci kanonický editor.
- Odkontrolované, aktívny partner, odomknutie čakajúce na dokončenie, tombstone a archív sa nesmú opravovať automaticky. Používa sa existujúci Directory SQL lock a existujúci Admin review lock pre Events/Help. Nedostupný lock sa neinterpretuje ako odomknutý.
- Pri individuálnom Notion overení sa odlišuje nesprávna identita, nesprávny zdroj, archivovaná stránka a nedostupnosť (403/404 nie sú dôkazom vymazania). Adaptéry naďalej overujú svoje existujúce invarianty, receipt a prípadné URL. Konfigurácia zdroja a oprávnenia sa nesmú hádať.
- Fronta pred založením kontroluje globálne kolízie; pred preview a pred potvrdeným zápisom znovu overuje identitu a zámky. Existujúca autorizácia, potvrdenie, fingerprint, last-write-wins a lifecycle pravidlá sa nemenia. Žiadne premapovanie, automatická oprava ani nový zápis do produkcie.

## Obmedzenia dôkazov

Report je stránkovaný živý D1 výrez, nie konzistentný snapshot celého Notion. Pre D1 diagnostiku sa nevyhľadávajú všetky Notion stránky; nedetekuje všetky vzdialené duplicity bez existujúceho D1 mapovania. Vzdialenú kontrolu treba spustiť zvlášť pre konkrétny profil. D1 diagnostika bez určenia kategórie zahŕňa aj osirotené mapovania adresára, ktorých pôvodnú kategóriu nemožno potvrdiť. Kontroluje iba podporované agendy manuálneho prenosu, nie články, Facebook a legacy originál plemien.

Bez prístupu k produkčnej D1 nemožno tvrdiť, že konkrétny produkčný profil má poškodené mapovanie. Kompaktný formát historických breed UUID je doložený komentárom a existujúcim normalizovaným lookupom v adaptéri, nie produkčným auditom.

Testy: tests/notion-manual-transfer-mapping.test.mjs, existujúce testy review locku a NOTION-MANUAL-TRANSFER contract CI. Lokálne SQL smoke scenáre na syntetickom SQLite overili typové ID, normalizovanú kolíziu, missing/orphan a legacy kategóriu, zámok review/partner. Plný checkout, Prettier, CI a vizuálna revízia presnej revízie zostávajú na overenie.
