"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { ArticleBlocks } from "@/components/article-blocks";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import {
  articleBlockLabels,
  createArticleBlock,
  type ArticleBlock,
  type ArticleBlockImage,
  type ArticleTextAlignment,
} from "@/lib/article-blocks";
import type { ManagedArticle } from "@/lib/article-store";
import { articleHref } from "@/lib/portal";

type Props = {
  blocks: ArticleBlock[];
  onChange: (blocks: ArticleBlock[]) => void;
  currentArticleId?: number;
  onUploadingChange: (uploading: boolean) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

const blockTypes = Object.keys(articleBlockLabels) as ArticleBlock["type"][];

function cloneBlock(block: ArticleBlock): ArticleBlock {
  return { ...structuredClone(block), id: crypto.randomUUID() };
}

function RichTextInput({
  value,
  onChange,
  rows = 5,
  id,
  placeholder,
  showLists = false,
  alignment = "left",
  onAlignmentChange,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  id: string;
  placeholder?: string;
  showLists?: boolean;
  alignment?: ArticleTextAlignment;
  onAlignmentChange?: (alignment: ArticleTextAlignment) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function wrap(before: string, after = before, fallback = "text") {
    const field = ref.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function addLink() {
    const url = window.prompt("Vlož adresu odkazu (https://…):", "https://");
    if (!url) return;
    wrap("[", `](${url})`, "text odkazu");
  }

  function formatSelectedLines(kind: "bullet" | "numbered") {
    const field = ref.current;
    if (!field) return;
    const start = value.lastIndexOf("\n", Math.max(0, field.selectionStart - 1)) + 1;
    const nextBreak = value.indexOf("\n", field.selectionEnd);
    const end = nextBreak === -1 ? value.length : nextBreak;
    const source = value.slice(start, end) || "Položka zoznamu";
    const formatted = source.split("\n").map((line, index) => {
      const clean = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "");
      return kind === "bullet" ? `- ${clean}` : `${index + 1}. ${clean}`;
    }).join("\n");
    onChange(`${value.slice(0, start)}${formatted}${value.slice(end)}`);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start, start + formatted.length);
    });
  }

  return (
    <div className="admin-rich-text">
      <div className="admin-rich-toolbar" aria-label="Formátovanie textu">
        <button type="button" onClick={() => wrap("**", "**", "tučný text")} title="Tučné"><strong>B</strong></button>
        <button type="button" onClick={() => wrap("_", "_", "kurzíva")} title="Kurzíva"><em>I</em></button>
        <button type="button" onClick={addLink} title="Vložiť odkaz">🔗 Odkaz</button>
        {showLists && <button type="button" onClick={() => formatSelectedLines("bullet")} title="Odrážkový zoznam">• Zoznam</button>}
        {showLists && <button type="button" onClick={() => formatSelectedLines("numbered")} title="Číslovaný zoznam">1. Zoznam</button>}
        {onAlignmentChange && <span className="admin-rich-toolbar-separator" aria-hidden="true" />}
        {onAlignmentChange && ([
          ["left", "Vľavo"],
          ["center", "Stred"],
          ["right", "Vpravo"],
        ] as const).map(([position, label]) => <button type="button" key={position} className={alignment === position ? "is-active" : ""} aria-pressed={alignment === position} onClick={() => onAlignmentChange(position)}>{label}</button>)}
      </div>
      <textarea ref={ref} id={id} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <small>Označ text a použi formátovanie. Prázdny riadok vytvorí na webe nový odsek.</small>
    </div>
  );
}

export function AdminArticleBlockEditor({ blocks, onChange, currentArticleId, onUploadingChange, onMessage, onError }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [articles, setArticles] = useState<ManagedArticle[]>([]);

  useEffect(() => {
    fetch("/api/admin/articles")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { articles?: ManagedArticle[] }) => setArticles((data.articles ?? []).filter((item) => item.id !== currentArticleId)))
      .catch(() => undefined);
  }, [currentArticleId]);

  function update(id: string, updater: (block: ArticleBlock) => ArticleBlock) {
    onChange(blocks.map((block) => block.id === id ? updater(block) : block));
  }

  function move(index: number, offset: number) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    onChange(next);
  }

  function moveGalleryImage(blockId: string, imageIndex: number, offset: number) {
    update(blockId, (block) => {
      if (block.type !== "gallery") return block;
      const targetIndex = imageIndex + offset;
      if (targetIndex < 0 || targetIndex >= block.images.length) return block;
      const images = [...block.images];
      const [image] = images.splice(imageIndex, 1);
      images.splice(targetIndex, 0, image);
      return { ...block, images };
    });
  }

  function drop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return setDragIndex(null);
    const next = [...blocks];
    const [item] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, item);
    onChange(next);
    setDragIndex(null);
  }

  function add(type: ArticleBlock["type"]) {
    onChange([...blocks, createArticleBlock(type)]);
    setPickerOpen(false);
  }

  async function uploadSingle(event: ChangeEvent<HTMLInputElement>, blockId: string) {
    const file = event.target.files?.[0];
    if (!file) return;
    onUploadingChange(true);
    onError("");
    try {
      const data = await uploadAdminImage(file, "articles");
      update(blockId, (block) => block.type === "image" ? { ...block, url: data.imageUrl, imageKey: data.imageKey, alt: block.alt || file.name.replace(/\.[^.]+$/, "") } : block);
      onMessage(adminImageUploadMessage(data, "Ulož článok, aby sa obrázok zachoval."));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Obrázok sa nepodarilo nahrať.");
    } finally {
      onUploadingChange(false);
      event.target.value = "";
    }
  }

  async function uploadGallery(event: ChangeEvent<HTMLInputElement>, blockId: string) {
    const files = [...(event.target.files ?? [])];
    if (!files.length) return;
    onUploadingChange(true);
    onError("");
    try {
      const uploaded = await Promise.all(files.slice(0, 12).map(async (file): Promise<ArticleBlockImage> => {
        const data = await uploadAdminImage(file, "articles");
        return { url: data.imageUrl, imageKey: data.imageKey, alt: file.name.replace(/\.[^.]+$/, ""), caption: "", credit: "", size: "normal" };
      }));
      update(blockId, (block) => block.type === "gallery" ? { ...block, images: [...block.images, ...uploaded].slice(0, 24) } : block);
      onMessage(`Do galérie bolo nahraných ${uploaded.length} obrázkov. Ulož článok, aby sa zmena zachovala.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Galériu sa nepodarilo nahrať.");
    } finally {
      onUploadingChange(false);
      event.target.value = "";
    }
  }

  return (
    <>
      <div className="admin-block-list">
        {blocks.length === 0 && <div className="admin-block-empty"><strong>Článok zatiaľ nemá obsahové bloky.</strong><p>Začni textom alebo nadpisom H2.</p></div>}
        {blocks.map((block, index) => (
          <section
            className={`admin-block-card ${dragIndex === index ? "is-dragging" : ""}`}
            key={block.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => drop(index)}
          >
            <header className="admin-block-head">
              <div><button type="button" className="admin-block-grip" title="Potiahni a presuň" aria-label={`Presunúť blok ${articleBlockLabels[block.type]}`}>⠿</button><strong>{articleBlockLabels[block.type]}</strong><span>Blok {index + 1}</span></div>
              <div>
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Presunúť hore">↑</button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === blocks.length - 1} aria-label="Presunúť dole">↓</button>
                <button type="button" onClick={() => { const next = [...blocks]; next.splice(index + 1, 0, cloneBlock(block)); onChange(next); }} aria-label="Duplikovať blok">⧉</button>
                <button type="button" className="is-danger" onClick={() => onChange(blocks.filter((item) => item.id !== block.id))} aria-label="Odstrániť blok">×</button>
              </div>
            </header>

            {block.type === "text" && <RichTextInput
              id={`block-${block.id}`}
              value={block.content}
              showLists
              alignment={block.alignment ?? "left"}
              onAlignmentChange={(alignment) => update(block.id, (item) => item.type === "text" ? { ...item, alignment } : item)}
              onChange={(content) => update(block.id, (item) => item.type === "text" ? { ...item, content } : item)}
              placeholder="Napíš text článku… Prázdnym riadkom oddeľ odseky."
            />}
            {(block.type === "h2" || block.type === "h3") && <div className="admin-field"><label htmlFor={`block-${block.id}`}>{block.type === "h2" ? "Hlavný medzititulok" : "Menší podnadpis"}</label><input id={`block-${block.id}`} value={block.text} onChange={(event) => update(block.id, (item) => item.type === block.type ? { ...item, text: event.target.value } : item)} placeholder={block.type === "h2" ? "Nadpis novej časti" : "Podnadpis v rámci časti"} /></div>}

            {block.type === "image" && <div className="admin-block-image-fields">
              {block.url ? <img src={block.url} alt={block.alt} /> : <div className="admin-block-image-placeholder">Obrázok ešte nie je vybraný</div>}
              <label className="admin-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void uploadSingle(event, block.id)} />{block.url ? "Vymeniť obrázok" : "Nahrať obrázok"}</label>
              <div className="admin-field-grid">
                <div className="admin-field"><label>Alt text</label><input value={block.alt} onChange={(event) => update(block.id, (item) => item.type === "image" ? { ...item, alt: event.target.value } : item)} placeholder="Stručne opíš, čo je na obrázku" /></div>
                <div className="admin-field"><label>Popis pod obrázkom</label><input value={block.caption ?? ""} onChange={(event) => update(block.id, (item) => item.type === "image" ? { ...item, caption: event.target.value } : item)} /></div>
                <div className="admin-field"><label>Kredit / zdroj fotografie</label><input value={block.credit ?? ""} onChange={(event) => update(block.id, (item) => item.type === "image" ? { ...item, credit: event.target.value } : item)} placeholder="Autor alebo zdroj" /></div>
                <div className="admin-field"><label>Veľkosť na stránke</label><select value={block.size ?? "normal"} onChange={(event) => update(block.id, (item) => item.type === "image" ? { ...item, size: event.target.value === "wide" ? "wide" : "normal" } : item)}><option value="normal">Normálna</option><option value="wide">Široká</option></select></div>
              </div>
            </div>}

            {block.type === "gallery" && <div className="admin-gallery-editor">
              <label className="admin-upload-button"><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void uploadGallery(event, block.id)} />+ Nahrať obrázky do galérie</label>
              <div className="admin-gallery-items">{block.images.map((image, imageIndex) => <div className="admin-gallery-item" key={`${image.url}-${imageIndex}`}>
                <img src={image.url} alt={image.alt} />
                <label>Alt text<input value={image.alt} aria-label={`Alt text obrázka ${imageIndex + 1}`} onChange={(event) => update(block.id, (item) => item.type === "gallery" ? { ...item, images: item.images.map((entry, entryIndex) => entryIndex === imageIndex ? { ...entry, alt: event.target.value } : entry) } : item)} placeholder="Čo je na obrázku" /></label>
                <label>Popis pod obrázkom<input value={image.caption ?? ""} onChange={(event) => update(block.id, (item) => item.type === "gallery" ? { ...item, images: item.images.map((entry, entryIndex) => entryIndex === imageIndex ? { ...entry, caption: event.target.value } : entry) } : item)} /></label>
                <label>Kredit / zdroj<input value={image.credit ?? ""} onChange={(event) => update(block.id, (item) => item.type === "gallery" ? { ...item, images: item.images.map((entry, entryIndex) => entryIndex === imageIndex ? { ...entry, credit: event.target.value } : entry) } : item)} /></label>
                <label>Veľkosť<select value={image.size ?? "normal"} onChange={(event) => update(block.id, (item) => item.type === "gallery" ? { ...item, images: item.images.map((entry, entryIndex) => entryIndex === imageIndex ? { ...entry, size: event.target.value === "wide" ? "wide" : "normal" } : entry) } : item)}><option value="normal">Normálna</option><option value="wide">Široká</option></select></label>
                <div className="admin-gallery-item-actions">
                  <button type="button" onClick={() => moveGalleryImage(block.id, imageIndex, -1)} disabled={imageIndex === 0} aria-label={`Presunúť obrázok ${imageIndex + 1} doľava`}>←</button>
                  <button type="button" onClick={() => moveGalleryImage(block.id, imageIndex, 1)} disabled={imageIndex === block.images.length - 1} aria-label={`Presunúť obrázok ${imageIndex + 1} doprava`}>→</button>
                  <button type="button" className="is-danger" onClick={() => update(block.id, (item) => item.type === "gallery" ? { ...item, images: item.images.filter((_, entryIndex) => entryIndex !== imageIndex) } : item)}>Odstrániť</button>
                </div>
              </div>)}</div>
            </div>}

            {(block.type === "bullet-list" || block.type === "numbered-list") && <div className="admin-list-editor">
              {block.items.map((itemValue, itemIndex) => <div key={itemIndex}><span>{block.type === "numbered-list" ? `${itemIndex + 1}.` : "•"}</span><input value={itemValue} onChange={(event) => update(block.id, (item) => item.type === block.type ? { ...item, items: item.items.map((entry, entryIndex) => entryIndex === itemIndex ? event.target.value : entry) } : item)} placeholder="Položka zoznamu" /><button type="button" onClick={() => update(block.id, (item) => item.type === block.type ? { ...item, items: item.items.filter((_, entryIndex) => entryIndex !== itemIndex) } : item)} aria-label={`Odstrániť položku ${itemIndex + 1}`}>×</button></div>)}
              <button type="button" onClick={() => update(block.id, (item) => item.type === block.type ? { ...item, items: [...item.items, ""] } : item)}>+ Pridať položku</button>
            </div>}

            {(block.type === "tip" || block.type === "warning") && <RichTextInput id={`block-${block.id}`} rows={4} value={block.content} onChange={(content) => update(block.id, (item) => item.type === block.type ? { ...item, content } : item)} placeholder={block.type === "tip" ? "Praktická rada pre čitateľa…" : "Čo si musí čitateľ všimnúť alebo čomu sa vyhnúť…"} />}
            {block.type === "quote" && <><RichTextInput id={`block-${block.id}`} rows={4} value={block.content} onChange={(content) => update(block.id, (item) => item.type === "quote" ? { ...item, content } : item)} placeholder="Text citátu…" /><div className="admin-field"><label>Autor alebo zdroj citátu</label><input value={block.attribution ?? ""} onChange={(event) => update(block.id, (item) => item.type === "quote" ? { ...item, attribution: event.target.value } : item)} /></div></>}

            {block.type === "table" && <div className="admin-table-editor">
              <div className="admin-table-scroll"><table><thead><tr>{block.headers.map((header, columnIndex) => <th key={columnIndex}><input value={header} onChange={(event) => update(block.id, (item) => item.type === "table" ? { ...item, headers: item.headers.map((entry, entryIndex) => entryIndex === columnIndex ? event.target.value : entry) } : item)} /><button type="button" onClick={() => update(block.id, (item) => item.type === "table" ? { ...item, headers: item.headers.filter((_, entryIndex) => entryIndex !== columnIndex), rows: item.rows.map((row) => row.filter((_, entryIndex) => entryIndex !== columnIndex)) } : item)} aria-label={`Odstrániť stĺpec ${columnIndex + 1}`}>×</button></th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.headers.map((_, columnIndex) => <td key={columnIndex}><input value={row[columnIndex] ?? ""} onChange={(event) => update(block.id, (item) => item.type === "table" ? { ...item, rows: item.rows.map((entry, entryIndex) => entryIndex === rowIndex ? item.headers.map((__, cellIndex) => cellIndex === columnIndex ? event.target.value : entry[cellIndex] ?? "") : entry) } : item)} /></td>)}<td><button type="button" onClick={() => update(block.id, (item) => item.type === "table" ? { ...item, rows: item.rows.filter((_, entryIndex) => entryIndex !== rowIndex) } : item)} aria-label={`Odstrániť riadok ${rowIndex + 1}`}>×</button></td></tr>)}</tbody></table></div>
              <div className="admin-table-actions"><button type="button" onClick={() => update(block.id, (item) => item.type === "table" ? { ...item, headers: [...item.headers, `Stĺpec ${item.headers.length + 1}`], rows: item.rows.map((row) => [...row, ""]) } : item)}>+ Stĺpec</button><button type="button" onClick={() => update(block.id, (item) => item.type === "table" ? { ...item, rows: [...item.rows, item.headers.map(() => "")] } : item)}>+ Riadok</button></div>
            </div>}

            {block.type === "source" && <div className="admin-field-grid"><div className="admin-field"><label>Názov organizácie alebo článku</label><input value={block.label} onChange={(event) => update(block.id, (item) => item.type === "source" ? { ...item, label: event.target.value } : item)} placeholder="Napríklad AVMA alebo názov štúdie" /></div><div className="admin-field"><label>URL zdroja</label><input type="url" value={block.url} onChange={(event) => update(block.id, (item) => item.type === "source" ? { ...item, url: event.target.value } : item)} placeholder="https://…" /></div><div className="admin-field"><label>Dátum prístupu <small>nepovinný</small></label><input type="date" value={block.accessedAt ?? ""} onChange={(event) => update(block.id, (item) => item.type === "source" ? { ...item, accessedAt: event.target.value || undefined } : item)} /></div><div className="admin-field"><label>Poznámka <small>nepovinná</small></label><input value={block.note ?? ""} onChange={(event) => update(block.id, (item) => item.type === "source" ? { ...item, note: event.target.value } : item)} /></div></div>}

            {block.type === "related" && <div className="admin-field-grid"><div className="admin-field admin-field--full"><label>Vybrať existujúci článok</label><select value={articles.find((item) => articleHref(item) === block.href)?.id ?? ""} onChange={(event) => { const selected = articles.find((item) => item.id === Number(event.target.value)); if (selected) update(block.id, (item) => item.type === "related" ? { ...item, title: selected.title, href: articleHref(selected), description: selected.excerpt } : item); }}><option value="">Vyber článok…</option>{articles.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div><div className="admin-field"><label>Názov</label><input value={block.title} onChange={(event) => update(block.id, (item) => item.type === "related" ? { ...item, title: event.target.value } : item)} /></div><div className="admin-field"><label>Odkaz</label><input value={block.href} onChange={(event) => update(block.id, (item) => item.type === "related" ? { ...item, href: event.target.value } : item)} placeholder="/sekcia/adresa" /></div></div>}
            {block.type === "embed" && <div className="admin-field-grid"><div className="admin-field"><label>Odkaz na YouTube alebo Vimeo</label><input type="url" value={block.url} onChange={(event) => update(block.id, (item) => item.type === "embed" ? { ...item, url: event.target.value } : item)} placeholder="https://youtube.com/watch?v=…" /></div><div className="admin-field"><label>Názov videa</label><input value={block.title ?? ""} onChange={(event) => update(block.id, (item) => item.type === "embed" ? { ...item, title: event.target.value } : item)} /></div></div>}
          </section>
        ))}
      </div>

      <div className="admin-block-add">
        <button type="button" className="admin-block-add-button" onClick={() => setPickerOpen((value) => !value)}>+ Pridať blok</button>
        {pickerOpen && <div className="admin-block-picker">{blockTypes.map((type) => <button type="button" key={type} onClick={() => add(type)}><span>{type === "text" ? "¶" : type === "image" ? "▧" : type === "gallery" ? "▦" : type === "table" ? "▤" : type === "tip" ? "★" : type === "warning" ? "!" : type === "quote" ? "❞" : type === "embed" ? "▶" : type === "source" ? "↗" : type === "related" ? "→" : type === "bullet-list" ? "•" : type === "numbered-list" ? "1." : "H"}</span>{articleBlockLabels[type]}</button>)}</div>}
      </div>

      <details className="admin-block-preview"><summary>Náhľad blokov</summary><ArticleBlocks blocks={blocks} preview /></details>
    </>
  );
}
