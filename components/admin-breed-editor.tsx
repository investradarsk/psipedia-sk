"use client";
import { useProfileEditorSectionPager } from "@/components/admin-profile-editor-section-pager";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import {AdminSingleImageUpload} from "@/components/admin-single-image-upload";
import {adminSelectedImage} from "@/lib/admin-selected-image";
import { AdminLexicalTextField } from "@/components/admin-lexical-text-field";
import { AdminLexicalAppendButton } from "@/components/admin-lexical-append-button";
import { appendLexicalPlainText } from "@/lib/editorial-lexical-append";

import { useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { BreedEditorOptions, BreedSport, ManagedBreed } from "@/lib/breed-store";
import type { BreedImage, BreedSource } from "@/lib/content";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { AdminFieldFeedback, AdminFormFeedback } from "@/components/admin-form-feedback";
import { inspectBreedMeasurement, type BreedMeasurementKind, type FciStandard, type FciStandardTextKey } from "@/lib/breed-fci";
import {
  FCI_GROUP_OPTIONS, BREED_SIZE_OPTIONS, BREED_ORIGIN_COUNTRIES,
  isBreedNumericDraft,
} from "@/lib/breed-controlled-fields.mjs";
import {
  AdminActionButton,
  AdminDrawer,
  AdminEditorSection,
  AdminHelpText,
} from "@/components/admin-interaction-system";
import styles from "./admin-breed-editor.module.css";
import {AdminGalleryDropzone} from "@/components/admin-gallery-dropzone";
import {AdminSortableGallery} from "@/components/admin-sortable-gallery";
import {arrayMove} from "@dnd-kit/sortable";
import { EditorActionBar, EditorStatus, EditorWorkspace } from "@/components/admin-editor-workspace";

function slugify(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90);}
function lines(value:string){return value.split("\n").map((item)=>item.replace(/^[-•]\s*/,"").trim()).filter(Boolean);}
function measurementMessage(value:string,kind:BreedMeasurementKind){return inspectBreedMeasurement(value,kind).map((item)=>item.message).join(" ");}
function measurementHasError(value:string,kind:BreedMeasurementKind){return inspectBreedMeasurement(value,kind).some((item)=>item.severity==="error");}
const emptySource:BreedSource={label:"",url:""};
function controlledNumericChange(next:string,previous:string,kind:BreedMeasurementKind,onChange:(value:string)=>void) {
  // Existing historical FCI prose remains untouched unless the editor intentionally replaces it.
  // Backspacing is allowed to clear an old description, but new prose is never accepted.
  if (isBreedNumericDraft(next,kind) || previous.startsWith(next)) onChange(next);
}
function CountryChoices({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  const valid=BREED_ORIGIN_COUNTRIES as readonly string[];
  const parts=value.split(/\s*[,;\/]\s*/).map(x=>x.trim()).filter(Boolean);
  const chosen=parts.filter(x=>valid.includes(x));
  const unknown=parts.some(x=>!valid.includes(x));
  return <div>
    <select value="" aria-label="Pridať krajinu pôvodu" onChange={e=>{
      const added=e.target.value;
      if (added) onChange([...new Set([...chosen,added])].join(", "));
    }}>
      <option value="">Vybrať krajinu…</option>
      {valid.filter(x=>!chosen.includes(x)).map(country=><option key={country} value={country}>{country}</option>)}
    </select>
    {unknown&&<small>Pôvodný údaj (ponechaný bez zmeny): {value}</small>}
    {chosen.map(country=><button key={country} type="button" aria-label={`Odstrániť krajinu ${country}`}
      onClick={()=>onChange(chosen.filter(x=>x!==country).join(", "))}>{country} ×</button>)}
  </div>;
}
const sportOptions=[
  ["obedience","Obedience"],["rally-obedience","Rally obedience"],["agility","Agility"],["canicross","Canicross"],
  ["bikejoring","Bikejöring"],["turistika","Turistika"],["nosework","Nosework"],["stopovanie","Stopovanie"],
  ["mantrailing","Mantrailing"],["field-trials","Field trials / retriever work"],["polovnictvo","Poľovnícke využitie"],
  ["pasenie","Pasenie"],["coursing","Coursing"],["dog-dancing","Dog dancing"],["zachranarcina","Záchranárčina"],
] as const;

type SportDraft={index:number|null;key:string;label:string;rating:number;note:string};
const subscribeToHydration=()=>()=>{};

export function AdminBreedEditor({ breed }: { breed?: ManagedBreed;options:BreedEditorOptions }) {
  const router = useRouter();
  const hydrated=useSyncExternalStore(subscribeToHydration,()=>true,()=>false);
  const [form,setCanonicalForm]=useState({
    name:breed?.name??"",slug:breed?.slug??"",status:breed?.status??"draft",image:breed?.image??"",imageKey:breed?.imageKey??"",
    gallery:breed?.gallery??[],fciNumber:breed?.fciNumber?.toString()??"",fciGroup:breed?.fciGroup??1,fciSection:breed?.fciSection??"",fciSectionNumber:breed?.fciSectionNumber??"",
    officialFciName:breed?.officialFciName??"",validStandardDate:breed?.validStandardDate??"",workingTrial:breed?.workingTrial??"",importKey:breed?.importKey??"",
    fciStandard:breed?.fciStandard??{} as FciStandard,editorialComplete:breed?.editorialComplete??false,origin:breed?.origin??"",group:breed?.group??"",
    size:breed?.size??"",weight:breed?.weight??"",height:breed?.height??"",lifespan:breed?.lifespan??"",coat:breed?.coat??"",
    energy:breed?.energy??3,trainability:breed?.trainability??3,children:breed?.children??breed?.family??3,otherDogs:breed?.otherDogs??3,
    apartment:breed?.apartment??3,grooming:breed?.grooming??3,shedding:breed?.shedding??3,preyDrive:breed?.preyDrive??3,
    intro:breed?.intro??"",character:breed?.character??"",needs:breed?.needs??"",history:breed?.history??"",exercise:breed?.exercise??"",
    training:breed?.training??"",health:breed?.health??"",healthRisks:breed?.healthRisks?.join("\n")??"",goodFor:breed?.goodFor.join("\n")??"",
    consider:breed?.consider.join("\n")??"",editorial:breed?.editorial??{},sports:breed?.sports??[],relatedBreedIds:breed?.relatedBreedIds??[],relatedArticleIds:breed?.relatedArticleIds??[],directoryProfileIds:breed?.directoryProfileIds??[],sources:breed?.sources?.length?breed.sources:[{...emptySource}],accent:breed?.accent??"forest",seo:breed?.seo??{},
  });
  const [dirty,setDirty]=useState(false);
  const formEditRevisionRef = useRef(0);
  const setForm: typeof setCanonicalForm = (update) => { formEditRevisionRef.current += 1; setDirty(true); setCanonicalForm(update); };
  const slugEdited = Boolean(breed);
  const [expectedUpdatedAt,setExpectedUpdatedAt]=useState(breed?.updatedAt??"");
  const [saving,setSaving]=useState(false);
  const savePendingRef=useRef(false);
  const [uploading,setUploading]=useState(false);
  const uploadPending = useRef(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [activeBreedSection,setActiveBreedSection]=useState("breed-basic");
  const chooseBreedSection = useProfileEditorSectionPager(activeBreedSection, setActiveBreedSection);
  const [sportDraft,setSportDraft]=useState<SportDraft|null>(null);
  const [sportError,setSportError]=useState("");

  const change=(key:keyof typeof form,value:(typeof form)[keyof typeof form])=>setForm((current)=>({...current,[key]:value}));
  function changeName(value:string){change("name",value);if(!slugEdited)change("slug",slugify(value));}
  function updateSource(index:number,patch:Partial<BreedSource>){setForm((current)=>({...current,sources:current.sources.map((item,i)=>i===index?{...item,...patch}:item)}));}
  function updateFci(key:keyof FciStandard,value:string){setForm((current)=>({...current,fciStandard:{...current.fciStandard,[key]:value}}));}
  function updateEditorial(key:keyof typeof form.editorial,value:string){setForm((current)=>({...current,editorial:{...current.editorial,[key]:value}}));}
  async function uploadCover(event:File|ChangeEvent<HTMLInputElement>){const file=adminSelectedImage(event);if(!file||uploadPending.current||saving)return;uploadPending.current=true;setUploading(true);setError("");try{const result=await uploadAdminImage(file,"breeds");setForm((current)=>({...current,image:result.imageUrl,imageKey:result.imageKey}));setMessage(adminImageUploadMessage(result,"Ulož plemeno, aby sa titulná fotografia priradila."));}catch(e){setError(e instanceof Error?e.message:"Obrázok sa nepodarilo nahrať.");}finally{uploadPending.current=false;setUploading(false);}}
  async function uploadGallery(event: ChangeEvent<HTMLInputElement> | File[]) {
    const files = Array.isArray(event) ? event : Array.from(event.target.files ?? []);
    if (!Array.isArray(event)) event.target.value = "";
    if (!files.length || uploadPending.current || saving) return;
    const remaining = Math.max(0, 30 - form.gallery.length);
    if (files.length > remaining) { setError(`Vyber najviac ${remaining} ďalších fotografií. Galéria plemena má limit 30.`); return; }
    uploadPending.current = true;
    setUploading(true); setError(""); setMessage("");
    let added = 0;
    const failures: string[] = [];
    try {
      for (const file of files) {
        try {
          const result = await uploadAdminImage(file, "breeds");
          const image: BreedImage = {imageUrl:result.imageUrl,imageKey:result.imageKey,alt:form.name ? `${form.name} – ďalšia fotografia` : "Fotografia plemena",caption:"",credit:""};
          // Commit each successful result immediately. A later failed file must not orphan it.
          setForm((current) => ({...current,gallery:[...current.gallery,image]}));
          added++;
        } catch (caught) {
          failures.push(`${file.name}: ${caught instanceof Error ? caught.message : "Nahratie zlyhalo."}`);
        }
      }
      setMessage(`${added} fotografií bolo nahraných. Ulož plemeno, aby sa priradili.`);
      setError(failures.join(" "));
    } finally { uploadPending.current = false; setUploading(false); }
  }
  function updateGallery(index:number,patch:Partial<BreedImage>){setForm((current)=>({...current,gallery:current.gallery.map((item,i)=>i===index?{...item,...patch}:item)}));}
  function moveGallery(index:number,direction:-1|1){setForm((current)=>{const gallery=[...current.gallery];const target=index+direction;if(target<0||target>=gallery.length)return current;[gallery[index],gallery[target]]=[gallery[target],gallery[index]];return {...current,gallery};});}

  function openNewSport(){
    const next=sportOptions.find(([key])=>!form.sports.some((item)=>item.key===key));
    setSportError("");
    setSportDraft({index:null,key:next?.[0]??"",label:next?.[1]??"",rating:3,note:""});
  }
  function openSport(index:number){const sport=form.sports[index];setSportError("");setSportDraft({index,key:sport.key,label:sport.label,rating:sport.rating,note:sport.note??""});}
  function saveSport(){
    if(!sportDraft)return;
    const key=sportDraft.key.trim();const label=sportDraft.label.trim();const rating=Number(sportDraft.rating);
    if(!key||!label){setSportError("Šport musí mať interný kľúč a názov.");return;}
    if(!Number.isFinite(rating)||rating<1||rating>5){setSportError("Vhodnosť športu musí byť číslo od 1 do 5.");return;}
    if(form.sports.some((item,index)=>item.key===key&&index!==sportDraft.index)){setSportError("Tento šport je už v zozname.");return;}
    const next:BreedSport={key,label,rating,note:sportDraft.note.trim()};
    setForm((current)=>({...current,sports:sportDraft.index===null?[...current.sports,next]:current.sports.map((item,index)=>index===sportDraft.index?next:item)}));
    setSportDraft(null);setSportError("");
  }
  function moveSport(index:number,direction:-1|1){setForm((current)=>{const sports=[...current.sports];const target=index+direction;if(target<0||target>=sports.length)return current;[sports[index],sports[target]]=[sports[target],sports[index]];return {...current,sports};});}
  function removeSport(index:number){setForm((current)=>({...current,sports:current.sports.filter((_,itemIndex)=>itemIndex!==index)}));}

  async function save(status:"draft"|"published"){
    if (saving || savePendingRef.current || uploadPending.current) return;
    // Native required controls cannot focus inside a temporarily hidden
    // section. Apply the existing essential required-field rules explicitly
    // and reveal the right section rather than silently submitting an error.
    if (!form.name.trim()) {
      chooseBreedSection("breed-basic");
      setError("Vyplň názov plemena.");
      return;
    }
    if (!form.slug.trim()) {
      chooseBreedSection("breed-basic");
      setError("Plemeno potrebuje platnú URL adresu vytvorenú z názvu.");
      return;
    }
    const submittedRevision = formEditRevisionRef.current;
    savePendingRef.current=true;
    setSaving(true);setError("");setMessage("");
    try{
      const response=await fetch(breed?`/api/admin/breeds/${breed.id}`:"/api/admin/breeds",{
        method:breed?"PUT":"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({...form,fciNumber:form.fciNumber?Number(form.fciNumber):null,validStandardDate:form.validStandardDate||null,importKey:form.importKey||null,status,family:form.children,healthRisks:lines(form.healthRisks),goodFor:lines(form.goodFor),consider:lines(form.consider),sources:form.sources.filter((item)=>item.label.trim()&&item.url.trim()),...(breed?{expectedUpdatedAt}:{})})
      });
      const data=await response.json() as {breed?:ManagedBreed;error?:string;notionEditorialWriteback?:{status:string;code?:string}};
      if(!response.ok||!data.breed)throw new Error(data.error||"Plemeno sa nepodarilo uložiť.");
      setExpectedUpdatedAt(data.breed.updatedAt);
      setCanonicalForm((current)=>({...current,status:data.breed!.status}));
      if (formEditRevisionRef.current === submittedRevision) setDirty(false);
      const notionStatus=data.notionEditorialWriteback?.status;
      const notionPending=notionStatus==="pending" ||
        notionStatus==="workcopy-inactive" ||
        notionStatus==="not-linked" || notionStatus==="disabled";
      setMessage(notionPending
        ? "Plemeno je uložené v Admine, ale prenos do Notionu zatiaľ nie je potvrdený."
        : status==="published"?"Plemeno je publikované v atlase.":"Koncept je uložený.");
      if(!breed)router.replace(`/admin/plemena/${data.breed.id}`);
    }catch(e){setError(e instanceof Error?e.message:"Plemeno sa nepodarilo uložiť.");}
    finally{savePendingRef.current=false;setSaving(false);}
  }

  const editorNavigation=[
    {id:"breed-basic",label:"Základ"},
    {id:"breed-overview",label:"Odborný profil"},
    {id:"breed-character",label:"Charakter"},
    {id:"breed-practical",label:"Pohyb a život"},
    {id:"breed-health",label:"Zdravie"},
    {id:"breed-sports",label:"Športy"},
    {id:"breed-media",label:"Fotografie"},
  ];
  const scoreFields=[
    ["energy","Úroveň energie"],["trainability","Cvičiteľnosť"],["children","Vzťah k deťom"],["otherDogs","Vzťah k iným psom"],
    ["apartment","Vhodnosť do bytu"],["grooming","Náročnosť starostlivosti"],["shedding","Pĺznutie"],["preyDrive","Lovecký inštinkt"],
  ] as const;

  // Only the independent FCI leaf cells of the approved 60-field Notion layout.
  const fciSections:Array<{title:string;fields:Array<[FciStandardTextKey,string]>}>=[
    {title:"Vzhľad a povaha",fields:[["celkovy_vzhlad","FCI celkový vzhľad"],["dolezite_proporcie","FCI proporcie"],["povaha_temperament","FCI povaha a temperament"]]},
    {title:"Stavba, pohyb a srsť",fields:[["hlava_lebecna_cast","FCI lebka"],["telo","FCI telo"],["predne_koncatiny","FCI predné končatiny"],["zadne_koncatiny","FCI zadné končatiny"],["pohyb","FCI pohyb"],["srst","FCI srsť"],["farba","FCI farba"]]},
    {title:"Rozmery a chyby",fields:[["vyska_pes_cm","FCI výška pes cm"],["vyska_suka_cm","FCI výška suka cm"],["hmotnost_pes_kg","FCI hmotnosť pes kg"],["hmotnost_suka_kg","FCI hmotnosť suka kg"],["chyby","FCI chyby"],["zavazne_chyby","FCI závažné chyby"],["diskvalifikacne_chyby","FCI diskvalifikačné chyby"]]},
  ];

  return <>
    <EditorWorkspace
      mode="page"
      title={breed ? `Upraviť plemeno: ${form.name || breed.name}` : "Nové plemeno"}
      description="Polia podľa novej 60-poľovej databázy Notion; FCI a SEO sú v nastaveniach."
      status={<><EditorStatus label={form.status === "published" ? "Publikované" : "Koncept"} tone={form.status === "published" ? "success" : "neutral"} /><EditorStatus label={dirty ? "Neuložené zmeny" : "Uložené"} tone={dirty ? "warning" : "success"} /></>}
      sections={editorNavigation}
      sectionMode="switch"
      activeSectionId={activeBreedSection}
      onSectionChange={setActiveBreedSection}
      dirty={dirty}
      onClose={()=>{ setDirty(false); router.push("/admin/plemena"); }}
      closeLabel="Späť na plemená"
      actions={<EditorActionBar
        message={<span role="status">{dirty ? "Neuložené zmeny" : "Všetky zmeny uložené"}</span>}
        secondary={<AdminActionButton variant="neutral" onClick={()=>setSettingsOpen(true)}>Nastavenia, FCI a SEO</AdminActionButton>}
        primary={<>
          <AdminActionButton variant="secondary" type="submit" form="breed-canonical-editor-form" disabled={saving||uploading}>{saving?"Ukladám…":form.status==="published"?"Uložiť zmeny":"Uložiť koncept"}</AdminActionButton>
          <AdminActionButton variant="primary" disabled={saving||uploading} onClick={()=>void save("published")}>{saving?"Ukladám…":form.status==="published"?"Uložiť a aktualizovať":"Publikovať"}</AdminActionButton>
        </>}
      />}
    >
    <form id="breed-canonical-editor-form" inert={saving} aria-busy={saving} noValidate className={`admin-breed-editor ${styles.editorForm}`} data-admin-breed-editor-ready={hydrated ? "true" : "false"} onSubmit={(event)=>{event.preventDefault();void save(form.status==="published"?"published":"draft");}}>
    <AdminFormFeedback message={message} error={error} pending={saving} errorClassName="admin-form-error" successClassName="admin-flash" />
    <div className={styles.editorTopbar}>
      <div>
        <strong>{breed ? "Plemeno #" + breed.id : "Nový profil plemena"}</strong>
        <p>Úpravy všetkých sekcií sa uložia spoločne.</p>
      </div>
      <div className={styles.editorStats} aria-label="Prehľad vyplnenia">
        <span>{form.sports.length} športov</span>
      </div>
    </div>

    <AdminEditorSection id="breed-basic" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Základné údaje</h2><p>Identita plemena a údaje, ktoré redaktor používa najčastejšie.</p></div></div>
        <div className="admin-field-grid">
          <label className="admin-field"><span>Názov plemena</span><input required value={form.name} onChange={(e)=>changeName(e.target.value)}/></label>
          <div className="admin-field"><span>Krajina pôvodu</span><CountryChoices value={form.origin} onChange={next=>change("origin",next)}/></div>
          <label className="admin-field"><span>FCI číslo</span><input type="number" min="1" max="9999" value={form.fciNumber} onChange={(e)=>change("fciNumber",e.target.value)}/></label>
          <label className="admin-field"><span>FCI skupina</span><select aria-label="FCI skupina" value={form.fciGroup} onChange={e=>change("fciGroup",Number(e.target.value))}>{FCI_GROUP_OPTIONS.map(([number,label])=><option value={number} key={number}>{number}. {label}</option>)}</select></label>
          <label className="admin-field"><span>FCI sekcia</span><input value={form.fciSection} onChange={(e)=>change("fciSection",e.target.value)}/></label>

          <label className="admin-field"><span>Veľkosť</span><select value={form.size} onChange={e=>change("size",e.target.value)}>
  <option value="">Nevyplnené</option>
  {form.size && !BREED_SIZE_OPTIONS.includes(form.size) && <option value={form.size}>Pôvodný údaj: {form.size}</option>}
  {BREED_SIZE_OPTIONS.map(size=><option key={size} value={size}>{size}</option>)}
</select></label>
          <label className="admin-field"><span>Hmotnosť</span><input aria-invalid={measurementHasError(form.weight,"weight")} aria-describedby={measurementMessage(form.weight,"weight") ? "breed-weight-feedback" : undefined} inputMode="decimal" value={form.weight} onChange={(e)=>controlledNumericChange(e.target.value,form.weight,"weight",next=>change("weight",next))}/><AdminFieldFeedback id="breed-weight-feedback" message={measurementMessage(form.weight,"weight")} invalid={measurementHasError(form.weight,"weight")} className="admin-field-warning" /></label>
          <label className="admin-field"><span>Výška v kohútiku</span><input aria-invalid={measurementHasError(form.height,"height")} aria-describedby={measurementMessage(form.height,"height") ? "breed-height-feedback" : undefined} inputMode="decimal" value={form.height} onChange={(e)=>controlledNumericChange(e.target.value,form.height,"height",next=>change("height",next))}/><AdminFieldFeedback id="breed-height-feedback" message={measurementMessage(form.height,"height")} invalid={measurementHasError(form.height,"height")} className="admin-field-warning" /></label>
          <label className="admin-field"><span>Dĺžka života</span><input aria-invalid={measurementHasError(form.lifespan,"lifespan")} aria-describedby={measurementMessage(form.lifespan,"lifespan") ? "breed-lifespan-feedback" : undefined} inputMode="decimal" value={form.lifespan} onChange={(e)=>controlledNumericChange(e.target.value,form.lifespan,"lifespan",next=>change("lifespan",next))}/><AdminFieldFeedback id="breed-lifespan-feedback" message={measurementMessage(form.lifespan,"lifespan")} invalid={measurementHasError(form.lifespan,"lifespan")} className="admin-field-warning" /></label>
          <label className="admin-field"><span>Srsť</span><input value={form.coat} onChange={(e)=>change("coat",e.target.value)}/></label>
          <label className="admin-field"><span>Oficiálny FCI názov</span><input value={form.officialFciName} onChange={(e)=>change("officialFciName",e.target.value)}/></label>
        </div>
      </div>
    </AdminEditorSection>

    <AdminEditorSection id="breed-overview" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Prehľad</h2><p>Úvod a redakčný kontext verejného profilu.</p></div></div>
        <label className="admin-field"><span>Krátky úvod v hero (2–4 vety)</span><AdminLexicalTextField rows={4} value={form.intro} onChange={(next)=>change("intro",next)} ariaLabel="Krátky úvod v hero (2–4 vety)" /></label>
        <label className="admin-field"><span>Prehľad plemena</span><AdminLexicalTextField rows={6} value={form.editorial.overview??""} onChange={(next)=>updateEditorial("overview",next)} ariaLabel="Prehľad plemena" /></label>
        <label className="admin-field"><span>História</span><AdminLexicalTextField rows={6} value={form.history} onChange={(next)=>change("history",next)} ariaLabel="História" /></label><AdminLexicalAppendButton disabled={saving} onAppend={text=>change("history",appendLexicalPlainText(form.history,text))}/>
      </div>
    </AdminEditorSection>

    <AdminEditorSection id="breed-character" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Charakter</h2><p>Povaha a redakčne potvrdené škály 1–5.</p></div></div>
        <label className="admin-field"><span>Povaha</span><AdminLexicalTextField rows={7} value={form.character} onChange={(next)=>change("character",next)} ariaLabel="Povaha" /></label>
        <label className="admin-check"><input type="checkbox" checked={form.editorialComplete} onChange={(e)=>change("editorialComplete",e.target.checked)}/><span>Praktický redakčný profil je skontrolovaný a môže sa verejne zobrazovať</span></label>
        <div className="admin-breed-score-grid">{scoreFields.map(([key,label])=><label className="admin-field" key={key}><span>{label}</span><input type="number" min="1" max="5" value={form[key]} onChange={(e)=>change(key,Number(e.target.value))}/></label>)}</div>
      </div>
    </AdminEditorSection>

    <AdminEditorSection id="breed-practical" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Praktický obsah, výcvik a starostlivosť</h2><p>Každodenné potreby, pohyb, výcvik, srsť a život v domácnosti.</p></div></div>
        <label className="admin-field"><span>Potreba pohybu</span><AdminLexicalTextField rows={6} value={form.exercise} onChange={(next)=>change("exercise",next)} ariaLabel="Potreba pohybu" /></label>
        <label className="admin-field"><span>Výcvik</span><AdminLexicalTextField rows={6} value={form.training} onChange={(next)=>change("training",next)} ariaLabel="Výcvik" /></label>
        <div className="admin-field-grid">
          <label className="admin-field"><span>Redakcia starostlivosť o srsť</span><AdminLexicalTextField rows={5} value={form.editorial.coatCare??""} onChange={(next)=>updateEditorial("coatCare",next)} ariaLabel="Redakcia starostlivosť o srsť" /></label>
          <label className="admin-field"><span>Redakcia život v rodine</span><AdminLexicalTextField rows={5} value={form.editorial.familyLife??""} onChange={(next)=>updateEditorial("familyLife",next)} ariaLabel="Redakcia život v rodine" /></label>
          <label className="admin-field"><span>Redakcia spolužitie so psami</span><AdminLexicalTextField rows={5} value={form.editorial.otherDogsLife??""} onChange={(next)=>updateEditorial("otherDogsLife",next)} ariaLabel="Redakcia spolužitie so psami" /></label>
        </div>
        <label className="admin-field"><span>Pre koho sa hodí — jedna položka na riadok</span><AdminLexicalTextField rows={4} value={form.goodFor} onChange={(next)=>change("goodFor",next)} ariaLabel="Pre koho sa hodí — jedna položka na riadok" /></label>
        <label className="admin-field"><span>Na čo si dať pozor — jedna položka na riadok</span><AdminLexicalTextField rows={4} value={form.consider} onChange={(next)=>change("consider",next)} ariaLabel="Na čo si dať pozor — jedna položka na riadok" /></label>
        <label className="admin-field"><span>Zaujímavosti</span><AdminLexicalTextField rows={4} value={form.editorial.curiosities??""} onChange={(next)=>updateEditorial("curiosities",next)} ariaLabel="Zaujímavosti" /></label>
        <label className="admin-field"><span>Časté chyby majiteľov</span><AdminLexicalTextField rows={4} value={form.editorial.commonOwnerMistakes??""} onChange={(next)=>updateEditorial("commonOwnerMistakes",next)} ariaLabel="Časté chyby majiteľov" /></label>
      </div>
    </AdminEditorSection>

    <AdminEditorSection id="breed-health" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Zdravie</h2><p>Zverejňuj iba odborne overený obsah; editor nepridáva žiadne odvodené zdravotné tvrdenia.</p></div></div>
        <label className="admin-field"><span>Zdravie</span><AdminLexicalTextField rows={7} value={form.health} onChange={(next)=>change("health",next)} ariaLabel="Zdravie" /></label>
        <label className="admin-field"><span>Typické zdravotné riziká — jedna položka na riadok</span><AdminLexicalTextField rows={5} value={form.healthRisks} onChange={(next)=>change("healthRisks",next)} ariaLabel="Typické zdravotné riziká — jedna položka na riadok" /></label>
      </div>
    </AdminEditorSection>

    <AdminEditorSection id="breed-sports" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Športy a aktivity</h2><p>Upravuj vhodnosť a poradie aktivít. Každý šport má byť v profile iba raz.</p></div><AdminActionButton variant="secondary" onClick={openNewSport}>+ Pridať šport</AdminActionButton></div>
        <div className={styles.sportsList}>
          {form.sports.map((sport,index)=><article className={styles.sportRow} key={`${sport.key}-${index}`}>
            <strong>{sport.label}</strong><span className={styles.sportRating}>Vhodnosť {sport.rating}/5</span>{sport.note ? <p>{sport.note}</p> : <span className={styles.sportEmpty}>Bez poznámky</span>}
            <div className={styles.sportActions}>
              <AdminActionButton variant="neutral" onClick={()=>moveSport(index,-1)} disabled={index===0} aria-label={`Posunúť ${sport.label} vyššie`}>↑</AdminActionButton>
              <AdminActionButton variant="neutral" onClick={()=>moveSport(index,1)} disabled={index===form.sports.length-1} aria-label={`Posunúť ${sport.label} nižšie`}>↓</AdminActionButton>
              <AdminActionButton variant="secondary" onClick={()=>openSport(index)}>Upraviť</AdminActionButton>
              <AdminActionButton variant="destructive" onClick={()=>removeSport(index)}>Odstrániť</AdminActionButton>
            </div>
          </article>)}
          {!form.sports.length&&<p>Bez redakčne priradených športov.</p>}
        </div>
      </div>
    </AdminEditorSection>

    <AdminEditorSection id="breed-media" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Fotografie</h2><p>Titulná fotografia a galéria nad existujúcim image contractom.</p></div></div>
        <div className={styles.mediaGrid}>
          <div className={styles.coverPreview}>{form.image?<img src={form.image} alt={`Náhľad: ${form.name||"plemeno"}`} loading="lazy" decoding="async" srcSet={responsiveMediaSrcSet(form.image, [320, 480, 640])} sizes="(max-width: 680px) 92vw, 480px"/>:<span>Bez fotografie<br/>verejne sa použije fallback</span>}</div>
          <div className={styles.mediaActions}>
            <div className="admin-field"><span>Titulná fotografia (JPG, PNG, WebP alebo AVIF do 8 MB)</span><AdminSingleImageUpload label={form.image?"Vybrať inú titulnú fotografiu":"Nahrať titulnú fotografiu"} onFile={uploadCover} disabled={saving} busy={uploading} onRejected={setError}/><small>{uploading?"Nahrávam…":form.image||"Zatiaľ bez fotografie"}</small></div>
            {form.image&&<AdminActionButton variant="destructive" onClick={()=>setForm((current)=>({...current,image:"",imageKey:""}))}>Odstrániť titulnú fotografiu</AdminActionButton>}
            <AdminHelpText>Vyber zdrojovú fotografiu s rezervou okolo psa; focal-point schema zatiaľ neexistuje, preto tesný crop nie je možné v admine bezpečne korigovať.</AdminHelpText>
            <div className="admin-field"><span>Ďalšie fotografie</span><AdminGalleryDropzone label="Nahrať fotografie plemena" disabled={uploading||saving||form.gallery.length>=30} busy={uploading} onFiles={uploadGallery} onRejected={setError}/></div>
          </div>
        </div>
        <AdminSortableGallery urls={form.gallery.map(item=>item.imageUrl)} as="article"
          className={styles.galleryList} rowClassName={styles.galleryRow} disabled={uploading||saving}
          onReorder={(from,to)=>setForm(current=>({...current,gallery:arrayMove(current.gallery,from,to)}))}
          renderRow={(index,handle)=>{const item=form.gallery[index];return <><img src={item.imageUrl} alt={item.alt||"Náhľad"} loading="lazy" decoding="async" srcSet={responsiveMediaSrcSet(item.imageUrl, [160, 320, 480])} sizes="(max-width: 680px) 44vw, 160px"/><div><label className="admin-field"><span>Alt text</span><input value={item.alt} onChange={(e)=>updateGallery(index,{alt:e.target.value})}/></label><label className="admin-field"><span>Popis</span><input value={item.caption} onChange={(e)=>updateGallery(index,{caption:e.target.value})}/></label><label className="admin-field"><span>Kredit / zdroj</span><input value={item.credit} onChange={(e)=>updateGallery(index,{credit:e.target.value})}/></label></div><div className={styles.galleryActions}>{handle}<AdminActionButton variant="neutral" onClick={()=>moveGallery(index,-1)} disabled={index===0}>↑</AdminActionButton><AdminActionButton variant="neutral" onClick={()=>moveGallery(index,1)} disabled={index===form.gallery.length-1}>↓</AdminActionButton><AdminActionButton variant="destructive" onClick={()=>change("gallery",form.gallery.filter((_,i)=>i!==index))}>Odstrániť</AdminActionButton></div></>;}}/>
      </div>
    </AdminEditorSection>

    <div data-admin-editor-pager className={styles.sectionPager} aria-label="Prechod medzi sekciami plemena">
      <AdminActionButton variant="neutral" disabled={editorNavigation[0].id===activeBreedSection}
        onClick={()=>chooseBreedSection(editorNavigation[Math.max(0,editorNavigation.findIndex(item=>item.id===activeBreedSection)-1)].id)}>
        ← Predchádzajúca
      </AdminActionButton>
      <span>{editorNavigation.findIndex(item=>item.id===activeBreedSection)+1} / {editorNavigation.length}</span>
      <AdminActionButton variant="secondary" disabled={editorNavigation[editorNavigation.length-1].id===activeBreedSection}
        onClick={()=>chooseBreedSection(editorNavigation[Math.min(editorNavigation.length-1,editorNavigation.findIndex(item=>item.id===activeBreedSection)+1)].id)}>
        Ďalšia →
      </AdminActionButton>
    </div>


    <AdminDrawer
      open={settingsOpen}
      title="Nastavenia plemena"
      description="Rozšírený FCI štandard, odborné zdroje a dve SEO polia podľa novej Notion databázy."
      onClose={()=>setSettingsOpen(false)}
      footer={<div className={styles.drawerFooter}><AdminActionButton variant="primary" data-admin-autofocus="true" onClick={()=>setSettingsOpen(false)}>Hotovo</AdminActionButton></div>}
    >
      <div className={styles.drawerFields}>
        <section className={styles.drawerSection}><h3>FCI referencia podľa Notionu</h3><label className="admin-field"><span>FCI štandard PDF</span><input type="url" value={form.fciStandard.fci_standard_pdf??""} onChange={(e)=>updateFci("fci_standard_pdf",e.target.value)}/></label><label className="admin-field"><span>FCI zdroj poznámka</span><textarea rows={4} value={form.fciStandard.zdroj_poznamka??""} onChange={(e)=>updateFci("zdroj_poznamka",e.target.value)}/></label></section>
        <section className={styles.drawerSection}><h3>FCI odborný štandard</h3><AdminHelpText>Tu sú iba samostatné odborné polia zo schváleného 60-poľového modelu Notion.</AdminHelpText>{fciSections.map((section)=><details className={styles.fciGroup} key={section.title}><summary>{section.title}</summary><div>{section.fields.map(([key,label])=><label className="admin-field" key={key}><span>{label}</span><textarea rows={5} value={form.fciStandard[key]??""} onChange={(e)=>updateFci(key,e.target.value)}/></label>)}</div></details>)}</section>
        <section className={styles.drawerSection}><h3>Zdroje</h3>{form.sources.map((source,index)=><div className={styles.sourceRow} key={index}><label className="admin-field"><span>Názov zdroja</span><input value={source.label} onChange={(e)=>updateSource(index,{label:e.target.value})}/></label><label className="admin-field"><span>URL zdroja</span><input type="url" value={source.url} onChange={(e)=>updateSource(index,{url:e.target.value})}/></label><AdminActionButton variant="destructive" onClick={()=>change("sources",form.sources.filter((_,i)=>i!==index))}>Odstrániť</AdminActionButton></div>)}<AdminActionButton variant="secondary" onClick={()=>change("sources",[...form.sources,{...emptySource}])}>+ Pridať zdroj</AdminActionButton></section>
        <section className={styles.drawerSection}><h3>SEO podľa Notionu</h3><label className="admin-field"><span>SEO title</span><input value={form.seo.title??""} onChange={(e)=>change("seo",{...form.seo,title:e.target.value})}/></label><label className="admin-field"><span>Meta description</span><textarea rows={4} value={form.seo.description??""} onChange={(e)=>change("seo",{...form.seo,description:e.target.value})}/></label></section>
      </div>
    </AdminDrawer>

    <AdminDrawer
      open={sportDraft!==null}
      title={sportDraft?.index===null?"Pridať šport":"Upraviť šport"}
      description="Úprava používa existujúci BreedSport contract: key, label, rating a note."
      onClose={()=>{setSportDraft(null);setSportError("");}}
      footer={<div className={styles.drawerFooter}><AdminActionButton variant="neutral" onClick={()=>{setSportDraft(null);setSportError("");}}>Zrušiť</AdminActionButton><AdminActionButton variant="primary" data-admin-autofocus="true" onClick={saveSport}>Uložiť šport</AdminActionButton></div>}
    >
      {sportDraft&&<div className={styles.drawerFields}>
        <label className="admin-field"><span>Šport</span><select value={sportDraft.key} onChange={(e)=>{const selected=sportOptions.find(([key])=>key===e.target.value);setSportDraft((current)=>current?{...current,key:e.target.value,label:selected?.[1]??current.label}:current);}} disabled={sportDraft.index!==null}><option value="">Vyber šport</option>{sportOptions.map(([key,label])=><option value={key} key={key} disabled={form.sports.some((item,index)=>item.key===key&&index!==sportDraft.index)}>{label}</option>)}</select></label>
        <label className="admin-field"><span>Názov</span><input value={sportDraft.label} onChange={(e)=>setSportDraft((current)=>current?{...current,label:e.target.value}:current)}/></label>
        <label className="admin-field"><span>Vhodnosť 1–5</span><input type="number" min="1" max="5" value={sportDraft.rating} onChange={(e)=>setSportDraft((current)=>current?{...current,rating:Number(e.target.value)}:current)}/></label>
        <label className="admin-field"><span>Krátka poznámka</span><textarea rows={4} value={sportDraft.note} onChange={(e)=>setSportDraft((current)=>current?{...current,note:e.target.value}:current)}/></label>
        {sportError&&<p className={styles.validation} role="alert">{sportError}</p>}
      </div>}
    </AdminDrawer>
    </form>
    </EditorWorkspace>
  </>;
}
