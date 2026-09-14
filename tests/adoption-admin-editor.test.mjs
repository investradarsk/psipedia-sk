import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canTransitionAdoptionStatus } from "../lib/adoption.ts";
import { createAdoptionFromAdmin } from "../lib/adoption-admin-write.ts";
import { prepareAdoptionWritePayload, resolveBreed } from "../lib/adoption-store.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const draftRow = {
  id: 1, name: "Ben", slug: "ben", status: "DRAFT", sex: "UNKNOWN", birth_date: null, approximate_age_months: null,
  size: "UNKNOWN", weight: null, breed_id: null, breed_name: "", breed_slug: null, breed_profile_name: null, breed_mix: 0,
  color: "", region: "", district: "", city: "", organization_id: null, organization_name: "", organization_slug: null,
  main_image: null, gallery_json: "[]", short_description: "", description: "", temperament: "", activity_level: "UNKNOWN",
  suitable_for_children: "UNKNOWN", suitable_for_dogs: "UNKNOWN", suitable_for_cats: "UNKNOWN", suitable_for_other_animals: "UNKNOWN",
  apartment_suitable: null, beginner_suitable: null, needs_experienced_owner: 0, vaccination_status: "UNKNOWN", chipped: null,
  neutered: null, health_notes: "", special_needs: "", adoption_requirements: "", external_source_url: null, contact_email: null,
  contact_phone: null, contact_url: null, search_text: "ben", published_at: null, last_verified_at: null,
  created_at: "2026-09-14T12:00:00.000Z", updated_at: "2026-09-14T12:00:00.000Z", created_by: "editor@psipedia.sk", updated_by: "editor@psipedia.sk",
};
function breedDb(valid = true) {
  return {
    prepare(query) {
      let bindings = [];
      return {
        bind(...values) { bindings = values; return this; },
        async first() {
          if (/managed_breeds/.test(query) && valid && bindings[0] === 42) return { id: 42, name: "Labradorský retriever", slug: "labradorsky-retriever" };
          if (/^INSERT INTO adoption_dogs/.test(query)) return { id: 1 };
          if (/FROM adoption_dogs d/.test(query) && /WHERE d\.id = \?/.test(query) && bindings[0] === 1) return draftRow;
          return null;
        },
        async all() { return { results: [] }; },
        async run() { return { meta: { changes: 1 } }; },
      };
    },
  };
}
const publicPayload=(overrides={})=>({name:"Ben",slug:"ben",status:"ACTIVE",sex:"MALE",approximateAgeMonths:30,size:"LARGE",breedId:42,region:"Nitriansky kraj",city:"Nitra",organizationName:"OZ Test",mainImage:"/images/ben.webp",shortDescription:"Priateľský pes hľadá bezpečný a zodpovedný nový domov.",description:"Ben je priateľský a aktívny pes, ktorý hľadá zodpovedný nový domov. Profil obsahuje dostatok overených informácií pre bezpečné publikovanie.",lastVerifiedAt:"2026-09-14",...overrides});

test("new admin adoption defaults to DRAFT when status is omitted", async()=>{const created=await createAdoptionFromAdmin({name:"Ben",slug:"ben"},"editor@psipedia.sk",breedDb());assert.equal(created.status,"DRAFT")});
test("server-domain validation rejects missing required profile fields",async()=>{await assert.rejects(()=>prepareAdoptionWritePayload(breedDb(),{name:"",slug:""},"editor@psipedia.sk"),/Doplň meno psa|adresa profilu/)});
test("resolveBreed rejects an invalid managed breed id",async()=>{await assert.rejects(()=>resolveBreed(breedDb(false),42),/managed_breeds/)});
test("lifecycle keeps supported transitions and rejects unsupported ones",()=>{assert.equal(canTransitionAdoptionStatus("ADOPTED","ACTIVE"),true);assert.equal(canTransitionAdoptionStatus("ARCHIVED","DRAFT"),true);assert.equal(canTransitionAdoptionStatus("ARCHIVED","ACTIVE"),false)});
test("write preparation derives search_text, published_at and last_verified_at",async()=>{const now=new Date("2026-09-14T12:00:00Z");const prepared=await prepareAdoptionWritePayload(breedDb(),publicPayload(),"editor@psipedia.sk",null,now);assert.match(prepared.searchText,/ben/);assert.match(prepared.searchText,/labradorsky retriever/);assert.equal(prepared.publishedAt,now.toISOString());assert.match(prepared.lastVerifiedAt,/^2026-09-14T/)});
test("admin API authenticates and rejects malformed payloads server-side",()=>{const create=read("../app/api/admin/adoptions/route.ts");const update=read("../app/api/admin/adoptions/[id]/route.ts");for(const source of [create,update]){assert.match(source,/getAdminApiUser/);assert.match(source,/unauthorizedAdminResponse/);assert.match(source,/isRecord/);assert.match(source,/status: 400/)}assert.match(update,/expectedUpdatedAt/)});
test("optimistic update is scoped to one id and original updated_at",()=>{const source=read("../lib/adoption-admin-write.ts");assert.match(source,/WHERE id = \? AND updated_at = \?/);assert.match(source,/existing\.updatedAt !== expectedUpdatedAt/);assert.match(source,/changes !== 1/);assert.match(source,/AdoptionConcurrentEditError/)});
test("editor exposes only model-backed fields and safe lifecycle defaults",()=>{const source=read("../components/admin-adoption-editor.tsx");assert.match(source,/item\?\.status \?\? "DRAFT"/);assert.match(source,/\["DRAFT", "ACTIVE", "RESERVED"\]/);for(const field of ["birthDate","approximateAgeMonths","breedId","organizationName","lastVerifiedAt","gallery","healthNotes","adoptionRequirements"])assert.match(source,new RegExp(field));assert.doesNotMatch(source,/hard delete|DELETE/i)});
test("list gains only create and edit links without changing dashboard query logic",()=>{const page=read("../app/admin/adopcie/page.tsx");const dashboard=read("../components/admin-adoption-dashboard.tsx");assert.match(page,/\/admin\/adopcie\/novy/);assert.match(dashboard,/\/admin\/adopcie\/\$\{item\.id\}/);assert.doesNotMatch(page,/publish|archive|bulk/i)});