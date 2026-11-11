import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("0165 is additive, defaults to no public contacts and never touches private PII", () => {
  const sql = read("drizzle/0165_lost_found_public_contacts.sql");
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE lost_found_dog_reports (id INTEGER PRIMARY KEY, public_contact_note TEXT NOT NULL DEFAULT '')");
  db.exec("CREATE TABLE lost_found_dog_private_details (report_id INTEGER PRIMARY KEY, contact_phone_encrypted TEXT, contact_email_encrypted TEXT)");
  db.exec("INSERT INTO lost_found_dog_reports(id,public_contact_note) VALUES (1,'Kontakt cez Psipediu')");
  db.exec("INSERT INTO lost_found_dog_private_details(report_id,contact_phone_encrypted,contact_email_encrypted) VALUES (1,'encrypted-phone','encrypted-email')");
  db.exec(sql);
  const cols = db.prepare("PRAGMA table_info(lost_found_dog_reports)").all().map(x=>x.name);
  for(const col of ["public_phone","public_email","public_website_url","public_facebook_url","public_instagram_url"])
    assert.ok(cols.includes(col),col);
  const row = db.prepare("SELECT * FROM lost_found_dog_reports WHERE id=1").get();
  for(const col of ["public_phone","public_email","public_website_url","public_facebook_url","public_instagram_url"])
    assert.equal(row[col],"",col);
  assert.equal(row.public_contact_note,"Kontakt cez Psipediu");
  assert.deepEqual(db.prepare("SELECT contact_phone_encrypted,contact_email_encrypted FROM lost_found_dog_private_details WHERE report_id=1").get(), {
    contact_phone_encrypted:"encrypted-phone",contact_email_encrypted:"encrypted-email",
  });
  db.close();
});

test("public DTO uses only explicit public fields, independent of encrypted private contact", () => {
  const domain = read("lib/lost-found-dogs.ts");
  const store = read("lib/lost-found-dog-store.ts");
  const publicType = domain.split("export type PublicDogReport = {")[1].split("export type AdminDogReport")[0];
  for(const name of ["publicPhone","publicEmail","publicWebsiteUrl","publicFacebookUrl","publicInstagramUrl"])
    assert.ok(publicType.includes(name),name);
  assert.doesNotMatch(publicType,/contactPhone:|contactEmail:|privateNote|contactName:/);
  assert.match(store,/publicPhone: row\.public_phone \?\? ""/);
  assert.match(store,/publicEmail: row\.public_email \?\? ""/);
  assert.match(store,/selectWithOptionalShortDescription/);
  assert.match(store,/PUBLIC_CONTACT_COLUMNS/);
  assert.match(store,/publicPhone: input\.publicPhone \?\? existing\.publicPhone/);
  assert.match(store,/publicEmail: input\.publicEmail \?\? existing\.publicEmail/);
  assert.match(store,/Verejné kontakty možno uložiť až po migrácii 0165/);
});

test("Admin editor uses the existing contact section for approved public contacts", () => {
  const editor = read("components/admin-lost-found-editor.tsx");
  assert.equal((editor.match(/id="lost-found-contacts"/g)??[]).length,1);
  for(const field of ["publicPhone","publicEmail","publicWebsiteUrl","publicFacebookUrl","publicInstagramUrl"]){
    assert.match(editor,new RegExp("state\\."+field));
    assert.ok(editor.includes('set("' + field + '"'),field);
  }
  assert.match(editor,/Verejný telefón/);
  assert.match(editor,/Súkromné kontakty vyššie zostávajú šifrované/);
  assert.match(editor,/publicPhone:state\.publicPhone/);
  assert.match(editor,/publicEmail:state\.publicEmail/);
});

test("public detail reuses service/organization contacts and buttons, never private PII", () => {
  const detail = read("components/lost-found-dog-detail.tsx");
  const primitives = read("components/detail-primitives/detail-primitives.tsx");
  assert.match(primitives,/export function DetailContactsCard/);
  assert.match(detail,/<DetailContactsCard title="Adresa a kontakt"/);
  assert.match(detail,/<DetailFactsCard/);
  assert.match(detail,/<DetailSection/);
  assert.match(detail,/<PublicHelpProfileDetailLayout/);
  assert.match(detail,/<PublicActionLink href=\{publicPhoneHref\}>Zavolať/);
  assert.match(detail,/<PublicActionLink href=\{publicEmailHref\}/);
  assert.match(detail,/report\.publicWebsiteUrl/);
  assert.match(detail,/report\.publicFacebookUrl/);
  assert.match(detail,/report\.publicInstagramUrl/);
  assert.match(detail,/report\.sourceUrl/);
  assert.doesNotMatch(detail,/report\.contactPhone|report\.contactEmail|report\.contactName/);
  assert.match(detail,/Telefón a e-mail oznamovateľa nie sú automaticky publikované/);
});
