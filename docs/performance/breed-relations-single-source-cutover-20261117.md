# Jednotné prepojenia plemien – bezpečný cutover

**Draft PR – NEZLUČOVAŤ, kým nie je overený prenos produkčných dát.**

## Jeden zdroj pravdy

- Katalóg plemien: `managed_breeds.id`.
- Prepojenia pre chovateľské stanice **aj trénerov**: `breed_directory_relations(breed_id, profile_id)`.
- Profil trénera už nemá čítať ani zapisovať `_psipedia_trainer_breed_ids`.
- Kluby zostávajú samostatná téma; ich metadata sa týmto PR nemenia.
- Notion, SEO/FCI publikovateľnosť a vzťahy článkov sú nezávislé kontrakty; nesmú sa odstrániť bez parity.

## D1 cutover – manuálne a v tomto poradí

1. Urobiť zálohu/snapshot produkčnej D1. Bez toho nepokračovať.
2. Spustiť iba SELECT: `scripts/d1-trainer-breed-links-preflight.sql`. Uložiť výstup a čas.
3. **STOP** ak `invalid_json`, `invalid_array`, `bad_ids`, `orphan_ids` nie sú nula. Nesmie sa ticho zahodiť ani jeden link.
4. V krátkom kontrolovanom cutover okne zastaviť súbežné editácie vzťahov trénerov (Admin a automatizácie), nie celú stránku. Opakovať preflight.
5. Manuálne spustiť `scripts/d1-trainer-breed-links-backfill.sql` na správnej databáze `psipedia-sk-db`. Tento SQL iba pridáva chýbajúce vzťahy, nikdy nemaže JSON a nikdy nemaže existujúce väzby.
6. Znova spustiť SELECT preflight. `legacy_pairs_missing = 0` a počet trainer relácií musí zodpovedať očakávaniu. Skontrolovať reálne záznamy Admin ↔ D1 a verejný profil.
7. Až potom merge a deploy tejto PR; nový kód používa **iba** reláciu. Overiť desktop/mobile a D1 Queries.
8. Historický JSON kľúč odstrániť až po dodatočnom read-back audite a schválení samostatného cleanup kroku. Nespúšťa sa tu žiadny JSON DELETE.

## Bezpečnostné záruky

- Žiadna produkčná migrácia sa nespustí merge alebo Workers Buildom.
- Zmeny trénerov používajú D1 batch (transakcia) a porovnanie pôvodného source JSON. Pri konfliktnej editácii sa nevytvorí čiastočne uložený profil.
- Existujúce kontakty, Notion polia, sekundárne kategórie a chovateľské relácie zostávajú nezmenené.
- Žiadne automatické priraďovanie plemena podľa voľného textu. Nejasný legacy text ostáva na ručnú kontrolu.

## Ďalší audit pred širším zjednotením plemien

Pred odstránením drahého `canonicalBreedIdsSql` treba read-only overiť duplicity podľa FCI/slug/import_key a kanonické URL na **produkčných** záznamoch. Bez toho by sa mohli zmeniť verejné URL alebo indexovanie.
