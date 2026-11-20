# Adresár krok 2/4 – staging aktuálnych hodnôt

Reuses existing D1/Notion production transport and owner-gated workflow, rather than introducing a duplicate import engine. PR #1489's isolated SQL schema is deployed only by explicit, manual apply.

Notion contributes only safely mapped editorial extra fields. Active Admin/D1 supplies service text and typed image display. Legacy source_data_json is read only for technical snapshot lists, never used to overwrite newer editorial SQL, contacts, SEO, canonical relations, review locks or Services V3. Existing partner, reviewed, archived and tombstoned protections are preserved.

The operation only writes additive companion SQL and the STAGED receipt. It does not flip runtime readers, overwrite canonical directory_profiles, set VERIFIED/SQL_ONLY, delete historical JSON or write Notion. Time on the Notion page does not establish per-field last-write-wins: ambiguous service differences are flagged for step 3 parity review.

Run after merge from GitHub Actions / Directory SQL step 2 of 4: first audit with AUDIT-DIRECTORY-SQL-STEP2-psipedia-sk-db, then owner-approved apply with APPLY-DIRECTORY-SQL-STEP2-psipedia-sk-db. Use the report before step 3. Partial schema causes a hard stop, not an automatic repair.