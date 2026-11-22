import type { ArticleBlock } from "./article-blocks";
import type { EditorialRichTextDocument } from "./editorial-content";

/** One unobtrusive notice after the article, not beside each product link. */
export const ARTICLE_PARTNER_DISCLOSURE = "Článok obsahuje partnerské odkazy.";

const STANDALONE_DISCLOSURE = /^(?:(?:tento )?článok )?obsahuje (?:reklamné|partnerské|affiliate) odkazy\.?$/iu;
// Only editorial body links count; independent site banners are labeled themselves.
const DOGNET_TRACKING_URL = /https?:\/\/go\.dognet\.com(?:[/?#]|$)/i;

function isStandaloneDisclosure(block: ArticleBlock): boolean {
  return block.type === "text" && STANDALONE_DISCLOSURE.test(block.content.trim());
}

/**
 * Legacy Notion drafts may already contain a separate "Obsahuje reklamné odkazy."
 * paragraph. Relocate that notice to the shared disclaimer without altering the
 * Notion page or the stored article. Dognet links are detected even when the
 * author omitted that paragraph, including structured rich-text link marks.
 */
export function prepareArticlePartnerDisclosure(
  blocks: ArticleBlock[],
  intro?: EditorialRichTextDocument | null,
  takeaway?: EditorialRichTextDocument | null,
) {
  const hasManualDisclosure = blocks.some(isStandaloneDisclosure);
  const hasDognetTrackingLink = DOGNET_TRACKING_URL.test(JSON.stringify([blocks, intro, takeaway]));
  return {
    blocks: blocks.filter((block) => !isStandaloneDisclosure(block)),
    showDisclosure: hasManualDisclosure || hasDognetTrackingLink,
  };
}
