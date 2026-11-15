"use client";
import { AdminRecordLifecycleActions } from "@/components/admin-record-lifecycle-actions";
import { useProfileEditorSectionPager } from "@/components/admin-profile-editor-section-pager";
import { AdminEditorFooter } from "@/components/admin-editor-footer";
import { AdminSharedEditorNavigation } from "@/components/admin-shared-editor-navigation";
import { AdminEditorSectionVisibility } from "@/components/admin-editor-section-visibility";
import { AdminEditorSection } from "@/components/admin-interaction-system";
import {AdminSingleImageUpload} from "@/components/admin-single-image-upload";
import {adminSelectedImage} from "@/lib/admin-selected-image";

import Link from "next/link";
import { AdminPhotoGallery } from "@/components/admin-photo-gallery";
import { AdminFormFeedback } from "@/components/admin-form-feedback";
import { AdminShareToFacebook } from "@/components/admin-share-to-facebook";
import { EditorUnsavedChangesGuard } from "@/components/admin-editor-workspace";
import { useAdminUnsavedFormLinks } from "@/components/admin-unsaved-form-links";
import { AdminLexicalAppendButton } from "@/components/admin-lexical-append-button";
import { AdminLexicalTextField } from "@/components/admin-lexical-text-field";
import { appendLexicalPlainText } from "@/lib/editorial-lexical-append";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { uploadAdminImage, adminImageUploadMessage } from "@/lib/admin-image-upload";
import { ImageDisplay } from "@/components/image-display";
import { ImageDisplayEditor } from "@/components/image-display-editor";
import type { ImageDisplayConfig } from "@/lib/image-display";
import { chipStateLabel, dogReportHref, dogReportStatusLabel, dogReportTypeLabel, dogSexLabel, dogSizeLabel, type AdminDogReport, type BreedOption, type ChipState, type DogReportType, type DogSex, type DogSize, type PublicLocationPrecision } from "@/lib/lost-found-dogs";
import { allowedLostFoundTransitions, type LostFoundStatus } from "@/lib/lost-found-lifecycle.js";
import { AdminAutomationUpdateSuggestions } from "@/components/admin-automation-update-suggestions";
import type { CanonicalUpdateSuggestion } from "@/lib/data-automation-update-review";
import styles from "./admin-lost-found.module.css";

const LOST_FOUND_SECTIONS = [
  { id: "lost-found-basics", label: "Typ a stav prípadu" },
  { id: "lost-found-dog", label: "Pes a plemeno" },
  { id: "lost-found-description", label: "Popis a identifikácia" },
  { id: "lost-found-location", label: "Dátum a bezpečná lokalita" },
  { id: "lost-found-contacts", label: "Kontakt a súkromie" },
  { id: "lost-found-media", label: "Fotografie a galéria" },
  { id: "lost-found-moderation", label: "Životnosť a moderácia" },
] as const;

type EditorState = {
  gallery: string[];
  type: DogReportType; status: LostFoundStatus; slug: string; dogName: string; sex: DogSex; breedId: string; breed: string; breedUnknown: boolean; color: string; approximateAge: string; size: DogSize;
  shortDescription: string; description: string; distinguishingMarks: string; collarDescription: string; chipped: ChipState; mainImage: string; mainImageKey: string; thumbnailImageDisplay: ImageDisplayConfig | null; detailImageDisplay: ImageDisplayConfig | null; eventDate: string; lastSeenDateTime: string;
  region: string; district: string; city: string; locationDescription: string; publicLatitude: string; publicLongitude: string; publicLocationPrecision: PublicLocationPrecision;
  contactName: string; contactPhone: string; contactEmail: string; publicContactNote: string; publicPhone: string; publicEmail: string; publicWebsiteUrl: string; publicFacebookUrl: string; publicInstagramUrl: string; source: string; sourceUrl: string; expiresAt: string; duplicateOfId: string; duplicateReason: string; internalNote: string;
};

const initial = (r?: AdminDogReport): EditorState => ({
  gallery: r?.gallery ?? [],
  type:r?.type||"LOST",status:r?.status||"DRAFT",slug:r?.slug||"",dogName:r?.dogName||"",sex:r?.sex||"UNKNOWN",breedId:r?.breedId?String(r.breedId):"",breed:r?.breed||"",breedUnknown:r?.breedUnknown||false,color:r?.color||"",approximateAge:r?.approximateAge||"",size:r?.size||"UNKNOWN",
  shortDescription:r?.shortDescription||"",description:r?.description||"",distinguishingMarks:r?.distinguishingMarks||"",collarDescription:r?.collarDescription||"",chipped:r?.chipped||"UNKNOWN",mainImage:r?.mainImage||"",mainImageKey:r?.mainImageKey||"",thumbnailImageDisplay:r?.thumbnailImageDisplay??null,detailImageDisplay:r?.detailImageDisplay??null,eventDate:r?.eventDate||"",lastSeenDateTime:r?.lastSeenDateTime?toLocalInput(r.lastSeenDateTime):"",
  region:r?.region||"",district:r?.district||"",city:r?.city||"",locationDescription:r?.locationDescription||"",publicLatitude:r?.publicLatitude===null||r?.publicLatitude===undefined?"":String(r.publicLatitude),publicLongitude:r?.publicLongitude===null||r?.publicLongitude===undefined?"":String(r.publicLongitude),publicLocationPrecision:r?.publicLocationPrecision||"MUNICIPALITY",
  contactName:r?.contactName||"",contactPhone:r?.contactPhone||"",contactEmail:r?.contactEmail||"",publicContactNote:r?.publicContactNote||"",publicPhone:r?.publicPhone||"",publicEmail:r?.publicEmail||"",publicWebsiteUrl:r?.publicWebsiteUrl||"",publicFacebookUrl:r?.publicFacebookUrl||"",publicInstagramUrl:r?.publicInstagramUrl||"",source:r?.source||"EDITORIAL",sourceUrl:r?.sourceUrl||"",expiresAt:r?.expiresAt?toLocalInput(r.expiresAt):"",duplicateOfId:r?.duplicateOfId?String(r.duplicateOfId):"",duplicateReason:r?.duplicateReason||"",internalNote:r?.internalNote||"",
});
function toLocalInput(value:string){const d=new Date(value);if(Number.isNaN(d.getTime()))return "";const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,16)}
function slugify(v:string){return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100)}

const transitionLabel: Record<LostFoundStatus, string> = {
  DRAFT: "Vyžiadať opravu / vrátiť do konceptu",
  PENDING: "Posunúť na kontrolu",
  ACTIVE: "Publikovať ako aktívne",
  RESOLVED: "Označiť vyriešené",
  EXPIRED: "Označiť expirované",
  REJECTED: "Zamietnuť",
  ARCHIVED: "Archivovať",
};

export function AdminLostFoundEditor({ report, breeds, automationSuggestions = [] }: { report?: AdminDogReport; breeds: BreedOption[]; automationSuggestions?: CanonicalUpdateSuggestion[] }) {
  const [state,setState]=useState(()=>initial(report)); const [saving,setSaving]=useState(false); const [uploading,setUploading]=useState(false); const [message,setMessage]=useState(""); const [error,setError]=useState(""); const formRef=useRef<HTMLFormElement|null>(null);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [activeLostFoundSection, setActiveLostFoundSection] = useState<string>(LOST_FOUND_SECTIONS[0].id);
  const activeLostFoundIndex = LOST_FOUND_SECTIONS.findIndex((section) => section.id === activeLostFoundSection);
  const navigateLostFoundPager = useProfileEditorSectionPager(activeLostFoundSection, setActiveLostFoundSection);
  const navigation = useAdminUnsavedFormLinks();
  const mutationPendingRef = useRef(false);
  // Moderation-only duplicate fields are not part of the profile save payload.
  const lastPersistedStateRef = useRef<EditorState>(initial(report));
  useEffect(()=>{ if(formRef.current) formRef.current.dataset.hydrated="true"; },[]);
  const set=<K extends keyof EditorState>(key:K,value:EditorState[K])=>{navigation.markDirty();setState((s)=>({...s,[key]:value}));};
  const publicHref=useMemo(()=>state.slug?dogReportHref({type:state.type,slug:state.slug}):"",[state.slug,state.type]);
  const privatePreview=report&&state.mainImageKey.startsWith("safe/LOST_FOUND_PUBLIC/")?`/api/admin/lost-found/${report.id}/media`:"";
  const allowedTransitions=useMemo(()=>report?allowedLostFoundTransitions(state.status) as LostFoundStatus[]:[],[report,state.status]);
  function changeName(value:string){navigation.markDirty();setState((s)=>({...s,dogName:value,slug:s.slug||slugify(`${s.type==="LOST"?"strateny":"najdeny"}-${value}`)}))}
  async function uploadImage(e:File|ChangeEvent<HTMLInputElement>){const file=adminSelectedImage(e);if(!file)return;setUploading(true);setError("");try{const data=await uploadAdminImage(file,"lost-found");navigation.markDirty();setState(s=>({...s,mainImage:data.imageUrl,mainImageKey:data.imageKey,thumbnailImageDisplay:null,detailImageDisplay:null}));setMessage(adminImageUploadMessage(data,"Ulož hlásenie."))}catch(err){setError(err instanceof Error?err.message:"Obrázok sa nepodarilo nahrať.")}finally{setUploading(false)}}
  async function save(status:LostFoundStatus=state.status){
    if (saving || mutationPendingRef.current || uploading || galleryUploading) return;
    // Missing optional dog, time, place and narrative fields do not block.
    // D1 remains authoritative for validity, privacy and lifecycle.
    const missing = [
      { section: "lost-found-basics", valid: Boolean(state.slug.trim()), label: "Adresa hlásenia" },
    ].find((field) => !field.valid);
    if (missing) {
      setActiveLostFoundSection(missing.section);
      setMessage("");
      setError("Vyplň alebo oprav: " + missing.label + ".");
      return;
    }
    const submittedRevision = navigation.getRevision();
    mutationPendingRef.current = true;
    setSaving(true);setError("");setMessage("");
    try{
      const payload={
        gallery:state.gallery,type:state.type,status:report?status:"DRAFT",slug:state.slug,dogName:state.dogName,sex:state.sex,breedId:state.breedId||null,breed:state.breed,breedUnknown:state.breedUnknown,color:state.color,approximateAge:state.approximateAge,size:state.size,
        shortDescription:state.shortDescription,description:state.description,distinguishingMarks:state.distinguishingMarks,collarDescription:state.collarDescription,chipped:state.chipped,mainImage:state.mainImage||null,mainImageKey:state.mainImageKey||null,thumbnailImageDisplay:state.thumbnailImageDisplay,detailImageDisplay:state.detailImageDisplay,eventDate:state.eventDate,lastSeenDateTime:state.lastSeenDateTime||null,
        region:state.region,district:state.district,city:state.city,locationDescription:state.locationDescription,publicLatitude:state.publicLatitude||null,publicLongitude:state.publicLongitude||null,publicLocationPrecision:state.publicLocationPrecision,
        contactName:state.contactName||null,contactPhone:state.contactPhone||null,contactEmail:state.contactEmail||null,publicContactNote:state.publicContactNote,publicPhone:state.publicPhone,publicEmail:state.publicEmail,publicWebsiteUrl:state.publicWebsiteUrl,publicFacebookUrl:state.publicFacebookUrl,publicInstagramUrl:state.publicInstagramUrl,source:state.source,sourceUrl:state.sourceUrl||null,expiresAt:state.expiresAt||null,internalNote:state.internalNote,
      };
      const res=await fetch(report?`/api/admin/lost-found/${report.id}`:"/api/admin/lost-found",{method:report?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const data=await res.json() as {report?:AdminDogReport;error?:string};
      if(!res.ok||!data.report)throw new Error(data.error||"Uloženie zlyhalo.");
      lastPersistedStateRef.current = initial(data.report);
      const hasNewerEdits = navigation.getRevision() !== submittedRevision;
      if (report) navigation.markSavedIfUnchanged(submittedRevision);
      else navigation.markSavedBeforeRedirect();
      // Server normalization is authoritative only if no newer form edit arrived.
      // The independent moderation fields must survive an ordinary save.
      if (!hasNewerEdits) setState((current) => ({
        ...lastPersistedStateRef.current,
        duplicateOfId: current.duplicateOfId,
        duplicateReason: current.duplicateReason,
      }));
      setMessage(hasNewerEdits
        ? "Predchádzajúce úpravy boli uložené. Novšie zmeny si ešte ulož."
        : status==="ACTIVE"?"Hlásenie je aktívne a verejné.":"Hlásenie bolo uložené.");
      if(!report)window.location.assign(`/admin/stratene-najdene/${data.report.id}?vytvorene=1`);
    }catch(err){
      const detail = err instanceof Error ? err.message : "Uloženie zlyhalo.";
      if (/súradnic|zemepis|map|kraj|mesto|obec|dátum|naposledy/i.test(detail)) setActiveLostFoundSection("lost-found-location");
      else if (/popis|znak|obojok/i.test(detail)) setActiveLostFoundSection("lost-found-description");
      else if (/plemen|breed/i.test(detail)) setActiveLostFoundSection("lost-found-dog");
      else if (/kontaktn|e-mail|telefón|odkaz|URL/i.test(detail)) setActiveLostFoundSection("lost-found-contacts");
      else if (/obráz|fotograf|galéri/i.test(detail)) setActiveLostFoundSection("lost-found-media");
      else if (/stav|expir|lifecycle|duplicit/i.test(detail)) setActiveLostFoundSection("lost-found-moderation");
      setError(detail);
    }finally{mutationPendingRef.current=false;setSaving(false)}
  }
  function applyAutomationUpdate(values: Record<string, unknown>) { if (Object.keys(values).length) navigation.markDirty(); setState((current) => ({ ...current, ...values } as EditorState)); }
  async function markDuplicate(){
    if(!report)return;
    if (saving || mutationPendingRef.current || uploading || galleryUploading) return;
    // The duplicate endpoint archives the record without persisting profile
    // fields. Never silently discard unsaved description, contacts or media.
    const saved = lastPersistedStateRef.current;
    const pendingProfileChanges = (Object.keys(state) as Array<keyof EditorState>)
      .some((key) => key !== "duplicateOfId" && key !== "duplicateReason" &&
        JSON.stringify(state[key]) !== JSON.stringify(saved[key]));
    if (pendingProfileChanges) {
      setActiveLostFoundSection("lost-found-moderation");
      setError("Najprv ulož ostatné úpravy hlásenia. Vybrané údaje o duplicite zostanú zachované.");
      return;
    }
    mutationPendingRef.current=true;
    setSaving(true);setError("");setMessage("");
    try{
      const res=await fetch(`/api/admin/lost-found/${report.id}/duplicate`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({duplicateOfId:state.duplicateOfId||null,duplicateReason:state.duplicateReason})});
      const data=await res.json() as {report?:AdminDogReport;error?:string};
      if(!res.ok||!data.report)throw new Error(data.error||"Označenie duplicity zlyhalo.");
      lastPersistedStateRef.current = initial(data.report);
      navigation.markSaved();setState(initial(data.report));setMessage("Hlásenie bolo označené ako duplicita a archivované.");
    }catch(err){setError(err instanceof Error?err.message:"Označenie duplicity zlyhalo.")}finally{mutationPendingRef.current=false;setSaving(false)}
  }
  return <form ref={formRef} inert={saving} aria-busy={saving} noValidate data-hydrated="false" data-admin-form-system="v4" data-admin-lost-found-editor data-admin-content-module="lost-found-editor" onChangeCapture={navigation.captureChange} onSubmit={(e)=>{e.preventDefault();void save()}}>
    <EditorUnsavedChangesGuard active={navigation.dirty} open={navigation.confirmOpen} onStay={navigation.stay} onDiscard={navigation.discard} allowNativeExitRef={navigation.allowNativeExitRef} />
    <AdminAutomationUpdateSuggestions initialSuggestions={automationSuggestions} onAccepted={applyAutomationUpdate} />
    {navigation.dirty && <p className="admin-message" role="status">Neuložené zmeny</p>}
    <AdminFormFeedback message={message} error={error} pending={saving} className={styles.message} errorClassName={styles.error} />
    <AdminEditorSectionVisibility.Provider value={{ activeId: activeLostFoundSection, mode: "switch" }}>
    <div className={styles.editorLayout} data-admin-lost-found-editor-workspace>
      <AdminSharedEditorNavigation sections={LOST_FOUND_SECTIONS} activeId={activeLostFoundSection}
        onNavigate={setActiveLostFoundSection} layout="sidebar" mode="switch" ariaLabel="Sekcie editora stratených a nájdených psov" />
      <div className={styles.editorBody}>
        <div className={styles.formGrid}><div className={styles.sections}>
      <AdminEditorSection id="lost-found-basics" className={styles.card}><h2>01. Typ a stav prípadu</h2><div className={styles.fieldGrid}><div className={styles.field}><label htmlFor="lf-field-typ">Typ</label><select id="lf-field-typ" value={state.type} onChange={(e)=>set("type",e.target.value as DogReportType)}><option value="LOST">Stratený pes</option><option value="FOUND">Nájdený pes</option></select></div><div className={styles.field}><label>Stav</label><strong>{dogReportStatusLabel[state.status]}</strong><small className={styles.help}>{report?"Stav sa mení iba explicitnou moderátorskou akciou nižšie.":"Nové hlásenie sa vždy vytvorí ako koncept."}</small></div></div><div className={styles.field}><label htmlFor="lf-field-slug">Slug</label><input id="lf-field-slug" value={state.slug} onChange={(e)=>set("slug",slugify(e.target.value))} placeholder="strateny-rex-nitra" required/></div></AdminEditorSection>
      <AdminEditorSection id="lost-found-dog" className={styles.card}><h2>02. Pes a plemeno</h2><div className={styles.fieldGrid}><div className={styles.field}><label htmlFor="lf-field-meno-ak-je-zname">Meno, ak je známe</label><input id="lf-field-meno-ak-je-zname" value={state.dogName} onChange={(e)=>changeName(e.target.value)}/></div><div className={styles.field}><label htmlFor="lf-field-pohlavie">Pohlavie</label><select id="lf-field-pohlavie" value={state.sex} onChange={(e)=>set("sex",e.target.value as DogSex)}>{Object.entries(dogSexLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div className={styles.field}><label htmlFor="lf-field-velkost">Veľkosť</label><select id="lf-field-velkost" value={state.size} onChange={(e)=>set("size",e.target.value as DogSize)}>{Object.entries(dogSizeLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div className={styles.field}><label htmlFor="lf-field-cip">Čip</label><select id="lf-field-cip" value={state.chipped} onChange={(e)=>set("chipped",e.target.value as ChipState)}>{Object.entries(chipStateLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div className={styles.field}><label htmlFor="lf-field-farba">Farba</label><input id="lf-field-farba" value={state.color} onChange={(e)=>set("color",e.target.value)}/></div><div className={styles.field}><label htmlFor="lf-field-priblizny-vek">Približný vek</label><input id="lf-field-priblizny-vek" value={state.approximateAge} onChange={(e)=>set("approximateAge",e.target.value)} placeholder="napr. 3–5 rokov"/></div></div><label className={styles.check}><input type="checkbox" checked={state.breedUnknown} onChange={(e)=>set("breedUnknown",e.target.checked)}/> Plemeno nie je známe</label>{!state.breedUnknown&&<><div className={styles.field}><label htmlFor="lf-field-prepojenie-na-publikovane-plemeno">Prepojenie na publikované plemeno</label><select id="lf-field-prepojenie-na-publikovane-plemeno" value={state.breedId} onChange={(e)=>set("breedId",e.target.value)}><option value="">Bez prepojenia</option>{breeds.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className={styles.field}><label htmlFor="lf-field-plemeno-text-ak-nie-je-v-atlase">Plemeno – text, ak nie je v atlase</label><input id="lf-field-plemeno-text-ak-nie-je-v-atlase" value={state.breed} onChange={(e)=>set("breed",e.target.value)}/></div></>}</AdminEditorSection>
      <AdminEditorSection id="lost-found-description" className={styles.card}><h2>03. Popis a identifikácia</h2><div className={styles.field}><label>Krátky popis</label><AdminLexicalTextField rows={3} value={state.shortDescription} onChange={(next)=>set("shortDescription",next)} ariaLabel="Krátky popis"/></div><div className={styles.field}><label>Hlavný popis</label><AdminLexicalTextField rows={7} value={state.description} onChange={(next)=>set("description",next)} ariaLabel="Hlavný popis" required={state.status!=="DRAFT"}/><AdminLexicalAppendButton disabled={saving} onAppend={text=>set("description",appendLexicalPlainText(state.description,text))}/></div><div className={styles.field}><label>Rozpoznávacie znaky</label><AdminLexicalTextField rows={4} value={state.distinguishingMarks} onChange={(next)=>set("distinguishingMarks",next)} ariaLabel="Rozpoznávacie znaky"/></div><div className={styles.field}><label>Obojok / postroj</label><AdminLexicalTextField rows={3} value={state.collarDescription} onChange={(next)=>set("collarDescription",next)} ariaLabel="Obojok / postroj"/></div></AdminEditorSection>
      <AdminEditorSection id="lost-found-location" className={styles.card}><h2>04. Dátum a bezpečná lokalita</h2><div className={styles.fieldGrid}><div className={styles.field}><label htmlFor="lf-field-datum-udalosti">Dátum udalosti</label><input id="lf-field-datum-udalosti" type="date" value={state.eventDate} onChange={(e)=>set("eventDate",e.target.value)} required={state.status!=="DRAFT"}/></div>{state.type==="LOST"&&<div className={styles.field}><label htmlFor="lf-field-naposledy-videny">Naposledy videný</label><input id="lf-field-naposledy-videny" type="datetime-local" value={state.lastSeenDateTime} onChange={(e)=>set("lastSeenDateTime",e.target.value)}/></div>}<div className={styles.field}><label htmlFor="lf-field-kraj">Kraj</label><input id="lf-field-kraj" value={state.region} onChange={(e)=>set("region",e.target.value)} required={state.status!=="DRAFT"}/></div><div className={styles.field}><label htmlFor="lf-field-okres">Okres</label><input id="lf-field-okres" value={state.district} onChange={(e)=>set("district",e.target.value)}/></div><div className={styles.field}><label htmlFor="lf-field-obec-mesto">Obec / mesto</label><input id="lf-field-obec-mesto" value={state.city} onChange={(e)=>set("city",e.target.value)} required={state.status!=="DRAFT"}/></div><div className={styles.field}><label htmlFor="lf-field-presnost-verejnej-mapy">Presnosť verejnej mapy</label><select id="lf-field-presnost-verejnej-mapy" value={state.publicLocationPrecision} onChange={(e)=>set("publicLocationPrecision",e.target.value as PublicLocationPrecision)}><option value="MUNICIPALITY">Obec</option><option value="NEIGHBORHOOD">Časť mesta</option><option value="APPROXIMATE">Približný bod</option></select></div><div className={styles.field}><label htmlFor="lf-field-priblizna-sirka">Približná šírka</label><input id="lf-field-priblizna-sirka" inputMode="decimal" value={state.publicLatitude} onChange={(e)=>set("publicLatitude",e.target.value)}/></div><div className={styles.field}><label htmlFor="lf-field-priblizna-dlzka">Približná dĺžka</label><input id="lf-field-priblizna-dlzka" inputMode="decimal" value={state.publicLongitude} onChange={(e)=>set("publicLongitude",e.target.value)}/></div></div><div className={styles.field}><label>Verejný opis miesta</label><AdminLexicalTextField rows={3} value={state.locationDescription} onChange={(next)=>set("locationDescription",next)} ariaLabel="Verejný opis miesta" placeholder="napr. okolie parku pri centre obce"/></div><small className={styles.help}>Nezadávaj domácu adresu. Súradnice musia byť už pred uložením vhodne anonymizované.</small></AdminEditorSection>
      <AdminEditorSection id="lost-found-contacts" className={styles.card}><h2>05. Kontakt, zdroj a súkromie</h2><div className={styles.fieldGrid}><div className={styles.field}><label htmlFor="lf-field-kontaktna-osoba-iba-admin">Kontaktná osoba — iba admin</label><input id="lf-field-kontaktna-osoba-iba-admin" value={state.contactName} onChange={(e)=>set("contactName",e.target.value)}/></div><div className={styles.field}><label htmlFor="lf-field-telefon-iba-admin">Telefón — iba admin</label><input id="lf-field-telefon-iba-admin" value={state.contactPhone} onChange={(e)=>set("contactPhone",e.target.value)}/></div><div className={styles.field}><label htmlFor="lf-field-e-mail-iba-admin">E-mail — iba admin</label><input id="lf-field-e-mail-iba-admin" type="email" value={state.contactEmail} onChange={(e)=>set("contactEmail",e.target.value)}/></div><div className={styles.field}><label htmlFor="lf-field-zdroj">Zdroj</label><input id="lf-field-zdroj" value={state.source} onChange={(e)=>set("source",e.target.value)}/></div></div>
        <div className={styles.fieldGrid} data-public-lost-found-contacts>
          <div className={styles.field}><label htmlFor="lf-public-phone">Verejný telefón</label><input id="lf-public-phone" type="tel" value={state.publicPhone} onChange={e=>set("publicPhone",e.target.value)} placeholder="+421..." /></div>
          <div className={styles.field}><label htmlFor="lf-public-email">Verejný e-mail</label><input id="lf-public-email" type="email" value={state.publicEmail} onChange={e=>set("publicEmail",e.target.value)} placeholder="kontakt@example.sk" /></div>
          <div className={styles.field}><label htmlFor="lf-public-web">Verejný web</label><input id="lf-public-web" type="url" value={state.publicWebsiteUrl} onChange={e=>set("publicWebsiteUrl",e.target.value)} placeholder="https://" /></div>
          <div className={styles.field}><label htmlFor="lf-public-facebook">Facebook</label><input id="lf-public-facebook" type="url" value={state.publicFacebookUrl} onChange={e=>set("publicFacebookUrl",e.target.value)} placeholder="https://facebook.com/..." /></div>
          <div className={styles.field}><label htmlFor="lf-public-instagram">Instagram</label><input id="lf-public-instagram" type="url" value={state.publicInstagramUrl} onChange={e=>set("publicInstagramUrl",e.target.value)} placeholder="https://instagram.com/..." /></div>
        </div>
        <small className={styles.help}>Tieto údaje sa zobrazia verejne a ako klikateľné odkazy. Vyplň ich iba po overení, že kontakt je určený na zverejnenie. Súkromné kontakty vyššie zostávajú šifrované a nikdy sa sem automaticky nekopírujú.</small>
        <div className={styles.field}><label>Verejná kontaktná poznámka</label><AdminLexicalTextField rows={3} value={state.publicContactNote} onChange={(next)=>set("publicContactNote",next)} ariaLabel="Verejná kontaktná poznámka" placeholder="napr. kontakt sprostredkujeme cez Psipediu"/></div><div className={styles.field}><label htmlFor="lf-field-url-povodneho-hlasenia">URL pôvodného hlásenia</label><input id="lf-field-url-povodneho-hlasenia" type="url" value={state.sourceUrl} onChange={(e)=>set("sourceUrl",e.target.value)}/></div></AdminEditorSection>
<AdminEditorSection id="lost-found-media" className={styles.card}><h2>06. Fotografie a galéria</h2><div className={styles.field}><label>Hlavná fotografia</label><div className={styles.upload}><AdminSingleImageUpload label={state.mainImage?"Vybrať inú fotografiu":"Nahrať hlavnú fotografiu"} onFile={uploadImage} busy={uploading} disabled={saving} onRejected={setError}/>{state.mainImage&&<button type="button" className={styles.secondary} onClick={()=>{navigation.markDirty();setState(s=>({...s,mainImage:"",mainImageKey:"",thumbnailImageDisplay:null,detailImageDisplay:null}))}}>Odstrániť</button>}</div>{state.mainImage&&<button type="button" className={styles.secondary} onClick={()=>setImageEditorOpen(true)}>Upraviť zobrazenie</button>}<small className={styles.help}>Fotografie môžeš spravovať v galérii nižšie.</small></div><AdminPhotoGallery value={state.gallery} onChange={(gallery) => set("gallery", gallery)} folder="lost-found" limit={8} disabled={saving || uploading} onBusyChange={setGalleryUploading} /></AdminEditorSection>
      <AdminEditorSection id="lost-found-moderation" className={styles.card}><h2>07. Životnosť{report?" a duplicita":""}</h2><div className={styles.field}><label htmlFor="lf-field-expiracia">Expirácia</label><input id="lf-field-expiracia" type="datetime-local" value={state.expiresAt} onChange={(e)=>set("expiresAt",e.target.value)}/><small className={styles.help}>Ak ACTIVE nemá dátum, systém nastaví 30 dní.</small></div>{report&&<><div className={styles.fieldGrid}><div className={styles.field}><label htmlFor="lf-field-kanonicke-hlasenie-id">Kanonické hlásenie ID</label><input id="lf-field-kanonicke-hlasenie-id" inputMode="numeric" value={state.duplicateOfId} onChange={(e)=>set("duplicateOfId",e.target.value)} placeholder="napr. 152"/></div><div className={styles.field}><label htmlFor="lf-field-dovod-oznacenia-duplicity">Dôvod označenia duplicity</label><textarea id="lf-field-dovod-oznacenia-duplicity" rows={2} value={state.duplicateReason} onChange={(e)=>set("duplicateReason",e.target.value)}/></div></div><button type="button" className={styles.secondary} disabled={saving||uploading||galleryUploading||!state.duplicateOfId} onClick={()=>void markDuplicate()}>Označiť ako duplicitu</button><small className={styles.help}>Ide o samostatnú moderátorskú operáciu. Server overí existenciu cieľa a zhodu typu LOST/FOUND a potom záznam archivuje.</small></>}<div className={styles.field}><label>Interná moderátorská poznámka</label><AdminLexicalTextField rows={4} value={state.internalNote} onChange={(next)=>set("internalNote",next)} ariaLabel="Interná moderátorská poznámka"/></div></AdminEditorSection>
      <nav data-admin-editor-pager className={styles.sectionPager} aria-label="Prechod medzi sekciami stratených a nájdených psov">
        <button type="button" disabled={activeLostFoundIndex <= 0}
          onClick={() => navigateLostFoundPager(LOST_FOUND_SECTIONS[activeLostFoundIndex - 1]?.id ?? LOST_FOUND_SECTIONS[0].id)}>Predchádzajúca</button>
        <span role="status">Sekcia {activeLostFoundIndex + 1} z {LOST_FOUND_SECTIONS.length}</span>
        <button type="button" disabled={activeLostFoundIndex >= LOST_FOUND_SECTIONS.length - 1}
          onClick={() => navigateLostFoundPager(LOST_FOUND_SECTIONS[activeLostFoundIndex + 1]?.id ?? LOST_FOUND_SECTIONS[LOST_FOUND_SECTIONS.length - 1].id)}>Ďalšia</button>
      </nav>
    </div><aside className={styles.preview}><span>{dogReportTypeLabel(state.type)}</span>{state.mainImage?<ImageDisplay roleHint="generic" context="thumbnail" config={state.thumbnailImageDisplay} src={state.mainImage} alt="Náhľad fotografie"/>:privatePreview?<img src={privatePreview} alt="Súkromný náhľad fotografie pred schválením"/>:<div style={{aspectRatio:"4/3",display:"grid",placeItems:"center",fontSize:"4rem",background:"#eef2ef",borderRadius:14}}>🐕</div>}<h2>{state.dogName||state.breed||"Pes bez mena"}</h2><p><strong>{dogReportStatusLabel[state.status]}</strong></p><dl><div><dt>Dátum</dt><dd>{state.eventDate||"—"}</dd></div><div><dt>Lokalita</dt><dd>{state.city||"—"}</dd></div><div><dt>Pohlavie</dt><dd>{dogSexLabel[state.sex]}</dd></div></dl>{report&&publicHref&&["ACTIVE","RESOLVED","EXPIRED","ARCHIVED"].includes(state.status)&&<Link href={publicHref} target="_blank">Verejný náhľad ↗</Link>}</aside></div>
      </div>
    </div>
    </AdminEditorSectionVisibility.Provider>
    {report && state.status === "ACTIVE" && publicHref && <AdminShareToFacebook title={state.dogName || state.breed || "Pes"} publicPath={publicHref} />}
    {imageEditorOpen && state.mainImage && <ImageDisplayEditor src={state.mainImage} alt={state.dogName||"Pes"} title={state.dogName} entityLabel="strateného alebo nájdeného psa" thumbnailAspectRatio="4 / 3" thumbnail={state.thumbnailImageDisplay} detail={state.detailImageDisplay} onCancel={()=>setImageEditorOpen(false)} onSave={(thumbnail,detail)=>{navigation.markDirty();setState(s=>({...s,thumbnailImageDisplay:thumbnail,detailImageDisplay:detail}));setImageEditorOpen(false)}}/>}
    <AdminEditorFooter dirty={navigation.dirty} pending={saving || uploading || galleryUploading}>
      {report && <AdminRecordLifecycleActions kind="lost-found" recordId={report.id} status={state.status} disabled={saving || uploading || galleryUploading} returnHref="/admin/stratene-najdene" onUnpublished={()=>setState(current=>({...current,status:"DRAFT"}))} />}
      <div className={styles.actions}><Link className={styles.secondary} href="/admin/stratene-najdene">← Späť</Link><div><button type="submit" className={styles.primary} disabled={saving||uploading||galleryUploading}>{saving?"Ukladám…":report?"Uložiť":"Vytvoriť koncept"}</button>{report&&allowedTransitions.map((status)=><button key={status} type="button" className={status==="ACTIVE"?styles.primary:styles.secondary} disabled={saving||uploading||galleryUploading} onClick={()=>void save(status)}>{transitionLabel[status]}</button>)}</div></div></AdminEditorFooter>
  </form>;
}
