/** One eligibility predicate for winners and competing rows. */
function eligible(alias:string) {
  const seo=`CASE WHEN json_valid(${alias}.seo_json) THEN ${alias}.seo_json ELSE '{}' END`;
  return `${alias}.status='published'
    AND typeof(${alias}.fci_number)='integer' AND ${alias}.fci_number>0
    AND ${alias}.import_key IS NOT NULL AND TRIM(${alias}.import_key)<>''
    AND TRIM(${alias}.name)<>''
    AND TRIM(${alias}.slug)<>'' AND ${alias}.slug NOT GLOB '*[^a-z0-9-]*'
    AND typeof(${alias}.fci_group)='integer' AND ${alias}.fci_group BETWEEN 1 AND 10
    AND json_valid(${alias}.seo_json)
    AND COALESCE(json_extract(${seo},'$.noindex'),0)=0
    AND COALESCE(json_extract(${seo},'$.canonicalUrl'),'') IN ('','https://psipedia.sk/plemena/'||${alias}.slug,'/plemena/'||${alias}.slug)`;
}

/** Shared eligibility used by every public breed query. Drafts and legacy rows stay editable. */
export const canonicalBreedIdsSql = `SELECT b.id FROM managed_breeds b
WHERE ${eligible('b')}
  AND NOT EXISTS (
    SELECT 1 FROM managed_breeds other WHERE ${eligible('other')}
      AND other.id<b.id
      AND (other.fci_number=b.fci_number OR other.slug=b.slug OR TRIM(other.import_key)=TRIM(b.import_key))
  )`;

export type CanonicalIdentity = { id:number; slug:string; fci_number:number|null; import_key:string|null; status:string; seo_json:string };

/** Audit the raw published rows, before filtering can hide conflicting identities. */
export function auditCanonicalIdentities(rows:CanonicalIdentity[]) {
  const issues:Array<{code:string; ids:number[]; value:string}>=[];
  const published=rows.filter(row=>row.status==='published');
  for(const field of ['fci_number','slug','import_key'] as const){
    const groups=new Map<string,number[]>();
    for(const row of published){
      const value=String(row[field]??'').trim();
      if(!value || (field==='fci_number' && (!Number.isSafeInteger(row.fci_number)||Number(row.fci_number)<=0))) {
        issues.push({code:`missing-or-invalid-${field}`,ids:[row.id],value});continue;
      }
      groups.set(value,[...(groups.get(value)??[]),row.id]);
    }
    for(const [value,ids] of groups) if(ids.length>1) issues.push({code:`duplicate-${field}`,ids,value});
  }
  for(const row of published){
    try {
      const seo=JSON.parse(row.seo_json);
      if(!seo||typeof seo!=='object'||Array.isArray(seo))throw new Error('Invalid SEO object');
      const target=seo.canonicalUrl;
      if(target && target!==`https://psipedia.sk/plemena/${row.slug}` && target!==`/plemena/${row.slug}`){
        const targetRow=published.find(candidate=>target===`https://psipedia.sk/plemena/${candidate.slug}`||target===`/plemena/${candidate.slug}`);
        let valid=Boolean(targetRow && Number.isSafeInteger(targetRow.fci_number) && Number(targetRow.fci_number)>0 && targetRow.import_key?.trim()
          && (!row.fci_number || row.fci_number===targetRow.fci_number));
        if(targetRow){
          const targetSeo=JSON.parse(targetRow.seo_json);
          valid=valid && !targetSeo.noindex && (!targetSeo.canonicalUrl || targetSeo.canonicalUrl===`https://psipedia.sk/plemena/${targetRow.slug}` || targetSeo.canonicalUrl===`/plemena/${targetRow.slug}`);
        }
        if(!valid)issues.push({code:'broken-canonical-relation',ids:[row.id],value:String(target)});
      }
    } catch { issues.push({code:'invalid-seo-json',ids:[row.id],value:row.seo_json}); }
  }
  return issues;
}

export function assertCanonicalIdentities(rows:CanonicalIdentity[]) {
  const issues=auditCanonicalIdentities(rows);
  if(issues.length) throw new Error(`Canonical breed integrity: ${JSON.stringify(issues)}`);
}

export function dayOfYearInBratislava(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(now).reduce<Record<string,number>>((values,part)=>{if(part.type!=='literal')values[part.type]=Number(part.value);return values;},{});
  return Math.floor((Date.UTC(parts.year,parts.month-1,parts.day)-Date.UTC(parts.year,0,0))/86400000);
}

export function rotateBreeds<T>(items:T[],day:number):T[] {
  if(!items.length)return [];
  const offset=((Number.isFinite(day)?Math.max(1,Math.trunc(day)):1)-1)%items.length;
  return [...items.slice(offset),...items.slice(0,offset)];
}

export async function canonicalBreedRedirect(database:D1Database,slug:string):Promise<string|null> {
  const row=await database.prepare(`SELECT target.slug FROM managed_breeds source
    JOIN managed_breeds target ON (source.fci_number=target.fci_number
      OR (source.fci_number IS NULL AND CASE WHEN json_valid(source.seo_json) THEN json_extract(source.seo_json,'$.canonicalUrl') ELSE '' END IN ('https://psipedia.sk/plemena/'||target.slug,'/plemena/'||target.slug)))
    WHERE source.slug=? AND source.status='published' AND source.id<>target.id
      AND target.id IN (${canonicalBreedIdsSql})
      AND source.id NOT IN (${canonicalBreedIdsSql}) LIMIT 1`).bind(slug).first<{slug:string}>();
  return row?`/plemena/${row.slug}`:null;
}
