/** Public FCI taxonomy – stable URL segments, independent of editorial content. */
const BREED_GROUP_SLUGS: Readonly<Record<number, string>> = {
  1: "ovciarske-a-pastierske",
  2: "pince-bradace-molosy-salasnicke",
  3: "teriery",
  4: "jazveciky",
  5: "spice-a-primitivne-typy",
  6: "durice",
  7: "stavace",
  8: "retrievery-sliedice-vodne",
  9: "spolocenske-a-sprievodne",
  10: "chrty",
};

export function breedCategorySlug(fciGroup: number): string | null {
  return BREED_GROUP_SLUGS[fciGroup] ?? null;
}

/** The old one-segment URL is a redirect source, not a canonical destination. */
export function breedProfileHref(slug: string, fciGroup?: number): string {
  const category = typeof fciGroup === "number" ? breedCategorySlug(fciGroup) : null;
  return category ? `/plemena/${category}/${slug}` : `/plemena/${slug}`;
}

export function breedFciStandardHref(slug: string, fciGroup: number): string {
  return `${breedProfileHref(slug, fciGroup)}/fci-standard`;
}

export function isBreedSelfCanonicalSeo(
  seo: { canonicalUrl?: string; noindex?: boolean } | undefined,
  slug: string,
  fciGroup: number,
): boolean {
  if (seo?.noindex) return false;
  if (!seo?.canonicalUrl) return true;
  try {
    const canonical = new URL(seo.canonicalUrl, "https://psipedia.sk");
    return canonical.protocol === "https:" &&
      canonical.hostname === "psipedia.sk" &&
      !canonical.search && !canonical.hash &&
      [`/plemena/${slug}`, breedProfileHref(slug, fciGroup)].includes(canonical.pathname);
  } catch {
    return false;
  }
}

function breedCategorySql(alias: string) {
  return `CASE ${Object.entries(BREED_GROUP_SLUGS)
    .map(([group, slug]) => `WHEN ${alias}.fci_group=${group} THEN '${slug}'`)
    .join(" ")} ELSE '' END`;
}

/** One eligibility predicate for winners and competing rows. */
export function canonicalBreedEligibilitySql(alias:string) {
  const seo=`CASE WHEN json_valid(${alias}.seo_json) THEN ${alias}.seo_json ELSE '{}' END`;
  const modernPath = `'/plemena/'||(${breedCategorySql(alias)})||'/'||${alias}.slug`;
  return `${alias}.status='published'
    AND typeof(${alias}.fci_number)='integer' AND ${alias}.fci_number>0
    AND ${alias}.import_key IS NOT NULL AND TRIM(${alias}.import_key)<>''
    AND TRIM(${alias}.name)<>''
    AND TRIM(${alias}.slug)<>'' AND ${alias}.slug NOT GLOB '*[^a-z0-9-]*'
    AND typeof(${alias}.fci_group)='integer' AND ${alias}.fci_group BETWEEN 1 AND 10
    AND json_valid(${alias}.seo_json)
    AND COALESCE(json_extract(${seo},'$.noindex'),0)=0
    AND COALESCE(json_extract(${seo},'$.canonicalUrl'),'') IN ('','https://psipedia.sk/plemena/'||${alias}.slug,'/plemena/'||${alias}.slug, 'https://psipedia.sk'||${modernPath}, ${modernPath})`;
}

/** Canonical winner predicate that can use a selective outer query (for example slug=?). */
export function canonicalBreedWinnerSql(alias:string) {
  return `${canonicalBreedEligibilitySql(alias)}
  AND NOT EXISTS (
    SELECT 1 FROM managed_breeds other WHERE ${canonicalBreedEligibilitySql('other')}
      AND other.id<${alias}.id
      AND (other.fci_number=${alias}.fci_number OR other.slug=${alias}.slug OR TRIM(other.import_key)=TRIM(${alias}.import_key))
  )`;
}

/**
 * Evaluate canonical public breeds in one eligibility pass.
 * A row wins iff it has the lowest eligible ID for each of the three
 * independent identity keys. This matches canonicalBreedWinnerSql's
 * lower-ID anti-join, including conflicts against non-winner rows.
 *
 * Window minima avoid the correlated eligible-breed rescan in every
 * public listing and in the breeding-station sitemap aggregates.
 */
export const canonicalBreedIdsSql = `SELECT winners.id
  FROM (
    SELECT b.id,
      MIN(b.id) OVER (PARTITION BY b.fci_number) AS fci_first_id,
      MIN(b.id) OVER (PARTITION BY b.slug) AS slug_first_id,
      MIN(b.id) OVER (PARTITION BY TRIM(b.import_key)) AS import_first_id
    FROM managed_breeds b
    WHERE ${canonicalBreedEligibilitySql('b')}
  ) winners
  WHERE winners.id = winners.fci_first_id
    AND winners.id = winners.slug_first_id
    AND winners.id = winners.import_first_id`;

export type CanonicalIdentity = { id:number; slug:string; fci_number:number|null; import_key:string|null; status:string; seo_json:string; fci_group?:number };

/** Audit the raw published rows, before filtering can hide conflicting identities. */
function breedCanonicalAliases(row: CanonicalIdentity): string[] {
  const paths = [`/plemena/${row.slug}`];
  if (row.fci_group) paths.push(breedProfileHref(row.slug, row.fci_group));
  return paths.flatMap(path => [path, `https://psipedia.sk${path}`]);
}

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
      if(target && !breedCanonicalAliases(row).includes(target)){
        const targetRow=published.find(candidate=>breedCanonicalAliases(candidate).includes(target));
        let valid=Boolean(targetRow && Number.isSafeInteger(targetRow.fci_number) && Number(targetRow.fci_number)>0 && targetRow.import_key?.trim()
          && (!row.fci_number || row.fci_number===targetRow.fci_number));
        if(targetRow){
          const targetSeo=JSON.parse(targetRow.seo_json);
          valid=valid && !targetSeo.noindex && (!targetSeo.canonicalUrl || breedCanonicalAliases(targetRow).includes(targetSeo.canonicalUrl));
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

/** Resolve legacy /plemena/:slug and losing duplicates to the category URL. */
export async function canonicalBreedRedirect(database: D1Database, slug: string): Promise<string | null> {
  const winner = await database.prepare(`SELECT slug, fci_group FROM managed_breeds
    WHERE slug=? AND id IN (${canonicalBreedIdsSql}) LIMIT 1`)
    .bind(slug).first<{ slug: string; fci_group: number }>();
  if (winner) return breedProfileHref(winner.slug, winner.fci_group);

  const categorySql = breedCategorySql("target");
  const loser = await database.prepare(`SELECT target.slug, target.fci_group FROM managed_breeds source
    JOIN managed_breeds target ON (source.fci_number=target.fci_number
      OR (source.fci_number IS NULL AND CASE WHEN json_valid(source.seo_json) THEN json_extract(source.seo_json,'$.canonicalUrl') ELSE '' END
        IN ('https://psipedia.sk/plemena/'||target.slug, '/plemena/'||target.slug,
          'https://psipedia.sk/plemena/'||(${categorySql})||'/'||target.slug,
          '/plemena/'||(${categorySql})||'/'||target.slug)))
    WHERE source.slug=? AND source.status='published' AND source.id<>target.id
      AND target.id IN (${canonicalBreedIdsSql})
      AND source.id NOT IN (${canonicalBreedIdsSql}) LIMIT 1`)
    .bind(slug).first<{ slug: string; fci_group: number }>();
  return loser ? breedProfileHref(loser.slug, loser.fci_group) : null;
}
