import { prepareFciBreedImport, type FciImportIssue, type PreparedFciBreed } from "@/lib/breed-fci";

type ExistingBreedRow = {
  id: number;
  slug: string;
  status: string;
  fci_number: number | null;
  import_key: string | null;
};

type ImportAction = { kind: "create" | "update"; record: PreparedFciBreed; existingId?: number };

export type FciImportPreview = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  published: number;
  draft: number;
  errors: FciImportIssue[];
  duplicateFciNumbers: number[];
  duplicateImportKeys: string[];
  duplicateSlugs: string[];
};

export type FciImportResult = FciImportPreview & { success: boolean };

async function existingBreeds(database: D1Database) {
  const result = await database.prepare("SELECT id, slug, status, fci_number, import_key FROM managed_breeds").all<ExistingBreedRow>();
  return result.results;
}

function resolveActions(records: PreparedFciBreed[], existing: ExistingBreedRow[]) {
  const byFci = new Map(existing.filter((row)=>row.fci_number !== null).map((row)=>[row.fci_number as number,row]));
  const byImportKey = new Map(existing.filter((row)=>row.import_key).map((row)=>[row.import_key as string,row]));
  const bySlug = new Map(existing.map((row)=>[row.slug,row]));
  const actions: ImportAction[] = [];
  const errors: FciImportIssue[] = [];
  const targetedIds = new Map<number,number>();

  for (const record of records) {
    const candidates = [byFci.get(record.fciNumber),byImportKey.get(record.importKey),bySlug.get(record.slug)].filter((row):row is ExistingBreedRow=>Boolean(row));
    const uniqueCandidates = [...new Map(candidates.map((row)=>[row.id,row])).values()];
    if (uniqueCandidates.length > 1) {
      errors.push({index:record.sourceIndex+1,field:"identity",message:"FCI číslo, import key a slug odkazujú na rôzne existujúce plemená."});
      continue;
    }
    const match = uniqueCandidates[0];
    if (match) {
      const previousSourceIndex = targetedIds.get(match.id);
      if (previousSourceIndex !== undefined) {
        errors.push({index:record.sourceIndex+1,field:"identity",message:`Záznam cieli na rovnaké existujúce plemeno ako riadok ${previousSourceIndex+1}.`});
        continue;
      }
      targetedIds.set(match.id,record.sourceIndex);
      actions.push({kind:"update",record,existingId:match.id});
    } else {
      actions.push({kind:"create",record});
    }
  }
  return { actions, errors };
}

function previewFrom(total:number,actions: ImportAction[], records: PreparedFciBreed[], errors: FciImportIssue[], duplicates: Pick<FciImportPreview,"duplicateFciNumbers"|"duplicateImportKeys"|"duplicateSlugs">): FciImportPreview {
  return {
    total,
    created: actions.filter((action)=>action.kind==="create").length,
    updated: actions.filter((action)=>action.kind==="update").length,
    skipped: errors.length ? total : 0,
    published: records.filter((record)=>record.status==="published").length,
    draft: records.filter((record)=>record.status==="draft").length,
    errors,
    ...duplicates,
  };
}

export async function previewFciBreedImport(database: D1Database, payload: unknown): Promise<{ preview:FciImportPreview; actions:ImportAction[] }> {
  const prepared = prepareFciBreedImport(payload);
  const {actions,errors:identityErrors} = await resolveActions(prepared.records,await existingBreeds(database));
  const errors = [...prepared.errors,...identityErrors];
  return {
    preview:previewFrom(prepared.total,actions,prepared.records,errors,{
      duplicateFciNumbers:prepared.duplicateFciNumbers,
      duplicateImportKeys:prepared.duplicateImportKeys,
      duplicateSlugs:prepared.duplicateSlugs,
    }),
    actions,
  };
}

function updateStatement(database:D1Database,action:ImportAction,user:string,now:string) {
  const record=action.record;const standard=record.standard;
  return database.prepare(`UPDATE managed_breeds SET
    name=?, fci_number=?, fci_group=?, fci_section=?, fci_section_number=?, official_fci_name=?, valid_standard_date=?,
    working_trial=?, import_key=COALESCE(import_key,?), fci_standard_json=?, search_text=?, origin=?,
    status=CASE WHEN ?='published' THEN 'published' ELSE status END,
    published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,
    updated_at=?, updated_by=? WHERE id=?`).bind(
      record.name,record.fciNumber,record.fciGroup,standard.fci_sekcia_nazov||record.fciSectionNumber,record.fciSectionNumber,
      record.officialFciName,record.validStandardDate,record.workingTrial,record.importKey,JSON.stringify(standard),record.searchText,
      record.origin,record.status,record.status,now,now,user,action.existingId,
    );
}

function createStatement(database:D1Database,action:ImportAction,user:string,now:string) {
  const record=action.record;const standard=record.standard;
  const intro=(standard.povaha_temperament||standard.celkovy_vzhlad||"").slice(0,1200);
  return database.prepare(`INSERT INTO managed_breeds (
    slug,name,status,image_url,image_key,gallery_json,fci_number,fci_group,fci_section,fci_section_number,official_fci_name,
    valid_standard_date,working_trial,import_key,fci_standard_json,search_text,editorial_complete,origin,group_name,
    size,weight,height,lifespan,coat,energy,trainability,family,children,other_dogs,apartment,grooming,shedding,prey_drive,
    intro,character,needs,history,exercise,training,health,health_risks_json,good_for_json,consider_json,sources_json,
    accent,seo_json,created_at,updated_at,published_at,created_by,updated_by
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    record.slug,record.name,record.status,"",null,"[]",record.fciNumber,record.fciGroup,standard.fci_sekcia_nazov||record.fciSectionNumber,
    record.fciSectionNumber,record.officialFciName,record.validStandardDate,record.workingTrial,record.importKey,JSON.stringify(standard),
    record.searchText,0,record.origin,standard.fci_skupina_nazov||"","","","","","",3,3,3,3,3,3,3,3,3,
    intro,"","","","","","","[]","[]","[]","[]","forest","{}",now,now,record.status==="published"?now:null,user,user,
  );
}

export async function importFciBreeds(database:D1Database,payload:unknown,user:string):Promise<FciImportResult> {
  const {preview,actions}=await previewFciBreedImport(database,payload);
  if(preview.errors.length) return {...preview,success:false};

  const now=new Date().toISOString();
  let created=0;let updated=0;const errors:FciImportIssue[]=[];
  for(let start=0;start<actions.length;start+=50){
    const batch=actions.slice(start,start+50);
    const statements=batch.map((action)=>action.kind==="create"?createStatement(database,action,user,now):updateStatement(database,action,user,now));
    try{
      await database.batch(statements);
      created+=batch.filter((action)=>action.kind==="create").length;
      updated+=batch.filter((action)=>action.kind==="update").length;
    }catch(batchError){
      console.error("FCI breed import batch failed; retrying records individually.",batchError);
      for(const action of batch){
        try{
          const statement=action.kind==="create"?createStatement(database,action,user,now):updateStatement(database,action,user,now);
          await statement.run();
          if(action.kind==="create")created+=1;else updated+=1;
        }catch(error){
          errors.push({index:action.record.sourceIndex+1,field:"database",message:error instanceof Error?error.message:"Zápis plemena zlyhal."});
        }
      }
    }
  }

  return {...preview,created,updated,skipped:errors.length,errors,success:errors.length===0};
}
