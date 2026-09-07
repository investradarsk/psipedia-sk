import { auditCanonicalIdentities, canonicalBreedIdsSql, type CanonicalIdentity } from './breed-canonical.ts';
import { inspectBreedMeasurement, publicFciSectionName } from './breed-fci.ts';
import { withAvailableBreedImages, type ImageBindings } from './breed-image.ts';

export type BreedAuditRow = CanonicalIdentity & {
  name:string; image_url:string; fci_group:number; fci_section_number:string; fci_section:string;
  height:string; weight:string; lifespan:string; fci_measurements_json:string;
};
// Keep the projection small: a complete FCI standard can contain tens of kilobytes per breed.
const standard = "CASE WHEN json_valid(fci_standard_json) THEN fci_standard_json ELSE '{}' END";
export const breedAuditRowsSql = `SELECT id,slug,name,status,fci_number,import_key,seo_json,image_url,
  fci_group,fci_section_number,fci_section,height,weight,lifespan,
  json_object('vyska_pes_cm',json_extract(${standard},'$.vyska_pes_cm'),
    'vyska_suka_cm',json_extract(${standard},'$.vyska_suka_cm'),
    'hmotnost_pes_kg',json_extract(${standard},'$.hmotnost_pes_kg'),
    'hmotnost_suka_kg',json_extract(${standard},'$.hmotnost_suka_kg')) AS fci_measurements_json
  FROM managed_breeds ORDER BY id`;

export function auditBreedRows(rows:BreedAuditRow[]) {
  const issues=auditCanonicalIdentities(rows);
  for(const row of rows.filter(item=>item.status==='published')){
    const add=(code:string,value:string)=>issues.push({code,ids:[row.id],value});
    if(!row.image_url?.trim())add('missing-image-url','');
    const expected=publicFciSectionName(row.fci_group,row.fci_section_number??'');
    if(expected==='Sekcia sa overuje'||expected==='Nezaradená sekcia')add('invalid-fci-group-section',`${row.fci_group}:${row.fci_section_number}`);
    else if(row.fci_section!==expected)add('non-slovak-or-inconsistent-fci-section',`${row.fci_section??''} → ${expected}`);
    for(const kind of ['height','weight','lifespan'] as const){
      for(const issue of inspectBreedMeasurement(row[kind],kind))add(`${kind}:${issue.code}`,row[kind]);
    }
    try{
      const measurements=JSON.parse(row.fci_measurements_json);
      for(const [key,value] of Object.entries(measurements)){
        if(value==null||value==='')continue;
        const kind=key.startsWith('vyska')?'height':'weight';
        for(const issue of inspectBreedMeasurement(value,kind,false))add(`fci-${key}:${issue.code}`,String(value));
      }
    }catch{add('invalid-fci-measurements-json','');}
  }
  return issues;
}

export async function auditPublishedBreeds(database:D1Database,bindings:ImageBindings){
  const rows=(await database.prepare(breedAuditRowsSql).all<BreedAuditRow>()).results;
  const canonical=(await database.prepare(canonicalBreedIdsSql).all<{id:number}>()).results;
  const canonicalIds=new Set(canonical.map(row=>row.id));
  const images=await withAvailableBreedImages(rows.filter(row=>canonicalIds.has(row.id)).map(row=>({id:row.id,slug:row.slug,image:row.image_url})),bindings);
  const issues=auditBreedRows(rows);
  for(const image of images){
    if(!image.image && rows.find(row=>row.id===image.id)?.image_url?.trim())issues.push({code:'image-missing-or-unavailable',ids:[image.id],value:rows.find(row=>row.id===image.id)!.image_url});
  }
  return {checkedAt:new Date().toISOString(),publishedCount:rows.filter(row=>row.status==='published').length,canonicalCount:canonical.length,
    verifiedImageCount:images.filter(row=>row.image).length,
    issues:issues.map(issue=>({...issue,slugs:issue.ids.map(id=>rows.find(row=>row.id===id)?.slug??'')})),
    excludedPublished:rows.filter(row=>row.status==='published'&&!canonicalIds.has(row.id)).map(row=>({id:row.id,slug:row.slug,fciNumber:row.fci_number})),
    note:'Nedostupný obrázok môže znamenať chýbajúci súbor alebo dočasnú chybu úložiska. Audit nemení záznamy.'};
}
