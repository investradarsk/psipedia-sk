import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contactRelaySubject } from "../lib/contact-relay-subject.ts";

test("lost and found relay links preserve the report ID in email subject", () => {
  assert.equal(contactRelaySubject("Hlásenie 25: STRATENÝ PES"), "Hlásenie 25: STRATENÝ PES – Psipedia.sk");
  assert.equal(contactRelaySubject(["Hlásenie 144: NÁJDENÝ PES"]), "Hlásenie 144: NÁJDENÝ PES – Psipedia.sk");
});

test("arbitrary query text cannot alter the generic mailto subject", () => {
  for (const value of [undefined, "", "Všeobecná otázka", "Hlásenie abc: STRATENÝ PES", "Hlásenie 2: INÉ", "Hlásenie 2: NÁJDENÝ PES\r\nBcc:"]) {
    assert.equal(contactRelaySubject(value), null);
  }
});

test("report contact action passes a subject context and contact page uses it in both generic email links", () => {
  const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
  assert.match(read("components/lost-found-dog-detail.tsx"), /\/kontakt\?tema=\$\{encodeURIComponent/);
  const contact = read("app/kontakt/page.tsx");
  assert.match(contact, /contactRelaySubject\(\(await searchParams\)\.tema\)/);
  assert.equal((contact.match(/href=\{generalEmailHref\}/g) ?? []).length, 2);
});
