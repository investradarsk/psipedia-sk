# Pomoc psom – bezpečné fyzické odstránenie historických SQL kópií

**Pozor:** Ide o historické **SQL riadky**, nie o JSON súbory. Súborové JSON importy boli odstránené v #1488. Technické JSON stĺpce v D1 sa nemenia.

Kanonické tabuľky: `help_cases` (bežné prípady), `help_organizations` (útulky), `adoption_dogs` (adopcie), `lost_found_dog_reports` (stratené a nájdené).

## Overený read-only produkčný inventár (20. 11. 2026)
- Historické `help_cases`: 36 `adopcia`, 104 `utulky`, 0 `stratene-a-najdene`.
- Všetkých 36 adopcií má kanonické párovanie, 94 útulkov má pár a 10 je majiteľom **úmyselne odstránených** bez opätovného importu.
- 140 historických riadkov má 140 väzieb `notion_agenda_sync` pre `help-cases`.
- Audit nepreukazuje field-level Notion parity; preto sa zo starých dát **nič neimportuje ani neprepisuje**.

## Implementácia
- V Admin / Pomoc psom / Historické kópie sa zobrazuje nevyhnutný read-only preflight.
- Majiteľ musí napísať výslovné potvrdenie.
- Každá požiadavka spracuje maximálne **jeden** starý SQL záznam.
- Neexistuje automatické nasadenie, cron, SQL migrácia ani `DELETE` počas PR merge.
- Režim používa existujúci `removeRecord()` lifecycle so striktne interným a explicitným povolením pre staré `adopcia/utulky`.
- U každého záznamu: id/slug/kategória + kanonické párovanie + Notion mapping → tombstone → skryť → overiť a presunúť starú Notion stránku do koša → transakčné odstránenie väzby a `help_cases` riadku → tombstone `COMPLETE`.
- Preflight blokuje neznáme počty, ďalšie staré stratené hlásenia, neznáme vymazané útulky, chýbajúce párovania, Notion mappingy, duplicity slugov, partner nároky, neočakávané stavy a konflikty tombstonov.
- Prerušenie otvorenej stránky proces zastaví po aktuálnom zázname; uložené tombstones umožnia bezpečné opakovanie. Neúspešné presunutie Notion zastaví ďalší postup.
- Triggery D1 z migrácie 0164 **zostávajú aktívne**. `partner_help_claims` s RESTRICT sa nemažú.
- Žiadny existujúci verejný profil, kanonická adopcia, útulok, partner alebo technický JSON sa nemení.

## Pred použitím
PR musí prejsť celé CI. Po merge a nasadení sa otvorí /admin/pomoc/historicke, skontroluje pripravenosť a potvrdí sa fyzické mazanie. **Až úspešné dokončenie 140/140 je dôkazom vymazania.** V PR sa nič nemaže.
