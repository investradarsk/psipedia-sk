# Psipedia Partner – krok 2/8: samoobslužný prehľad

## Už existujúce funkcie, ktoré nepíšeme znova

- Registrovanie, overenie e-mailu, prihlásenie, Google/heslo a bezpečná session ostávajú vo svojej pôvodnej implementácii.
- `requirePartnerPageIdentity()` zachováva presmerovanie neprihláseného používateľa a povinný onboarding.
- `PartnerShell`, `partner.css` a štandardné triedy tlačidiel ostávajú spoločné.
- Žiadne zmeny schémy, nová identita profilu ani ďalšie paralelné ukladanie.

## Nový /partner

1. **Začať:** funkčné odkazy „Pridať nový profil“ a „Pridať podujatie“; existujúci claim sa začína na verejnom profile služby alebo organizácie.
2. **Prehľad:** počty spravovaných profilov, podujatí a čakajúcich žiadostí (vrátane zmien, ktoré zatiaľ zostávajú moderované).
3. **Moje záznamy:** posledných šesť priradených záznamov zo skutočnej D1 membership. Odkazy na aktuálny editor a prípadnú verejnú stránku; nevymýšľajú sa ďalšie dátové kópie.
4. **Moje žiadosti:** štyri najnovšie žiadosti naprieč prevzatiami, novými profilmi, podujatiami a existujúcimi návrhmi úprav. Statusy pochádzajú zo zavedených moderation/claim úložísk.
5. **Vizuál:** kompaktné karty s existujúcou paletou, mobilné 1-stĺpcové záznamy a dostupné fokusovanie odkazov.

## K hraniciam tejto etapy

- Samostatné adopcie, stratené/nájdené psy a žiadosti o prevzatie podujatí **zatiaľ nemajú funkčnú Partner integráciu** – preto neukazujeme nefunkčné odkazy. Doplníme ich v krokoch 3/4.
- Priame zverejňovanie zmien schváleným partnerom bude až v krokoch 5/6. Neodstránili sme súčasnú moderáciu.
- Používateľské účty, ich prístupy a interné ID nie sú súčasťou verejného webu.
- PR #1437 je pokračovaním #1434; #1434 sa má zlúčiť skôr než #1437.

## Testy

`npm run test:partner-dashboard` overuje zdroj počtov, stavy žiadostí, prázdny prehľad a funkčné ciele odkazov. Playwright `tests/e2e/partner-auth.spec.ts` kontroluje odkazy a mobilný overflow po prihlásení.
