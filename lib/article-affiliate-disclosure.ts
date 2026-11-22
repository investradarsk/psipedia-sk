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
 * Remove legacy standalone "Obsahuje reklamné odkazy." from the public body
 * without altering Notion or D1. Only a detected Dognet tracking URL triggers
 * the shared bottom disclaimer, never the mere presence of a manual sentence.
 */
export function prepareArticlePartnerDisclosure(
  blocks: ArticleBlock[],
  intro?: EditorialRichTextDocument | null,
  takeaway?: EditorialRichTextDocument | null,
) {
  const hasDognetTrackingLink = DOGNET_TRACKING_URL.test(JSON.stringify([blocks, intro, takeaway]));
  return {
    blocks: blocks.filter((block) => !isStandaloneDisclosure(block)),
    showDisclosure: hasDognetTrackingLink,
  };
}
