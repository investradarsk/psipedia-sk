import type { ArticleBlock } from "@/lib/article-blocks";

type SourceBlock = Extract<ArticleBlock, { type: "source" }>;

function sourceHeading(value: string): boolean {
  const heading = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk").replace(/\s+/g, " ").trim();
  return heading === "odborne zdroje" || heading === "odborne a povodne zdroje";
}

function urlKey(value: string): string {
  return value.trim().replace(/\/$/, "");
}

/** Existing editorial source links remain authoritative. Do not render the
 * same link a second time just because a Notion manifest also added a
 * structured source block. Preserve genuinely additional source blocks. */
export function planArticleSourceDisplay(blocks: ArticleBlock[]): {
  contentBlocks: ArticleBlock[];
  sourceBlocks: SourceBlock[];
  hasManualSourceSection: boolean;
} {
  const contentBlocks = blocks.filter(block => block.type !== "source");
  const sourceBlocks = blocks.filter(
    (block): block is SourceBlock => block.type === "source",
  );
  const citedUrls = new Set<string>();
  let inSourceSection = false;
  let hasManualSourceSection = false;
  for (const block of contentBlocks) {
    if (block.type === "h2") inSourceSection = sourceHeading(block.text);
    else if (block.type === "h3" && sourceHeading(block.text)) inSourceSection = true;
    if (!inSourceSection) continue;
    if (block.type === "h2" || block.type === "h3") {
      hasManualSourceSection ||= sourceHeading(block.text);
      continue;
    }
    const entries = block.type === "bullet-list" || block.type === "numbered-list"
      ? block.items
      : "content" in block && typeof block.content === "string"
        ? [block.content]
        : [];
    for (const entry of entries) {
      for (const match of entry.matchAll(/https?:\/\/[^\s)\]]+/g))
        citedUrls.add(urlKey(match[0]));
    }
  }
  return {
    contentBlocks,
    sourceBlocks: sourceBlocks.filter(source =>
      !citedUrls.has(urlKey(source.url))),
    hasManualSourceSection,
  };
}
