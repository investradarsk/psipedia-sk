#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';

const REQUIRED_FLAG = 'PSIPEDIA_E2E_LOCAL_BOOTSTRAP';
const DEFAULT_BASE_URL = 'http://localhost:5173';
const EXPECTED_SOURCE_SHA256 = 'bce5188a91e39627997140006fa922ff627348c013f5c97a600525c4da72488b';
const EXPECTED_PROJECTION_SHA256 = '9389a248568f39189ac7e5228807805efe5839a9eb127845c23cc281713e8d4a';
const EXPECTED_IDENTITIES = 344;
const EXPECTED_PUBLISHED = 343;
const DRAFT_FCI = 5;
const DRAFT_SLUG = 'anglicky-kokerspaniel';
const WHITE_SWISS_FCI = 347;
const WHITE_SWISS_SLUG = 'biely-svajciarsky-ovciak';
const LOCAL_IMAGE_PATH = '/images/e2e-biely-svajciarsky-ovciak.png';
const REQUIRED_FULL_SLUGS = [
  WHITE_SWISS_SLUG,
  'burgosky-stavac',
  'jazvecik',
  'anglicky-mastif',
  'dansko-svedsky-farmarsky-pes',
].sort();
const FIXTURE_PARTS = Array.from({ length: 3 }, (_, index) =>
  `tests/fixtures/breeds-ci-source.lean.br.b64.part${String(index + 1).padStart(2, '0')}`,
);
const AUDIT_PATH = 'docs/audits/breeds-2026-09-07.csv';
const PAYLOAD_PATH = '.e2e-artifacts/breed-import.json';
const META_PATH = '.e2e-artifacts/breed-seed-meta.json';

function fail(message) {
  throw new Error(`[breed-e2e-bootstrap] ${message}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requireLocalEnvironment() {
  if (process.env[REQUIRED_FLAG] !== '1') fail(`Refusing to run without ${REQUIRED_FLAG}=1.`);
  const url = new URL(process.env.E2E_BASE_URL || DEFAULT_BASE_URL);
  if (url.protocol !== 'http:' || url.hostname !== 'localhost' || url.port !== '5173') {
    fail(`Refusing non-local target ${url.origin}; expected http://localhost:5173.`);
  }
  return url.origin;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (quoted) fail(`${AUDIT_PATH} contains an unterminated quoted field.`);
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    if (row.some((value) => value !== '')) rows.push(row);
  }
  if (!rows.length) fail(`${AUDIT_PATH} is empty.`);
  const header = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values, rowIndex) =>
    Object.fromEntries(header.map((key, index) => [key, values[index]?.trim() ?? ''])),
  ).filter((record) => record.FCI || record.slug || record.nazov).map((record, index) => ({ ...record, __row: index + 2 }));
}

async function loadProjection() {
  const parts = await Promise.all(FIXTURE_PARTS.map((path) => readFile(path, 'utf8')));
  const compressed = Buffer.from(parts.join('').replace(/\s+/g, ''), 'base64');
  const jsonBuffer = brotliDecompressSync(compressed);
  const projectionSha = sha256(jsonBuffer);
  if (projectionSha !== EXPECTED_PROJECTION_SHA256) {
    fail(`Projected fixture SHA-256 ${projectionSha} != ${EXPECTED_PROJECTION_SHA256}.`);
  }
  const fixture = JSON.parse(jsonBuffer.toString('utf8'));
  if (fixture.source_file !== 'psipedia_plemena_MASTER_V2_344_READY.json') {
    fail(`Unexpected source file ${JSON.stringify(fixture.source_file)}.`);
  }
  if (fixture.source_sha256 !== EXPECTED_SOURCE_SHA256) {
    fail(`Fixture source SHA-256 ${fixture.source_sha256} != ${EXPECTED_SOURCE_SHA256}.`);
  }
  if (!Array.isArray(fixture.breeds) || fixture.breeds.length !== EXPECTED_IDENTITIES) {
    fail(`Projected fixture has ${fixture.breeds?.length ?? 0} identities; expected ${EXPECTED_IDENTITIES}.`);
  }
  const fullSlugs = [...(fixture.full_record_slugs || [])].sort();
  if (JSON.stringify(fullSlugs) !== JSON.stringify(REQUIRED_FULL_SLUGS)) {
    fail(`Full-record breeds ${JSON.stringify(fullSlugs)} != ${JSON.stringify(REQUIRED_FULL_SLUGS)}.`);
  }
  for (const slug of REQUIRED_FULL_SLUGS) {
    const breed = fixture.breeds.find((item) => item.slug === slug);
    if (!breed?.redakcny_profil || Object.keys(breed).length < 30) {
      fail(`${slug} is not preserved as a full real master record.`);
    }
  }
  return fixture;
}

async function loadPublishedAudit() {
  const records = parseCsv(await readFile(AUDIT_PATH, 'utf8'));
  if (records.length !== EXPECTED_PUBLISHED) {
    fail(`${AUDIT_PATH} has ${records.length} canonical rows; expected ${EXPECTED_PUBLISHED}.`);
  }
  const byFci = new Map();
  const slugs = new Set();
  for (const row of records) {
    const fci = Number(row.FCI);
    if (!Number.isSafeInteger(fci) || fci <= 0) fail(`Invalid FCI at audit row ${row.__row}: ${row.FCI}.`);
    if (!row.slug) fail(`Missing slug at audit row ${row.__row}.`);
    if (byFci.has(fci)) fail(`Duplicate audit FCI ${fci}.`);
    if (slugs.has(row.slug)) fail(`Duplicate audit slug ${row.slug}.`);
    byFci.set(fci, row);
    slugs.add(row.slug);
  }
  if (byFci.has(DRAFT_FCI) || slugs.has(DRAFT_SLUG)) {
    fail(`Draft FCI ${DRAFT_FCI} / ${DRAFT_SLUG} unexpectedly appears in the published audit.`);
  }
  return { records, byFci };
}

async function fetchWhiteSwissImage(auditByFci) {
  const row = auditByFci.get(WHITE_SWISS_FCI);
  if (!row || row.slug !== WHITE_SWISS_SLUG || !row.image_url) {
    fail('White Swiss audit row does not contain the expected published image URL.');
  }
  const sourceUrl = new URL(row.image_url, 'https://psipedia.sk');
  if (sourceUrl.origin !== 'https://psipedia.sk' || !sourceUrl.pathname.startsWith('/media/')) {
    fail(`White Swiss image is not an owned Psipedia media URL: ${sourceUrl}.`);
  }
  const response = await fetch(sourceUrl);
  if (!response.ok) fail(`Read-only White Swiss image fetch returned HTTP ${response.status}.`);
  const contentType = response.headers.get('content-type') || '';
  if (!/^image\//i.test(contentType)) fail(`White Swiss image returned ${contentType || 'no content-type'}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) fail('White Swiss image download is empty.');
  await mkdir('public/images', { recursive: true });
  await mkdir('dist/client/images', { recursive: true });
  await writeFile(`public${LOCAL_IMAGE_PATH}`, bytes);
  await writeFile(`dist/client${LOCAL_IMAGE_PATH}`, bytes);
  return { sourceUrl: sourceUrl.toString(), contentType, bytes: bytes.length, sha256: sha256(bytes) };
}

async function prepare() {
  requireLocalEnvironment();
  const fixture = await loadProjection();
  const audit = await loadPublishedAudit();
  const identities = new Map();
  for (const breed of fixture.breeds) {
    const fci = Number(breed.fci_cislo);
    if (!Number.isSafeInteger(fci) || fci <= 0 || !breed.slug) fail(`Invalid projected identity ${JSON.stringify(breed.slug)} / ${breed.fci_cislo}.`);
    const key = `${fci}:${breed.slug}`;
    if (identities.has(key)) fail(`Duplicate projected identity ${key}.`);
    identities.set(key, breed);
    const auditRow = audit.byFci.get(fci);
    breed.status = auditRow && auditRow.slug === breed.slug ? 'published' : 'draft';
  }
  const published = fixture.breeds.filter((breed) => breed.status === 'published');
  const draft = fixture.breeds.filter((breed) => breed.status !== 'published');
  if (published.length !== EXPECTED_PUBLISHED) fail(`Prepared ${published.length} published breeds; expected ${EXPECTED_PUBLISHED}.`);
  if (draft.length !== 1 || Number(draft[0].fci_cislo) !== DRAFT_FCI || draft[0].slug !== DRAFT_SLUG) {
    fail(`Unexpected draft projection: ${draft.map((breed) => `${breed.fci_cislo}:${breed.slug}`).join(', ')}.`);
  }
  for (const row of audit.records) {
    const breed = identities.get(`${Number(row.FCI)}:${row.slug}`);
    if (!breed || breed.status !== 'published') fail(`Published audit identity ${row.FCI}:${row.slug} is missing from projected source.`);
  }

  const image = await fetchWhiteSwissImage(audit.byFci);
  const payload = { breeds: fixture.breeds };
  await mkdir('.e2e-artifacts', { recursive: true });
  await writeFile(PAYLOAD_PATH, `${JSON.stringify(payload)}\n`);
  await writeFile(META_PATH, `${JSON.stringify({
    sourceFile: fixture.source_file,
    sourceSha256: fixture.source_sha256,
    projectionSha256: EXPECTED_PROJECTION_SHA256,
    identities: fixture.breeds.length,
    published: published.length,
    draft: { fci: DRAFT_FCI, slug: DRAFT_SLUG },
    fullRecordSlugs: REQUIRED_FULL_SLUGS,
    image,
  }, null, 2)}\n`);
  console.log(`[breed-e2e-bootstrap] Prepare PASS: ${EXPECTED_IDENTITIES} real source identities, ${EXPECTED_PUBLISHED} published canonical, FCI ${DRAFT_FCI} ${DRAFT_SLUG} draft.`);
  console.log(`[breed-e2e-bootstrap] White Swiss image PASS: ${image.sourceUrl} -> ${LOCAL_IMAGE_PATH} (${image.bytes} bytes, ${image.contentType}).`);
}

async function requestJson(baseUrl, pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  });
  const body = await response.text();
  if (!response.ok) fail(`${init.method || 'GET'} ${pathname} returned ${response.status}: ${body.slice(0, 800)}`);
  try { return JSON.parse(body); } catch { fail(`${pathname} did not return JSON.`); }
}

function runLocalD1(sql) {
  const result = spawnSync('npx', [
    'wrangler', 'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json',
    '--persist-to', '.wrangler/state', '--command', sql,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) fail(`Local D1 command failed: ${(result.stderr || result.stdout).slice(0, 1200)}`);
}

async function seed() {
  const baseUrl = requireLocalEnvironment();
  const payload = JSON.parse(await readFile(PAYLOAD_PATH, 'utf8'));
  const result = await requestJson(baseUrl, '/api/admin/import', { method: 'POST', body: JSON.stringify(payload) });
  const imported = result.imported?.breeds ?? result.preview;
  if (!result.success || imported?.total !== EXPECTED_IDENTITIES || imported?.published !== EXPECTED_PUBLISHED || imported?.draft !== 1) {
    fail(`Import result mismatch: ${JSON.stringify(imported).slice(0, 1200)}.`);
  }

  runLocalD1(`UPDATE managed_breeds SET image_url='${LOCAL_IMAGE_PATH}' WHERE fci_number=${WHITE_SWISS_FCI} AND slug='${WHITE_SWISS_SLUG}';`);

  const admin = await requestJson(baseUrl, '/api/admin/breeds');
  const breeds = admin.breeds || [];
  if (breeds.length !== EXPECTED_IDENTITIES) fail(`Local D1 exposes ${breeds.length} breed identities; expected ${EXPECTED_IDENTITIES}.`);
  const published = breeds.filter((breed) => breed.status === 'published');
  if (published.length !== EXPECTED_PUBLISHED) fail(`Local D1 exposes ${published.length} published breeds; expected ${EXPECTED_PUBLISHED}.`);
  const draft = breeds.find((breed) => breed.fciNumber === DRAFT_FCI || breed.slug === DRAFT_SLUG);
  if (!draft || draft.fciNumber !== DRAFT_FCI || draft.slug !== DRAFT_SLUG || draft.status !== 'draft') {
    fail(`FCI ${DRAFT_FCI} draft invariant failed: ${JSON.stringify(draft)}.`);
  }
  for (const slug of REQUIRED_FULL_SLUGS) {
    const breed = breeds.find((item) => item.slug === slug);
    if (!breed || breed.status !== 'published') fail(`${slug} is not published after local CI seed.`);
  }

  const detail = await fetch(`${baseUrl}/plemena/${WHITE_SWISS_SLUG}`);
  const html = await detail.text();
  if (!detail.ok || !html.includes('data-testid="breed-hero-image"') || !html.includes(LOCAL_IMAGE_PATH)) {
    fail(`White Swiss SSR did not expose the local real image fixture (HTTP ${detail.status}).`);
  }
  console.log(`[breed-e2e-bootstrap] Seed PASS: ${breeds.length} identities in local D1, ${published.length} published canonical, FCI ${DRAFT_FCI} ${DRAFT_SLUG} remains draft.`);
  console.log(`[breed-e2e-bootstrap] White Swiss SSR real-image PASS: ${LOCAL_IMAGE_PATH}.`);
}

const command = process.argv[2];
if (command === 'prepare') await prepare();
else if (command === 'seed') await seed();
else fail('Usage: node scripts/bootstrap-breed-e2e.mjs <prepare|seed>.');
