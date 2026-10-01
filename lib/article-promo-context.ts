import type { ArticleBlock } from "@/lib/article-blocks";
import type { Article } from "@/lib/content";
import {
  articlePromoKeys,
  articlePromoUtcDay,
  type ArticlePromoKey,
} from "@/lib/article-promo";
import { normalizeArticleTopicKey, type ArticleTopic } from "@/lib/article-topics";
import type { ArticlePortalSection } from "@/lib/portal";
import type { NewsCategorySlug } from "@/lib/news";

export type ContextualArticlePromoInput = Pick<
  Article,
  "slug" | "portalSection" | "portalSubpage" | "newsCategory"
> & {
  blocks?: readonly ArticleBlock[];
  topics?: readonly Pick<ArticleTopic, "slug" | "label" | "normalizedKey">[];
};

export type ContextualArticlePromoSource = "topic" | "subsection" | "section" | "global";

export type ContextualArticlePromoDecision = {
  promoKey: ArticlePromoKey;
  candidates: readonly ArticlePromoKey[];
  source: ContextualArticlePromoSource;
  contextKey: string;
  reason: string;
  seed: string;
  utcDay: string;
};

type TopicPromoRule = {
  key: string;
  signals: readonly string[];
  candidates: readonly ArticlePromoKey[];
};

export const articlePromoTopicRules: readonly TopicPromoRule[] = [
  {
    key: "lost-found",
    signals: ["straten", "najden", "lost found"],
    candidates: ["stratene-a-najdene"],
  },
  {
    key: "adoption-rescue",
    signals: ["adopc", "zachran", "utulk", "docasna opatera"],
    candidates: ["adopcia", "utulky"],
  },
  {
    key: "breeding",
    signals: ["chovatel", "chov", "odchov", "stenata s pp"],
    candidates: ["chovatelske-stanice", "chovatelske-kluby"],
  },
  {
    key: "breed-selection",
    signals: ["plemen", "vyber psa"],
    candidates: ["plemena", "chovatelske-kluby"],
  },
  {
    key: "dental",
    signals: ["zub", "dental", "chrup"],
    candidates: ["veterinari"],
  },
  {
    key: "nutrition",
    signals: ["vyziv", "krmiv", "krmen", "granul", "maskrt"],
    candidates: ["recenzie", "veterinari"],
  },
  {
    key: "grooming-hygiene",
    signals: ["srst", "hygien", "groom", "pazur", "kupanie"],
    candidates: ["salony", "veterinari"],
  },
  {
    key: "rehabilitation",
    signals: ["fyzioter", "rehabilit", "regener", "senior", "klb", "pohybovy aparat"],
    candidates: ["fyzioterapia", "veterinari"],
  },
  {
    key: "health",
    signals: ["zdrav", "veterinar", "ockovan", "parazit", "chorob", "prevencia", "prva pomoc"],
    candidates: ["veterinari", "fyzioterapia"],
  },
  {
    key: "dog-sport",
    signals: ["nosework", "field trial", "bikejoring", "canicross", "agility", "obedience", "aport"],
    candidates: ["kynologicke-kluby", "podujatia", "treneri"],
  },
  {
    key: "training-behaviour",
    signals: ["privol", "poslus", "socializ", "reaktiv", "stop whistle", "vycvik", "trening", "spravanie"],
    candidates: ["treneri", "kynologicke-kluby"],
  },
];

export const articlePromoSubsectionCandidates = {
  "starostlivost/zdravie": ["veterinari", "fyzioterapia"],
  "starostlivost/vyziva": ["recenzie", "veterinari"],
  "starostlivost/vycvik": ["treneri", "kynologicke-kluby"],
  "starostlivost/spravanie": ["treneri", "veterinari"],
  "starostlivost/srst-a-hygiena": ["salony", "veterinari"],
  "starostlivost/senior": ["fyzioterapia", "veterinari"],

  "steniatka/pred-kupou-psa": ["plemena", "chovatelske-stanice"],
  "steniatka/vyber-plemena": ["plemena", "chovatelske-kluby"],
  "steniatka/vyber-chovatela": ["chovatelske-stanice", "chovatelske-kluby"],
  "steniatka/prve-dni": ["veterinari", "treneri"],
  "steniatka/socializacia": ["treneri", "kynologicke-kluby"],
  "steniatka/hygiena": ["salony", "veterinari"],
  "steniatka/krmenie": ["recenzie", "veterinari"],
  "steniatka/ockovanie-a-zdravie": ["veterinari"],
  "steniatka/vycvik-steniatka": ["treneri", "kynologicke-kluby"],
  "steniatka/rast-a-vyvoj": ["veterinari", "fyzioterapia"],
  "steniatka/puberta": ["treneri", "veterinari"],

  "aktivity/psie-sporty": ["podujatia", "kynologicke-kluby", "fyzioterapia"],
  "aktivity/trening": ["treneri", "kynologicke-kluby"],
  "aktivity/vylety-so-psom": ["podujatia", "mapa", "fyzioterapia"],
  "aktivity/dog-friendly-miesta": ["mapa"],
  "aktivity/dovolenka-so-psom": ["mapa", "veterinari"],

  "recenzie/krmiva": ["veterinari"],
  "recenzie/maskrty": ["treneri", "veterinari"],
  "recenzie/hracky": ["treneri"],
  "recenzie/postroje-a-vodidla": ["treneri", "fyzioterapia"],
  "recenzie/gps-lokatory": ["mapa"],
  "recenzie/peleche": ["fyzioterapia", "veterinari"],
  "recenzie/cestovanie": ["mapa", "podujatia"],
  "recenzie/vycvikova-vybava": ["treneri", "kynologicke-kluby"],
} as const satisfies Record<string, readonly ArticlePromoKey[]>;

export const articlePromoNewsCategoryCandidates = {
  "zachrana-a-hrdinovia": ["adopcia", "utulky"],
  "veda-a-zdravie": ["veterinari", "recenzie"],
  "pracovne-psy": ["treneri", "kynologicke-kluby", "podujatia"],
  "ochrana-a-pravo": ["utulky", "adopcia"],
  "zo-sveta": ["mapa", "podujatia"],
  "zaujimavosti": ["mapa", "podujatia"],
} as const satisfies Record<NewsCategorySlug, readonly ArticlePromoKey[]>;

export const articlePromoSectionFallbacks = {
  clanky: ["mapa"],
  novinky: ["mapa"],
  steniatka: ["plemena", "veterinari", "treneri"],
  starostlivost: ["veterinari"],
  aktivity: ["treneri", "podujatia"],
  recenzie: ["mapa", "veterinari"],
} as const satisfies Partial<Record<ArticlePortalSection, readonly ArticlePromoKey[]>>;

export const articlePromoSubsectionSectionFallbacks = [] as const satisfies readonly string[];

export const articlePromoGlobalFallback = ["mapa"] as const satisfies readonly ArticlePromoKey[];

function uniquePromoKeys(keys: readonly ArticlePromoKey[]) {
  return [...new Set(keys)];
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function utcDayOrdinal(utcDay: string) {
  const timestamp = Date.parse(`${utcDay}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 86_400_000) : 0;
}

export function selectContextualArticlePromoIndex(
  candidateCount: number,
  seed: string,
  utcDay: string,
) {
  if (candidateCount <= 1) return 0;
  return (stableHash(seed) + utcDayOrdinal(utcDay)) % candidateCount;
}

function topicContext(article: ContextualArticlePromoInput) {
  const topics = [...(article.topics ?? [])].sort((a, b) =>
    normalizeArticleTopicKey(a.label).localeCompare(normalizeArticleTopicKey(b.label), "sk"),
  );
  const candidates: ArticlePromoKey[] = [];
  const matchedRules: string[] = [];

  for (const topic of topics) {
    const searchable = normalizeArticleTopicKey(
      [topic.normalizedKey, topic.slug, topic.label].filter(Boolean).join(" "),
    );
    const rule = articlePromoTopicRules.find((item) =>
      item.signals.some((signal) => searchable.includes(signal)),
    );
    if (!rule) continue;
    matchedRules.push(rule.key);
    candidates.push(...rule.candidates);
  }

  if (!candidates.length) return null;
  const ruleKeys = [...new Set(matchedRules)].sort();
  return {
    candidates: uniquePromoKeys(candidates),
    source: "topic" as const,
    contextKey: `topic:${ruleKeys.join("+")}`,
    reason: `explicit article topics: ${ruleKeys.join(", ")}`,
  };
}

function subsectionContext(article: ContextualArticlePromoInput) {
  const section = article.portalSection ?? "clanky";
  if (section === "novinky" && article.newsCategory) {
    const candidates = articlePromoNewsCategoryCandidates[article.newsCategory as NewsCategorySlug];
    if (candidates) {
      return {
        candidates: [...candidates],
        source: "subsection" as const,
        contextKey: `news:${article.newsCategory}`,
        reason: `news category: ${article.newsCategory}`,
      };
    }
  }

  if (!article.portalSubpage) return null;
  const key = `${section}/${article.portalSubpage}`;
  const candidates = articlePromoSubsectionCandidates[key as keyof typeof articlePromoSubsectionCandidates];
  if (!candidates) return null;
  return {
    candidates: [...candidates],
    source: "subsection" as const,
    contextKey: `subsection:${key}`,
    reason: `portal subsection: ${key}`,
  };
}

function sectionContext(article: ContextualArticlePromoInput) {
  const section = article.portalSection ?? "clanky";
  const candidates = articlePromoSectionFallbacks[section as keyof typeof articlePromoSectionFallbacks];
  if (!candidates) return null;
  return {
    candidates: [...candidates],
    source: "section" as const,
    contextKey: `section:${section}`,
    reason: `portal section fallback: ${section}`,
  };
}

function manualPromoKeys(article: ContextualArticlePromoInput) {
  return new Set(
    (article.blocks ?? [])
      .filter((block): block is Extract<ArticleBlock, { type: "psipedia-promo" }> =>
        block.type === "psipedia-promo",
      )
      .map((block) => block.promoKey),
  );
}

export function resolveContextualArticlePromo(
  article: ContextualArticlePromoInput,
  options: { utcDay?: string } = {},
): ContextualArticlePromoDecision {
  const context = topicContext(article)
    ?? subsectionContext(article)
    ?? sectionContext(article)
    ?? {
      candidates: [...articlePromoGlobalFallback],
      source: "global" as const,
      contextKey: "global:mapa",
      reason: "global fallback",
    };

  const candidates = uniquePromoKeys(context.candidates).filter((key) =>
    articlePromoKeys.includes(key),
  );
  const safeCandidates = candidates.length ? candidates : [...articlePromoGlobalFallback];
  const manualKeys = manualPromoKeys(article);
  const alternatives = safeCandidates.filter((key) => !manualKeys.has(key));
  const candidatePool = alternatives.length ? alternatives : safeCandidates;
  const utcDay = options.utcDay ?? articlePromoUtcDay();
  const selectionSeed = `${article.slug}|${context.contextKey}`;
  const promoKey = candidatePool[
    selectContextualArticlePromoIndex(candidatePool.length, selectionSeed, utcDay)
  ] ?? "mapa";

  return {
    promoKey,
    candidates: safeCandidates,
    source: context.source,
    contextKey: context.contextKey,
    reason: context.reason,
    seed: `${article.slug}|${context.contextKey}|${promoKey}`,
    utcDay,
  };
}
