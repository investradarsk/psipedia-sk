# Adresár 0173 – prvé relačné zápisy fotogalérie

Po nasadení 0173 a PR #1458 sa **explicitne uložená galéria chovateľskej stanice**
zapisuje transakčne do `directory_profile_media` spolu s kanonickým profilovým
INSERT/UPDATE. Záznamy majú poradie, URL, prázdne ALT a atribúciu; hlavný
obrázok zostáva v `directory_profiles.image_url/image_key`.

- Pri neupravenom poli `galleryUrls` sa SQL galéria nemení.
- Explicitná prázdna galéria odstráni iba galériové SQL riadky daného profilu.
- Zmena je ohraničená identitou profilu, `updated_at` a `updated_by`, takže
  neúspešný alebo zastaraný kanonický zápis nezmaže novšiu SQL galériu.
- Pôvodná galéria v `source_data_json` sa naďalej zachováva a zatiaľ sa z nej číta.
  **Žiadny globálny JSON → SQL import ani SQL-only read cutover sa nerobí.**
- Nie je dotknuté partnerom spravované nahrávanie ani galérie iných kategórií,
  ktoré zatiaľ používajú rozdielne zapisovacie cesty; tie treba zjednotiť
  samostatne pred vyradením JSON.

SQL štruktúra `directory_profile_media` už existuje od produkčnej migrácie
0173, preto tento PR nemá novú migráciu ani zásah do ostatných tabuliek.

Izolované testy: poradie, viac fotografií, typy hodnôt, clear vs omitted,
súbežné zápisy, oddelenie hlavného obrázka a profilovej identity.

## Ochrana pred historickou galériou

Pri explicitnom vymazaní galérie chovateľskej stanice sa odstráni aj starý
technický alias `_psipedia_profile_gallery_urls` pre tento profil, aby
existujúci verejný čítač nenačítal už vymazané fotografie z iného JSON kľúča.
Pri iných zmenách profilu sa tento alias nemení. SQL shadow sa vždy odvodzuje
z konkrétneho normalizovaného poľa `_psipedia_breeder_gallery_urls`, nikdy
z fallbacku partner-profile-gallery.
