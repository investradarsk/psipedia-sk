# Plemená – stav redukcie polí a skúšobného presunu (5. 11. 2026)

## Inventár
- Notion zdroj: `collection://2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2`.
- **344** plemien a **109** existujúcich vlastností; v detaile je preferovaných 60 a v tabuľke 13 stĺpcov.
- Kompletná pôvodná záloha: `collection://170793fc-1d18-8204-a6f9-87479609dca7` a [odkaz do Notionu](https://app.notion.com/p/40e793fc1d1881f1b78df9f435b6cc1a).
- Porovnanie pracovnej databázy so zálohou cez Notion view v čase kontroly: **344/344** profilov, **109/109** pôvodných hodnôt zhodných (pred skúšobným zápisom).
- Inventár zmien: **344 profilov potrebuje konsolidáciu**, približne **4 250** vyplnených kúskov historických dát podľa 23 plánovaných prenosov. Viaceré zdrojové polia sa presúvajú do toho istého cieľa.

## Skúška a čo ukázala
- Jeden profil: Affenpinscher (FCI č. 186), ďalšie dva: Afganský chrt a Aidi.
- Pri prvom skúšobnom zápise Notion editor zmenil zalomenia na doslovné `<br />`; ďalší zápis už používal bezpečné oddeľovače ` — `.
- Pri presune URL môže editor previesť holú URL na Markdown autolink `[URL](URL)`; ekvivalentnosť kontrolovať len pri rovnakom texte a cieli.
- Skúšobne sa presunuli údaje približne do 10–11 cieľových polí na profil; pôvodné zdroje a identita boli po zápise nezmenené.
- **Skúška odhalila duplicity na živej verejnej stránke**: prehľad obsahoval aj „Každodenné potreby“, ale pôvodná sekcia ich stále zobrazovala; analogicky sa opakovali tipy k pohybu, srsti, zdraviu a výcviku.
- **Všetky cieľové hodnoty v troch skúšobných profiloch boli obnovené z nezávislej zálohy a readback overil každý návrat.** Odstránenie starých stĺpcov neprebehlo. Ak Admin už načítal pilotný obsah, verejná produkcia ho môže do nasledujúceho úspešného syncu zobrazovať – skontrolovať zvlášť.
- Obe odborné automatizácie A–K a L–Ž boli aktualizované tak, aby nepísali do skrytých migračných polí, a L–Ž bola znovu zapnutá.

## Nový kód v PR #1212
- Verejný renderer (`app/plemena/[slug]/page.tsx`, FCI detail) v prechodnom období skryje **len pridanú, označenú migračnú príponu**, nie originálny text ani staré FCI podpolia.
- Migrátor `--mode=apply` sa nespustí bez `BREED_COMPACT_PUBLIC_CUTOVER_READY=true`. Režimy `audit` a `verify` sú naďalej len na čítanie.
- Kontrakty čítania/zápisu Notion majú brať do úvahy 23 migračných nadpisov, presnosť readbacku a citlivé spracovanie URL.
- Pridané jednotkové testy proti duplicite, neúplným zdrojom, konfliktom a nesprávnemu schváleniu cutoveru.

## Čo ešte musí byť hotové PRED mazacou migráciou
1. Upraviť Notion↔Admin mapovanie 23 zlúčených obsahových polí tak, aby žiadny automatický sync neprepísal nové cieľové dáta starou hodnotou.
2. Doplniť skutočný nový public renderer, ktorý po odpojení zdrojových stĺpcov zobrazí zlúčené údaje iba raz a zachová čitateľnú FCI štruktúru.
3. Znova urobiť čerstvú úplnú zálohu; pri migrovaní zamraziť súbežné zápisy migrovaných polí.
4. Skúšobný backfill po malej dávke, kontrola konkrétnych plemien na verejnom webe a ich D1/Notion readbacku.
5. Až po úplnom overení 344 profilov odstrániť LEN konkrétne odpojené staré Notion properties. Ponechať identitu, systémové metadáta, vzťahy a odborný obsah; nepokúšať sa nasilu dosiahnuť presne 60 fyzických stĺpcov vrátane metadát.

**Nezahadzovať historické FCI detaily ani povinné údaje z profilov, ani nespúšťať `DROP COLUMN` po samotnom merge PR.**
