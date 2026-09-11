#!/usr/bin/env node

const EXPECTED_PUBLISHED = 343;
const DRAFT_SLUG = 'anglicky-kokerspaniel';

function argument(name, fallback = '') {
  const flag = `--${name}`;
  const direct = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (direct) return direct.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function fail(message) {
  throw new Error(`[breed-profile-ci-audit] ${message}`);
}

const rawBase = argument('base', process.env.E2E_BASE_URL || 'http://localhost:5173');
const base = rawBase.replace(/\/$/, '');
const target = new URL(base);
if (target.protocol !== 'http:' || target.hostname !== 'localhost' || target.port !== '5173') {
  fail(`Refusing non-local audit target ${target.origin}.`);
}

const response = await fetch(`${base}/sitemap.xml`, { redirect: 'manual' });
if (!response.ok) fail(`sitemap.xml returned HTTP ${response.status}.`);
const xml = await response.text();
const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].trim());
const routes = [...new Set(locations.map((value) => {
  try { return new URL(value, base).pathname.replace(/\/$/, '') || '/'; }
  catch { return ''; }
}).filter((pathname) => /^\/plemena\/[^/]+$/.test(pathname)))].sort();

if (routes.length !== EXPECTED_PUBLISHED) {
  fail(`sitemap exposes ${routes.length} published breed URLs; expected exactly ${EXPECTED_PUBLISHED}.`);
}
if (routes.includes(`/plemena/${DRAFT_SLUG}`)) {
  fail(`Draft FCI 5 route /plemena/${DRAFT_SLUG} is present in the published sitemap.`);
}

console.log(`[breed-profile-ci-audit] Breed set PASS: ${routes.length}/${EXPECTED_PUBLISHED} published URLs loaded; FCI 5 ${DRAFT_SLUG} excluded.`);
await import('./audit-breed-profiles.mjs');
