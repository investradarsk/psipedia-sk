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

function plainTextRelationNote(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n").map(comparisonText).filter(Boolean);
  return lines.some((line) => /^(?:súvisiaci|suvisiaci) (?:článok|clanok|podsekcia)\s*:\s*\S+/.test(line));
}

function unsupportedVerificationClaim(value: string) {
  const normalized = comparisonText(value);
  return /\b(?:overene veterinarom|odborne overene|overeny clanok)\b/.test(normalized);
}

function unsafeMarkup(value: string) {
  return /<\s*(?:script|style|iframe|object|embed)\b|\bon(?:error|load|click)\s*=|javascript\s*:|\b(?:href|src)\s*=\s*["']?\s*data\s*:/i.test(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function issue(input: ArticleQaIssue) {
  return input;
}

function blockTextParts(block: ArticleBlock): Array<{ field: string; value: string }> {
  const raw = block as unknown as Record<string, unknown>;
  const type = stringValue(raw.type);
  if (type === "text" || type === "tip" || type === "warning" || type === "quote") return [{ field: "content", value: stringValue(raw.content) }];
  if (type === "h2" || type === "h3") return [{ field: "text", value: stringValue(raw.text) }];
  if (type === "bullet-list" || type === "numbered-list") {
    return (Array.isArray(raw.items) ? raw.items : []).map((value, index) => ({ field: `items.${index}`, value: stringValue(value) }));
  }
  if (type === "table") {
    const headers = Array.isArray(raw.headers) ? raw.headers : [];
    const rows = Array.isArray(raw.rows) ? raw.rows : [];
    return [
      ...headers.map((value, index) => ({ field: `headers.${index}`, value: stringValue(value) })),
      ...rows.flatMap((row, rowIndex) => Array.isArray(row) ? row.map((value, cellIndex) => ({ field: `rows.${rowIndex}.${cellIndex}`, value: stringValue(value) })) : []),
    ];
  }
  if (type === "source") return [{ field: "label", value: stringValue(raw.label) }, { field: "note", value: stringValue(raw.note) }];
  if (type === "related") return [{ field: "title", value: stringValue(raw.title) }, { field: "description", value: stringValue(raw.description) }];
  if (type === "cta") return [{ field: "text", value: stringValue(raw.text) }, { field: "buttonText", value: stringValue(raw.buttonText) }];
  if (type === "image") return [{ field: "alt", value: stringValue(raw.alt) }, { field: "caption", value: stringValue(raw.caption) }, { field: "credit", value: stringValue(raw.credit) }];
  if (type === "gallery") {
    return (Array.isArray(raw.images) ? raw.images : []).flatMap((image, index) => {
      const item = image && typeof image === "object" ? image as Record<string, unknown> : {};
      return [
        { field: `images.${index}.alt`, value: stringValue(item.alt) },
        { field: `images.${index}.caption`, value: stringValue(item.caption) },
        { field: `images.${index}.credit`, value: stringValue(item.credit) },
      ];
    });
  }
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

  const accessedAt = typeof source.accessedAt === "string" ? source.accessedAt.trim() : "";
  if (accessedAt && !/^\d{4}-\d{2}-\d{2}$/.test(accessedAt)) {
    result.push(issue({
      code: "SOURCE_ACCESS_DATE_INVALID", field, blockId, severity: "BLOCKER",
      message: "Dátum prístupu k zdroju nemá platný ISO formát.",
      suggestedAction: "Dátum oprav alebo ho odstráň; neznámy dátum sa nevymýšľa.",
    }));
  }

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
    if (plainTextRelationNote(value)) result.push(issue({
      code: "PLAIN_TEXT_RELATION_NOTE", field, severity: "BLOCKER",
      message: "Text obsahuje redakčnú poznámku o súvisiacom obsahu namiesto canonical vzťahu.",
      suggestedAction: "Použi canonical relation blok alebo poznámku odstráň.",
    }));
    if (unsupportedVerificationClaim(value)) result.push(issue({
      code: "UNSUPPORTED_VERIFICATION_CLAIM", field, severity: "BLOCKER",
      message: "Text používa nepodložené všeobecné tvrdenie o odbornom overení.",
      suggestedAction: "Odstráň všeobecné „Overené“ tvrdenie.",
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

  const rawBlocks = Array.isArray(payload.blocks)
    ? payload.blocks.filter((block): block is ArticleBlock => Boolean(block) && typeof block === "object")
    : [];
  for (const block of rawBlocks) {
    for (const part of blockTextParts(block)) {
      if (placeholderMatch(part.value)) result.push(issue({
        code: "EDITORIAL_PLACEHOLDER", field: `blocks.${part.field}`, blockId: block.id, severity: "BLOCKER",
        message: "Obsahový blok obsahuje internú redakčnú poznámku alebo placeholder.",
        suggestedAction: "Odstráň redakčnú poznámku alebo ju nahraď finálnym textom.",
      }));
      if (plainTextRelationNote(part.value)) result.push(issue({
        code: "PLAIN_TEXT_RELATION_NOTE", field: `blocks.${part.field}`, blockId: block.id, severity: "BLOCKER",
        message: "Text obsahuje redakčnú poznámku o súvisiacom článku alebo podsekcii namiesto canonical vzťahu.",
        suggestedAction: "Použi existujúci relation blok s platným canonical cieľom alebo poznámku odstráň.",
      }));
      if (unsupportedVerificationClaim(part.value)) result.push(issue({
        code: "UNSUPPORTED_VERIFICATION_CLAIM", field: `blocks.${part.field}`, blockId: block.id, severity: "BLOCKER",
        message: "Obsah používa nepodložené všeobecné tvrdenie o odbornom overení.",
        suggestedAction: "Odstráň všeobecné „Overené“ tvrdenie; zobraz iba konkrétne údaje reviewera, ak sú reálne evidované.",
      }));
      if (unsafeMarkup(part.value)) result.push(issue({
        code: "UNSAFE_RAW_MARKUP", field: `blocks.${part.field}`, blockId: block.id, severity: "BLOCKER",
        message: "Obsahový blok obsahuje nebezpečný raw HTML alebo URL protokol.",
        suggestedAction: "Odstráň nebezpečný obsah.",
      }));
    }

    const rawBlock = block as unknown as Record<string, unknown>;
    if ((block.type === "text" || block.type === "tip" || block.type === "warning" || block.type === "quote") && !stringValue(rawBlock.content).trim()) {
      result.push(issue({
        code: "EMPTY_REQUIRED_BLOCK", field: "blocks", blockId: block.id, severity: "BLOCKER",
        message: "Obsahový blok je prázdny.",
        suggestedAction: "Doplň obsah alebo blok odstráň.",
      }));
    }
    if ((block.type === "h2" || block.type === "h3") && !stringValue(rawBlock.text).trim()) {
      result.push(issue({
        code: "EMPTY_REQUIRED_BLOCK", field: "blocks", blockId: block.id, severity: "BLOCKER",
        message: "Nadpisový blok je prázdny.",
        suggestedAction: "Doplň nadpis alebo blok odstráň.",
      }));
    }
    if (block.type === "image" && stringValue(rawBlock.url) && !stringValue(rawBlock.alt).trim()) {
      result.push(issue({
        code: "IMAGE_ALT_REQUIRED", field: "blocks", blockId: block.id, severity: "BLOCKER",
        message: "Obrázok nemá alternatívny text.",
        suggestedAction: "Doplň stručný ALT text obrázka.",
      }));
    }
    if (block.type === "gallery" && (Array.isArray(rawBlock.images) ? rawBlock.images : []).some((image) => {
      const item = image && typeof image === "object" ? image as Record<string, unknown> : {};
      return Boolean(stringValue(item.url)) && !stringValue(item.alt).trim();
    })) {
      result.push(issue({
        code: "IMAGE_ALT_REQUIRED", field: "blocks", blockId: block.id, severity: "BLOCKER",
        message: "Aspoň jeden obrázok v galérii nemá alternatívny text.",
        suggestedAction: "Doplň ALT text ku každému obrázku.",
      }));
    }
    if (block.type === "source") result.push(...sourceIssues(block as unknown as Record<string, unknown>, "blocks.source", block.id));
    if (block.type === "related") {
      const relatedTitle = stringValue(rawBlock.title);
      const relatedHref = stringValue(rawBlock.href);
      if (!relatedTitle.trim() || !relatedHref.trim()) result.push(issue({
        code: "RELATED_TARGET_REQUIRED", field: "blocks.related", blockId: block.id, severity: "BLOCKER",
        message: "Súvisiaci článok nemá názov alebo cieľ.",
        suggestedAction: "Vyber existujúci canonical cieľ alebo blok odstráň.",
      }));
      else if (!relatedHref.startsWith("/")) result.push(issue({
        code: "RELATED_TARGET_NOT_INTERNAL", field: "blocks.related", blockId: block.id, severity: "BLOCKER",
        message: "Blok „Súvisiaci článok“ musí smerovať na interný canonical cieľ.",
        suggestedAction: "Použi internú URL začínajúcu / alebo externý odkaz vlož ako bežný odkaz/CTA.",
      }));
    }
  }

  for (const [index, source] of (payload.sources ?? []).entries()) {
    result.push(...sourceIssues(source as unknown as Record<string, unknown>, `sources.${index}`));
  }

  const relatedIdentity = new Map<string, string>();
  for (const block of rawBlocks.filter((item) => item.type === "related")) {
    const raw = block as unknown as Record<string, unknown>;
    const href = stringValue(raw.href).split(/[?#]/, 1)[0].replace(/\/$/, "");
    if (!href) continue;
    const first = relatedIdentity.get(href);
    if (first) result.push(issue({
      code: "RELATED_DUPLICATE",
      field: "blocks.related",
      blockId: block.id,
      severity: "WARNING",
      message: "Rovnaký súvisiaci canonical cieľ je uvedený viackrát.",
      suggestedAction: `Ponechaj jeden relation blok; prvý blok je ${first}.`,
    }));
    else relatedIdentity.set(href, block.id);
  }

    const sourceIdentity = new Map<string, string>();
  const allSources: Array<{ source: Record<string, unknown>; field: string; blockId?: string }> = [
    ...(payload.sources ?? []).map((source, index) => ({ source: source as unknown as Record<string, unknown>, field: `sources.${index}` })),
    ...rawBlocks.filter((block) => block.type === "source").map((block) => ({ source: block as unknown as Record<string, unknown>, field: "blocks.source", blockId: block.id })),
  ];
  for (const entry of allSources) {
    const label = comparisonText(stringValue(entry.source.label));
    const url = comparisonText(stringValue(entry.source.url));
    const key = url || label;
    if (!key) continue;
    const first = sourceIdentity.get(key);
    if (first) result.push(issue({
      code: "SOURCE_DUPLICATE",
      field: entry.field,
      blockId: entry.blockId,
      severity: "WARNING",
      message: "Rovnaký odborný zdroj je uvedený viackrát.",
      suggestedAction: `Ponechaj jednu citáciu; prvý výskyt je v ${first}.`,
    }));
    else sourceIdentity.set(key, entry.field);
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
