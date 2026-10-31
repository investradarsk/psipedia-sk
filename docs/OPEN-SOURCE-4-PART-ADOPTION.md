# Psipedia – spoločný open-source PR (4 časti)

Tento dokument sleduje **jeden Draft PR**. Každá ďalšia časť sa doplní na rovnakú vetvu; nejde o štyri samostatné PR.

## 1. TanStack Query – prvá dokončená implementačná etapa

- [x] Nainštalovaný a SHA512-locknutý `@tanstack/react-query@5.105.0`.
- [x] `AdminQueryProvider` len pre `/admin`: krátka pamäťová cache (stale 20 s, garbage collection 60 s), bez persistence a bez retry mutácií.
- [x] Admin Podujatia: kľúče podľa filtrov, stránky a Bratislava-dňa; zachovaná SSR prvá strana, oneskorené hľadanie, cancel signal, cache predchádzajúcej strany a explicitné obnovenie po úspešnej mutácii.
- [x] Admin Nastavenia → Notion: samostatné cache kľúče podľa kategórie, live test **iba na kliknutie** a opakovanie pri chybe.
- [x] Kontraktové testy vrátane aktualizácie existujúcich testov na nový model.
- [ ] CI: npm ci, TypeScript, build, lint, relevantné Node testy, admin E2E.
- [ ] Manuálny desktop/mobil smoke; porovnať počet requestov (pred/po) a vylúčiť stale údaje po editáciách.

### Bezpečnostné hranice

- Bez zmeny D1 schémy, Notion synchronizácie, publikačných pravidiel a existujúcich API.
- Cache zostáva iba v pamäti aktuálneho admin klienta. Žiadne ukladanie dôverných odpovedí do storage.
- Server a pôvodné editor/mutation endpointy sú naďalej zdrojom pravdy. Žiadne automatické retry zápisov.
- Neprenášať TanStack Query automaticky na všetky SSR zoznamy; najprv preukázať prínos na vybraných klientských obrazovkách.

## 2. Uppy – schválený zámer, **zatiaľ neimplementované**

- [ ] Audit súčasného `react-dropzone`, nahrávania Cloudflare Images a existujúcich editorov.
- [ ] Jeden opakovane použiteľný uploader pre články, plemená, služby, Pomoc psom a podujatia; hromadný výber, bezpečný preview, poradie a chyby.
- [ ] Bez zásahu do existujúcich identifikátorov médií, ukladaných URL či publikovania; žiadna druhá media pipeline.
- [ ] Doplniť príslušné balíky/lockfile a E2E len po audite kompatibility.

## 3. PhotoSwipe – schválený zámer, **zatiaľ neimplementované**

- [ ] Audit existujúcich lightboxov a verejného zobrazovania obrázkov.
- [ ] Jednotný prístupný gallery/lightbox komponent pre profily a články, s mobilnými gestami.
- [ ] Zachovať SEO obrazové údaje, alt text, SSR náhľady a fallback fotografií.

## 4. FullCalendar – schválený zámer, **zatiaľ neimplementované**

- [ ] Audit aktuálneho verejného kalendára a admin plánovania.
- [ ] Zaviesť modernejší kalendár Podujatí so zachovaním existujúcich typov, filtrov, URL a údajov; schválený vzhľad Psipedie.
- [ ] Zmena mesiaca a výber dňa bez full page reload, prístupnosť klávesnice a mobil.
- [ ] Voliteľné spoločné zobrazenie publikačných plánov FB článkov a obrázkov bez zásahu do publikátora.
- [ ] Overiť licenčné limity free MIT pluginov; nepoužívať platené resource/timeline views bez súhlasu.

## Merge politika

**Nemergovať po časti 1.** Dopĺňať len tento PR, označovať hotové etapy a skontrolovať celý súbor zmien pred konečným merge. D1 produkčné migrácie a nasadenia mimo PR nespúšťať.
