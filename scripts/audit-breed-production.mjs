import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const sourcePath = process.argv[2];
const baseUrl = (process.argv[3] || "https://psipedia.sk").replace(/\/$/, "");
const auditDetails = process.argv.includes("--details");
if (!sourcePath) throw new Error("Usage: node scripts/audit-breed-production.mjs SOURCE_READY.json [BASE_URL]");

const payload = JSON.parse(await readFile(sourcePath, "utf8"));
const source = Array.isArray(payload) ? payload : payload.breeds;
if (!Array.isArray(source)) throw new Error("Source JSON must contain breeds[].");

function decode(value = "") {
  return value
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function curl(path) {
  const { stdout } = await execFileAsync("curl", ["-sS", "-L", "--max-time", "60", "-w", "\n__PSIPEDIA_STATUS__%{http_code}", `${baseUrl}${path}`], { maxBuffer: 4_000_000 });
  const statusMatch=stdout.match(/\n__PSIPEDIA_STATUS__(\d{3})$/);
  return { html: statusMatch ? stdout.slice(0,statusMatch.index) : stdout, status: Number(statusMatch?.[1]) || 0 };
}

function mainHtml(html) {
  return html.match(/<main id="obsah">([\s\S]*?)<\/main>/)?.[1] || "";
}

function fact(card, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decode(card.match(new RegExp(`<dt>${escaped}<\\/dt><dd>([\\s\\S]*?)<\\/dd>`))?.[1] || "");
}

function classification(card) {
  return decode(card.match(/<span class="breed-card-classification">([\s\S]*?)<\/span>/)?.[1] || "");
}

function parseGroupPage(html) {
  const main = mainHtml(html);
  return [...main.matchAll(/<article class="breed-card[^\"]*">([\s\S]*?)<\/article>/g)].map((match) => {
    const card = match[0];
    const slug = card.match(/href="\/plemena\/([a-z0-9-]+)"/)?.[1] || "";
    return {
      slug,
      name: decode(card.match(/<h3><a[^>]*>([\s\S]*?)<\/a><\/h3>/)?.[1] || ""),
      classification: classification(card),
      origin: fact(card, "Pôvod"),
      height: fact(card, "Výška"),
      weight: fact(card, "Hmotnosť"),
      intro: decode(card.match(/<\/dl><p>([\s\S]*?)<\/p>/)?.[1] || ""),
    };
  }).filter((item) => item.slug);
}

function numbers(value) {
  return [...String(value || "").matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => Number(match[0].replace(",", "."))).filter(Number.isFinite);
}

const limits = {
  height: { min: 8, max: 130, unit: "cm" },
  weight: { min: 0.5, max: 150, unit: "kg" },
  lifespan: { min: 3, max: 30, unit: "rok" },
};

function numericIssues(value, kind, { requireUnit = true } = {}) {
  const text = String(value || "").trim();
  if (!text) return [];
  const found = numbers(text);
  const rule = limits[kind];
  const issues = [];
  if (!found.length) issues.push("bez číselnej hodnoty");
  if (found.some((item) => item < rule.min || item > rule.max)) issues.push("mimo realistického rozsahu");
  if (found.length >= 2 && /\d\s*[–—-]\s*\d/.test(text) && found[0] > found[1]) issues.push("minimum je vyššie než maximum");
  if (/\d{4,}/.test(text.replace(/\d{4}\s*(?:rok|year)/gi, ""))) issues.push("pravdepodobne zlepené čísla");
  if (found.length >= 3 && found.every((item) => item === found[0])) issues.push("rovnaké číslo je opakované viackrát");
  if (requireUnit && !text.toLocaleLowerCase("sk").includes(rule.unit)) issues.push("chýba jednotka");
  return [...new Set(issues)];
}

function combined(values, unit) {
  const found = values.flatMap(numbers);
  if (!found.length) return "";
  const min = Math.min(...found); const max = Math.max(...found);
  const fmt = (value) => String(value).replace(".", ",");
  return `${fmt(min)}${min === max ? "" : `–${fmt(max)}`} ${unit}`;
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try { results[index] = await callback(items[index], index); }
      catch (error) { results[index] = { error: error instanceof Error ? error.message : String(error) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const groupResponses = await mapLimit(Array.from({ length: 10 }, (_, index) => index + 1), 5, async (group) => {
  const response = await curl(`/plemena?fciGroup=${group}&audit=data`);
  return { group, status: response.status, cards: parseGroupPage(response.html) };
});
let cards = groupResponses.flatMap((result) => result.cards || []);
const initiallyPresent=new Set(cards.map((card)=>card.slug));
const missingCardResponses=await mapLimit(source.filter((breed)=>!initiallyPresent.has(breed.slug)),4,async (breed)=>{
  const response=await curl(`/plemena?q=${encodeURIComponent(breed.nazov_sk)}&audit=data`);
  return parseGroupPage(response.html).find((card)=>card.slug===breed.slug)??null;
});
cards=[...cards,...missingCardResponses.filter(Boolean)];
const cardBySlug = new Map(cards.map((card) => [card.slug, card]));

const detailResults = auditDetails ? await mapLimit(source, 4, async (breed) => {
  const response = await curl(`/plemena/${breed.slug}?audit=data`);
  const main = mainHtml(response.html);
  const lifespan = fact(main.match(/<dl class="breed-hero-facts">([\s\S]*?)<\/dl>/)?.[0] || "", "Dĺžka života");
  const expectedSection = breed.fci_sekcia_nazov || "";
  return {
    slug: breed.slug,
    status: response.status,
    lifespan,
    fciNumber: Number(decode(main.match(/<span>FCI č\. ([\s\S]*?)<\/span>/)?.[1] || "")) || null,
    hasUndefined: /\b(?:undefined|null)\b/i.test(decode(main)),
    hasExpectedIntro: !breed.redakcny_profil?.uvod || decode(main).includes(String(breed.redakcny_profil.uvod).slice(0, 80)),
    hasRawEnglishSection: /Sheepdogs|Cattledogs \(except Swiss Cattledogs\)/.test(decode(main)),
    expectedSection,
  };
}) : source.map((breed)=>({slug:breed.slug,status:null,lifespan:breed.redakcny_profil?.dlzka_zivota||"",fciNumber:Number(breed.fci_cislo)||null,hasUndefined:false,hasExpectedIntro:true,hasRawEnglishSection:false,expectedSection:breed.fci_sekcia_nazov||"",sourceBacked:true}));
const detailBySlug = new Map(detailResults.filter((item) => item?.slug).map((item) => [item.slug, item]));

const sourceIdentity = {
  fciNumbers: source.map((item) => item.fci_cislo),
  importKeys: source.map((item) => item.import_key),
  slugs: source.map((item) => item.slug),
};
function duplicates(values) {
  const seen = new Set(); const duplicate = new Set();
  for (const value of values) (seen.has(value) ? duplicate : seen).add(value);
  return [...duplicate];
}

const sourceNumericIssues = [];
const productionNumericIssues = [];
const repairs = [];
const missing = {
  height: 0, weight: 0, lifespan: 0, origin: 0, fciSection: 0, fciNumber: 0, intro: 0,
  character: 0, history: 0, exercise: 0, training: 0, health: 0,
};
const sourceMissing = {height:0,weight:0,lifespan:0,origin:0,fciSection:0,fciNumber:0,intro:0};
const sourceSectionEnglish = [];
const sourceSectionPairs = new Set();
for (const breed of source) {
  const card = cardBySlug.get(breed.slug);
  const detail = detailBySlug.get(breed.slug);
  for (const [field, kind] of [["vyska_pes_cm", "height"], ["vyska_suka_cm", "height"], ["hmotnost_pes_kg", "weight"], ["hmotnost_suka_kg", "weight"]]) {
    const issues = numericIssues(breed[field], kind, { requireUnit: false });
    if (issues.length) sourceNumericIssues.push({ slug: breed.slug, field, value: breed[field] || "", issues });
  }
  const lifespan = breed.redakcny_profil?.dlzka_zivota || detail?.lifespan || "";
  const lifespanIssues = numericIssues(lifespan, "lifespan");
  if (lifespanIssues.length) productionNumericIssues.push({ slug: breed.slug, field: "lifespan", value: lifespan, issues: lifespanIssues });
  for (const kind of ["height", "weight"]) {
    const value = card?.[kind] || "";
    const issues = numericIssues(value, kind);
    if (issues.length) {
      productionNumericIssues.push({ slug: breed.slug, field: kind, value, issues });
      const sourceValues = kind === "height" ? [breed.vyska_pes_cm, breed.vyska_suka_cm] : [breed.hmotnost_pes_kg, breed.hmotnost_suka_kg];
      const replacement = combined(sourceValues, kind === "height" ? "cm" : "kg");
      if (replacement) repairs.push({ fciNumber: breed.fci_cislo, slug: breed.slug, name: breed.nazov_sk, field: kind, from: value, to: replacement, source: "FCI standard stored in READY JSON" });
    }
  }
  if (!card?.height) missing.height++;
  if (!card?.weight) missing.weight++;
  if (!breed.redakcny_profil?.dlzka_zivota) missing.lifespan++;
  if (!card?.origin) missing.origin++;
  if ((breed.fci_skupina!==4&&!breed.fci_sekcia) || !card?.classification.replace(/^FCI\s+\d+\s*·?\s*/, "")) missing.fciSection++;
  if (!breed.fci_cislo) missing.fciNumber++;
  if (!card?.intro) missing.intro++;
  if(!breed.vyska_pes_cm&&!breed.vyska_suka_cm)sourceMissing.height++;
  if(!breed.hmotnost_pes_kg&&!breed.hmotnost_suka_kg)sourceMissing.weight++;
  if(!breed.redakcny_profil?.dlzka_zivota)sourceMissing.lifespan++;
  if(!breed.krajina_povodu)sourceMissing.origin++;
  if(breed.fci_skupina!==4&&!breed.fci_sekcia)sourceMissing.fciSection++;
  if(!breed.fci_cislo)sourceMissing.fciNumber++;
  if(!breed.redakcny_profil?.uvod)sourceMissing.intro++;
  for (const [sourceField, target] of [["povaha", "character"], ["historia", "history"], ["pohyb_a_denne_potreby", "exercise"], ["vycvik_a_vychova", "training"], ["zdravie_a_starostlivost", "health"]]) if (!breed.redakcny_profil?.[sourceField]) missing[target]++;
  if (/Sheepdogs|Cattledogs/i.test(breed.fci_sekcia_nazov || "")) sourceSectionEnglish.push({ fciNumber: breed.fci_cislo, slug: breed.slug, value: breed.fci_sekcia_nazov });
  sourceSectionPairs.add(`${breed.fci_skupina}:${breed.fci_sekcia}`);
}

const legacy = await mapLimit([
  ["/plemena/anglicky-koker-spaniel", "/plemena/anglicky-kokerspaniel"],
  ["/plemena/beagle", "/plemena/bigl"],
  ["/plemena/madarska-vyzla", "/plemena/madarsky-kratkosrsty-stavac-vyzla"],
], 3, async ([from, expected]) => {
  const { stdout } = await execFileAsync("curl", ["-sS", "-o", "/dev/null", "--max-time", "30", "-w", "%{http_code}\t%{redirect_url}", `${baseUrl}${from}`]);
  const [status, location] = stdout.trim().split("\t");
  return { from, expected, status: Number(status), location, correct: Number(status) === 301 && new URL(location).pathname === expected };
});

const productionSlugs = cards.map((item) => item.slug);
const report = {
  auditedAt: new Date().toISOString(),
  sourcePath,
  baseUrl,
  totals: {
    sourceBreeds: source.length,
    productionCards: cards.length,
    uniqueProductionSlugs: new Set(productionSlugs).size,
    detail200: auditDetails?detailResults.filter((item) => item?.status === 200).length:null,
    completelyClean: source.filter((breed) => {
      const slug = breed.slug;
      return !sourceNumericIssues.some((issue) => issue.slug === slug) && !productionNumericIssues.some((issue) => issue.slug === slug) && cardBySlug.has(slug) && detailBySlug.get(slug)?.status === 200;
    }).length,
  },
  identity: {
    duplicateSourceFciNumbers: duplicates(sourceIdentity.fciNumbers),
    duplicateSourceImportKeys: duplicates(sourceIdentity.importKeys),
    duplicateSourceSlugs: duplicates(sourceIdentity.slugs),
    duplicateProductionSlugs: duplicates(productionSlugs),
    missingProductionSlugs: sourceIdentity.slugs.filter((slug) => !cardBySlug.has(slug)),
    unexpectedProductionSlugs: productionSlugs.filter((slug) => !sourceIdentity.slugs.includes(slug)),
  },
  missing,
  sourceMissing,
  sourceNumericIssues,
  productionNumericIssues,
  unambiguousRepairs: repairs,
  fci: {
    sourceEnglishSectionLabels: sourceSectionEnglish,
    uniqueGroupSectionPairs: [...sourceSectionPairs].sort(),
    detailPagesWithRawEnglishSection: detailResults.filter((item) => item?.hasRawEnglishSection).map((item) => item.slug),
    fciNumberMismatches: auditDetails?source.filter((breed) => detailBySlug.get(breed.slug)?.fciNumber !== Number(breed.fci_cislo)).map((breed) => ({ slug: breed.slug, expected: breed.fci_cislo, actual: detailBySlug.get(breed.slug)?.fciNumber ?? null })):[],
  },
  frontend: {
    pagesWithUndefinedOrNull: detailResults.filter((item) => item?.hasUndefined).map((item) => item.slug),
    pagesMissingExpectedIntro: detailResults.filter((item) => item && !item.hasExpectedIntro).map((item) => item.slug),
    non200: auditDetails?detailResults.filter((item) => item?.status !== 200).map((item) => ({ slug: item?.slug || "", status: item?.status || 0, error: item?.error || "" })):[],
  },
  legacy,
};

console.log(JSON.stringify(report, null, 2));
