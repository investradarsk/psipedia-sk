# NAME-DAY-1 — canonical kalendár psích mien

## Runtime contract

Kalendár psích mien je canonical D1 dataset v tabuľke `dog_name_days`. Verejný resolver používa iba riadky so stavom `published` pre aktuálny deň v timezone `Europe/Bratislava`. Ak databáza, tabuľka alebo eligible záznam nie je dostupný, resolver vráti prázdny zoznam a header sa nezobrazí. Neexistuje statický ani syntetický fallback.

Jeden deň môže obsahovať viac mien. Kombinácia `(month, day, normalized_name)` je unikátna. Normalizované meno je accent-insensitive a case-insensitive hodnota používaná na ochranu pred duplicitou a na vyhľadávanie.

Stavy sú `draft`, `published` a `archived`. Nový záznam môže byť publikovaný iba explicitnou redakčnou akciou. `source`/proveniencia je povinná; `note` je voliteľná.

## Import contract

Admin import prijíma JSON pole s poliami `month`, `day`, `name`, `source` a voliteľným `note`. Preview vždy vráti počty `INSERT`, `UPDATE`, `SKIP`, `ERROR`.

- nový záznam sa vytvorí výhradne ako `draft`,
- identický záznam je `SKIP`,
- zmena existujúceho draftu je `UPDATE`,
- import nesmie meniť publikovaný alebo archivovaný záznam,
- duplicita v importnom súbore je `ERROR`,
- ak preview obsahuje aspoň jeden `ERROR`, apply sa nevykoná,
- import nikdy sám nepublikuje.

## Source audit — 2026-09-20

V tomto workstreame nebol schválený ani importovaný reálny dataset. Pri audite boli porovnané verejne dostupné slovenské kalendáre vrátane Aktuality/Kalendár.sk, Pes.sk, WebforDog a Kalendár/Zoznam. Zoznamy nie sú jednotné a nejde o štátny alebo iný zjavne autoritatívny register psích mien. Zároveň podmienky niektorých zdrojov obmedzujú kopírovanie alebo ďalšie použitie obsahu.

Preto migrácia zámerne neobsahuje žiadne `INSERT` záznamy. Dataset zostáva prázdny, kým redakcia nezíska dôveryhodný a použiteľný source-of-truth alebo vlastný redakčne schválený dataset s dokumentovanou provenienciou.

Auditované verejné zdroje (iba ako výskumné referencie, nie ako importný dataset):

- https://kalendar.aktuality.sk/psi/
- https://www.pes.sk/psi-kalendar/
- https://www.webfordog.sk/psi-kalendar/
- https://calendar.zoznam.sk/animalnameday-sk.php

Žiadne meno ani dátum z týchto stránok nebol skopírovaný do produkčných dát v NAME-DAY-1.
