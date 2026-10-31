# Psipedia – Vizuálna knižnica (postupný PR)

## Etapa 1 – realizovaná v tejto vetve

- Nový prvý pohľad v `/admin/komponenty` pre majiteľa webu: zoznam bannerov podľa ľudských názvov, vyhľadávanie, výber a náhľad z **toho istého** komponentu `PublicMagazineBanner`, ktorý používa produkcia.
- Automatické načítanie textových variantov všetkých definovaných článkových promo bannerov zo skutočnej definície `articlePromoRegistry`.
- Overené statické URL: `https://psipedia.sk/` pre banner „Pridajte svoj profil“ a `https://psipedia.sk/plemena` pre banner „Kluby plemien“. Tieto referencie boli skontrolované v aktuálnom zdrojovom kóde, nie prehliadaním produkčného webu.
- Pri článkových promo banneroch **zatiaľ nie je** výpis jednotlivých URL. Banner sa môže vybrať podľa obsahu a dňa alebo byť vložený ako obsahový blok. Zobrazujeme pravdivý stav „Presné URL zatiaľ nezistené“, nie odhadované odkazy.
- Starý technický register zostáva k dispozícii v rozbaliteľnej časti pre programátora.
- Náhľady sú iba na čítanie. Nič sa automaticky neupravuje a nepublikuje; neboli upravené žiadne existujúce verejné bannery.

## Plán pokračovania v tomto jedinom PR

1. **Presné publikované URL:** doplniť read-only zistenie konkrétnych článkov a dynamických profilov s rozlíšením „použité teraz“, „možné/rotujúce“ a „neoverené“. Neuvádzať len názov šablóny ako konkrétny článok.
2. **Polohy a opakovania:** rozlíšiť na tej istej URL viac výskytov, umiestnenia (obsah/sidebar/koniec), a explicitné označenia jednotlivých bannerov.
3. **Ďalšie kategórie:** Hero, CTA tlačidlá, karty, navigácia, filtre, kalendáre; všade reálny náhľad a použitá URL.
4. **Detekcia duplicít:** zoskupiť podobné bannerové varianty a nechať majiteľa potvrdiť, čo je naozaj duplicita.
5. **Bezpečný editor:** jednoduché zmeny farby/textu len pre tie komponenty, ktoré to bezpečne podporujú. Náhľad pred uložením, jasné „jedno miesto vs. všetky“ a schválenie pred publikovaním. Samostatne ochrániť mobilný vzhľad.

**Dôležité:** nezaraďovať hotové označenie „všetky URL“, kým enumerácia pokrytia nie je otestovaná na živých publikovaných záznamoch. Skladanie URL pomocou odhadovaných slugov nie je akceptovateľné.

## Príkazy

- `npm run test:visual-library` – zdrojové bezpečnostné kontrakty etapy 1.
- Existujúce `npm run test:component-registry` – testy technického registra.

## Rozsah

Iba admin zobrazenie a sprievodná dátová evidencia; bez databázovej migrácie, bez zásahov do existujúceho verejného vzhľadu a mobilného zobrazenia.
