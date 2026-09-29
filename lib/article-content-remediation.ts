import type { ArticleBlock } from "@/lib/article-blocks";
import type { Article, ArticleSection } from "@/lib/content";
import { editorialRichTextPlainText } from "@/lib/editorial-content";

export const DENTAL_ARTICLE_SLUG = "ako-cistit-psovi-zuby";

const DENTAL_EDITORIAL_SENTENCES = [
  "po publikovaní bude vhodné prepojiť aj článok Ako spoznať bolesť u psa",
  "Súvisiaca podsekcia: Hygiena šteniatka.",
  "Súvisiaci článok: Ako vybrať granule bez marketingových mýtov.",
] as const;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function sanitizePublicArticleText(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");

  return lines
    .flatMap((line) => {
      const normalizedLine = normalize(line).replace(/^(?:[-*]|\d+\.)\s+/, "");
      if (
        /^(?:todo|fixme)(?:\s*[:.!-]|$)/.test(normalizedLine)
        || /^(?:sem\s+)?doplnit(?:\s*[:.!-]|$)/.test(normalizedLine)
        || /^placeholder(?:\s*[:.!-]|$)/.test(normalizedLine)
      ) {
        return [];
      }

      let next = line;
      next = next.replace(
        /(?:,\s*)?po publikovan[íi] bude vhodn[ée](?=\s|$)[^.!?\n]*(?:[.!?]|$)/giu,
        (match) => match.trimStart().startsWith(",") ? "." : "",
      );
      next = next.replace(
        /\bS[uú]visiaci\s+[cč]l[aá]nok\s*:\s*[^.!?\n]*(?:[.!?]|$)/giu,
        "",
      );
      next = next.replace(
        /\bS[uú]visiaca\s+podsekcia\s*:\s*[^.!?\n]*(?:[.!?]|$)/giu,
        "",
      );
      next = next
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.!?])/g, "$1")
        .replace(/\.\s*\./g, ".")
        .trim();

      return next ? [next] : [];
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizePublicArticleSections(sections: ArticleSection[]) {
  return sections.flatMap((section) => {
    const heading = sanitizePublicArticleText(section.heading ?? "");
    const paragraphs = (section.paragraphs ?? [])
      .map(sanitizePublicArticleText)
      .filter(Boolean);
    const bullets = (section.bullets ?? [])
      .map(sanitizePublicArticleText)
      .filter(Boolean);
    const tip = sanitizePublicArticleText(section.tip ?? "");
    if (!heading && !paragraphs.length && !bullets.length && !tip) return [];
    return [{
      ...section,
      heading,
      paragraphs,
      ...(section.bullets ? { bullets } : {}),
      ...(section.tip ? { tip: tip || undefined } : {}),
    }];
  });
}

function sanitizePublicArticleBlocks(blocks: ArticleBlock[]) {
  return blocks.flatMap((block): ArticleBlock[] => {
    if (block.type === "text" || block.type === "tip" || block.type === "warning" || block.type === "quote") {
      const content = sanitizePublicArticleText(block.content);
      if (!content) return [];
      return [{ ...block, content, ...(content === block.content ? {} : { richText: undefined }) }];
    }
    if (block.type === "h2" || block.type === "h3") {
      const text = sanitizePublicArticleText(block.text);
      return text ? [{ ...block, text }] : [];
    }
    if (block.type === "bullet-list" || block.type === "numbered-list") {
      const items = block.items.map(sanitizePublicArticleText).filter(Boolean);
      return items.length ? [{ ...block, items }] : [];
    }
    if (block.type === "table") {
      return [{
        ...block,
        headers: block.headers.map(sanitizePublicArticleText),
        rows: block.rows.map((row) => row.map(sanitizePublicArticleText)),
      }];
    }
    if (block.type === "image") {
      const caption = sanitizePublicArticleText(block.caption ?? "");
      const credit = sanitizePublicArticleText(block.credit ?? "");
      return [{ ...block, caption: caption || undefined, credit: credit || undefined }];
    }
    if (block.type === "gallery") {
      return [{
        ...block,
        images: block.images.map((image) => {
          const caption = sanitizePublicArticleText(image.caption ?? "");
          const credit = sanitizePublicArticleText(image.credit ?? "");
          return { ...image, caption: caption || undefined, credit: credit || undefined };
        }),
      }];
    }
    if (block.type === "source") {
      const note = sanitizePublicArticleText(block.note ?? "");
      return [{ ...block, note: note || undefined }];
    }
    return [block];
  });
}

export function sanitizePublicArticleContent(article: Article): Article {
  const richIntro = article.introRichText ? editorialRichTextPlainText(article.introRichText) : null;
  const richTakeaway = article.takeawayRichText ? editorialRichTextPlainText(article.takeawayRichText) : null;
  const introSource = richIntro ?? article.intro;
  const takeawaySource = richTakeaway ?? article.takeaway;
  const intro = sanitizePublicArticleText(introSource);
  const takeaway = sanitizePublicArticleText(takeawaySource);

  return {
    ...article,
    excerpt: sanitizePublicArticleText(article.excerpt),
    intro,
    takeaway,
    introRichText: richIntro !== null && intro !== richIntro ? undefined : article.introRichText,
    takeawayRichText: richTakeaway !== null && takeaway !== richTakeaway ? undefined : article.takeawayRichText,
    sections: sanitizePublicArticleSections(article.sections ?? []),
    blocks: article.blocks ? sanitizePublicArticleBlocks(article.blocks) : article.blocks,
  };
}

function removeKnownEditorialLines(value: string) {
  const originalLines = value.replace(/\r\n?/g, "\n").split("\n");
  const removed: string[] = [];
  const kept = originalLines.filter((line) => {
    const normalizedLine = normalize(line).replace(/[.!]+$/, "");
    const match = DENTAL_EDITORIAL_SENTENCES.find((candidate) =>
      normalizedLine === normalize(candidate).replace(/[.!]+$/, ""),
    );
    if (match) removed.push(line.trim());
    return !match;
  });
  return { value: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed };
}

export type DentalRemediationPreview = {
  slug: typeof DENTAL_ARTICLE_SLUG;
  changed: boolean;
  removedEditorialNotes: string[];
  addedRelatedArticle: boolean;
  relatedArticleHref: string | null;
  manualRequired: string[];
  sections: ArticleSection[];
  blocks: ArticleBlock[];
};

export function buildDentalArticleRemediation(input: {
  sections: ArticleSection[];
  blocks: ArticleBlock[];
  relatedNutritionArticleHref?: string | null;
}): DentalRemediationPreview {
  const removedEditorialNotes: string[] = [];

  const sections = input.sections.flatMap((section) => {
    const heading = removeKnownEditorialLines(section.heading ?? "");
    removedEditorialNotes.push(...heading.removed);
    const paragraphs = (section.paragraphs ?? []).flatMap((paragraph) => {
      const result = removeKnownEditorialLines(paragraph);
      removedEditorialNotes.push(...result.removed);
      return result.value ? [result.value] : [];
    });
    const bullets = (section.bullets ?? []).flatMap((bullet) => {
      const result = removeKnownEditorialLines(bullet);
      removedEditorialNotes.push(...result.removed);
      return result.value ? [result.value] : [];
    });
    const tipResult = removeKnownEditorialLines(section.tip ?? "");
    removedEditorialNotes.push(...tipResult.removed);
    const next = {
      ...section,
      heading: heading.value,
      paragraphs,
      ...(section.bullets ? { bullets } : {}),
      ...(section.tip ? { tip: tipResult.value || undefined } : {}),
    };
    return next.heading || next.paragraphs.length || next.bullets?.length || next.tip ? [next] : [];
  });

  const blocks = input.blocks.flatMap((block): ArticleBlock[] => {
    if (block.type === "text" || block.type === "tip" || block.type === "warning" || block.type === "quote") {
      const result = removeKnownEditorialLines(block.content);
      removedEditorialNotes.push(...result.removed);
      return result.value ? [{ ...block, content: result.value, richText: undefined }] : [];
    }
    if (block.type === "h2" || block.type === "h3") {
      const result = removeKnownEditorialLines(block.text);
      removedEditorialNotes.push(...result.removed);
      return result.value ? [{ ...block, text: result.value }] : [];
    }
    if (block.type === "bullet-list" || block.type === "numbered-list") {
      const items = block.items.flatMap((item) => {
        const result = removeKnownEditorialLines(item);
        removedEditorialNotes.push(...result.removed);
        return result.value ? [result.value] : [];
      });
      return items.length ? [{ ...block, items }] : [];
    }
    return [block];
  });

  const relatedHref = input.relatedNutritionArticleHref?.startsWith("/") ? input.relatedNutritionArticleHref : null;
  const alreadyRelated = blocks.some((block) => block.type === "related" && block.href === relatedHref);
  const removedNutritionNote = removedEditorialNotes.some((value) =>
    normalize(value).startsWith(normalize("Súvisiaci článok: Ako vybrať granule bez marketingových mýtov")),
  );
  let addedRelatedArticle = false;
  if (removedNutritionNote && relatedHref && !alreadyRelated) {
    blocks.push({
      id: "content-qa-dental-related-nutrition",
      type: "related",
      title: "Ako vybrať granule bez marketingových mýtov",
      href: relatedHref,
      description: "Súvisiaci článok na Psipedii.",
    });
    addedRelatedArticle = true;
  }

  const manualRequired: string[] = [
    "Skontrolovať neklikateľnú zmienku o adresári veterinárov a redakčne ju prepojiť na /adresar/veterinari iba tam, kde je odkaz prirodzenou súčasťou textu.",
    "Skontrolovať odborné zdroje bez použiteľnej URL; žiadnu URL, dátum, autora ani reviewera nedopĺňať odhadom.",
  ];
  if (removedEditorialNotes.some((value) => normalize(value).startsWith(normalize("Súvisiaca podsekcia: Hygiena šteniatka")))) {
    manualRequired.push("Poznámka o podsekcii Hygiena šteniatka bola odstránená; nový verejný modul nevytvárať, kým neexistuje vhodný canonical relation typ pre portal subsection.");
  }
  if (removedNutritionNote && !relatedHref) {
    manualRequired.push("Súvisiaci článok o granulách nebol automaticky pridaný, pretože nebol potvrdený publikovaný canonical cieľ.");
  }

  return {
    slug: DENTAL_ARTICLE_SLUG,
    changed: removedEditorialNotes.length > 0 || addedRelatedArticle,
    removedEditorialNotes,
    addedRelatedArticle,
    relatedArticleHref: relatedHref,
    manualRequired,
    sections,
    blocks,
  };
}
