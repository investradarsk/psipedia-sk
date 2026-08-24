import type { ArticleSection, ArticleSource } from "@/lib/content";

export type ArticleBlockImage = {
  url: string;
  imageKey?: string | null;
  alt: string;
  caption?: string;
  credit?: string;
  size?: ArticleImageSize;
};

export type ArticleImageSize = "normal" | "wide";
export type ArticleTextAlignment = "left" | "center" | "right";

export type ArticleBlock =
  | { id: string; type: "text"; content: string; alignment?: ArticleTextAlignment }
  | { id: string; type: "h2" | "h3"; text: string }
  | ({ id: string; type: "image" } & ArticleBlockImage)
  | { id: string; type: "gallery"; images: ArticleBlockImage[] }
  | { id: string; type: "bullet-list" | "numbered-list"; items: string[] }
  | { id: string; type: "tip" | "warning"; content: string }
  | { id: string; type: "quote"; content: string; attribution?: string }
  | { id: string; type: "table"; headers: string[]; rows: string[][] }
  | { id: string; type: "source"; label: string; url: string; accessedAt?: string; note?: string }
  | { id: string; type: "related"; title: string; href: string; description?: string }
  | { id: string; type: "embed"; url: string; title?: string };

export const articleBlockLabels: Record<ArticleBlock["type"], string> = {
  text: "Text",
  h2: "Nadpis H2",
  h3: "Nadpis H3",
  image: "Obrázok",
  gallery: "Galéria",
  "bullet-list": "Odrážkový zoznam",
  "numbered-list": "Číslovaný zoznam",
  tip: "Tip z praxe",
  warning: "Dôležité upozornenie",
  quote: "Citát",
  table: "Tabuľka",
  source: "Odborný zdroj",
  related: "Súvisiaci článok",
  embed: "Video / embed",
};

export function createArticleBlock(type: ArticleBlock["type"], id = crypto.randomUUID()): ArticleBlock {
  if (type === "text") return { id, type, content: "", alignment: "left" };
  if (type === "h2" || type === "h3") return { id, type, text: "" };
  if (type === "image") return { id, type, url: "", imageKey: null, alt: "", caption: "", credit: "", size: "normal" };
  if (type === "gallery") return { id, type, images: [] };
  if (type === "bullet-list" || type === "numbered-list") return { id, type, items: [""] };
  if (type === "tip" || type === "warning") return { id, type, content: "" };
  if (type === "quote") return { id, type, content: "", attribution: "" };
  if (type === "table") return { id, type, headers: ["Stĺpec 1", "Stĺpec 2"], rows: [["", ""]] };
  if (type === "source") return { id, type, label: "", url: "", note: "" };
  if (type === "related") return { id, type, title: "", href: "", description: "" };
  return { id, type: "embed", url: "", title: "" };
}

export function legacyArticleBlocks(
  sections: ArticleSection[],
  sources: ArticleSource[],
): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  (Array.isArray(sections) ? sections : []).forEach((section, sectionIndex) => {
    if (!section || typeof section !== "object") return;
    if (section.heading) blocks.push({ id: `legacy-h2-${sectionIndex}`, type: "h2", text: section.heading });
    (Array.isArray(section.paragraphs) ? section.paragraphs : []).forEach((paragraph, paragraphIndex) => {
      blocks.push({ id: `legacy-text-${sectionIndex}-${paragraphIndex}`, type: "text", content: paragraph });
    });
    if (Array.isArray(section.bullets) && section.bullets.length) {
      blocks.push({ id: `legacy-list-${sectionIndex}`, type: "bullet-list", items: section.bullets });
    }
    if (section.tip) blocks.push({ id: `legacy-tip-${sectionIndex}`, type: "tip", content: section.tip });
  });
  (Array.isArray(sources) ? sources : []).forEach((source, index) => {
    if (source && typeof source === "object") {
      blocks.push({ id: `legacy-source-${index}`, type: "source", ...source });
    }
  });
  return blocks;
}

function safeText(value: unknown, max = 20_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeId(value: unknown, index: number) {
  const id = safeText(value, 100);
  return id || `block-${index + 1}`;
}

function safeUrl(value: unknown, allowInternal = false) {
  const url = safeText(value, 2_000);
  if (allowInternal && url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : "";
  } catch {
    return "";
  }
}

function safeAlignment(value: unknown): ArticleTextAlignment {
  return value === "center" || value === "right" ? value : "left";
}

function safeImageSize(value: unknown): ArticleImageSize {
  return value === "wide" ? "wide" : "normal";
}

function safeImage(value: unknown): ArticleBlockImage | null {
  if (!value || typeof value !== "object") return null;
  const image = value as Partial<ArticleBlockImage>;
  const url = safeText(image.url, 2_000);
  if (!url || (!url.startsWith("/media/") && !url.startsWith("/images/") && !/^https:\/\//i.test(url))) return null;
  return {
    url,
    imageKey: safeText(image.imageKey, 500) || null,
    alt: safeText(image.alt, 300),
    caption: safeText(image.caption, 500) || undefined,
    credit: safeText(image.credit, 500) || undefined,
    size: safeImageSize(image.size),
  };
}

export function normalizeArticleBlocks(value: unknown): ArticleBlock[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 250).flatMap((raw, index): ArticleBlock[] => {
    if (!raw || typeof raw !== "object") return [];
    const block = raw as Record<string, unknown>;
    const id = safeId(block.id, index);
    const type = safeText(block.type, 30) as ArticleBlock["type"];
    if (type === "text") return [{ id, type, content: safeText(block.content), alignment: safeAlignment(block.alignment) }];
    if (type === "h2" || type === "h3") return [{ id, type, text: safeText(block.text, 300) }];
    if (type === "image") {
      const image = safeImage(block);
      return image ? [{ id, type, ...image }] : [{ id, type, url: "", imageKey: null, alt: "", caption: "", credit: "", size: "normal" }];
    }
    if (type === "gallery") {
      const images = Array.isArray(block.images) ? block.images.map(safeImage).filter((item): item is ArticleBlockImage => Boolean(item)).slice(0, 24) : [];
      return [{ id, type, images }];
    }
    if (type === "bullet-list" || type === "numbered-list") {
      const items = Array.isArray(block.items) ? block.items.map((item) => safeText(item, 2_000)).filter(Boolean).slice(0, 100) : [];
      return [{ id, type, items }];
    }
    if (type === "tip" || type === "warning") return [{ id, type, content: safeText(block.content, 5_000) }];
    if (type === "quote") return [{ id, type, content: safeText(block.content, 5_000), attribution: safeText(block.attribution, 300) || undefined }];
    if (type === "table") {
      const headers = Array.isArray(block.headers) ? block.headers.map((item) => safeText(item, 500)).slice(0, 12) : [];
      const rows = Array.isArray(block.rows) ? block.rows.slice(0, 100).map((row) => Array.isArray(row) ? row.slice(0, 12).map((item) => safeText(item, 2_000)) : []) : [];
      return [{ id, type, headers, rows }];
    }
    if (type === "source") return [{ id, type, label: safeText(block.label, 500), url: safeUrl(block.url), accessedAt: /^\d{4}-\d{2}-\d{2}$/.test(safeText(block.accessedAt, 10)) ? safeText(block.accessedAt, 10) : undefined, note: safeText(block.note, 1_000) || undefined }];
    if (type === "related") return [{ id, type, title: safeText(block.title, 500), href: safeUrl(block.href, true), description: safeText(block.description, 1_000) || undefined }];
    if (type === "embed") return [{ id, type, url: safeUrl(block.url), title: safeText(block.title, 500) || undefined }];
    return [];
  });
}

export function articleBlockSources(blocks: ArticleBlock[]) {
  return blocks
    .filter((block): block is Extract<ArticleBlock, { type: "source" }> => block.type === "source")
    .filter((block) => block.label && block.url)
    .map(({ label, url, accessedAt }) => ({ label, url, ...(accessedAt ? { accessedAt } : {}) }));
}

function headingSlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "cast";
}

export function articleBlockHeadings(blocks: ArticleBlock[]) {
  const used = new Map<string, number>();
  return blocks.flatMap((block) => {
    if ((block.type !== "h2" && block.type !== "h3") || !block.text) return [];
    const base = headingSlug(block.text);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return [{ blockId: block.id, id: count === 1 ? base : `${base}-${count}`, level: block.type === "h2" ? 2 as const : 3 as const, text: block.text }];
  });
}

export function articleBlockImageKeys(blocks: ArticleBlock[]) {
  const keys = new Set<string>();
  blocks.forEach((block) => {
    if (block.type === "image" && block.imageKey) keys.add(block.imageKey);
    if (block.type === "gallery") block.images.forEach((image) => { if (image.imageKey) keys.add(image.imageKey); });
  });
  return [...keys];
}

export function articleBlockPlainText(blocks: ArticleBlock[]) {
  return blocks.flatMap((block) => {
    if (block.type === "text" || block.type === "tip" || block.type === "warning" || block.type === "quote") return [block.content];
    if (block.type === "h2" || block.type === "h3") return [block.text];
    if (block.type === "bullet-list" || block.type === "numbered-list") return block.items;
    if (block.type === "table") return [...block.headers, ...block.rows.flat()];
    if (block.type === "source") return [block.label, block.note ?? ""];
    if (block.type === "related") return [block.title, block.description ?? ""];
    if (block.type === "image") return [block.alt, block.caption ?? "", block.credit ?? ""];
    if (block.type === "gallery") return block.images.flatMap((image) => [image.alt, image.caption ?? "", image.credit ?? ""]);
    return [];
  }).join(" ").replace(/[\[\]_*`]/g, " ");
}
