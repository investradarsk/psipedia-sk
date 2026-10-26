import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const engine=read("lib/data-quality-missing-hourly.ts");
const dashboard=read("components/admin-missing-quality-dashboard.tsx");
const api=read("app/api/admin/data-quality/missing/manual/route.ts");
const migration=read("drizzle/0143_quality_missing_manual_attempts.sql");
const workflow=read(".github/workflows/production-d1-migrate.yml");

test("manual Tavily controls are admin-only, paid requests are one per explicit action",()=>{
  assert.match(api,/requireAdminMutation\(request\)/);
  assert.match(api,/validManualQualityRequest\(body\)/);
  assert.match(api,/TAVILY_API_KEY/);
  assert.match(engine,/runManualQualitySearch/);
  assert.match(engine,/searchWithImages\(/);
  assert.match(engine,/maxResults:5/);
  assert.match(dashboard,/manualLimit,setManualLimit\]=useState\(5\)/);
  assert.match(dashboard,/<option value=\{20\}>20<\/option>/);
  assert.match(dashboard,/for\(let i=0;i<manualLimit&&!stopManual.current;i\+\+\)/);
  const manual=engine.slice(engine.indexOf("export async function runManualQualitySearch"),engine.indexOf("export type MissingQualityProposal"));
  assert.doesNotMatch(manual,/UPDATE quality_missing_cursors/);
});
test("manual attempts have durable history and require owner-dispatched 0143",()=>{
  assert.match(migration,/CREATE TABLE quality_missing_manual_attempts/);
  assert.match(migration,/status TEXT NOT NULL CHECK\(status IN \('RUNNING','SUCCESS','FAILED'\)\)/);
  assert.match(engine,/qualityManualSchemaReady\(db\)/);
  assert.match(engine,/INSERT INTO quality_missing_manual_attempts/);
  assert.match(engine,/status='FAILED'/);
  assert.match(engine,/status='SUCCESS'/);
  assert.match(workflow,/0143_quality_missing_manual_attempts.sql/);
  assert.match(workflow,/APPLY-0143-psipedia-sk-db/);
  assert.match(dashboard,/data\.manualHistory\.map/);
});
test("new proposals stay review-only and hourly cursor cannot be moved by manual search",()=>{
  const part=engine.slice(engine.indexOf("export async function runManualQualitySearch"),engine.indexOf("export type MissingQualityProposal"));
  assert.match(part,/insertQualityFinding/);
  assert.doesNotMatch(part,/UPDATE quality_missing_cursors/);
  assert.doesNotMatch(part,/status='ACCEPTED'/);
  assert.match(part,/discoverWithStagedImage/);
  assert.match(dashboard,/Voľné vyhľadávanie \(bez priradenia\)/);
});
test("each finding links to the correct admin editor for all seven canonical kinds",()=>{
  for(const route of ["adresar","podujatia","organizacie","adopcie","pomoc","stratene-najdene"]){
    assert.ok(dashboard.includes(':"'+route+'"'));
  }
  assert.match(dashboard,/href=\{adminProfileHref\(p\)\}/);
  assert.match(dashboard,/Otvoriť profil ↗/);
  assert.match(dashboard,/Hľadať iný obrázok/);
  assert.match(dashboard,/onError=\{\(\)=>\{setBroken\(true\);onBroken\?\.\(\);\}\}/);
});
test("image approval downloads and stores a validated copy in R2 rather than a hotlink",()=>{
  const reviewer=engine.slice(engine.indexOf("export async function reviewMissingQualityProposal"));
  assert.match(reviewer,/downloadRemoteImage\(p\.value\)/);
  assert.match(reviewer,/optimizeRemoteImageForStorage/);
  assert.match(reviewer,/BUCKET\.put/);
  assert.match(reviewer,/reviewedImage\?\.url\?\?p\.value/);
  assert.match(reviewer,/status='ACCEPTED'/);
  assert.match(reviewer,/BUCKET\?\.delete/);
});

test("Facebook/Tavily images are privately staged before proposal and approved without refetch",()=>{
  const preview=read("app/api/admin/data-quality/missing/[id]/image/route.ts");
  const publicMedia=read("app/media/[...key]/route.ts");
  assert.match(engine,/async function discoverWithStagedImage/);
  assert.match(engine,/await downloadRemoteImage\(source\)/);
  assert.match(engine,/quality-missing-candidates\//);
  assert.match(engine,/private, no-store/);
  assert.match(engine,/discoverWithStagedImage\(db,profile,search\.results,search\.images\)/);
  assert.match(engine,/const stagedKey=f\.group==="image"\?qualityMissingCandidateKey\(p\.value\):null/);
  assert.match(engine,/bindings\.BUCKET\.get\(stagedKey\)/);
  assert.match(engine,/BUCKET\?\.delete\(stagedKey\)/);
  assert.match(preview,/getAdminApiUser\(\)/);
  assert.match(preview,/status='OPEN'/);
  assert.match(preview,/qualityMissingCandidateKey\(row\.value\)/);
  assert.match(preview,/private, no-store/);
  assert.match(publicMedia,/segments\[0\] === "quality-missing-candidates"/);
  assert.match(dashboard,/\/api\/admin\/data-quality\/missing\/.*\/image/);
  assert.match(dashboard,/brokenImages\.includes\(p\.id\)/);
});
