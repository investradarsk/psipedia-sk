import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { preflightAdoptionMigration } from "../lib/adoption-migration-safety.ts";

const { values } = parseArgs({ options: { database: { type: "string", short: "d" } } });
if (!values.database) throw new Error("Použitie: npm run preflight:adoptions -- --database <lokálny-d1.sqlite>");

const manifest = JSON.parse(readFileSync(new URL("../data/imports/adoptions-ready-2026-09-13.json", import.meta.url), "utf8"));
const db = new DatabaseSync(values.database, { readOnly: true });
try {
  const legacyRows = db.prepare(`SELECT category, slug, status, excerpt, description,
    dog_name AS dogName, breed, image_url AS imageUrl
    FROM help_cases WHERE category = 'adopcia'`).all();
  const organizationRows = db.prepare(`SELECT id, import_key AS importKey, slug, name
    FROM help_organizations
    WHERE import_key IN (?, ?, ?, ?)`).all(
      "help-org:pomoc-unia-vzajomnej-pomoci-ludi-a-psov-u-v-p",
      "help-org:pomoc-dog-azyl-o-z",
      "help-org:pomoc-zdruzenie-na-ochranu-zvierat-trnava",
      "help-org:pomoc-oz-pes-v-nudzi",
    );
  const targetSlugs = db.prepare("SELECT slug FROM adoption_dogs").all().map((row) => row.slug);
  const report = preflightAdoptionMigration(manifest, legacyRows, organizationRows, targetSlugs);
  const summary = { ...report };
  delete summary.candidates;
  console.log(JSON.stringify(summary, null, 2));
} finally {
  db.close();
}
