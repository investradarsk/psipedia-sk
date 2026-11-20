import { removeRecord, type LifecycleBindings } from "./admin-record-lifecycle";
import {
  HELP_LEGACY_APPROVED_REMOVALS,
  assessHelpLegacyCleanup,
} from "./help-legacy-cleanup-plan.mjs";

type CountKey = "adoption"|"shelters"|"lost"|"adoptionDone"|"sheltersDone"|
  "unmapped"|"unmatchedAdoptions"|"unexpectedShelters"|"duplicateSlugs"|
  "partnerClaimReferences"|"unsupportedStatuses"|"conflictingTombstones"|
  "notionTargetMissing"|"approvedRemoved";
type Summary = Record<CountKey,number>;
const scope = "('adopcia','utulky')";
const approved = "(" + HELP_LEGACY_APPROVED_REMOVALS.map(slug => "'" + slug + "'").join(",") + ")";

// All SQL strings are static. No browser-supplied IDs, categories, pages,
// table names or SQL are accepted by the cleanup executor.
const sql:Record<CountKey,string> = {
  adoption:"SELECT COUNT(*) n FROM help_cases WHERE category='adopcia'",
  shelters:"SELECT COUNT(*) n FROM help_cases WHERE category='utulky'",
  lost:"SELECT COUNT(*) n FROM help_cases WHERE category='stratene-a-najdene'",
  adoptionDone:"SELECT COUNT(*) n FROM admin_record_tombstones WHERE kind='help' AND record_category='adopcia' AND state='COMPLETE'",
  sheltersDone:"SELECT COUNT(*) n FROM admin_record_tombstones WHERE kind='help' AND record_category='utulky' AND state='COMPLETE'",
  unmapped:"SELECT COUNT(*) n FROM help_cases h WHERE h.category IN "+scope+" AND NOT EXISTS (SELECT 1 FROM notion_agenda_sync m WHERE m.agenda='help-cases' AND m.entity_id=h.id)",
  unmatchedAdoptions:"SELECT COUNT(*) n FROM help_cases h WHERE h.category='adopcia' AND NOT EXISTS (SELECT 1 FROM adoption_dogs d WHERE d.slug=h.slug)",
  unexpectedShelters:"SELECT COUNT(*) n FROM help_cases h WHERE h.category='utulky' AND NOT EXISTS (SELECT 1 FROM help_organizations o WHERE o.slug=h.slug) AND h.slug NOT IN "+approved,
  duplicateSlugs:"SELECT COUNT(*) n FROM help_cases h WHERE h.category IN "+scope+" AND EXISTS (SELECT 1 FROM help_cases other WHERE other.slug=h.slug AND other.id<>h.id)",
  partnerClaimReferences:"SELECT COUNT(*) n FROM partner_help_claims p JOIN help_cases h ON h.id=p.help_case_id WHERE h.category IN "+scope,
  unsupportedStatuses:"SELECT COUNT(*) n FROM help_cases h WHERE h.category IN "+scope+" AND h.status<>'published' AND NOT EXISTS (SELECT 1 FROM admin_record_tombstones t WHERE t.kind='help' AND t.record_id=h.id AND t.state<>'COMPLETE')",
  conflictingTombstones:"SELECT COUNT(*) n FROM help_cases h JOIN admin_record_tombstones t ON t.kind='help' AND t.record_slug=h.slug AND t.record_id<>h.id WHERE h.category IN "+scope,
  notionTargetMissing:"SELECT CASE WHEN EXISTS (SELECT 1 FROM notion_agenda_targets WHERE agenda='help-cases' AND length(trim(data_source_id))>0) THEN 0 ELSE 1 END n",
  approvedRemoved:"SELECT (SELECT COUNT(*) FROM help_cases h WHERE h.category='utulky' AND h.slug IN "+approved+" AND NOT EXISTS (SELECT 1 FROM help_organizations o WHERE o.slug=h.slug)) + (SELECT COUNT(*) FROM admin_record_tombstones t WHERE t.kind='help' AND t.record_category='utulky' AND t.state='COMPLETE' AND t.record_slug IN "+approved+") n"
};

export async function inspectHelpLegacyCleanup(db:D1Database) {
  const keys=Object.keys(sql) as CountKey[];
  const results=await db.batch(keys.map(key=>db.prepare(sql[key])));
  const summary={} as Summary;
  keys.forEach((key,index)=>{
    const value=(results[index].results?.[0] as {n?:number}|undefined)?.n;
    summary[key]=typeof value==="number" ? value : -1;
  });
  return {...assessHelpLegacyCleanup(summary),stats:summary};
}

type NextLegacy = {id:number;slug:string;title:string;category:"adopcia"|"utulky"};
export async function removeNextReviewedLegacyHelp(
  db:D1Database,bindings:LifecycleBindings,owner:string,
) {
  const preflight=await inspectHelpLegacyCleanup(db);
  if(!preflight.ready)return {state:"BLOCKED" as const,preflight};
  if(preflight.remaining===0)return {state:"COMPLETE" as const,preflight};
  // Pending partial removals take priority so a failed Notion operation is
  // never bypassed. A tombstone is the only path for an already hidden row.
  const next=await db.prepare(
    "SELECT h.id,h.slug,h.title,h.category FROM help_cases h "+
    "WHERE h.category IN "+scope+" AND (h.status='published' OR EXISTS "+
    "(SELECT 1 FROM admin_record_tombstones t WHERE t.kind='help' AND t.record_id=h.id AND t.state<>'COMPLETE')) "+
    "ORDER BY CASE WHEN EXISTS (SELECT 1 FROM admin_record_tombstones t "+
    "WHERE t.kind='help' AND t.record_id=h.id AND t.state<>'COMPLETE') THEN 0 ELSE 1 END,h.id LIMIT 1"
  ).first<NextLegacy>();
  if(!next)return {state:"BLOCKED" as const,preflight,reason:"NO_ELIGIBLE_RECORD"};
  // Recheck exact entity, category and target before anything is hidden.
  if(next.category==="adopcia") {
    const paired=await db.prepare("SELECT 1 ok FROM adoption_dogs WHERE slug=? LIMIT 1")
      .bind(next.slug).first<{ok:number}>();
    if(!paired)return {state:"BLOCKED" as const,preflight,reason:"CANONICAL_ADOPTION_MISSING"};
  } else {
    const paired=await db.prepare("SELECT 1 ok FROM help_organizations WHERE slug=? LIMIT 1")
      .bind(next.slug).first<{ok:number}>();
    if(!paired && !HELP_LEGACY_APPROVED_REMOVALS.includes(next.slug))
      return {state:"BLOCKED" as const,preflight,reason:"CANONICAL_ORGANIZATION_MISSING"};
  }
  const result=await removeRecord(db,bindings,"help",next.id,owner,false,
    {slug:next.slug,name:next.title,category:next.category},{allowReviewedLegacyHelp:true});
  if(result.state!=="COMPLETE")return {state:"BLOCKED" as const,preflight,reason:result.errorCode||result.state};
  const after=await inspectHelpLegacyCleanup(db);
  return {state:after.ready?(after.remaining===0?"COMPLETE" as const:"PROGRESS" as const):"BLOCKED" as const,
    preflight:after,reason:after.blockers.join(",")||undefined};
}
