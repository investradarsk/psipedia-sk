"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDropzone } from "react-dropzone";
import styles from "./admin-facebook-graphic-editor.module.css";

type Template = "gradient" | "panel" | "editorial";
type Format = "portrait" | "square";
type LogoStyle = "pill" | "wordmark" | "mark";
type Line = { text: string; accent: boolean };
type Settings = {
  template: Template;
  format: Format;
  title: string;
  emphasis: string;
  fontSize: number;
  vertical: number;
  zoom: number;
  photoX: number;
  photoY: number;
  showBrand: boolean;
  logoStyle: LogoStyle;
  logoX: number;
  logoY: number;
  logoScale: number;
};

const TEMPLATES: { id: Template; name: string; description: string }[] = [
  { id: "gradient", name: "01 · Titulok cez fotografiu", description: "Tmavý prechod, biely nadpis, červené zvýraznenie" },
  { id: "panel", name: "02 · Zelený panel", description: "Výrazný nadpis na tmavozelenom podklade" },
  { id: "editorial", name: "03 · Redakčný pás", description: "Krémový pás, zelené písmo a tehlovočervený akcent" },
];
const GREEN = "#073b2b";
const RED = "#c93624";
const CREAM = "#fff8ed";
const MAX_BYTES = 8 * 1024 * 1024;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function wrap(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const all: string[] = [];
  for (const paragraph of value.split(/\n/)) {
    if (!paragraph.trim()) { all.push(""); continue; }
    let current = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = current ? current + " " + word : word;
      if (current && ctx.measureText(candidate).width > maxWidth) {
        all.push(current); current = word;
      } else current = candidate;
    }
    if (current) all.push(current);
  }
  return all;
}

function headlineLines(ctx: CanvasRenderingContext2D, title: string, emphasis: string, maxWidth: number, fontSize: number): Line[] {
  ctx.font = "800 " + fontSize + "px Arial, sans-serif";
  const needle = emphasis.trim();
  const index = needle ? title.toLocaleLowerCase("sk").indexOf(needle.toLocaleLowerCase("sk")) : -1;
  const segments = index < 0 ? [{ text: title, accent: false }] : [
    { text: title.slice(0, index).trim(), accent: false },
    { text: title.slice(index, index + needle.length).trim(), accent: true },
    { text: title.slice(index + needle.length).trim(), accent: false },
  ];
  return segments.flatMap(part => part.text ? wrap(ctx, part.text, maxWidth - (part.accent ? 42 : 0))
    .map(text => ({ text, accent: part.accent })) : []);
}

/** Three layouts of the same Psipedia brand mark, never three competing logos. */
function logoBounds(ctx: CanvasRenderingContext2D, settings: Settings, width: number, height: number) {
  ctx.save();
  ctx.font = "bold 39px Arial, sans-serif";
  const textWidth = ctx.measureText("psipedia").width + ctx.measureText(".sk").width;
  ctx.restore();
  const scale = settings.logoScale / 100;
  const baseWidth = settings.logoStyle === "mark" ? 72
    : 64 + 17 + textWidth + (settings.logoStyle === "pill" ? 30 : 0);
  const w = baseWidth * scale;
  const h = 82 * scale;
  const margin = 24;
  const spaceX = Math.max(0, width - 2 * margin - w);
  const spaceY = Math.max(0, height - 2 * margin - h);
  return {x: margin + spaceX * settings.logoX / 100, y: margin + spaceY * settings.logoY / 100,
    w, h, scale, margin, spaceX, spaceY, baseWidth};
}
function brand(ctx: CanvasRenderingContext2D, width: number, height: number, settings: Settings) {
  const bounds = logoBounds(ctx, settings, width, height);
  ctx.save();
  ctx.translate(bounds.x, bounds.y);
  ctx.scale(bounds.scale, bounds.scale);
  if (settings.logoStyle === "pill") {
    ctx.fillStyle = "rgba(255, 249, 235, .97)";
    roundedRect(ctx, 0, 0, bounds.baseWidth, 82, 24);
  } else if (settings.logoStyle === "wordmark") {
    ctx.shadowColor = "rgba(0,0,0,.38)";
    ctx.shadowBlur = 14;
  }
  const markX = settings.logoStyle === "pill" ? 14 : 0;
  ctx.fillStyle = "#174b38";
  roundedRect(ctx, markX, 9, 64, 64, 18);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#fffdf8";
  ctx.save();
  ctx.translate(markX, 9);
  const pads: [number, number, number, number, number][] = [
    [19, 25, 6, 8, -26], [28, 17, 6, 8, -8],
    [40, 18, 6, 8, 10], [48, 27, 6, 8, 28],
  ];
  pads.forEach(([cx, cy, rx, ry, deg]) => {
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, deg * Math.PI / 180, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fill(new Path2D("M33.5 29c-9 0-16 8.6-16 16 0 5.4 4 8.5 9 8.5 2.7 0 4.6-1.7 7-1.7s4.3 1.7 7 1.7c5 0 9-3.1 9-8.5 0-7.4-7-16-16-16Z"));
  ctx.restore();
  if (settings.logoStyle !== "mark") {
    const textX = markX + 81;
    ctx.font = "bold 39px Arial, sans-serif";
    ctx.fillStyle = settings.logoStyle === "wordmark" ? "#fffdf8" : GREEN;
    ctx.fillText("psipedia", textX, 56);
    const widthOfName = ctx.measureText("psipedia").width;
    ctx.fillStyle = settings.logoStyle === "wordmark" ? "#f8a38f" : RED;
    ctx.fillText(".sk", textX + widthOfName, 56);
  }
  ctx.restore();
}

function paintBackground(ctx: CanvasRenderingContext2D, bitmap: ImageBitmap | null, settings: Settings, width: number, height: number) {
  if (!bitmap) {
    const fill = ctx.createLinearGradient(0, 0, width, height);
    fill.addColorStop(0, "#6c886b");
    fill.addColorStop(.52, "#254d3a");
    fill.addColorStop(1, "#092e25");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  const cover = Math.max(width / bitmap.width, height / bitmap.height) * settings.zoom / 100;
  const drawWidth = bitmap.width * cover;
  const drawHeight = bitmap.height * cover;
  const remainingX = drawWidth - width;
  const remainingY = drawHeight - height;
  const x = -remainingX * (1 + settings.photoX / 100) / 2;
  const y = -remainingY * (1 + settings.photoY / 100) / 2;
  ctx.drawImage(bitmap, x, y, drawWidth, drawHeight);
}

function renderGraphic(canvas: HTMLCanvasElement, bitmap: ImageBitmap | null, settings: Settings): string | null {
  const width = 1080;
  const height = settings.format === "portrait" ? 1350 : 1080;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "Prehliadač nepodporuje vykreslenie obrázka.";
  ctx.clearRect(0, 0, width, height);
  paintBackground(ctx, bitmap, settings, width, height);

  const inset = 76;
  const maxWidth = width - inset * 2;
  let fontSize = settings.fontSize;
  let lines: Line[] = [];
  let lineHeight = fontSize * 1.19;
  const maxTextHeight = height * (settings.template === "editorial" ? .43 : .40);
  while (fontSize >= 36) {
    lines = headlineLines(ctx, settings.title.trim(), settings.emphasis, maxWidth - 34, fontSize);
    lineHeight = fontSize * 1.19;
    if (lines.length * lineHeight <= maxTextHeight && lines.length <= 7) break;
    fontSize -= 2;
  }
  if (!lines.length || lines.length * lineHeight > maxTextHeight) return "Nadpis je príliš dlhý. Skráť ho, prosím.";

  const blockHeight = lines.length * lineHeight;
  const baselineOffset = fontSize * .82;
  const bottom = height - 128 + settings.vertical;
  const top = Math.max(160, Math.min(height - blockHeight - 40, bottom - blockHeight));
  if (settings.template === "gradient") {
    const gradient = ctx.createLinearGradient(0, height * .36, 0, height);
    gradient.addColorStop(0, "rgba(2, 35, 26, 0)");
    gradient.addColorStop(.5, "rgba(2, 35, 26, .58)");
    gradient.addColorStop(1, "rgba(2, 35, 26, .91)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, height * .36, width, height * .64);
  } else if (settings.template === "panel") {
    ctx.fillStyle = "rgba(3, 54, 38, .95)";
    roundedRect(ctx, 36, top - 70, width - 72, blockHeight + 139, 35);
    ctx.fillStyle = RED;
    roundedRect(ctx, 56, top - 74, 182, 12, 6);
  } else {
    ctx.fillStyle = "rgba(255, 249, 235, .96)";
    roundedRect(ctx, 38, top - 62, width - 76, blockHeight + 130, 28);
    ctx.fillStyle = RED;
    roundedRect(ctx, 38, top - 62, 14, blockHeight + 130, 6);
  }

  ctx.textBaseline = "alphabetic";
  ctx.font = "800 " + fontSize + "px Arial, sans-serif";
  lines.forEach((line, i) => {
    const textY = top + i * lineHeight + baselineOffset;
    const textWidth = ctx.measureText(line.text).width;
    const textX = inset;
    if (line.accent) {
      ctx.fillStyle = RED;
      roundedRect(ctx, textX - 13, textY - fontSize * .88, Math.min(maxWidth + 12, textWidth + 28), fontSize * 1.12, 11);
    }
    ctx.fillStyle = line.accent ? "#ffffff" : settings.template === "editorial" ? GREEN : CREAM;
    ctx.fillText(line.text, textX, textY);
  });
  if (settings.template === "gradient") {
    ctx.fillStyle = RED;
    roundedRect(ctx, inset, Math.min(height - 44, top + blockHeight + 17), 186, 9, 4);
  }
  if (settings.showBrand) brand(ctx, width, height, settings);
  return null;
}

function exportBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Export obrázka sa nepodaril.")), "image/png");
  });
}

export function AdminFacebookGraphicEditor({
  initialTitle,
  initialPhotoUrl,
  onUse,
  onCancel,
}: {
  initialTitle: string;
  initialPhotoUrl?: string;
  onUse: (file: File, title: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [settings, setSettings] = useState<Settings>({
    template: "gradient",
    format: "portrait",
    title: initialTitle && initialTitle !== "Nový príspevok" ? initialTitle : "5 tipov, ako lepšie porozumieť svojmu psovi",
    emphasis: "",
    fontSize: 74,
    vertical: 0,
    zoom: 100,
    photoX: 0,
    photoY: 0,
    showBrand: true,
    logoStyle: "pill",
    logoX: 0,
    logoY: 0,
    logoScale: 100,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [loaded, setLoaded] = useState<{ file: File; bitmap: ImageBitmap } | null>(null);
  const bitmap = loaded?.file === photo ? loaded.bitmap : null;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Reuse the copy of a selected article/profile image already staged in R2.
  useEffect(() => {
    if (!initialPhotoUrl || !/^\/media\/facebook-images\/[a-z0-9/_.-]+$/i.test(initialPhotoUrl)) return;
    const controller = new AbortController();
    fetch(initialPhotoUrl, { credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("Titulný obrázok sa nepodarilo načítať.");
        const blob = await response.blob();
        if (blob.size > MAX_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(blob.type))
          throw Error("Titulný obrázok musí byť JPG, PNG alebo WebP do 8 MB.");
        if (!controller.signal.aborted) {
          const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
          setPhoto(new File([blob], "vybrany-obsah." + ext, { type: blob.type }));
        }
      }).catch(failure => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Obrázok sa nepodarilo načítať.");
      });
    return () => controller.abort();
  }, [initialPhotoUrl]);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const logoDrag = useRef<{pointerId:number;offsetX:number;offsetY:number}|null>(null);
  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    // The preview uses object-fit: contain at small widths: account for letterboxing.
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const contentWidth = canvas.width * scale;
    const contentHeight = canvas.height * scale;
    return {
      x: (event.clientX - rect.left - (rect.width - contentWidth) / 2) / scale,
      y: (event.clientY - rect.top - (rect.height - contentHeight) / 2) / scale,
    };
  };
  const startLogoDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!settings.showBrand || busy) return;
    const canvas = event.currentTarget;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const box = logoBounds(ctx, settings, canvas.width, canvas.height);
    const position = canvasPoint(event);
    if (position.x < box.x || position.x > box.x + box.w ||
        position.y < box.y || position.y > box.y + box.h) return;
    logoDrag.current = {pointerId:event.pointerId,offsetX:position.x-box.x,offsetY:position.y-box.y};
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveLogoDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = logoDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const canvas = event.currentTarget;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const box = logoBounds(ctx, settings, canvas.width, canvas.height);
    const point = canvasPoint(event);
    const clamp = (value:number) => Math.max(0,Math.min(100,value));
    setSettings(old => ({
      ...old,
      logoX: box.spaceX ? clamp(100*(point.x-drag.offsetX-box.margin)/box.spaceX) : 0,
      logoY: box.spaceY ? clamp(100*(point.y-drag.offsetY-box.margin)/box.spaceY) : 0,
    }));
    event.preventDefault();
  };
  const endLogoDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (logoDrag.current?.pointerId === event.pointerId) logoDrag.current = null;
  };
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(old => ({ ...old, [key]: value }));
  };

  const onDrop = useCallback((accepted: File[], rejected: { errors: { message: string }[] }[]) => {
    if (rejected.length) { setError("Použi fotografiu JPG, PNG alebo WebP do 8 MB."); return; }
    if (accepted[0]) { setPhoto(accepted[0]); setError(""); }
  }, []);
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

  useEffect(() => {
    if (previewRef.current) renderGraphic(previewRef.current, bitmap, settings);
  }, [bitmap, settings]);

  async function makeFile(): Promise<File> {
    if (!bitmap) throw new Error("Najprv nahraj fotografiu.");
    if (!settings.title.trim()) throw new Error("Doplň nadpis článku.");
    const canvas = document.createElement("canvas");
    const problem = renderGraphic(canvas, bitmap, settings);
    if (problem) throw new Error(problem);
    const blob = await exportBlob(canvas);
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
      <div><h3>Grafické šablóny Psipedia</h3><p>Tri opakovane použiteľné návrhy bez predvolenej fotografie. Grafika sa na Facebook neodošle automaticky.</p></div>
      <button type="button" onClick={onCancel} disabled={busy}>Späť k príspevku</button>
    </div>
    <div className={styles.layout}>
      <div className={styles.controls}>
        <fieldset disabled={busy}>
          <legend>1. Vyber šablónu</legend>
          <div className={styles.templateGrid}>{TEMPLATES.map(item =>
            <button key={item.id} type="button" className={settings.template === item.id ? styles.selected : ""}
              aria-pressed={settings.template === item.id} onClick={() => set("template", item.id)}>
              <strong>{item.name}</strong><small>{item.description}</small>
            </button>)}</div>
        </fieldset>
        <fieldset disabled={busy}>
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
        </fieldset>
        <fieldset disabled={busy}>
          <legend>3. Uprav nadpis</legend>
          <label>Nadpis článku<textarea rows={3} maxLength={160} value={settings.title} onChange={e => set("title", e.target.value)} /></label>
          <label>Zvýrazni tieto slová (musia byť súčasťou nadpisu)
            <input type="text" maxLength={80} placeholder="Napr. svojmu psovi" value={settings.emphasis} onChange={e => set("emphasis", e.target.value)} />
          </label>
          <div className={styles.dual}>
            <label>Veľkosť písma <input type="range" min="48" max="104" value={settings.fontSize} onChange={e => set("fontSize", Number(e.target.value))} /></label>
            <label>Posun nadpisu <input type="range" min="-170" max="100" step="10" value={settings.vertical} onChange={e => set("vertical", Number(e.target.value))} /></label>
          </div>
          <div className={styles.dual}>
            <label>Formát <select value={settings.format} onChange={e => set("format", e.target.value as Format)}>
              <option value="portrait">Facebook príspevok 4:5 (1080 × 1350)</option>
              <option value="square">Štvorec 1:1 (1080 × 1080)</option>
            </select></label>
            <label className={styles.check}><input type="checkbox" checked={settings.showBrand} onChange={e => set("showBrand", e.target.checked)} />Zobraziť logo Psipedia</label>
          </div>
        </fieldset>
        <fieldset disabled={busy}>
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
                <span className={styles.logoThumbMark} aria-hidden="true" />
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
            <label>Veľkosť loga · {settings.logoScale}% <input type="range" min="65" max="160" step="5"
              value={settings.logoScale} onChange={e=>set("logoScale",Number(e.target.value))}/></label>
            <label>Vodorovná pozícia · {Math.round(settings.logoX)}% <input type="range" min="0" max="100"
              value={settings.logoX} onChange={e=>set("logoX",Number(e.target.value))}/></label>
            <label>Zvislá pozícia · {Math.round(settings.logoY)}% <input type="range" min="0" max="100"
              value={settings.logoY} onChange={e=>set("logoY",Number(e.target.value))}/></label>
          </div>
          <p className={styles.hint}>Logo ostáva v bezpečných okrajoch. Môžeš ho tiež úplne vypnúť v nastaveniach nadpisu.</p>
        </fieldset>
      </div>
      <div className={styles.previewSide}>
        <div className={styles.previewFrame}>
          <canvas ref={previewRef} className={styles.canvas} role="img" aria-label="Živý náhľad Facebook grafiky · potiahni logo prstom alebo myšou" onPointerDown={startLogoDrag} onPointerMove={moveLogoDrag} onPointerUp={endLogoDrag} onPointerCancel={endLogoDrag} />
        </div>
        <p className={styles.note}>{bitmap ? "Náhľad zodpovedá výslednému PNG." : "Náhľad šablóny bez psa. Nahraj vlastnú fotografiu, aby si mohol vytvoriť výsledný obrázok."}</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" disabled={busy || !bitmap} onClick={() => void download()}>Stiahnuť PNG</button>
          <button className={styles.primary} type="button" disabled={busy || !bitmap} onClick={() => void applyGraphic()}>{busy ? "Pripravujem…" : "Použiť v príspevku"}</button>
        </div>
      </div>
    </div>
  </section>;
}
