#!/usr/bin/env node

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:5173";
const guard = new URL(baseUrl);
if (process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP !== "1" || guard.protocol !== "http:" || guard.hostname !== "localhost" || guard.port !== "5173") {
  throw new Error("Refusing to seed adoption fixture outside the guarded local E2E server.");
}

const now = new Date().toISOString();
const payload = {
  name: "Testovací Rex",
  slug: "e2e-testovaci-rex",
  status: "ACTIVE",
  sex: "MALE",
  approximateAgeMonths: 30,
  size: "MEDIUM",
  weightKg: 22,
  breedMix: true,
  color: "čierna",
  region: "Nitriansky kraj",
  district: "Nitra",
  city: "Nitra",
  organizationName: "E2E útulok",
  shortDescription: "Pokojný testovací pes pripravený na overenie adopčného katalógu.",
  description: "Tento profil existuje iba v lokálnej CI databáze a nikdy sa neimportuje do produkcie. Slúži na test detailu, filtrov a prístupnosti.",
  temperament: "priateľský",
  activityLevel: "MEDIUM",
  suitableForChildren: "YES",
  suitableForDogs: "YES",
  suitableForCats: "UNKNOWN",
  suitableForOtherAnimals: "UNKNOWN",
  apartmentSuitable: "YES",
  beginnerSuitable: "YES",
  needsExperiencedOwner: "NO",
  vaccinationStatus: "COMPLETE",
  chipped: "YES",
  neutered: "YES",
  healthNotes: "Bez známych obmedzení.",
  adoptionRequirements: "Stabilný a zodpovedný domov.",
  contactName: "E2E kontakt",
  contactEmail: "e2e@example.invalid",
  lastVerifiedAt: now,
};

const response = await fetch(`${baseUrl}/api/admin/adoptions`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify(payload),
});
const body = await response.text();
if (!response.ok) throw new Error(`Local adoption seed failed (${response.status}): ${body.slice(0, 1000)}`);
const result = JSON.parse(body);
if (result.item?.slug !== payload.slug || result.item?.status !== "ACTIVE") throw new Error(`Unexpected seed response: ${body.slice(0, 1000)}`);

const publicResponse = await fetch(`${baseUrl}/pomoc-psom/adopcia`);
const html = await publicResponse.text();
if (!publicResponse.ok || !html.includes("Testovací Rex")) throw new Error(`Seeded profile is not visible in public SSR (HTTP ${publicResponse.status}).`);
console.log("[adoption-e2e] Local API seed PASS and public SSR exposes Testovací Rex.");
