"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {useDropzone} from "react-dropzone";
import {FacebookProfileIntroCanvas} from "./facebook-profile-intro-canvas";
import {removeEdgeWhite,suggestedLogoCrop} from "./facebook-profile-logo-processing";
import {
  DEFAULT_PROFILE_LAYOUT,DEFAULT_PROFILE_LOGO_OPTIONS,PROFILE_PARTS,constrainProfilePlacement,
  type ProfilePart,type ProfileLayout,type ProfileLogoOptions,type ProfilePlacement,
  type ProfileLogoShape,
} from "./facebook-profile-intro-layout";
import {FacebookKonvaCanvas, type GraphicCanvasHandle, type GraphicPart, type GraphicSettings, type GraphicTemplate, type GraphicFormat} from "./facebook-konva-canvas";
import styles from "./admin-facebook-graphic-editor.module.css";

type Template = GraphicTemplate | "profile";
type Format = GraphicFormat;
type Settings = GraphicSettings;
const TEMPLATES: { id: Template; name: string; description: string }[] = [
  {id:"gradient",name:"01 · Redakčná fotografia",description:"Jemný stmavovací prechod a čitateľný nadpis"},
  {id:"panel",name:"02 · Zelený titulok",description:"Výrazný tmavozelený panel na fotografii"},
  {id:"editorial",name:"03 · Krémový redakčný pás",description:"Svetlá karta s tehlovočerveným akcentom"},
  {id:"clean",name:"04 · Čistá kompozícia",description:"Minimalistická fotografia a svetlá textová karta"},
  {id:"split",name:"05 · Delená kompozícia",description:"Fotografia s oddelenou tmavozelenou spodnou sekciou"},
  {id:"profile",name:"06 · Predstavujeme profil",description:"Jednotná grafika s hlavným obrázkom profilu"},
];
const MAX_BYTES = 8 * 1024 * 1024;
const PROFILE_LAYOUT_KEY="psipedia-facebook-profile-intro-v3";
async function loadProfileImageFile(source:string,signal?:AbortSignal):Promise<File>{
  const url=new URL(source,window.location.origin);
  if(url.origin!==window.location.origin||!url.pathname.startsWith("/media/facebook-images/"))
    throw Error("Hlavný obrázok musí byť uložený na Psipedia.sk. Nahraj ho ručne.");
  const response=await fetch(url.pathname+url.search,{
    credentials:"same-origin",cache:"no-store",signal,
  });
  if(!response.ok)throw Error("Hlavný obrázok sa nepodarilo načítať. Nahraj ho ručne.");
  const blob=await response.blob();
  const mime=blob.type.split(";")[0].toLowerCase();
  if(!blob.size||blob.size>MAX_BYTES||!["image/jpeg","image/png","image/webp"].includes(mime))
    throw Error("Hlavný obrázok musí byť JPG, PNG alebo WebP do 8 MB.");
  return new File([blob],"hlavny-obrazok-profilu",{type:mime});
}


export function AdminFacebookGraphicEditor({
  initialTitle,
  initialPhotoUrl,
  initialProfileCategory,
  initialProfileImageUrl,
  onReloadProfileImage,
  onUse,
  onCancel,
}: {
  initialTitle: string;
  initialPhotoUrl?: string;
  initialProfileCategory?: string;
  initialProfileImageUrl?: string;
  onReloadProfileImage?: ()=>Promise<string>;
  onUse: (file: File, title: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [settings, setSettings] = useState<Settings>({
    template: "gradient",
    format: "portrait",
    title: initialTitle && initialTitle !== "Nový príspevok" ? initialTitle : "5 tipov, ako lepšie porozumieť svojmu psovi",
    emphasis: "",
    fontSize: 74,
    headlineX: 50,
    headlineY: 75,
    zoom: 100,
    photoX: 0,
    photoY: 0,
    photoFit: "cover",
    overlay: 70,
    showBrand: true,
    logoStyle: "pill",
    logoX: 0,
    logoY: 0,
    logoScale: 100,
  });
  const [selectedTemplate,setSelectedTemplate]=useState<Template>(initialProfileCategory?"profile":"gradient");
  const [error, setError] = useState("");
  const [profileLayout,setProfileLayout]=useState<ProfileLayout>(DEFAULT_PROFILE_LAYOUT);
  const [profileOptions,setProfileOptions]=useState<ProfileLogoOptions>(DEFAULT_PROFILE_LOGO_OPTIONS);
  const [selectedProfilePart,setSelectedProfilePart]=useState<ProfilePart|null>(null);
  const [fullPreview,setFullPreview]=useState(false);
  const [imageReloading,setImageReloading]=useState(false);
  const [profileHistory,setProfileHistory]=useState<Array<{layout:ProfileLayout;options:ProfileLogoOptions}>>([]);
  const restoreReady=useRef(false);
  useEffect(()=>{
    const task=window.setTimeout(()=>{
      try{
        const stored=window.localStorage.getItem(PROFILE_LAYOUT_KEY);
        if(stored){
          const parsed=JSON.parse(stored) as {layout?:Partial<ProfileLayout>;options?:Partial<ProfileLogoOptions>};
          if(parsed.layout&&PROFILE_PARTS.every(part=>{
            const p=parsed.layout?.[part.id];
            return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.scale);
          })){
            const cleaned={} as ProfileLayout;
            for(const part of PROFILE_PARTS)cleaned[part.id]=constrainProfilePlacement(parsed.layout[part.id]!);
            setProfileLayout(cleaned);
          }
          if(parsed.options){
            const o=parsed.options;
            if(["circle","rounded","square","none"].includes(o.shape||""))setProfileOptions(old=>({
              ...old,...Object.fromEntries(Object.entries(o).filter(([key,value])=>
                key==="shape"?["circle","rounded","square","none"].includes(String(value))
                  :key==="removeWhite"?typeof value==="boolean"
                  :typeof value==="number"&&Number.isFinite(value)
              )),
            }));
          }
        }
      }catch{/* Corrupted preferences never stop the editor. */}
      restoreReady.current=true;
    },0);
    return()=>window.clearTimeout(task);
  },[]);
  useEffect(()=>{
    if(!restoreReady.current)return;
    try{window.localStorage.setItem(PROFILE_LAYOUT_KEY,JSON.stringify({layout:profileLayout,options:{shape:profileOptions.shape}}));}
    catch{/* Private browsers may deny local storage; editing still works. */}
  },[profileLayout,profileOptions]);
  const saveProfileHistory=()=>setProfileHistory(old=>[{
    layout:profileLayout,options:profileOptions,
  },...old].slice(0,20));
  const changeProfilePlacement=useCallback((part:ProfilePart,placement:ProfilePlacement)=>{
    setProfileHistory(old=>[{layout:profileLayout,options:profileOptions},...old].slice(0,20));
    setProfileLayout(old=>({...old,[part]:constrainProfilePlacement(placement)}));
  },[profileLayout,profileOptions]);
  const changeLogoInside=useCallback((values:Partial<Pick<ProfileLogoOptions,"offsetX"|"offsetY"|"zoom">>)=>{
    setProfileOptions(old=>({...old,...values}));
  },[]);
  const changeProfileOption=<K extends keyof ProfileLogoOptions>(key:K,value:ProfileLogoOptions[K])=>{
    saveProfileHistory();
    setProfileOptions(old=>({...old,[key]:value}));
  };
  function undoProfileChange(){
    const previous=profileHistory[0];if(!previous)return;
    setProfileLayout(previous.layout);setProfileOptions(previous.options);
    setProfileHistory(old=>old.slice(1));
  }
  function resetProfileLayout(){
    saveProfileHistory();
    setProfileLayout(DEFAULT_PROFILE_LAYOUT);setProfileOptions(DEFAULT_PROFILE_LOGO_OPTIONS);
    setSelectedProfilePart(null);
  }
  const [profileCategory,setProfileCategory]=useState(initialProfileCategory||"");
  const [profileImageFile,setProfileImageFile]=useState<File|null>(null);
  const [profileImageLoaded,setProfileImageLoaded]=useState<{file:File;bitmap:ImageBitmap}|null>(null);
  const profileImageBitmap=profileImageLoaded?.file===profileImageFile?profileImageLoaded.bitmap:null;
  const [cleanLogo,setCleanLogo]=useState<{source:ImageBitmap;bitmap:ImageBitmap}|null>(null);
  const displayLogoBitmap=profileOptions.removeWhite&&cleanLogo?.source===profileImageBitmap
    ?cleanLogo.bitmap:profileImageBitmap;
  const profileImageReady=!!profileImageBitmap&&(!profileOptions.removeWhite||cleanLogo?.source===profileImageBitmap);
  useEffect(()=>{
    if(!profileImageBitmap||!profileOptions.removeWhite)return;
    let active=true,processed:ImageBitmap|null=null;
    void removeEdgeWhite(profileImageBitmap).then(result=>{
      processed=result;
      if(active)setCleanLogo({source:profileImageBitmap,bitmap:result});
      else result.close();
    }).catch(()=>{if(active)setError("Pozadie loga sa nepodarilo odstrániť.");});
    return()=>{active=false;processed?.close();};
  },[profileImageBitmap,profileOptions.removeWhite]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [loaded, setLoaded] = useState<{ file: File; bitmap: ImageBitmap } | null>(null);
  const bitmap = loaded?.file === photo ? loaded.bitmap : null;
  const [busy, setBusy] = useState(false);
  // Display the exact image selected in the Facebook post. Normally it is
  // staged under /media/facebook-images; allow older safe Psipedia assets too.
  // Do not silently open an empty template for a selected image.
  useEffect(() => {
    const photoUrl = initialPhotoUrl;
    if (!photoUrl) return;
    const controller = new AbortController();
    async function loadSelectedPhoto() {
      let localUrl: URL;
      try { localUrl = new URL(photoUrl, window.location.origin); }
      catch { throw Error("Adresa fotografie z vybraného článku nie je platná."); }
      if (localUrl.origin !== window.location.origin ||
          !/^\/(?:media\/(?!safe\/|quarantine\/|quality-missing-candidates\/)|images\/|migrated-media\/)/i.test(localUrl.pathname)) {
        throw Error("Fotografia musí byť dostupná na Psipedia.sk. Nahraj ju ručne.");
      }
      const response = await fetch(localUrl.pathname + localUrl.search, {
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw Error("Titulný obrázok sa nepodarilo načítať.");
      const blob = await response.blob();
      const mime = blob.type.split(";")[0].toLowerCase();
      if (!blob.size || blob.size > MAX_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(mime))
        throw Error("Titulný obrázok musí byť JPG, PNG alebo WebP do 8 MB.");
      if (!controller.signal.aborted) {
        const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
        setPhoto(new File([blob], "vybrany-obsah." + ext, { type: mime }));
        setError("");
      }
    }
    // Validation and loading errors flow through the async callback, not a
    // synchronous state update in the effect setup (React effects lint rule).
    void loadSelectedPhoto().catch(failure => {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Obrázok sa nepodarilo načítať.");
    });
    return () => controller.abort();
  }, [initialPhotoUrl]);
  const previewRef = useRef<GraphicCanvasHandle>(null);
  const [qualityWarning,setQualityWarning] = useState("");
  const onMove = useCallback((part: GraphicPart,x:number,y:number,scale?:number)=>{
    setSettings(old=>part==="photo"?{...old,photoX:x,photoY:y}
      :part==="logo"?{...old,logoX:x,logoY:y,logoScale:scale??old.logoScale}
      :{...old,headlineX:x,headlineY:y,fontSize:scale??old.fontSize});
  },[]);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(old => ({ ...old, [key]: value }));
  };

  const onDrop = useCallback((accepted: File[], rejected: { errors: { message: string }[] }[]) => {
    if (rejected.length) { setError("Použi fotografiu JPG, PNG alebo WebP do 8 MB."); return; }
    if (accepted[0]) { setPhoto(accepted[0]); setError(""); }
  }, []);
  const onLogoDrop=useCallback((accepted:File[])=>{
    if(accepted[0]){
      setProfileImageFile(accepted[0]);setCleanLogo(null);setError("");
      setProfileOptions(old=>({...old,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,
        zoom:100,offsetX:0,offsetY:0,removeWhite:false}));
    }
  },[]);
  const profileImageDropzone=useDropzone({
    onDrop:onLogoDrop,onDropRejected:()=>setError("Použi logo JPG, PNG alebo WebP do 8 MB."),
    accept:{"image/jpeg":[],"image/png":[],"image/webp":[]},
    maxSize:MAX_BYTES,multiple:false,disabled:busy,
  });
  useEffect(()=>{
    const logoUrl: string=initialProfileImageUrl??"";
    if(!logoUrl)return;
    const controller=new AbortController();
    void loadProfileImageFile(logoUrl,controller.signal).then(file=>{
      if(!controller.signal.aborted){setProfileImageFile(file);setError("");}
    }).catch(error=>{
      if(!controller.signal.aborted)setError(error instanceof Error?error.message:"Logo sa nepodarilo načítať.");
    });
    return()=>controller.abort();
  },[initialProfileImageUrl]);
  async function reloadProfileImage(){
    if(!onReloadProfileImage||imageReloading)return;
    setImageReloading(true);setError("");
    try{
      const url=await onReloadProfileImage();
      const file=await loadProfileImageFile(url);
      setProfileImageFile(file);setCleanLogo(null);
      setProfileOptions(old=>({...old,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,
        zoom:100,offsetX:0,offsetY:0,removeWhite:false}));
    }catch(error){setError(error instanceof Error?error.message:"Hlavný obrázok sa nepodarilo načítať. Nahraj ho ručne.");}
    finally{setImageReloading(false);}
  }
  function autoCropProfileImage(){
    if(!displayLogoBitmap)return;
    const crop=suggestedLogoCrop(displayLogoBitmap);
    saveProfileHistory();
    setProfileOptions(old=>({...old,...crop}));
  }
  useEffect(()=>{
    if(!profileImageFile)return;
    let active=true,bitmap:ImageBitmap|null=null;
    createImageBitmap(profileImageFile).then(value=>{
      bitmap=value;if(active)setProfileImageLoaded({file:profileImageFile,bitmap:value});else value.close();
    }).catch(()=>{if(active)setError("Logo sa nedá otvoriť.");});
    return()=>{active=false;bitmap?.close();};
  },[profileImageFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/jpeg": [], "image/png": [], "image/webp": [] },
    maxSize: MAX_BYTES,
    multiple: false,
    disabled: busy,
  });

  useEffect(() => {
    if (!photo) return;
    let active = true;
    let opened: ImageBitmap | null = null;
    createImageBitmap(photo).then(image => {
      opened = image;
      if (active) setLoaded({ file: photo, bitmap: image });
      else image.close();
    }).catch(() => { if (active) setError("Fotografia sa nedá otvoriť."); });
    return () => { active = false; opened?.close(); };
  }, [photo]);

  async function makeFile(): Promise<File> {
    if(selectedTemplate==="profile"){
      if(!settings.title.trim())throw new Error("Doplň názov profilu.");
      if(!profileCategory.trim())throw new Error("Vyber kategóriu profilu.");
      if(!profileImageBitmap)throw new Error("Najprv nahraj hlavný obrázok profilu.");
      if(!profileImageReady)throw new Error("Úprava pozadia obrázka ešte nie je dokončená.");
    }else{
      if(!bitmap)throw new Error("Najprv nahraj fotografiu.");
      if(!settings.title.trim())throw new Error("Doplň nadpis článku.");
    }
    const blob = await previewRef.current?.exportPng();
    if (!blob) throw new Error("Editor ešte nie je pripravený na export.");
    if (blob.size > MAX_BYTES) throw new Error("Výsledná grafika presiahla 8 MB. Skús štvorcový formát.");
    return new File([blob], "psipedia-facebook-grafika.png", { type: "image/png", lastModified: Date.now() });
  }

  async function applyGraphic() {
    if (busy) return;
    setError(""); setBusy(true);
    try {
      const file = await makeFile();
      await onUse(file, settings.title.trim());
    } catch (e) { setError(e instanceof Error ? e.message : "Grafiku sa nepodarilo pripraviť."); }
    finally { setBusy(false); }
  }

  async function download() {
    if (busy) return;
    setError(""); setBusy(true);
    try {
      const file = await makeFile();
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = file.name; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { setError(e instanceof Error ? e.message : "Sťahovanie zlyhalo."); }
    finally { setBusy(false); }
  }

  return <section className={styles.editor} aria-label="Grafický editor Facebook obrázkov">
    <div className={styles.top}>
      <div><h3>Grafické šablóny Psipedia</h3><p>Šesť šablón vrátane predstavenia profilu s hlavným obrázkom. Grafika sa na Facebook neodošle automaticky.</p></div>
      <button type="button" onClick={onCancel} disabled={busy}>Späť k príspevku</button>
    </div>
    <div className={styles.layout}>
      <div className={styles.controls}>
        <fieldset disabled={busy}>
          <legend>1. Vyber šablónu</legend>
          <div className={styles.templateGrid}>{TEMPLATES.map(item =>
            <button key={item.id} type="button" className={selectedTemplate === item.id ? styles.selected : ""}
              aria-pressed={selectedTemplate === item.id} onClick={()=>{
                setSelectedTemplate(item.id);
                if(item.id!=="profile")set("template",item.id);
              }}>
              <strong>{item.name}</strong><small>{item.description}</small>
            </button>)}</div>
        </fieldset>
        {selectedTemplate==="profile"&&<fieldset disabled={busy}>
          <legend>2. Údaje predstavovaného profilu</legend>
          <p className={styles.hint}>Názov, kategória a hlavný obrázok sa načítajú z vybraného profilu. Údaje môžeš upraviť.</p>
          <label>Kategória<input type="text" maxLength={80} value={profileCategory}
            onChange={event=>setProfileCategory(event.target.value)} placeholder="Napr. Veterinár"/></label>
          <label>Názov profilu<input type="text" maxLength={160} value={settings.title}
            onChange={event=>set("title",event.target.value)} placeholder="Názov prevádzky"/></label>
          <div {...profileImageDropzone.getRootProps({className:styles.dropzone})}>
            <input {...profileImageDropzone.getInputProps()} aria-label="Hlavný obrázok predstavovaného profilu"/>
            <strong>{profileImageFile?profileImageFile.name:profileImageDropzone.isDragActive?"Pusti obrázok sem":"Nahraj hlavný obrázok profilu"}</strong>
            <small>JPG, PNG alebo WebP do 8 MB. Môže to byť fotografia alebo logo prevádzky.</small>
          </div>
          <div className={styles.profileTools}>
            <button type="button" disabled={!onReloadProfileImage||imageReloading}
              onClick={()=>void reloadProfileImage()}>
              {imageReloading?"Načítavam obrázok…":"Znova načítať hlavný obrázok z profilu"}
            </button>
          </div>
          <p className={styles.hint}>Ak hlavný obrázok profilu chýba, nahraj ho ručne. Úpravy sa použijú iba v tomto obrázku. Výstup: 1080 × 1350 px.</p>
        </fieldset>}
        {selectedTemplate==="profile"&&<fieldset disabled={busy}>
          <legend>3. Voľná úprava prvkov</legend>
          <p className={styles.hint}>Ťukni na prvok v náhľade a potiahni ho prstom alebo myšou. Rohy menia veľkosť; dvoma prstami môžeš zväčšovať aj posúvať.</p>
          <div className={styles.profileParts}>
            {PROFILE_PARTS.map(part=><button key={part.id} type="button"
              className={selectedProfilePart===part.id?styles.selected:""}
              aria-pressed={selectedProfilePart===part.id} onClick={()=>setSelectedProfilePart(part.id)}>
              {part.label}
            </button>)}
          </div>
          {selectedProfilePart&&selectedProfilePart!=="logo"&&<div className={styles.profileAdjust}>
            <strong>{PROFILE_PARTS.find(p=>p.id===selectedProfilePart)?.label}</strong>
            <label>Veľkosť · {Math.round(profileLayout[selectedProfilePart].scale*100)} %
              <input type="range" min="30" max="300" step="5"
                value={Math.round(profileLayout[selectedProfilePart].scale*100)}
                onChange={e=>changeProfilePlacement(selectedProfilePart,{
                  ...profileLayout[selectedProfilePart],scale:Number(e.target.value)/100,
                })}/>
            </label>
            <label>Vodorovná poloha · {Math.round(profileLayout[selectedProfilePart].x)}
              <input type="range" min="0" max="1048" step="1" value={profileLayout[selectedProfilePart].x}
                onChange={e=>changeProfilePlacement(selectedProfilePart,{
                  ...profileLayout[selectedProfilePart],x:Number(e.target.value),
                })}/>
            </label>
            <label>Zvislá poloha · {Math.round(profileLayout[selectedProfilePart].y)}
              <input type="range" min="0" max="1318" step="1" value={profileLayout[selectedProfilePart].y}
                onChange={e=>changeProfilePlacement(selectedProfilePart,{
                  ...profileLayout[selectedProfilePart],y:Number(e.target.value),
                })}/>
            </label>
          </div>}
          {selectedProfilePart==="logo"&&<p className={styles.hint}>
            Rámik obrázka je pevný. Prstom alebo myšou posúvaš iba obrázok vnútri;
            dvojprstovým gestom ho zväčšíš. Obrázok zostáva orezaný v kruhu.
          </p>}
          <div className={styles.profileTools}>
            <button type="button" disabled={!profileHistory.length} onClick={undoProfileChange}>Späť o krok</button>
            <button type="button" onClick={resetProfileLayout}>Obnoviť pôvodné rozloženie</button>
          </div>
          <p className={styles.hint}>Rozloženie sa ukladá len do tohto prehliadača. Každý ďalší profil ho môže použiť ako základ.</p>
        </fieldset>}
        {selectedTemplate==="profile"&&<fieldset disabled={busy}>
          <legend>4. Výrez a tvar obrázka</legend>
          <label>Tvar zobrazenia
            <select value={profileOptions.shape}
              onChange={e=>changeProfileOption("shape",e.target.value as ProfileLogoShape)}>
              <option value="circle">Kruh</option>
              <option value="rounded">Zaoblený obdĺžnik</option>
              <option value="square">Štvorec</option>
              <option value="none">Bez rámčeka</option>
            </select>
          </label>
          <label>Priblíženie obrázka vo vnútri · {profileOptions.zoom} %
            <input type="range" min="40" max="280" step="5" value={profileOptions.zoom}
              onChange={e=>changeProfileOption("zoom",Number(e.target.value))}/>
          </label>
          <div className={styles.dual}>
            <label>Posun obrázka vodorovne · {profileOptions.offsetX}
              <input type="range" min="-200" max="200" value={profileOptions.offsetX}
                onChange={e=>changeProfileOption("offsetX",Number(e.target.value))}/>
            </label>
            <label>Posun obrázka zvisle · {profileOptions.offsetY}
              <input type="range" min="-200" max="200" value={profileOptions.offsetY}
                onChange={e=>changeProfileOption("offsetY",Number(e.target.value))}/>
            </label>
          </div>
          <p className={styles.hint}>Orezať okraje pôvodného obrázka (bez zmeny súboru):</p>
          <div className={styles.dual}>
            {([
              ["cropLeft","Ľavý okraj"],["cropRight","Pravý okraj"],
              ["cropTop","Horný okraj"],["cropBottom","Dolný okraj"],
            ] as const).map(([key,label])=><label key={key}>{label} · {profileOptions[key]} %
              <input type="range" min="0" max="45" step="1" value={profileOptions[key]}
                onChange={e=>changeProfileOption(key,Number(e.target.value))}/>
            </label>)}
          </div>
          <div className={styles.profileTools}>
            <button type="button" disabled={!displayLogoBitmap} onClick={autoCropProfileImage}>Automatický výrez okrajov</button>
            <button type="button" onClick={()=>{
              saveProfileHistory();setProfileOptions(old=>({...old,cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,zoom:100,offsetX:0,offsetY:0}));
            }}>Zrušiť výrez</button>
          </div>
          <label className={styles.profileCheckbox}>
            <input type="checkbox" checked={profileOptions.removeWhite}
              onChange={e=>changeProfileOption("removeWhite",e.target.checked)}/>
            Odstrániť jednoliate biele pozadie obrázka
          </label>
          <p className={styles.hint}>Odstránenie sa týka len bielej oblasti spojenej s okrajom. Pôvodný obrázok zostáva nedotknutý a zmenu môžeš kedykoľvek vypnúť.</p>
        </fieldset>}
        {selectedTemplate!=="profile"&&<fieldset disabled={busy}>
          <legend>2. Fotografia z článku/profilu alebo vlastná</legend>
          <div {...getRootProps({ className: styles.dropzone })}>
            <input {...getInputProps()} aria-label="Fotografia do grafiky" />
            <strong>{photo ? photo.name : isDragActive ? "Pusti fotografiu sem" : "Klikni alebo presuň fotografiu"}</strong>
            <small>Vybraná fotografia sa načíta automaticky. Môžeš ju nahradiť (JPG, PNG, WebP · max. 8 MB).</small>
          </div>
          <div className={styles.dual}>
            <label>Priblíženie fotografie <input type="range" min="100" max="200" step="5" value={settings.zoom} onChange={e => set("zoom", Number(e.target.value))} /></label>
            <label>Posun fotografie vodorovne <input type="range" min="-100" max="100" value={settings.photoX} onChange={e => set("photoX", Number(e.target.value))} /></label>
            <label>Posun fotografie zvisle <input type="range" min="-100" max="100" value={settings.photoY} onChange={e => set("photoY", Number(e.target.value))} /></label>
          </div>
        </fieldset>}
        {selectedTemplate!=="profile"&&<fieldset disabled={busy}>
          <legend>3. Uprav nadpis</legend>
          <p className={styles.hint}>Nadpis môžeš presunúť priamo v náhľade. Ťahaním rohov meníš jeho veľkosť.</p>
          <label>Nadpis príspevku<textarea rows={3} maxLength={160} value={settings.title} onChange={e => set("title", e.target.value)} /></label>
          <label>Zvýrazni tieto slová (musia byť súčasťou nadpisu)
            <input type="text" maxLength={80} placeholder="Napr. svojmu psovi" value={settings.emphasis} onChange={e => set("emphasis", e.target.value)} />
          </label>
          <div className={styles.dual}>
            <label>Veľkosť písma <input type="range" min="48" max="104" value={settings.fontSize} onChange={e => set("fontSize", Number(e.target.value))} /></label>
            <label>Zvislá pozícia nadpisu <input type="range" min="0" max="100" step="1" value={settings.headlineY} onChange={e => set("headlineY", Number(e.target.value))} /></label>
          </div>
          <div className={styles.dual}>
            <label>Formát <select value={settings.format} onChange={e => set("format", e.target.value as Format)}>
              <option value="portrait">Facebook príspevok 4:5 (1080 × 1350)</option>
              <option value="square">Štvorec 1:1 (1080 × 1080)</option>
            </select></label>
            <label className={styles.check}><input type="checkbox" checked={settings.showBrand} onChange={e => set("showBrand", e.target.checked)} />Zobraziť logo Psipedia</label>
          </div>
        </fieldset>}
        {selectedTemplate!=="profile"&&<fieldset disabled={busy}>
          <legend>Vzhľad fotografie</legend>
          <label>Zobrazenie obrázka
            <select value={settings.photoFit} onChange={e=>set("photoFit",e.target.value as Settings["photoFit"])}>
              <option value="cover">Vyplniť plochu – vhodné pre fotografie</option>
              <option value="contain">Zobraziť celý obrázok – vhodné pre logá a plagáty</option>
            </select>
          </label>
          <label>Intenzita stmavenia · {settings.overlay}% <input type="range" min="0" max="95" value={settings.overlay} onChange={e=>set("overlay",Number(e.target.value))}/></label>
        </fieldset>}
        {selectedTemplate!=="profile"&&<fieldset disabled={busy}>
          <legend>4. Logo Psipedia · voľná pozícia</legend>
          <p className={styles.hint}>Vyber jeden z troch variantov rovnakého loga. Potiahni ho priamo v náhľade prstom alebo myšou na ľubovoľné miesto.</p>
          <div className={styles.logoStyles}>
            {([
              ["pill", "01 · Logo na krémovom podklade"],
              ["wordmark", "02 · Logo bez podkladu"],
              ["mark", "03 · Len symbol labky"],
            ] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={settings.logoStyle===value}
              className={settings.logoStyle===value?styles.selected:""} onClick={()=>set("logoStyle",value)}>
              <span className={styles.logoThumb + " " + (value==="wordmark"?styles.logoThumbDark:"")}>
                <img className={styles.logoThumbMark} src="/favicon.svg" alt="" aria-hidden="true" />
                {value!=="mark"&&<span className={styles.logoThumbName}>psipedia<span>.sk</span></span>}
              </span>
              <small>{label}</small>
            </button>)}
          </div>
          <div className={styles.logoPositions} aria-label="Rýchle umiestnenie loga">
            {([
              ["Vľavo hore",0,0],["V strede hore",50,0],["Vpravo hore",100,0],
              ["Vľavo dole",0,100],["V strede dole",50,100],["Vpravo dole",100,100],
            ] as const).map(([label,x,y]) => <button key={label} type="button" onClick={()=>setSettings(old=>({...old,logoX:x,logoY:y}))}>{label}</button>)}
          </div>
          <div className={styles.dual}>
            <label>Veľkosť loga · {settings.logoScale}% <input type="range" min="50" max="200" step="5"
              value={settings.logoScale} onChange={e=>set("logoScale",Number(e.target.value))}/></label>
            <label>Vodorovná pozícia · {Math.round(settings.logoX)}% <input type="range" min="0" max="100"
              value={settings.logoX} onChange={e=>set("logoX",Number(e.target.value))}/></label>
            <label>Zvislá pozícia · {Math.round(settings.logoY)}% <input type="range" min="0" max="100"
              value={settings.logoY} onChange={e=>set("logoY",Number(e.target.value))}/></label>
          </div>
          <p className={styles.hint}>Logo ostáva v bezpečných okrajoch. Môžeš ho tiež úplne vypnúť v nastaveniach nadpisu.</p>
        </fieldset>}
      </div>
      <div className={[styles.previewSide,selectedTemplate==="profile"?styles.profilePreviewSide:"",
        fullPreview?styles.previewFullscreen:""].filter(Boolean).join(" ")}>
        {selectedTemplate==="profile"&&<div className={styles.previewToolbar}>
          <strong>Živý náhľad grafiky</strong>
          <button type="button" onClick={()=>setFullPreview(value=>!value)}>
            {fullPreview?"Zavrieť celý náhľad":"Zväčšiť náhľad"}
          </button>
        </div>}
        <div className={styles.previewFrame}>
          {selectedTemplate==="profile"
            ?<FacebookProfileIntroCanvas ref={previewRef} name={settings.title} category={profileCategory}
              logo={displayLogoBitmap} layout={profileLayout} logoOptions={profileOptions}
              selected={selectedProfilePart} onSelect={setSelectedProfilePart}
              onChange={changeProfilePlacement} onLogoInsideChange={changeLogoInside}/>
            :<FacebookKonvaCanvas ref={previewRef} settings={settings} bitmap={bitmap} onMove={onMove} onWarning={setQualityWarning}/>}
        </div>
        <p className={styles.note}>{selectedTemplate==="profile"?(profileImageBitmap?"Náhľad zodpovedá výslednému PNG.":"Nahraj hlavný obrázok profilu na dokončenie grafiky."):(bitmap?"Náhľad zodpovedá výslednému PNG.":"Nahraj fotografiu na dokončenie grafiky.")}</p>
        {qualityWarning && <p className={styles.error} role="status">{qualityWarning}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" disabled={busy || (selectedTemplate==="profile"?!profileImageReady:!bitmap)} onClick={() => void download()}>Stiahnuť PNG</button>
          <button className={styles.primary} type="button" disabled={busy || (selectedTemplate==="profile"?!profileImageReady:!bitmap)} onClick={() => void applyGraphic()}>{busy ? "Pripravujem…" : "Použiť v príspevku"}</button>
        </div>
      </div>
    </div>
  </section>;
}
