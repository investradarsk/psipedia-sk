import type { ManagedArticleInput } from "@/lib/article-store";
import type { ArticleBlock } from "@/lib/article-blocks";

export type ArticleQaSeverity = "BLOCKER" | "WARNING" | "INFO";

export type ArticleQaIssue = {
  code: string;
  field: string;
  blockId?: string;
  message: string;
  severity: ArticleQaSeverity;
  suggestedAction: string;
};

export class ArticlePublishIntegrityError extends Error {
  readonly issues: ArticleQaIssue[];

  constructor(issues: ArticleQaIssue[]) {
    super("Článok zatiaľ nemožno publikovať. Oprav blokujúce položky.");
    this.name = "ArticlePublishIntegrityError";
    this.issues = issues;
  }
}

export function isArticlePublishIntegrityError(error: unknown): error is ArticlePublishIntegrityError {
  return error instanceof ArticlePublishIntegrityError
    || (Boolean(error) && typeof error === "object" && (error as { name?: string }).name === "ArticlePublishIntegrityError");
}

function comparisonText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function placeholderMatch(value: string) {
  const normalized = comparisonText(value);
  if (!normalized) return null;
  if (/\b(?:todo|fixme|placeholder|lorem ipsum)\b/.test(normalized)) return "EDITORIAL_PLACEHOLDER";
  if (normalized.includes("po publikovani bude vhodne")) return "POST_PUBLISH_EDITORIAL_NOTE";
  const lines = value.replace(/\r\n?/g, "\n").split("\n").map(comparisonText).filter(Boolean);
  if (lines.some((line) => /^(?:\[[^\]]+\]\s*)?(?:sem\s+)?doplnit(?:\s*[:.!-]|$)/.test(line))) return "EDITORIAL_PLACEHOLDER";
  return null;
}

function unsafeMarkup(value: string) {
  return /<\s*(?:script|style|iframe|object|embed)\b|\bon(?:error|load|click)\s*=|javascript\s*:|data\s*:/i.test(value);
}

function issue(input: ArticleQaIssue) {
  return input;
}

function blockTextParts(block: ArticleBlock): Array<{ field: string; value: string }> {
  if (block.type === "text" || block.type === "tip" || block.type === "warning" || block.type === "quote") return [{ field: "content", value: block.content }];
  if (block.type === "h2" || block.type === "h3") return [{ field: "text", value: block.text }];
  if (block.type === "bullet-list" || block.type === "numbered-list") return block.items.map((value, index) => ({ field: `items.${index}`, value }));
  if (block.type === "table") return [
    ...block.headers.map((value, index) => ({ field: `headers.${index}`, value })),
    ...block.rows.flatMap((row, rowIndex) => row.map((value, cellIndex) => ({ field: `rows.${rowIndex}.${cellIndex}`, value }))),
  ];
  if (block.type === "source") return [{ field: "label", value: block.label }, { field: "note", value: block.note ?? "" }];
  if (block.type === "related") return [{ field: "title", value: block.title }, { field: "description", value: block.description ?? "" }];
  if (block.type === "cta") return [{ field: "text", value: block.text }, { field: "buttonText", value: block.buttonText }];
  if (block.type === "image") return [{ field: "alt", value: block.alt }, { field: "caption", value: block.caption ?? "" }, { field: "credit", value: block.credit ?? "" }];
  if (block.type === "gallery") return block.images.flatMap((image, index) => [
    { field: `images.${index}.alt`, value: image.alt },
    { field: `images.${index}.caption`, value: image.caption ?? "" },
    { field: `images.${index}.credit`, value: image.credit ?? "" },
  ]);
  return [];
}

function sourceIssues(source: Record<string, unknown>, field: string, blockId?: string): ArticleQaIssue[] {
  const label = typeof source.label === "string" ? source.label.trim() : "";
  const url = typeof source.url === "string" ? source.url.trim() : "";
  const publisher = typeof source.publisher === "string" ? source.publisher.trim() : "";
  const doi = typeof source.doi === "string" ? source.doi.trim() : "";
  const note = typeof source.note === "string" ? source.note.trim() : "";
  const result: ArticleQaIssue[] = [];

  if (!label) result.push(issue({
    code: "SOURCE_TITLE_REQUIRED", field, blockId, severity: "BLOCKER",
    message: "Odborný zdroj nemá názov.",
    suggestedAction: "Doplň názov dokumentu, stránky, knihy alebo publikácie.",
  }));

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("unsafe");
    } catch {
      result.push(issue({
        code: "SOURCE_URL_UNSAFE", field, blockId, severity: "BLOCKER",
        message: "Zdroj obsahuje neplatnú alebo nebezpečnú URL.",
        suggestedAction: "Použi bezpečný https: odkaz alebo odôvodnený http: legacy odkaz.",
      }));
    }
  } else if (!publisher && !doi && note.length < 8) {
    result.push(issue({
      code: "SOURCE_IDENTITY_INCOMPLETE", field, blockId, severity: "BLOCKER",
      message: "Offline zdroj nemá dostatočnú bibliografickú identitu.",
      suggestedAction: "Doplň vydavateľa, DOI alebo stručnú bibliografickú poznámku. URL nevymýšľaj.",
    }));
  }

  return result;
}

export function assessArticleContentQa(payload: ManagedArticleInput): ArticleQaIssue[] {
  const result: ArticleQaIssue[] = [];
  const fields = [
    ["title", payload.title ?? ""],
    ["excerpt", payload.excerpt ?? ""],
    ["intro", payload.intro ?? ""],
    ["takeaway", payload.takeaway ?? ""],
  ] as const;

  for (const [field, value] of fields) {
    const placeholder = placeholderMatch(value);
    if (placeholder) result.push(issue({
      code: placeholder,
      field,
      severity: "BLOCKER",
      message: "Text obsahuje internú redakčnú poznámku alebo placeholder.",
      suggestedAction: "Odstráň internú poznámku alebo ju nahraď finálnym čitateľským textom.",
    }));
    if (unsafeMarkup(value)) result.push(issue({
      code: "UNSAFE_RAW_MARKUP", field, severity: "BLOCKER",
      message: "Text obsahuje nebezpečný raw HTML alebo URL protokol.",
      suggestedAction: "Odstráň raw HTML/script obsah a použi bezpečný editor alebo interný odkaz.",
    }));
  }

  for (const [sectionIndex, section] of (payload.sections ?? []).entries()) {
    const values = [section.heading, ...(section.paragraphs ?? []), ...(section.bullets ?? []), section.tip ?? ""];
    values.forEach((value, valueIndex) => {
      if (placeholderMatch(value)) result.push(issue({
        code: "EDITORIAL_PLACEHOLDER", field: `sections.${sectionIndex}.${valueIndex}`, severity: "BLOCKER",
        message: "Legacy sekcia obsahuje internú redakčnú poznámku alebo placeholder.",
        suggestedAction: "Odstráň poznámku pred publikovaním.",
      }));
      if (unsafeMarkup(value)) result.push(issue({
        code: "UNSAFE_RAW_MARKUP", field: `sections.${sectionIndex}.${valueIndex}`, severity: "BLOCKER",
        message: "Legacy sekcia obsahuje nebezpečný raw HTML obsah.",
        suggestedAction: "Odstráň raw HTML alebo nebezpečný protokol.",
      }));
    });
  }

  const rawBlocks = Array.isArray(payload.blocks) ? payload.blocks as ArticleBlock[] : [];
  for (const block of rawBlocks) {
    for (const part of blockTextParts(block)) {
      if (placeholderMatch(part.value)) result.push(issue({
        code: "EDITORIAL_PLACEHOLDER", field: `blocks.${part.field}`, blockId: block.id, severity: "BLOCKER",
        message: "Obsahový blok obsahuje internú redakčnú poznámku alebo placeholder.",
        suggestedAction: "Odstráň redakčnú poznámku alebo ju nahraď finálnym textom.",
      }));
      if (unsafeMarkup(part.value)) result.push(issue({
        code: "UNSAFE_RAW_MARKUP", field: `blocks.${part.field}`, blockId: block.id, severity: "BLOCKER",
        message: "Obsahový blok obsahuje nebezpečný raw HTML alebo URL protokol.",
        suggestedAction: "Odstráň nebezpečný obsah.",
      }));
    }

    if ((block.type === "text" || block.type === "tip" || block.type === "warning" || block.type === "quote") && !block.content.trim()) {
      result.push(issue({
        code: "EMPTY_REQUIRED_BLOCK", field: "blocks", blockId: block.id, severity: "BLOCKER",
        message: "Obsahový blok je prázdny.",
        suggestedAction: "Doplň obsah alebo blok odstráň.",
      }));
    }
    if ((block.type === "h2" || block.type === "h3") && !block.text.trim()) {
      result.push(issue({
        code: "EMPTY_REQUIRED_BLOCK", field: "blocks", blockId: block.id, severity: "BLOCKER",
        message: "Nadpisový blok je prázdny.",
        suggestedAction: "Doplň nadpis alebo blok odstráň.",
      }));
    }
    if (block.type === "image" && block.url && !block.alt.trim()) {
      result.push(issue({
        code: "IMAGE_ALT_REQUIRED", field: "blocks", blockId: block.id, severity: "BLOCKER",
        message: "Obrázok nemá alternatívny text.",
        suggestedAction: "Doplň stručný ALT text obrázka.",
      }));
    }
    if (block.type === "gallery" && block.images.some((image) => image.url && !image.alt.trim())) {
      result.push(issue({
        code: "IMAGE_ALT_REQUIRED", field: "blocks", blockId: block.id, severity: "BLOCKER",
        message: "Aspoň jeden obrázok v galérii nemá alternatívny text.",
        suggestedAction: "Doplň ALT text ku každému obrázku.",
      }));
    }
    if (block.type === "source") result.push(...sourceIssues(block as unknown as Record<string, unknown>, "blocks.source", block.id));
    if (block.type === "related") {
      if (!block.title.trim() || !block.href.trim()) result.push(issue({
        code: "RELATED_TARGET_REQUIRED", field: "blocks.related", blockId: block.id, severity: "BLOCKER",
        message: "Súvisiaci článok nemá názov alebo cieľ.",
        suggestedAction: "Vyber existujúci canonical cieľ alebo blok odstráň.",
      }));
      else if (!block.href.startsWith("/")) result.push(issue({
        code: "RELATED_TARGET_NOT_INTERNAL", field: "blocks.related", blockId: block.id, severity: "BLOCKER",
        message: "Blok „Súvisiaci článok“ musí smerovať na interný canonical cieľ.",
        suggestedAction: "Použi internú URL začínajúcu / alebo externý odkaz vlož ako bežný odkaz/CTA.",
      }));
    }
  }

  for (const [index, source] of (payload.sources ?? []).entries()) {
    result.push(...sourceIssues(source as unknown as Record<string, unknown>, `sources.${index}`));
  }

  const healthContent = payload.category === "Zdravie"
    || (payload.portalSection === "starostlivost" && payload.portalSubpage === "zdravie");
  if (healthContent) {
    const sources = [
      ...(payload.sources ?? []),
      ...rawBlocks.filter((block) => block.type === "source"),
    ];
    if (!sources.length) result.push(issue({
      code: "HEALTH_SOURCE_REQUIRED", field: "sources", severity: "BLOCKER",
      message: "Zdravotný článok nemá uvedený odborný zdroj.",
      suggestedAction: "Doplň aspoň jeden reálny odborný zdroj; URL, autora ani dátum nevymýšľaj.",
    }));
    result.push(issue({
      code: "HEALTH_DISCLAIMER_RENDERED", field: "portalSection", severity: "INFO",
      message: "Verejný article renderer pridáva informačný disclaimer a odkaz na opravy.",
      suggestedAction: "Pri akútnych témach skontroluj, že samotný obsah obsahuje jasné red flags a odporúčanie kontaktovať veterinára.",
    }));
  }

  return result;
}

export function blockerIssues(issues: ArticleQaIssue[]) {
  return issues.filter((item) => item.severity === "BLOCKER");
}
