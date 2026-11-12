"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {useDropzone} from "react-dropzone";
import {FacebookProfileIntroCanvas} from "./facebook-profile-intro-canvas";
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
  {id:"profile",name:"06 · Predstavujeme profil",description:"Jednotná grafika s logom prevádzky, bez fotografie"},
];
const MAX_BYTES = 8 * 1024 * 1024;

export function AdminFacebookGraphicEditor({
  initialTitle,
  initialPhotoUrl,
  initialProfileCategory,
  initialProfileLogoUrl,
  onUse,
  onCancel,
}: {
  initialTitle: string;
  initialPhotoUrl?: string;
  initialProfileCategory?: string;
  initialProfileLogoUrl?: string;
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
  const [selectedTemplate,setSelectedTemplate]=useState<Template>("gradient");
  const [profileCategory,setProfileCategory]=useState(initialProfileCategory||"");
  const [profileLogoFile,setProfileLogoFile]=useState<File|null>(null);
  const [profileLogoLoaded,setProfileLogoLoaded]=useState<{file:File;bitmap:ImageBitmap}|null>(null);
  const profileLogoBitmap=profileLogoLoaded?.file===profileLogoFile?profileLogoLoaded.bitmap:null;
  const [photo, setPhoto] = useState<File | null>(null);
  const [loaded, setLoaded] = useState<{ file: File; bitmap: ImageBitmap } | null>(null);
  const bitmap = loaded?.file === photo ? loaded.bitmap : null;
  const [error, setError] = useState("");
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
    if(accepted[0]){setProfileLogoFile(accepted[0]);setError("");}
  },[]);
  const logoDropzone=useDropzone({
    onDrop:onLogoDrop,onDropRejected:()=>setError("Použi logo JPG, PNG alebo WebP do 8 MB."),
    accept:{"image/jpeg":[],"image/png":[],"image/webp":[]},
    maxSize:MAX_BYTES,multiple:false,disabled:busy,
  });
  useEffect(()=>{
    const logoUrl=initialProfileLogoUrl;
    if(!logoUrl)return;
    const controller=new AbortController();
    async function loadLogo(){
      const url=new URL(logoUrl,window.location.origin);
      if(url.origin!==window.location.origin||!url.pathname.startsWith("/media/facebook-images/"))
        throw Error("Logo musí byť uložené na Psipedia.sk. Nahraj ho ručne.");
      const response=await fetch(url.pathname+url.search,{credentials:"same-origin",cache:"no-store",signal:controller.signal});
      if(!response.ok)throw Error("Logo sa nepodarilo načítať. Nahraj ho ručne.");
      const blob=await response.blob();
      const mime=blob.type.split(";")[0].toLowerCase();
      if(!blob.size||blob.size>MAX_BYTES||!["image/jpeg","image/png","image/webp"].includes(mime))
        throw Error("Logo musí byť JPG, PNG alebo WebP do 8 MB.");
      if(!controller.signal.aborted)setProfileLogoFile(new File([blob],"logo-profilu",{type:mime}));
    }
    void loadLogo().catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:"Logo sa nepodarilo načítať.");});
    return()=>controller.abort();
  },[initialProfileLogoUrl]);
  useEffect(()=>{
    if(!profileLogoFile)return;
    let active=true,bitmap:ImageBitmap|null=null;
    createImageBitmap(profileLogoFile).then(value=>{
      bitmap=value;if(active)setProfileLogoLoaded({file:profileLogoFile,bitmap:value});else value.close();
    }).catch(()=>{if(active)setError("Logo sa nedá otvoriť.");});
    return()=>{active=false;bitmap?.close();};
  },[profileLogoFile]);

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
      if(!profileLogoBitmap)throw new Error("Najprv nahraj logo profilu.");
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
      <div><h3>Grafické šablóny Psipedia</h3><p>Šesť šablón vrátane predstavenia profilu bez fotografie. Grafika sa na Facebook neodošle automaticky.</p></div>
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
          <p className={styles.hint}>Názov, kategória a logo sa načítajú z vybraného profilu, ak sú dostupné. Údaje môžeš upraviť.</p>
          <label>Kategória<input type="text" maxLength={80} value={profileCategory}
            onChange={event=>setProfileCategory(event.target.value)} placeholder="Napr. Veterinár"/></label>
          <label>Názov profilu<input type="text" maxLength={160} value={settings.title}
            onChange={event=>set("title",event.target.value)} placeholder="Názov prevádzky"/></label>
          <div {...logoDropzone.getRootProps({className:styles.dropzone})}>
            <input {...logoDropzone.getInputProps()} aria-label="Logo predstavovaného profilu"/>
            <strong>{profileLogoFile?profileLogoFile.name:logoDropzone.isDragActive?"Pusti logo sem":"Nahraj logo prevádzky"}</strong>
            <small>JPG, PNG alebo WebP do 8 MB. Nevyžaduje sa fotografia psa.</small>
          </div>
          <p className={styles.hint}>Rozmer výstupu: 1080 × 1350 px (4:5).</p>
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
      <div className={styles.previewSide}>
        <div className={styles.previewFrame}>
          {selectedTemplate==="profile"
            ?<FacebookProfileIntroCanvas ref={previewRef} name={settings.title} category={profileCategory} logo={profileLogoBitmap}/>
            :<FacebookKonvaCanvas ref={previewRef} settings={settings} bitmap={bitmap} onMove={onMove} onWarning={setQualityWarning}/>}
        </div>
        <p className={styles.note}>{selectedTemplate==="profile"?(profileLogoBitmap?"Náhľad zodpovedá výslednému PNG.":"Nahraj logo profilu na dokončenie grafiky."):(bitmap?"Náhľad zodpovedá výslednému PNG.":"Nahraj fotografiu na dokončenie grafiky.")}</p>
        {qualityWarning && <p className={styles.error} role="status">{qualityWarning}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" disabled={busy || (selectedTemplate==="profile"?!profileLogoBitmap:!bitmap)} onClick={() => void download()}>Stiahnuť PNG</button>
          <button className={styles.primary} type="button" disabled={busy || (selectedTemplate==="profile"?!profileLogoBitmap:!bitmap)} onClick={() => void applyGraphic()}>{busy ? "Pripravujem…" : "Použiť v príspevku"}</button>
        </div>
      </div>
    </div>
  </section>;
}
