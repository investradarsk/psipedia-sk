/** Conservative, dependency-free XML 1.0 sitemap parser for Cloudflare Workers.
 * Validates well-formedness, namespace binding, and the sitemap core grammar.
 * It intentionally rejects DTDs, external entities, processing instructions,
 * custom entities and unknown sitemap-namespace elements (fail closed).
 */
const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 50_000;
const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/;
const ENTITY = /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|(amp|lt|gt|quot|apos));/g;
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

type XmlElement = {
  name: string;
  local: string;
  ns: string;
  namespaces: Map<string, string>;
  children: Map<string, number>;
  text: string;
};

function legalXmlChar(cp: number): boolean {
  return cp === 9 || cp === 10 || cp === 13
    || (cp >= 0x20 && cp <= 0xD7FF)
    || (cp >= 0xE000 && cp <= 0xFFFD)
    || (cp >= 0x10000 && cp <= 0x10FFFF);
}

function xmlCharsValid(source: string): boolean {
  // XML 1.0 doesn't permit raw illegal control chars or orphan surrogates.
  for (let i = 0; i < source.length; i++) {
    const cp = source.codePointAt(i)!;
    if (!legalXmlChar(cp)) return false;
    if (cp > 0xFFFF) i++;
  }
  return true;
}

function decodeEntities(source: string): string | null {
  if (!xmlCharsValid(source)) return null;
  let badEntity = false;
  const result = source.replace(ENTITY, (_full, hex: string | undefined, dec: string | undefined, named: string | undefined) => {
    if (named) return NAMED[named];
    const value = Number.parseInt((hex ?? dec)!, hex ? 16 : 10);
    if (!Number.isFinite(value) || !legalXmlChar(value) || value > 0x10FFFF) {
      badEntity = true;
      return "";
    }
    return String.fromCodePoint(value);
  });
  return badEntity || source.replace(ENTITY, "").includes("&") ? null : result;
}

function normalizedLoc(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u0020\u007F<>"'|\\]/.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    if (url.origin !== "https://psipedia.sk" || url.username || url.password || url.search || url.hash) return false;
    return true;
  } catch {
    return false;
  }
}

export function validSitemapXml(xml: string): boolean {
  if (!xml || new TextEncoder().encode(xml).byteLength > MAX_BYTES) return false;
  // Explicitly prohibit DTDs/ENTITY, even within XML comments or markup.
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) return false;
  let body = xml.charCodeAt(0) === 0xFEFF ? xml.slice(1) : xml;
  let i = 0;
  const prolog = /^<\?xml\s+version\s*=\s*(["'])1\.0\1(?:\s+encoding\s*=\s*(["'])UTF-8\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\3)?\s*\?>/i.exec(body);
  if (prolog) i = prolog[0].length;
  const stack: XmlElement[] = [];
  let root: string | null = null;
  let entries = 0;

  function addText(value: string, cdata = false): boolean {
    const decoded = cdata ? (xmlCharsValid(value) ? value : null) : decodeEntities(value);
    if (decoded === null) return false;
    if (!stack.length) return !decoded.trim();
    const current = stack[stack.length - 1];
    if (current.ns === SITEMAP_NS && ["loc", "lastmod", "changefreq", "priority"].includes(current.local)) {
      current.text += decoded;
      return current.text.length <= 8192;
    }
    // Text in sitemap structural nodes may only be indentation/whitespace.
    if (current.ns === SITEMAP_NS && decoded.trim()) return false;
    return true;
  }

  while (i < body.length) {
    if (body[i] !== "<") {
      const next = body.indexOf("<", i);
      const end = next === -1 ? body.length : next;
      if (body.slice(i, end).includes("]]>") || !addText(body.slice(i, end))) return false;
      i = end;
      continue;
    }
    if (body.startsWith("<!--", i)) {
      const end = body.indexOf("-->", i + 4);
      const comment = end === -1 ? "" : body.slice(i + 4, end);
      if (end === -1 || comment.includes("--") || comment.endsWith("-") || !xmlCharsValid(comment)) return false;
      i = end + 3;
      continue;
    }
    if (body.startsWith("<![CDATA[", i)) {
      const end = body.indexOf("]]>", i + 9);
      if (end === -1 || !stack.length || !addText(body.slice(i + 9, end), true)) return false;
      i = end + 3;
      continue;
    }
    if (body.startsWith("</", i)) {
      const end = body.indexOf(">", i + 2);
      if (end === -1 || !stack.length) return false;
      const close = body.slice(i + 2, end).trim();
      if (!NAME.test(close) || NAME.exec(close)?.[0] !== close) return false;
      const current = stack.pop()!;
      if (current.name !== close) return false;
      if (current.ns === SITEMAP_NS) {
        if (current.local === "lastmod" && !/^\d{4}(?:-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?)?)?$/.test(current.text.trim())) return false;
        if (current.local === "changefreq" && !/^(?:always|hourly|daily|weekly|monthly|yearly|never)$/.test(current.text.trim())) return false;
        if (current.local === "priority" && !/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(current.text.trim())) return false;
        if (current.local === "loc") {
          const parent = stack[stack.length - 1];
          if (!parent || !normalizedLoc(current.text)) return false;
        }
        if (current.local === "url" || current.local === "sitemap") {
          if (current.children.get("loc") !== 1) return false;
        }
      }
      i = end + 1;
      continue;
    }
    if (body.startsWith("<!", i) || body.startsWith("<?", i)) return false;
    if (root !== null && stack.length === 0) return false;

    // Find the opening-tag end without treating '>' inside quoted attributes as markup.
    let end = i + 1;
    let quote = "";
    for (; end < body.length; end++) {
      const c = body[end];
      if (quote) { if (c === quote) quote = ""; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    if (end === body.length || quote) return false;
    let inside = body.slice(i + 1, end);
    const selfClosed = /\/\s*$/.test(inside);
    if (selfClosed) inside = inside.replace(/\/\s*$/, "");
    const match = NAME.exec(inside);
    if (!match) return false;
    const name = match[0];
    if (name.includes(":") && name.split(":").length !== 2) return false;
    let pos = name.length;
    const attributes = new Map<string, string>();
    while (pos < inside.length) {
      const leading = /^\s+/.exec(inside.slice(pos));
      if (!leading) return false;
      pos += leading[0].length;
      if (pos >= inside.length) break;
      const found = NAME.exec(inside.slice(pos));
      if (!found || found[0].split(":").length > 2) return false;
      const attrName = found[0];
      pos += attrName.length;
      const equal = /^\s*=\s*/.exec(inside.slice(pos));
      if (!equal) return false;
      pos += equal[0].length;
      const q = inside[pos];
      if (q !== '"' && q !== "'") return false;
      const endQuote = inside.indexOf(q, pos + 1);
      if (endQuote === -1) return false;
      const raw = inside.slice(pos + 1, endQuote);
      if (raw.includes("<") || attributes.has(attrName)) return false;
      const decoded = decodeEntities(raw);
      if (decoded === null) return false;
      attributes.set(attrName, decoded);
      pos = endQuote + 1;
    }
    const parent = stack[stack.length - 1];
    const namespaces = new Map<string, string>(parent?.namespaces ?? [["xml", XML_NS]]);
    for (const [attr, value] of attributes) {
      if (attr === "xmlns" || attr.startsWith("xmlns:")) {
        const prefix = attr === "xmlns" ? "" : attr.slice(6);
        if (attr === "xmlns:" || !prefix && !value || prefix === "xmlns" || prefix === "xml" && value !== XML_NS || prefix && !value) return false;
        namespaces.set(prefix, value);
      }
    }
    const parts = name.split(":");
    const prefix = parts.length === 2 ? parts[0] : "";
    const local = parts[parts.length - 1];
    if (!local || parts.length === 2 && !parts[0]) return false;
    const ns = namespaces.get(prefix);
    if (ns === undefined || prefix === "xmlns") return false;
    for (const attr of attributes.keys()) {
      if (attr !== "xmlns" && !attr.startsWith("xmlns:") && attr.includes(":")) {
        if (!namespaces.has(attr.split(":")[0])) return false;
      }
    }
    const current: XmlElement = { name, local, ns, namespaces, children: new Map(), text: "" };
    if (!parent) {
      if (root !== null || ns !== SITEMAP_NS || (local !== "urlset" && local !== "sitemapindex")) return false;
      root = local;
    } else if (parent.ns === SITEMAP_NS) {
      let allowed: boolean;
      if (parent.local === "urlset") allowed = ns === SITEMAP_NS && local === "url";
      else if (parent.local === "sitemapindex") allowed = ns === SITEMAP_NS && local === "sitemap";
      else if (parent.local === "url") allowed = ns !== SITEMAP_NS || ["loc", "lastmod", "changefreq", "priority"].includes(local);
      else if (parent.local === "sitemap") allowed = ns === SITEMAP_NS && ["loc", "lastmod"].includes(local);
      else allowed = ns !== SITEMAP_NS;
      if (!allowed) return false;
      if (ns === SITEMAP_NS) {
        const n = (parent.children.get(local) ?? 0) + 1;
        if (n > 1 && local !== "url" && local !== "sitemap") return false;
        parent.children.set(local, n);
        if (local === "url" || local === "sitemap") {
          if (++entries > MAX_ENTRIES) return false;
        }
      }
    }
    stack.push(current);
    if (selfClosed) {
      // A valid sitemap cannot have an empty core element (<loc/>, <url/>).
      if (ns === SITEMAP_NS) return false;
      stack.pop();
    }
    i = end + 1;
  }
  return root !== null && stack.length === 0 && entries > 0;
}
