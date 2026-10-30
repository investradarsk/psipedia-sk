"use client";
import {AdminSingleImageUpload} from "@/components/admin-single-image-upload";
import {adminSelectedImage} from "@/lib/admin-selected-image";
import { AdminLexicalTextField } from "@/components/admin-lexical-text-field";
import { AdminLexicalAppendButton } from "@/components/admin-lexical-append-button";
import { appendLexicalPlainText } from "@/lib/editorial-lexical-append";

import { useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import type { BreedEditorOptions, BreedHeroTrait, BreedSport, ManagedBreed } from "@/lib/breed-store";
import type { BreedImage, BreedSource } from "@/lib/content";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { AdminSeoFields } from "@/components/admin-seo-fields";
import { AdminFieldFeedback, AdminFormFeedback } from "@/components/admin-form-feedback";
import { breedSeoFallback } from "@/lib/content-seo";
import { inspectBreedMeasurement, type BreedMeasurementKind, type FciStandard, type FciStandardTextKey } from "@/lib/breed-fci";
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
function normalized(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("sk");}
function filterNamedOptions<T extends {name:string}>(items:T[],query:string){const needle=normalized(query.trim());return !needle?items:items.filter((item)=>normalized(item.name).includes(needle));}
const emptySource:BreedSource={label:"",url:""};
const sportOptions=[
  ["obedience","Obedience"],["rally-obedience","Rally obedience"],["agility","Agility"],["canicross","Canicross"],
  ["bikejoring","Bikejöring"],["turistika","Turistika"],["nosework","Nosework"],["stopovanie","Stopovanie"],
  ["mantrailing","Mantrailing"],["field-trials","Field trials / retriever work"],["polovnictvo","Poľovnícke využitie"],
  ["pasenie","Pasenie"],["coursing","Coursing"],["dog-dancing","Dog dancing"],["zachranarcina","Záchranárčina"],
] as const;

type SportDraft={index:number|null;key:string;label:string;rating:number;note:string};
const subscribeToHydration=()=>()=>{};

export function AdminBreedEditor({ breed,options }: { breed?: ManagedBreed;options:BreedEditorOptions }) {
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
  const setForm: typeof setCanonicalForm = (update) => { setDirty(true); setCanonicalForm(update); };
  const [slugEdited,setSlugEdited]=useState(Boolean(breed));
  const [expectedUpdatedAt,setExpectedUpdatedAt]=useState(breed?.updatedAt??"");
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const uploadPending = useRef(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [sportDraft,setSportDraft]=useState<SportDraft|null>(null);
  const [sportError,setSportError]=useState("");
  const [articleQuery,setArticleQuery]=useState("");
  const [stationQuery,setStationQuery]=useState("");
  const [clubQuery,setClubQuery]=useState("");
  const [breedQuery,setBreedQuery]=useState("");

  const change=(key:keyof typeof form,value:(typeof form)[keyof typeof form])=>setForm((current)=>({...current,[key]:value}));
  function changeName(value:string){change("name",value);if(!slugEdited)change("slug",slugify(value));}
  function updateSource(index:number,patch:Partial<BreedSource>){setForm((current)=>({...current,sources:current.sources.map((item,i)=>i===index?{...item,...patch}:item)}));}
  function updateFci(key:keyof FciStandard,value:string){setForm((current)=>({...current,fciStandard:{...current.fciStandard,[key]:value}}));}
  function updateEditorial(key:keyof typeof form.editorial,value:string){setForm((current)=>({...current,editorial:{...current.editorial,[key]:value}}));}
  function updateHeroTrait(index:number,patch:Partial<BreedHeroTrait>){setForm((current)=>{const traits=[...(current.editorial.heroTraits??[])];while(traits.length<=index)traits.push({label:"",rating:3});traits[index]={...traits[index],...patch};return {...current,editorial:{...current.editorial,heroTraits:traits}};});}
  function toggleId(key:"relatedBreedIds"|"relatedArticleIds"|"directoryProfileIds",id:number){setForm((current)=>({...current,[key]:current[key].includes(id)?current[key].filter((item)=>item!==id):[...current[key],id]}));}

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
    if (saving || uploadPending.current) return;
    setSaving(true);setError("");setMessage("");
    try{
      const response=await fetch(breed?`/api/admin/breeds/${breed.id}`:"/api/admin/breeds",{
        method:breed?"PUT":"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({...form,fciNumber:form.fciNumber?Number(form.fciNumber):null,validStandardDate:form.validStandardDate||null,importKey:form.importKey||null,status,family:form.children,healthRisks:lines(form.healthRisks),goodFor:lines(form.goodFor),consider:lines(form.consider),sources:form.sources.filter((item)=>item.label.trim()&&item.url.trim()),...(breed?{expectedUpdatedAt}:{})})
      });
      const data=await response.json() as {breed?:ManagedBreed;error?:string};
      if(!response.ok||!data.breed)throw new Error(data.error||"Plemeno sa nepodarilo uložiť.");
      setExpectedUpdatedAt(data.breed.updatedAt);
      setCanonicalForm((current)=>({...current,status:data.breed!.status}));
      setDirty(false);
      setMessage(status==="published"?"Plemeno je publikované v atlase.":"Koncept je uložený.");
      if(!breed)window.setTimeout(()=>window.location.assign(`/admin/plemena/${data.breed.id}`),0);
    }catch(e){setError(e instanceof Error?e.message:"Plemeno sa nepodarilo uložiť.");}
    finally{setSaving(false);}
  }

  const editorNavigation=[
    {id:"breed-basic",label:"Základ"},
    {id:"breed-overview",label:"Prehľad"},
    {id:"breed-character",label:"Charakter"},
    {id:"breed-practical",label:"Praktické"},
    {id:"breed-health",label:"Zdravie"},
    {id:"breed-sports",label:"Športy"},
    {id:"breed-relations",label:"Prepojenia"},
    {id:"breed-media",label:"Fotografie"},
  ];
  const scoreFields=[
    ["energy","Úroveň energie"],["trainability","Cvičiteľnosť"],["children","Vzťah k deťom"],["otherDogs","Vzťah k iným psom"],
    ["apartment","Vhodnosť do bytu"],["grooming","Náročnosť starostlivosti"],["shedding","Pĺznutie"],["preyDrive","Lovecký inštinkt"],
  ] as const;
  const fciSections:Array<{title:string;fields:Array<[FciStandardTextKey,string]>}>=[
    {title:"História, vzhľad a povaha",fields:[["historicky_suhrn","Historický súhrn"],["celkovy_vzhlad","Celkový vzhľad"],["dolezite_proporcie","Dôležité proporcie"],["povaha_temperament","Povaha a temperament"],["vyuzitie","Využitie"]]},
    {title:"Hlava a telo",fields:[["hlava_lebecna_cast","Hlava – lebečná časť"],["hlava_tvarova_cast","Hlava – tvárová časť"],["oci","Oči"],["usi","Uši"],["krk","Krk"],["telo","Telo"],["chvost","Chvost"]]},
    {title:"Končatiny, pohyb a srsť",fields:[["predne_koncatiny","Predné končatiny"],["zadne_koncatiny","Zadné končatiny"],["pohyb","Pohyb"],["koza","Koža"],["srst","Srsť"],["farba","Farba"]]},
    {title:"Veľkosť a chyby",fields:[["vyska_pes_cm","Výška – pes"],["vyska_suka_cm","Výška – suka"],["hmotnost_pes_kg","Hmotnosť – pes"],["hmotnost_suka_kg","Hmotnosť – suka"],["velkost_hmotnost_poznamka","Poznámka k veľkosti"],["chyby","Chyby"],["zavazne_chyby","Závažné chyby"],["diskvalifikacne_chyby","Diskvalifikačné chyby"],["poznamka_chov","Poznámka k chovu"]]},
  ];

  const articles=useMemo(()=>{const needle=normalized(articleQuery.trim());return !needle?options.articles:options.articles.filter((item)=>normalized(item.title).includes(needle));},[articleQuery,options.articles]);
  const stations=useMemo(()=>filterNamedOptions(options.directoryProfiles.filter((item)=>item.category==="chovatelske-stanice"),stationQuery),[options.directoryProfiles,stationQuery]);
  const clubs=useMemo(()=>filterNamedOptions(options.directoryProfiles.filter((item)=>item.category==="chovatelske-kluby"),clubQuery),[options.directoryProfiles,clubQuery]);
  const relatedBreeds=useMemo(()=>filterNamedOptions(options.breeds.filter((item)=>item.id!==breed?.id),breedQuery),[options.breeds,breed?.id,breedQuery]);

  return <>
    <EditorWorkspace
      mode="page"
      title={breed ? `Upraviť plemeno: ${form.name || breed.name}` : "Nové plemeno"}
      description="Kanonický editor plemena vrátane FCI, médií a vzťahov."
      status={<><EditorStatus label={form.status === "published" ? "Publikované" : "Koncept"} tone={form.status === "published" ? "success" : "neutral"} /><EditorStatus label={dirty ? "Neuložené zmeny" : "Uložené"} tone={dirty ? "warning" : "success"} /></>}
      sections={editorNavigation}
      dirty={dirty}
      onClose={()=>{ setDirty(false); window.setTimeout(()=>window.location.assign("/admin/plemena"),0); }}
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
    <form id="breed-canonical-editor-form" className={`admin-breed-editor ${styles.editorForm}`} data-admin-breed-editor-ready={hydrated ? "true" : "false"} onSubmit={(event)=>{event.preventDefault();void save(form.status==="published"?"published":"draft");}}>
    <div className={styles.editorTopbar}>
      <p>{breed ? `ID ${breed.id} · ${form.status==="published"?"Publikované":"Koncept"}` : "Nový koncept plemena"}</p>
      
    </div>

    <AdminEditorSection id="breed-basic" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Základné údaje</h2><p>Identita plemena a údaje, ktoré redaktor používa najčastejšie.</p></div></div>
        <div className="admin-field-grid">
          <label className="admin-field"><span>Názov plemena</span><input required value={form.name} onChange={(e)=>changeName(e.target.value)}/></label>
          <label className="admin-field"><span>Krajina pôvodu</span><input value={form.origin} onChange={(e)=>change("origin",e.target.value)}/></label>
          <label className="admin-field"><span>FCI číslo</span><input type="number" min="1" max="9999" value={form.fciNumber} onChange={(e)=>change("fciNumber",e.target.value)}/></label>
          <label className="admin-field"><span>FCI skupina</span><input type="number" min="1" max="10" value={form.fciGroup} onChange={(e)=>change("fciGroup",Number(e.target.value))}/></label>
          <label className="admin-field"><span>FCI sekcia</span><input value={form.fciSection} onChange={(e)=>change("fciSection",e.target.value)}/></label>
          <label className="admin-field"><span>Číslo FCI sekcie</span><input value={form.fciSectionNumber} onChange={(e)=>change("fciSectionNumber",e.target.value)}/></label>
          <label className="admin-field"><span>Skupina / pôvodné využitie</span><input value={form.group} onChange={(e)=>change("group",e.target.value)}/></label>
          <label className="admin-field"><span>Veľkosť</span><input value={form.size} onChange={(e)=>change("size",e.target.value)}/></label>
          <label className="admin-field"><span>Hmotnosť</span><input aria-invalid={measurementHasError(form.weight,"weight")} aria-describedby={measurementMessage(form.weight,"weight") ? "breed-weight-feedback" : undefined} value={form.weight} onChange={(e)=>change("weight",e.target.value)}/><AdminFieldFeedback id="breed-weight-feedback" message={measurementMessage(form.weight,"weight")} invalid={measurementHasError(form.weight,"weight")} className="admin-field-warning" /></label>
          <label className="admin-field"><span>Výška v kohútiku</span><input aria-invalid={measurementHasError(form.height,"height")} aria-describedby={measurementMessage(form.height,"height") ? "breed-height-feedback" : undefined} value={form.height} onChange={(e)=>change("height",e.target.value)}/><AdminFieldFeedback id="breed-height-feedback" message={measurementMessage(form.height,"height")} invalid={measurementHasError(form.height,"height")} className="admin-field-warning" /></label>
          <label className="admin-field"><span>Dĺžka života</span><input aria-invalid={measurementHasError(form.lifespan,"lifespan")} aria-describedby={measurementMessage(form.lifespan,"lifespan") ? "breed-lifespan-feedback" : undefined} value={form.lifespan} onChange={(e)=>change("lifespan",e.target.value)}/><AdminFieldFeedback id="breed-lifespan-feedback" message={measurementMessage(form.lifespan,"lifespan")} invalid={measurementHasError(form.lifespan,"lifespan")} className="admin-field-warning" /></label>
          <label className="admin-field"><span>Srsť</span><input value={form.coat} onChange={(e)=>change("coat",e.target.value)}/></label>
        </div>
      </div>
    </AdminEditorSection>

    <AdminEditorSection id="breed-overview" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Prehľad</h2><p>Úvod a redakčný kontext verejného profilu.</p></div></div>
        <label className="admin-field"><span>Krátky úvod v hero (2–4 vety)</span><AdminLexicalTextField required rows={4} value={form.intro} onChange={(next)=>change("intro",next)} ariaLabel="intro" /></label>
        <label className="admin-field"><span>Prehľad plemena</span><AdminLexicalTextField rows={6} value={form.editorial.overview??""} onChange={(next)=>updateEditorial("overview",next)} ariaLabel="overview" /></label>
        <label className="admin-field"><span>História</span><AdminLexicalTextField rows={6} value={form.history} onChange={(next)=>change("history",next)} ariaLabel="history" /></label><AdminLexicalAppendButton disabled={saving} onAppend={text=>change("history",appendLexicalPlainText(form.history,text))}/>
        <h3>Tri hlavné vlastnosti v hero</h3>
        <AdminHelpText>Prázdne vlastnosti sa verejne nezobrazia.</AdminHelpText>
        <div className="admin-field-grid">{Array.from({length:3},(_,index)=>{const trait=form.editorial.heroTraits?.[index];return <div className="admin-field-grid" key={index}><label className="admin-field"><span>Vlastnosť {index+1}</span><input value={trait?.label??""} onChange={(e)=>updateHeroTrait(index,{label:e.target.value})}/></label><label className="admin-field"><span>Hodnotenie 1–5</span><input type="number" min="1" max="5" value={trait?.rating??3} onChange={(e)=>updateHeroTrait(index,{rating:Number(e.target.value)})}/></label></div>})}</div>
      </div>
    </AdminEditorSection>

    <AdminEditorSection id="breed-character" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Charakter</h2><p>Povaha a redakčne potvrdené škály 1–5.</p></div></div>
        <label className="admin-field"><span>Povaha</span><AdminLexicalTextField rows={7} value={form.character} onChange={(next)=>change("character",next)} ariaLabel="character" /></label>
        <label className="admin-check"><input type="checkbox" checked={form.editorialComplete} onChange={(e)=>change("editorialComplete",e.target.checked)}/><span>Praktický redakčný profil je skontrolovaný a môže sa verejne zobrazovať</span></label>
        <div className="admin-breed-score-grid">{scoreFields.map(([key,label])=><label className="admin-field" key={key}><span>{label}</span><input type="number" min="1" max="5" value={form[key]} onChange={(e)=>change(key,Number(e.target.value))}/></label>)}</div>
      </div>
    </AdminEditorSection>

    <AdminEditorSection id="breed-practical" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Praktický obsah, výcvik a starostlivosť</h2><p>Každodenné potreby, pohyb, výcvik, srsť a život v domácnosti.</p></div></div>
        <label className="admin-field"><span>Každodenné potreby</span><AdminLexicalTextField rows={5} value={form.needs} onChange={(next)=>change("needs",next)} ariaLabel="needs" /></label>
        <label className="admin-field"><span>Potreba pohybu</span><AdminLexicalTextField rows={6} value={form.exercise} onChange={(next)=>change("exercise",next)} ariaLabel="exercise" /></label>
        <label className="admin-field"><span>Výcvik</span><AdminLexicalTextField rows={6} value={form.training} onChange={(next)=>change("training",next)} ariaLabel="training" /></label>
        <div className="admin-field-grid">
          <label className="admin-field"><span>Odporúčanie k pohybu</span><AdminLexicalTextField rows={3} value={form.editorial.exerciseTip??""} onChange={(next)=>updateEditorial("exerciseTip",next)} ariaLabel="exerciseTip" /></label>
          <label className="admin-field"><span>Odporúčanie k výcviku</span><AdminLexicalTextField rows={3} value={form.editorial.trainingTip??""} onChange={(next)=>updateEditorial("trainingTip",next)} ariaLabel="trainingTip" /></label>
          <label className="admin-field"><span>Srsť a údržba</span><AdminLexicalTextField rows={4} value={form.editorial.coatCare??""} onChange={(next)=>updateEditorial("coatCare",next)} ariaLabel="coatCare" /></label>
          <label className="admin-field"><span>Odporúčanie k srsti</span><AdminLexicalTextField rows={3} value={form.editorial.coatTip??""} onChange={(next)=>updateEditorial("coatTip",next)} ariaLabel="coatTip" /></label>
          <label className="admin-field"><span>Život s rodinou a deťmi</span><AdminLexicalTextField rows={4} value={form.editorial.familyLife??""} onChange={(next)=>updateEditorial("familyLife",next)} ariaLabel="familyLife" /></label>
          <label className="admin-field"><span>Vzťah k iným psom</span><AdminLexicalTextField rows={4} value={form.editorial.otherDogsLife??""} onChange={(next)=>updateEditorial("otherDogsLife",next)} ariaLabel="otherDogsLife" /></label>
        </div>
        <label className="admin-field"><span>Pre koho sa hodí — jedna položka na riadok</span><AdminLexicalTextField rows={4} value={form.goodFor} onChange={(next)=>change("goodFor",next)} ariaLabel="goodFor" /></label>
        <label className="admin-field"><span>Na čo si dať pozor — jedna položka na riadok</span><AdminLexicalTextField rows={4} value={form.consider} onChange={(next)=>change("consider",next)} ariaLabel="consider" /></label>
        <label className="admin-field"><span>Zaujímavosti</span><AdminLexicalTextField rows={4} value={form.editorial.curiosities??""} onChange={(next)=>updateEditorial("curiosities",next)} ariaLabel="curiosities" /></label>
        <label className="admin-field"><span>Časté chyby majiteľov</span><AdminLexicalTextField rows={4} value={form.editorial.commonOwnerMistakes??""} onChange={(next)=>updateEditorial("commonOwnerMistakes",next)} ariaLabel="commonOwnerMistakes" /></label>
      </div>
    </AdminEditorSection>

    <AdminEditorSection id="breed-health" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Zdravie</h2><p>Zverejňuj iba odborne overený obsah; editor nepridáva žiadne odvodené zdravotné tvrdenia.</p></div></div>
        <label className="admin-field"><span>Zdravie</span><AdminLexicalTextField rows={7} value={form.health} onChange={(next)=>change("health",next)} ariaLabel="health" /></label>
        <label className="admin-field"><span>Typické zdravotné riziká — jedna položka na riadok</span><AdminLexicalTextField rows={5} value={form.healthRisks} onChange={(next)=>change("healthRisks",next)} ariaLabel="healthRisks" /></label>
        <label className="admin-field"><span>Zdravotná poznámka</span><AdminLexicalTextField rows={3} value={form.editorial.healthTip??""} onChange={(next)=>updateEditorial("healthTip",next)} ariaLabel="healthTip" /></label>
      </div>
    </AdminEditorSection>

    <AdminEditorSection id="breed-sports" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Športy a aktivity</h2><p>Poradie sa ukladá v existujúcom <code>sports_json</code>; verejný contract sa nemení.</p></div><AdminActionButton variant="secondary" onClick={openNewSport}>+ Pridať šport</AdminActionButton></div>
        <div className={styles.sportsList}>
          {form.sports.map((sport,index)=><article className={styles.sportRow} key={`${sport.key}-${index}`}>
            <strong>{sport.label}</strong><span>Vhodnosť {sport.rating}/5</span><p>{sport.note||"Bez poznámky"}</p>
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

    <AdminEditorSection id="breed-relations" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Súvisiaci obsah a databázy</h2><p>Upravujú sa iba existujúce canonical relations. Chovateľské stanice a kluby sú oddelené pre jasnú správu; profily adresára ani články sa tu nemenia.</p></div></div>
        <div className={styles.relationColumns}>
          <fieldset className={styles.relationBox}><legend>Súvisiace články</legend><input className={styles.relationSearch} value={articleQuery} onChange={(e)=>setArticleQuery(e.target.value)} placeholder="Hľadať článok"/><div className={styles.relationItems}>{articles.map((item)=><label className="admin-check" key={item.id}><input type="checkbox" checked={form.relatedArticleIds.includes(item.id)} onChange={()=>toggleId("relatedArticleIds",item.id)}/><span>{item.title}<small>{item.status}</small></span></label>)}</div></fieldset>
          <fieldset className={styles.relationBox}><legend>Podobné plemená</legend><input className={styles.relationSearch} value={breedQuery} onChange={(e)=>setBreedQuery(e.target.value)} placeholder="Hľadať plemeno"/><div className={styles.relationItems}>{relatedBreeds.map((item)=><label className="admin-check" key={item.id}><input type="checkbox" checked={form.relatedBreedIds.includes(item.id)} onChange={()=>toggleId("relatedBreedIds",item.id)}/><span>{item.name}<small>{item.fciNumber?`FCI ${item.fciNumber}`:"FCI číslo neuvedené"}</small></span></label>)}</div></fieldset>
          <fieldset className={styles.relationBox}><legend>Chovateľské stanice</legend><input className={styles.relationSearch} value={stationQuery} onChange={(e)=>setStationQuery(e.target.value)} placeholder="Hľadať stanicu"/><div className={styles.relationItems}>{stations.map((item)=><label className="admin-check" key={item.id}><input type="checkbox" checked={form.directoryProfileIds.includes(item.id)} onChange={()=>toggleId("directoryProfileIds",item.id)}/><span>{item.name}<small>Stanica{item.city?` · ${item.city}`:""}</small></span></label>)}</div></fieldset>
          <fieldset className={styles.relationBox}><legend>Chovateľské kluby</legend><input className={styles.relationSearch} value={clubQuery} onChange={(e)=>setClubQuery(e.target.value)} placeholder="Hľadať klub"/><div className={styles.relationItems}>{clubs.map((item)=><label className="admin-check" key={item.id}><input type="checkbox" checked={form.directoryProfileIds.includes(item.id)} onChange={()=>toggleId("directoryProfileIds",item.id)}/><span>{item.name}<small>Klub{item.city?` · ${item.city}`:""}</small></span></label>)}</div></fieldset>
        </div>
      </div>
    </AdminEditorSection>

    <AdminEditorSection id="breed-media" className={styles.sectionCard}>
      <div className="admin-form-card">
        <div className={styles.heading}><div><h2>Fotografie</h2><p>Titulná fotografia a galéria nad existujúcim image contractom.</p></div></div>
        <div className={styles.mediaGrid}>
          <div className={styles.coverPreview}>{form.image?<img src={form.image} alt={`Náhľad: ${form.name||"plemeno"}`} loading="lazy" decoding="async"/>:<span>Bez fotografie<br/>verejne sa použije fallback</span>}</div>
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
          renderRow={(index,handle)=>{const item=form.gallery[index];return <><img src={item.imageUrl} alt={item.alt||"Náhľad"} loading="lazy" decoding="async"/><div><label className="admin-field"><span>Alt text</span><input value={item.alt} onChange={(e)=>updateGallery(index,{alt:e.target.value})}/></label><label className="admin-field"><span>Popis</span><input value={item.caption} onChange={(e)=>updateGallery(index,{caption:e.target.value})}/></label><label className="admin-field"><span>Kredit / zdroj</span><input value={item.credit} onChange={(e)=>updateGallery(index,{credit:e.target.value})}/></label></div><div className={styles.galleryActions}>{handle}<AdminActionButton variant="neutral" onClick={()=>moveGallery(index,-1)} disabled={index===0}>↑</AdminActionButton><AdminActionButton variant="neutral" onClick={()=>moveGallery(index,1)} disabled={index===form.gallery.length-1}>↓</AdminActionButton><AdminActionButton variant="destructive" onClick={()=>change("gallery",form.gallery.filter((_,i)=>i!==index))}>Odstrániť</AdminActionButton></div></>;}}/>
      </div>
    </AdminEditorSection>

    <AdminFormFeedback message={message} error={error} pending={saving} errorClassName="admin-form-error" successClassName="admin-flash" />
    <AdminDrawer
      open={settingsOpen}
      title="Nastavenia plemena"
      description="Slug, SEO, odborné FCI/reference údaje a ďalšie sekundárne nastavenia."
      onClose={()=>setSettingsOpen(false)}
      footer={<div className={styles.drawerFooter}><AdminActionButton variant="primary" data-admin-autofocus="true" onClick={()=>setSettingsOpen(false)}>Hotovo</AdminActionButton></div>}
    >
      <div className={styles.drawerFields}>
        <section className={styles.drawerSection}><h3>Adresa a vizuálne nastavenia</h3><label className="admin-field"><span>URL adresa</span><input required value={form.slug} onChange={(e)=>{setSlugEdited(true);change("slug",slugify(e.target.value));}}/><small>psipedia.sk/plemena/{form.slug||"adresa-plemena"}</small></label><label className="admin-field"><span>Farebný motív</span><select value={form.accent} onChange={(e)=>change("accent",e.target.value)}><option value="forest">Zelený</option><option value="coral">Koralový</option><option value="gold">Zlatý</option><option value="blue">Modrý</option></select></label></section>
        <section className={styles.drawerSection}><h3>FCI identita a referencia</h3><div className="admin-field-grid"><label className="admin-field"><span>FCI uznanie / status</span><input value={form.fciStandard.status_fci??""} onChange={(e)=>updateFci("status_fci",e.target.value)}/></label><label className="admin-field"><span>Oficiálny názov FCI</span><input value={form.officialFciName} onChange={(e)=>change("officialFciName",e.target.value)}/></label><label className="admin-field"><span>Dátum platného štandardu</span><input value={form.validStandardDate} onChange={(e)=>change("validStandardDate",e.target.value)}/></label><label className="admin-field"><span>Pracovná skúška</span><input value={form.workingTrial} onChange={(e)=>change("workingTrial",e.target.value)}/></label><label className="admin-field"><span>Import key</span><input value={form.importKey} onChange={(e)=>change("importKey",e.target.value)}/><small>Publikované plemeno musí mať importný kľúč.</small></label><label className="admin-field"><span>FCI skupina – názov</span><input value={form.fciStandard.fci_skupina_nazov??""} onChange={(e)=>updateFci("fci_skupina_nazov",e.target.value)}/></label><label className="admin-field"><span>FCI sekcia – názov</span><input value={form.fciStandard.fci_sekcia_nazov??""} onChange={(e)=>updateFci("fci_sekcia_nazov",e.target.value)}/></label><label className="admin-field"><span>FCI nomenklatúra URL</span><input type="url" value={form.fciStandard.fci_nomenklatura_url??""} onChange={(e)=>updateFci("fci_nomenklatura_url",e.target.value)}/></label><label className="admin-field"><span>FCI PDF URL</span><input type="url" value={form.fciStandard.fci_standard_pdf??""} onChange={(e)=>updateFci("fci_standard_pdf",e.target.value)}/></label></div><label className="admin-field"><span>Poznámka k zdroju</span><textarea value={form.fciStandard.zdroj_poznamka??""} onChange={(e)=>updateFci("zdroj_poznamka",e.target.value)}/></label></section>
        <section className={styles.drawerSection}><h3>FCI odborný štandard</h3><AdminHelpText>Sem patria referenčné FCI údaje. Semantika polí sa v BREEDS-ADMIN nemení.</AdminHelpText>{fciSections.map((section)=><details className={styles.fciGroup} key={section.title}><summary>{section.title}</summary><div>{section.fields.map(([key,label])=><label className="admin-field" key={key}><span>{label}</span><textarea rows={5} value={form.fciStandard[key]??""} onChange={(e)=>updateFci(key,e.target.value)}/></label>)}</div></details>)}</section>
        <section className={styles.drawerSection}><h3>Zdroje</h3>{form.sources.map((source,index)=><div className={styles.sourceRow} key={index}><label className="admin-field"><span>Názov zdroja</span><input value={source.label} onChange={(e)=>updateSource(index,{label:e.target.value})}/></label><label className="admin-field"><span>URL zdroja</span><input type="url" value={source.url} onChange={(e)=>updateSource(index,{url:e.target.value})}/></label><AdminActionButton variant="destructive" onClick={()=>change("sources",form.sources.filter((_,i)=>i!==index))}>Odstrániť</AdminActionButton></div>)}<AdminActionButton variant="secondary" onClick={()=>change("sources",[...form.sources,{...emptySource}])}>+ Pridať zdroj</AdminActionButton></section>
        <section className={styles.drawerSection}><h3>SEO a zdieľanie</h3><AdminSeoFields value={form.seo} onChange={(seo)=>change("seo",seo)} canonicalPath={`/plemena/${form.slug}`} fallbackTitle={breedSeoFallback(form.name||"Názov plemena").title} fallbackDescription={breedSeoFallback(form.name||"Názov plemena").description}/></section>
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
