import test from "node:test";
import assert from "node:assert/strict";
import { assertShelterUnique, buildShelterDraft } from "../scripts/gemini-notion-shelter-fields.mjs";
const rich = value => ({type:"rich_text",rich_text:[{plain_text:value}]});
const row = (fields={}) => ({properties:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,rich(v)]))});
const schema = Object.fromEntries(["Typ","Právny názov","IČO / registračné číslo","Psipedia ID","Mesto","Kraj","Popis","Krátky popis"].map(x=>[x,{type:"rich_text"}]));
Object.assign(schema,{"Názov":{type:"title"},"Stav":{type:"select",select:{options:[{name:"Nápad"}]}},"Web":{type:"url"},"Zdroj dát":{type:"url"},"Facebook":{type:"url"},"Instagram":{type:"url"}});
const args = () => ({name:"Nádej", summary:"Útulok zabezpečuje pomoc zvieratám.", description:"Organizácia pomáha opusteným psom a zabezpečuje ich odbornú starostlivosť.",source_url:"https://example.org/about",evidence:[{source_url:"https://example.org/about",fields:["name","summary","description"]}]});
const build = (a,rows=[])=>buildShelterDraft({args:a,properties:schema,rows,scanComplete:true,groundedSources:["https://example.org/about"]});
test("canonical draft remains SHELTER and Nápad",()=>{const p=build(args());assert.equal(p.Typ.rich_text[0].text.content,"SHELTER");assert.equal(p.Stav.select.name,"Nápad");});
test("same exact source page catches different organization names",()=>assert.throws(()=>assertShelterUnique([row({"Názov":"Other","Zdroj dát":"https://example.org/about"})],args(),true),/DUPLICATE/));
test("shared aggregator domain by itself does not collapse distinct organizations",()=>assert.doesNotThrow(()=>assertShelterUnique([row({"Názov":"Iný útulok","Zdroj dát":"https://portal.example/dog/2"})],{...args(),source_url:"https://portal.example/dog/1"},true)));
test("variant names and cross-type organizations cannot create second profile",()=>{
 const other=row({"Názov":"Občianske združenie Nádej","Typ":"CIVIC_ASSOCIATION"});
 assert.throws(()=>assertShelterUnique([other],args(),true),/DUPLICATE/);
});
test("registered identity mismatch ambiguity is blocked",()=>assert.throws(()=>assertShelterUnique([row({"Názov":"Other","IČO / registračné číslo":"12345678"})],{...args(),registration_number:"12345678"},true),/DUPLICATE/));
test("incomplete scan fails closed",()=>assert.throws(()=>assertShelterUnique([],args(),false),/SCAN_INCOMPLETE/));
for(const [label,change] of [
 ["email in summary",a=>a.summary+=" Kontakt office@example.com"],
 ["telephone in description",a=>a.description+=" Volajte +421 905 123 456"],
 ["implicit street address",a=>a.description+=" Nájdete nás na Hlavná 42, 949 01."],
 ["street with postal code",a=>a.description+=" Adresa: Hlavná 42, 949 01."],
 ["latitude and longitude",a=>a.description+=" GPS: 48.123456, 18.123456"],
 ["coordinates in source URL",a=>{a.source_url="https://example.org/about?lat=48.1234&lng=18.2345";a.evidence[0].source_url=a.source_url;}],
 ["address in source URL",a=>{a.source_url="https://example.org/address/Hlavna-42";a.evidence[0].source_url=a.source_url;}],
 ["private phone in source URL",a=>{a.source_url="https://example.org/about?phone=0905123456";a.evidence[0].source_url=a.source_url;}],
 ["precise visitor address field",a=>a.address="Hlavná 42"],
]) test("privacy rejects "+label,()=>{const a=args();change(a);assert.throws(()=>build(a));});

for (const payload of [
  "email private@example.com",
  "Hlavná 42",
  "GPS: 48.123456, 18.123456",
  "949 01 Hlavná 42",
  "phone +421 905 123 456",
]) {
  test("evidence fields cannot inject private information: " + payload, () => {
    const a=args();
    a.evidence[0].fields.push(payload);
    assert.throws(()=>build(a), /EVIDENCE_FIELD_INVALID/);
  });
}
test("evidence fields cannot contain non-string values or extra keys",()=>{
  const a=args();a.evidence[0].fields.push({description:"Hlavná 42"});
  assert.throws(()=>build(a),/EVIDENCE_FIELD_INVALID/);
});
test("verified website with embedded private coordinates is rejected",()=>{
  const a=args();a.website_url="https://example.org/about?latitude=48.123456";
  a.evidence[0].fields.push("website_url");
  assert.throws(()=>build(a),/WEBSITE_UNSAFE/);
});
