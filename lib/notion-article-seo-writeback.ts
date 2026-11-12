/**
 * Per-field Admin -> Notion SEO projection. No publication, identity, content
 * blocks, technical metadata or unedited SEO properties belong in this PATCH.
 */
import { ARTICLE_NOTION_SEO_PROPERTIES as FIELDS, type ExistingArticleSeo, type ArticleSeoRemoteValues } from "./notion-article-seo-properties";

export type ArticleSeoField = keyof typeof FIELDS;
export type SeoPageProperties = Record<string, unknown>;
type SeoValue = string | boolean;
export type SeoPatchPlan = {
  changed: ArticleSeoField[];
  properties: Record<string, unknown>;
  expectedRemote: Partial<Record<ArticleSeoField, SeoValue>>;
  target: Partial<Record<ArticleSeoField, SeoValue>>;
};

function seoValue(article: ExistingArticleSeo, field: ArticleSeoField): SeoValue {
  const seo = article.seo;
  switch (field) {
    case "seoTitle": return seo?.title ?? "";
    case "metaDescription": return seo?.description ?? "";
    case "focusKeyword": return seo?.focusKeyword ?? "";
    case "canonicalUrl": return seo?.canonicalUrl ?? "";
    case "noindex": return seo?.noindex === true;
    case "ogTitle": return seo?.ogTitle ?? "";
    case "ogDescription": return seo?.ogDescription ?? "";
    case "ogImageUrl": return seo?.ogImage ?? "";
  }
}

function remoteUrl(value: SeoValue, siteUrl: string): SeoValue {
  if (typeof value !== "string" || !value.trim()) return "";
  const url = value.startsWith("/media/") || value.startsWith("/images/")
    ? siteUrl.replace(/\/$/, "") + value : value;
  try {
    const parsed = new URL(url);
    if ((parsed.protocol === "http:" || parsed.protocol === "https:")
      && !parsed.username && !parsed.password) return url;
  } catch { /* invalid value */ }
  throw new Error("NOTION_ARTICLE_SEO_URL_INVALID");
}

function normalize(field: ArticleSeoField, value: SeoValue, siteUrl: string): SeoValue {
  if (field === "canonicalUrl" || field === "ogImageUrl") return remoteUrl(value, siteUrl);
  return typeof value === "string" ? value.trim() : value;
}

function remoteProperty(raw: unknown, field: ArticleSeoField): SeoValue {
  const type = FIELDS[field].type;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("NOTION_ARTICLE_SEO_PROPERTY_MISSING");
  }
  const prop = raw as Record<string, unknown>;
  if (prop.type && prop.type !== type) throw new Error("NOTION_ARTICLE_SEO_TYPE_MISMATCH");
  if (type === "checkbox") {
    if (typeof prop.checkbox !== "boolean") throw new Error("NOTION_ARTICLE_SEO_TYPE_MISMATCH");
    return prop.checkbox;
  }
  if (type === "url") {
    if (prop.url !== null && typeof prop.url !== "string") throw new Error("NOTION_ARTICLE_SEO_TYPE_MISMATCH");
    return typeof prop.url === "string" ? prop.url.trim() : "";
  }
  if (!Array.isArray(prop.rich_text)) throw new Error("NOTION_ARTICLE_SEO_TYPE_MISMATCH");
  if (prop.rich_text.length >= 25) throw new Error("NOTION_ARTICLE_SEO_PROPERTY_INCOMPLETE");
  return prop.rich_text.map((node: unknown) => {
    const value = node && typeof node === "object" ? node as Record<string, unknown> : {};
    const text = value.text && typeof value.text === "object"
      ? (value.text as Record<string, unknown>).content : undefined;
    if (typeof value.plain_text === "string") return value.plain_text;
    if (typeof text === "string") return text;
    throw new Error("NOTION_ARTICLE_SEO_PROPERTY_INCOMPLETE");
  }).join("").trim();
}

function notionText(content: string) {
  const entries: Array<{ type: "text"; text: { content: string } }> = [];
  for (let offset = 0; offset < content.length; offset += 1900) {
    entries.push({ type: "text", text: { content: content.slice(offset, offset + 1900) } });
  }
  return entries;
}

/** All eight field names are canonical and only changed editor values qualify. */
export function articleSeoChangedFields(before: ExistingArticleSeo, after: ExistingArticleSeo): ArticleSeoField[] {
  return (Object.keys(FIELDS) as ArticleSeoField[]).filter(field =>
    seoValue(before, field) !== seoValue(after, field));
}

export function planArticleSeoWriteback(input: {
  before: ExistingArticleSeo;
  after: ExistingArticleSeo;
  properties: SeoPageProperties;
  siteUrl: string;
  /** When supplied, validate and prepare only these independently edited fields. */
  fields?: readonly ArticleSeoField[];
}): SeoPatchPlan {
  const plan: SeoPatchPlan = {
    changed: articleSeoChangedFields(input.before, input.after)
      .filter(field => !input.fields || input.fields.includes(field)),
    properties: {}, expectedRemote: {}, target: {},
  };
  for (const field of plan.changed) {
    const definition = FIELDS[field];
    if (!Object.hasOwn(input.properties, definition.name)) throw new Error("NOTION_ARTICLE_SEO_PROPERTY_MISSING");
    const current = remoteProperty(input.properties[definition.name], field);
    const desired = normalize(field, seoValue(input.after, field), input.siteUrl);
    const prior = normalize(field, seoValue(input.before, field), input.siteUrl);
    plan.expectedRemote[field] = current;
    plan.target[field] = desired;
    if (current === desired) continue;
    // A separately edited value is a conflict. A pristine empty Notion field
    // is permitted for backwards compatibility with historical Admin articles.
    if (current !== prior && current !== "" && current !== false) {
      throw new Error("NOTION_ARTICLE_SEO_FIELD_CONFLICT");
    }
    if (definition.type === "checkbox") {
      plan.properties[definition.name] = { checkbox: desired };
    } else if (definition.type === "url") {
      plan.properties[definition.name] = { url: desired || null };
    } else {
      plan.properties[definition.name] = { rich_text: notionText(String(desired)) };
    }
  }
  return plan;
}

/** Separate planning errors so one conflicting field does not invalidate
 * independent SEO edits. Identity, article revision and content guards remain global.
 */
export type ArticleSeoFieldFailure = { field: ArticleSeoField; code: string };

export function planArticleSeoIndependentWriteback(input: {
  before: ExistingArticleSeo;
  after: ExistingArticleSeo;
  properties: SeoPageProperties;
  siteUrl: string;
}): { ready: Array<{ field: ArticleSeoField; plan: SeoPatchPlan }>; failures: ArticleSeoFieldFailure[] } {
  const ready: Array<{ field: ArticleSeoField; plan: SeoPatchPlan }> = [];
  const failures: ArticleSeoFieldFailure[] = [];
  for (const field of articleSeoChangedFields(input.before, input.after)) {
    try {
      ready.push({ field, plan: planArticleSeoWriteback({ ...input, fields: [field] }) });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "";
      failures.push({
        field,
        code: /^NOTION_ARTICLE_SEO_[A-Z0-9_]+$/.test(raw) ? raw : "REMOTE_WRITEBACK_FAILED",
      });
    }
  }
  return { ready, failures };
}

/** Remote edits in SEO fields that Admin did NOT touch must also stay
 * pending until the inbound sync imports them. Never mark those as acknowledged
 * merely because a different Admin SEO field was saved successfully.
 */
export function articleSeoUnacknowledgedRemoteFields(
  properties: SeoPageProperties, confirmed: ArticleSeoRemoteValues | null,
): ArticleSeoField[] {
  if (!confirmed) return [];
  const changed: ArticleSeoField[] = [];
  for (const field of Object.keys(FIELDS) as ArticleSeoField[]) {
    if (!Object.hasOwn(confirmed, field)) continue;
    try {
      if (remoteProperty(properties[FIELDS[field].name], field) !== confirmed[field]) changed.push(field);
    } catch {
      changed.push(field);
    }
  }
  return changed;
}

/** For a concurrent Notion edit that fails only one field, verify that the
 * REST of the page still matches the acknowledged import baseline. Do not
 * advance that baseline if any field remains unresolved.
 */
export function projectArticleSeoConfirmedBaseline<T extends { properties?: Record<string, unknown> }>(
  page: T, confirmed: ArticleSeoRemoteValues | null, failures: readonly ArticleSeoFieldFailure[],
): T {
  if (!failures.length) return page;
  if (!confirmed) throw new Error("NOTION_ARTICLE_SEO_REMOTE_CONFLICT");
  const properties = { ...page.properties };
  for (const { field } of failures) {
    if (!Object.hasOwn(confirmed, field)) throw new Error("NOTION_ARTICLE_SEO_REMOTE_CONFLICT");
    const prior = confirmed[field];
    const def = FIELDS[field];
    if (def.type === "checkbox") {
      if (typeof prior !== "boolean") throw new Error("NOTION_ARTICLE_SEO_REMOTE_CONFLICT");
      properties[def.name] = { type: "checkbox", checkbox: prior };
    } else if (def.type === "url") {
      if (typeof prior !== "string") throw new Error("NOTION_ARTICLE_SEO_REMOTE_CONFLICT");
      properties[def.name] = { type: "url", url: prior || null };
    } else {
      if (typeof prior !== "string") throw new Error("NOTION_ARTICLE_SEO_REMOTE_CONFLICT");
      properties[def.name] = { type: "rich_text", rich_text: prior ? [{
        type: "text", plain_text: prior, text: { content: prior },
      }] : [] };
    }
  }
  return { ...page, properties };
}

export function verifyArticleSeoPatch(
  plan: SeoPatchPlan,
  properties: SeoPageProperties,
  phase: "before" | "after",
) {
  for (const field of plan.changed) {
    const remote = remoteProperty(properties[FIELDS[field].name], field);
    if (phase === "before" && remote !== plan.expectedRemote[field]) {
      throw new Error("NOTION_ARTICLE_SEO_FIELD_CONFLICT");
    }
    if (phase === "after" && remote !== plan.target[field]) {
      throw new Error("NOTION_ARTICLE_SEO_ECHO_MISMATCH");
    }
  }
}
