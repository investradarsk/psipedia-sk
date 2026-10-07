export type DirectEntityNameSource = "TAVILY_EXTRACT" | "TAVILY_SEARCH" | "CONFLICT" | "NONE";

export type DirectEntityContentQuality = {
  nameSource: DirectEntityNameSource;
  nameAccepted: boolean;
  descriptionAccepted: boolean;
  descriptionReason: string;
  boilerplateSegmentsDropped: number;
  descriptionLength: number;
};

export type DirectEntityPublicContent = {
  name: string | null;
  description: string;
  excerpt: string;
  quality: DirectEntityContentQuality;
};

const DESCRIPTION_MAX = 1500;
const EXCERPT_MAX = 320;
const NAME_MAX = 160;

const NAVIGATION_ONLY = new Set([
  "skip to content",
  "preskocit na obsah",
  "preskočiť na obsah",
  "uvod",
  "úvod",
  "domov",
  "home",
  "o nas",
  "o nás",
  "sluzby",
  "služby",
  "kontakt",
  "contact",
  "menu",
  "navigacia",
  "navigácia",
  "cennik",
  "cenník",
  "rezervacia",
  "rezervácia",
  "kde nas najdete",
  "kde nás nájdete",
  "facebook",
  "instagram",
  "youtube",
  "linkedin",
  "tiktok",
]);

const LEGAL_ONLY = new Set([
  "ochrana osobnych udajov",
  "ochrana osobných údajov",
  "privacy policy",
  "cookies",
  "cookie policy",
  "vseobecne obchodne podmienky",
  "všeobecné obchodné podmienky",
  "obchodne podmienky",
  "obchodné podmienky",
  "reklamacny poriadok",
  "reklamačný poriadok",
  "odstupenie od zmluvy",
  "odstúpenie od zmluvy",
  "gdpr",
]);

function compact(value: string) {
  return value.normalize("NFC").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function folded(value: string) {
  return compact(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizedLabel(value: string) {
  return folded(value)
    .replace(/^#{1,6}\s*/, "")
    .replace(/[\[\]()*_\x60>#]+/g, " ")
    .replace(/[?!:;,.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeHostname(value: string, sourceUrl: string) {
  const candidate = folded(value).replace(/^www\./, "").replace(/\/$/, "");
  let sourceHost = "";
  try {
    sourceHost = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    sourceHost = "";
  }
  if (sourceHost && candidate === sourceHost) return true;
  return /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/)?$/i.test(value.trim());
}

function isNavigationOrLegalOnly(value: string) {
  const label = normalizedLabel(value);
  return NAVIGATION_ONLY.has(label) || LEGAL_ONLY.has(label);
}

function stripMarkdownInline(value: string) {
  return compact(value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\((?!javascript:)[^)]+\)/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[>*_-]+\s*/g, "")
    .replace(/^#{1,6}\s+/g, "")
    .replace(/[*_\x60]+/g, " "));
}

function nameScore(value: string, sourceUrl: string) {
  const clean = stripMarkdownInline(value);
  if (!clean || clean.length < 2 || clean.length > NAME_MAX) {
    return { accepted: false, clean, score: -100 };
  }
  if (/!\[[^\]]*\]\([^)]*\)/.test(value) || /javascript\s*:/i.test(value)) {
    return { accepted: false, clean, score: -100 };
  }
  if (/^https?:\/\//i.test(clean) || looksLikeHostname(clean, sourceUrl)) {
    return { accepted: false, clean, score: -100 };
  }
  if (isNavigationOrLegalOnly(clean)) return { accepted: false, clean, score: -100 };

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 12) return { accepted: false, clean, score: -100 };
  const navWords = words.filter((word) => NAVIGATION_ONLY.has(normalizedLabel(word))).length;
  if (words.length >= 2 && navWords / words.length >= 0.6) {
    return { accepted: false, clean, score: -100 };
  }

  let score = 0;
  if (clean.length <= 80) score += 2;
  if (words.length >= 2 && words.length <= 7) score += 3;
  else if (words.length <= 10) score += 1;
  if (!/[.!?]$/.test(clean)) score += 1;
  if (/^[\p{Lu}\d][\p{Lu}\p{Ll}\d &+.'’/-]+$/u.test(clean)) score += 1;
  if (/\b(?:kliknite|zistite|objavte|vitajte|welcome|najleps|najlepš|akcia|novinka)\b/i.test(folded(clean))) {
    score -= 2;
  }
  return { accepted: score >= 3, clean, score };
}

function providerNameCandidate(content: string, sourceUrl: string) {
  let best: { name: string; score: number } | null = null;
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 120);

  for (const raw of lines) {
    if (/^!\[/.test(raw) || /javascript\s*:/i.test(raw)) continue;
    const heading = /^#{1,3}\s+\S/.test(raw);
    const scored = nameScore(raw.replace(/^#{1,3}\s+/, ""), sourceUrl);
    if (!scored.accepted) continue;

    const words = scored.clean.split(/\s+/).filter(Boolean);
    const letters = scored.clean.match(/\p{L}/gu) ?? [];
    const upper = scored.clean.match(/\p{Lu}/gu) ?? [];
    const upperRatio = letters.length ? upper.length / letters.length : 0;
    const titleLike = heading || (words.length >= 2 && words.length <= 8 && upperRatio >= 0.55);
    if (!titleLike) continue;

    const score = scored.score + (heading ? 2 : 0) + (upperRatio >= 0.7 ? 1 : 0);
    if (!best || score > best.score) best = { name: scored.clean, score };
  }

  return best;
}

function searchTitleCandidate(searchCandidateTitle: string | null | undefined, sourceUrl: string) {
  const raw = compact(String(searchCandidateTitle ?? ""));
  if (!raw) return null;

  const candidates = [raw];
  const parts = raw.split(/\s(?:\||–|—|-)\s/).map((part) => compact(part)).filter(Boolean);
  if (parts.length > 1) candidates.unshift(parts[0]);

  let best: { name: string; score: number } | null = null;
  for (const candidate of candidates) {
    const scored = nameScore(candidate, sourceUrl);
    if (!scored.accepted) continue;
    const score = scored.score + (candidate !== raw ? 1 : 0);
    if (!best || score > best.score || (score === best.score && scored.clean.length < best.name.length)) {
      best = { name: scored.clean, score };
    }
  }
  return best;
}

function nameTokens(value: string) {
  return new Set(
    folded(value)
      .replace(/[^a-z0-9\p{L}]+/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1),
  );
}

function namesAgree(a: string, b: string) {
  const left = folded(a);
  const right = folded(b);
  if (left === right || left.includes(right) || right.includes(left)) return true;

  const aTokens = nameTokens(a);
  const bTokens = nameTokens(b);
  if (!aTokens.size || !bTokens.size) return false;

  let shared = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) shared += 1;
  }
  return shared / Math.min(aTokens.size, bTokens.size) >= 0.6;
}

export function selectDirectEntityName(input: {
  extractedName?: string | null;
  searchCandidateTitle?: string | null;
  sourceUrl: string;
}) {
  const extracted = input.extractedName ? nameScore(input.extractedName, input.sourceUrl) : null;
  const provider = extracted?.accepted ? { name: extracted.clean, score: extracted.score } : null;
  const search = searchTitleCandidate(input.searchCandidateTitle, input.sourceUrl);

  if (!provider && !search) {
    return { name: null, source: "NONE" as const, accepted: false, conflict: false };
  }
  if (provider && !search) {
    return { name: provider.name, source: "TAVILY_EXTRACT" as const, accepted: true, conflict: false };
  }
  if (!provider && search) {
    return { name: search.name, source: "TAVILY_SEARCH" as const, accepted: true, conflict: false };
  }
  if (!provider || !search) throw new Error("unreachable");

  if (namesAgree(provider.name, search.name)) {
    if (search.score > provider.score + 1) {
      return { name: search.name, source: "TAVILY_SEARCH" as const, accepted: true, conflict: false };
    }
    return { name: provider.name, source: "TAVILY_EXTRACT" as const, accepted: true, conflict: false };
  }

  if (search.score >= provider.score + 2) {
    return { name: search.name, source: "TAVILY_SEARCH" as const, accepted: true, conflict: true };
  }
  if (provider.score >= search.score + 2) {
    return { name: provider.name, source: "TAVILY_EXTRACT" as const, accepted: true, conflict: true };
  }

  return { name: null, source: "CONFLICT" as const, accepted: false, conflict: true };
}

function isContactOnly(value: string) {
  const clean = compact(value);
  if (/^(?:tel(?:efon)?|mobil|email|e-mail)\s*:/i.test(folded(clean))) return true;
  if (/^\+?[\d\s()./-]{7,}$/.test(clean)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return true;
  return false;
}

function proseSegment(raw: string) {
  if (!raw.trim()) return null;
  if (/^!\[[^\]]*\]\([^)]*\)/.test(raw.trim())) return null;
  if (/javascript\s*:/i.test(raw)) return null;

  const clean = stripMarkdownInline(raw);
  if (!clean || isNavigationOrLegalOnly(clean) || isContactOnly(clean)) return null;
  if (/^(?:https?:\/\/|www\.)/i.test(clean)) return null;

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 5 || clean.length < 32) return null;

  const urls = clean.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (urls > 0 && urls * 4 >= words.length) return null;

  const sentenceLike = /[.!?](?:\s|$)/.test(clean) || words.length >= 9;
  if (!sentenceLike) return null;

  return clean;
}

function truncateText(value: string, max: number) {
  if (value.length <= max) return value;
  const slice = value.slice(0, max + 1);
  const lastBoundary = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (lastBoundary >= Math.floor(max * 0.55)) {
    return slice.slice(0, lastBoundary + 1).trim();
  }
  const lastSpace = slice.lastIndexOf(" ");
  return slice.slice(0, lastSpace >= Math.floor(max * 0.7) ? lastSpace : max).trim();
}

function cleanDescription(content: string) {
  const rawSegments = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2000);

  const kept: string[] = [];
  let dropped = 0;
  const seen = new Set<string>();

  for (const raw of rawSegments) {
    const candidate = proseSegment(raw);
    if (!candidate) {
      dropped += 1;
      continue;
    }

    const key = folded(candidate);
    if (seen.has(key)) {
      dropped += 1;
      continue;
    }

    seen.add(key);
    kept.push(candidate);
    if (kept.join(" ").length >= DESCRIPTION_MAX * 1.35) break;
  }

  const description = truncateText(compact(kept.join(" ")), DESCRIPTION_MAX);
  const words = description.split(/\s+/).filter(Boolean);
  const sentences = description.match(/[.!?](?:\s|$)/g)?.length ?? 0;
  const forbidden = /javascript\s*:|!\[[^\]]*\]\([^)]*\)|\b(?:privacy policy|cookie policy|gdpr)\b/i
    .test(description);

  const accepted = Boolean(description)
    && words.length >= 8
    && (sentences >= 1 || words.length >= 14)
    && !forbidden;

  const reason = accepted
    ? "quality_approved"
    : !description
      ? "no_prose_segments"
      : forbidden
        ? "boilerplate_residue"
        : "insufficient_prose";

  return {
    description: accepted ? description : "",
    accepted,
    reason,
    dropped,
  };
}

export function extractDirectEntityPublicContent(input: {
  content: string;
  sourceUrl: string;
}): DirectEntityPublicContent {
  const provider = providerNameCandidate(input.content, input.sourceUrl);
  const description = cleanDescription(input.content);
  const excerpt = description.accepted
    ? truncateText(description.description, EXCERPT_MAX)
    : "";

  return {
    name: provider?.name ?? null,
    description: description.description,
    excerpt,
    quality: {
      nameSource: provider ? "TAVILY_EXTRACT" : "NONE",
      nameAccepted: Boolean(provider),
      descriptionAccepted: description.accepted,
      descriptionReason: description.reason,
      boilerplateSegmentsDropped: description.dropped,
      descriptionLength: description.description.length,
    },
  };
}
