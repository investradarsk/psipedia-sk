import { prepareFciBreedImport, publicFciSectionName, type FciImportIssue, type PreparedFciBreed } from "@/lib/breed-fci";

type ExistingBreedRow = {
  id: number;
  slug: string;
  status: string;
  fci_number: number | null;
  import_key: string | null;
  editorial_json: string;
};

type ImportAction = { kind: "create" | "update"; record: PreparedFciBreed; existingId?: number; existingEditorial?: string };

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
  const result = await database.prepare("SELECT id, slug, status, fci_number, import_key, editorial_json FROM managed_breeds").all<ExistingBreedRow>();
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
      actions.push({kind:"update",record,existingId:match.id,existingEditorial:match.editorial_json});
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
  const record=action.record;const standard=record.standard;const profile=record.profile;
  const publicSection=publicFciSectionName(record.fciGroup,record.fciSectionNumber,standard.fci_sekcia_nazov||record.fciSectionNumber);
  let editorial:string|null=null;
  if(profile){let current:Record<string,unknown>={};try{const parsed=JSON.parse(action.existingEditorial||"{}");if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))current=parsed;}catch{current={};}
    const patch={overview:profile.overview,coatCare:profile.coatCare,familyLife:profile.familyLife,otherDogsLife:profile.otherDogsLife,curiosities:profile.curiosities,commonOwnerMistakes:profile.commonOwnerMistakes,exerciseTip:profile.exerciseTip,trainingTip:profile.trainingTip,healthTip:profile.healthTip,coatTip:profile.coatTip,heroTraits:profile.heroTraits};
    for(const [key,value] of Object.entries(patch))if((typeof value==="string"&&value.trim())||(Array.isArray(value)&&value.length))current[key]=value;
    editorial=JSON.stringify(current);
  }
  const ratings=profile?.ratings??{};
  return database.prepare(`UPDATE managed_breeds SET
    name=?, fci_number=?, fci_group=?, fci_section=?, fci_section_number=?, official_fci_name=?, valid_standard_date=?,
    working_trial=?, import_key=COALESCE(import_key,?), fci_standard_json=?, search_text=?, origin=?,
    editorial_json=COALESCE(?,editorial_json), sports_json=COALESCE(?,sports_json),
    intro=COALESCE(NULLIF(?,''),intro), character=COALESCE(NULLIF(?,''),character), needs=COALESCE(NULLIF(?,''),needs), history=COALESCE(NULLIF(?,''),history), exercise=COALESCE(NULLIF(?,''),exercise), training=COALESCE(NULLIF(?,''),training), health=COALESCE(NULLIF(?,''),health),
    height=COALESCE(NULLIF(?,''),height), weight=COALESCE(NULLIF(?,''),weight), lifespan=COALESCE(NULLIF(?,''),lifespan), coat=COALESCE(NULLIF(?,''),coat),
    health_risks_json=COALESCE(?,health_risks_json), good_for_json=COALESCE(?,good_for_json), consider_json=COALESCE(?,consider_json),
    energy=COALESCE(?,energy), trainability=COALESCE(?,trainability), children=COALESCE(?,children), family=COALESCE(?,family), other_dogs=COALESCE(?,other_dogs), apartment=COALESCE(?,apartment), grooming=COALESCE(?,grooming), shedding=COALESCE(?,shedding), prey_drive=COALESCE(?,prey_drive), editorial_complete=COALESCE(?,editorial_complete),
    status=CASE WHEN ?='published' THEN 'published' ELSE status END,
    published_at=CASE WHEN ?='published' THEN COALESCE(published_at,?) ELSE published_at END,
    updated_at=?, updated_by=? WHERE id=?`).bind(
      record.name,record.fciNumber,record.fciGroup,publicSection,record.fciSectionNumber,
      record.officialFciName,record.validStandardDate,record.workingTrial,record.importKey,JSON.stringify(standard),record.searchText,
      record.origin,editorial,profile?.sports?.length?JSON.stringify(profile.sports):null,
      profile?.intro??"",profile?.character??"",profile?.needs??"",profile?.history??"",profile?.exercise??"",profile?.training??"",profile?.health??"",
      profile?.height??"",profile?.weight??"",profile?.lifespan??"",profile?.coat??"",
      profile?.healthRisks?.length?JSON.stringify(profile.healthRisks):null,profile?.goodFor?.length?JSON.stringify(profile.goodFor):null,profile?.consider?.length?JSON.stringify(profile.consider):null,
      ratings.energy??null,ratings.trainability??null,ratings.children??null,ratings.children??null,ratings.otherDogs??null,ratings.apartment??null,ratings.grooming??null,ratings.shedding??null,ratings.preyDrive??null,profile?.editorialComplete===undefined?null:(profile.editorialComplete?1:0),
      record.status,record.status,now,now,user,action.existingId,
    );
}

function createStatement(database:D1Database,action:ImportAction,user:string,now:string) {
  const record=action.record;const standard=record.standard;const profile=record.profile;
  const publicSection=publicFciSectionName(record.fciGroup,record.fciSectionNumber,standard.fci_sekcia_nazov||record.fciSectionNumber);
  const intro=(profile?.intro||standard.povaha_temperament||standard.celkovy_vzhlad||"").slice(0,1200);
  const editorial=profile?{overview:profile.overview||"",coatCare:profile.coatCare||"",familyLife:profile.familyLife||"",otherDogsLife:profile.otherDogsLife||"",curiosities:profile.curiosities||"",commonOwnerMistakes:profile.commonOwnerMistakes||"",exerciseTip:profile.exerciseTip||"",trainingTip:profile.trainingTip||"",healthTip:profile.healthTip||"",coatTip:profile.coatTip||"",heroTraits:profile.heroTraits??[]}:{};
  const ratings=profile?.ratings??{};
  return database.prepare(`INSERT INTO managed_breeds (
    slug,name,status,image_url,image_key,gallery_json,fci_number,fci_group,fci_section,fci_section_number,official_fci_name,
    valid_standard_date,working_trial,import_key,fci_standard_json,editorial_json,sports_json,search_text,editorial_complete,origin,group_name,
    size,weight,height,lifespan,coat,energy,trainability,family,children,other_dogs,apartment,grooming,shedding,prey_drive,
    intro,character,needs,history,exercise,training,health,health_risks_json,good_for_json,consider_json,sources_json,
    accent,seo_json,created_at,updated_at,published_at,created_by,updated_by
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    record.slug,record.name,record.status,"",null,"[]",record.fciNumber,record.fciGroup,publicSection,
    record.fciSectionNumber,record.officialFciName,record.validStandardDate,record.workingTrial,record.importKey,JSON.stringify(standard),JSON.stringify(editorial),JSON.stringify(profile?.sports??[]),
    record.searchText,profile?.editorialComplete?1:0,record.origin,standard.fci_skupina_nazov||"","",profile?.weight??"",profile?.height??"",profile?.lifespan??"",profile?.coat??"",ratings.energy??3,ratings.trainability??3,ratings.children??3,ratings.children??3,ratings.otherDogs??3,ratings.apartment??3,ratings.grooming??3,ratings.shedding??3,ratings.preyDrive??3,
    intro,profile?.character??"",profile?.needs??"",profile?.history??"",profile?.exercise??"",profile?.training??"",profile?.health??"",JSON.stringify(profile?.healthRisks??[]),JSON.stringify(profile?.goodFor??[]),JSON.stringify(profile?.consider??[]),"[]","forest","{}",now,now,record.status==="published"?now:null,user,user,
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
