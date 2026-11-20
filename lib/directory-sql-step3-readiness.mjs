/**
 * Adresár 3/4: privacy-safe D1/Notion staging receipt inventory.
 * No editorial choice or cutover is inferred from timestamps alone.
 */
import { notionId } from "./directory-notion-onetime-import.mjs";

const norm = (value) => String(value ?? "").replaceAll("-", "").toLowerCase();
const sample = (ids) => ids.slice(0, 30).sort((a, b) => a - b);

export function directoryStep3Readiness(rows, receipts, pages) {
  if (!Array.isArray(rows) || !Array.isArray(receipts) || !Array.isArray(pages))
    throw new Error("DIRECTORY_STEP3_INVALID_INPUT");
  const receiptById = new Map();
  for (const receipt of receipts) {
    const id = Number(receipt.profile_id);
    if (!Number.isSafeInteger(id) || id <= 0 || receiptById.has(id))
      throw new Error("DIRECTORY_STEP3_DUPLICATE_RECEIPT");
    receiptById.set(id, receipt);
  }
  const pageById = new Map();
  for (const page of pages) {
    const id = notionId(page);
    if (id) pageById.set(id, page);
  }

  const missingActive = [];
  const protectedUnstaged = [];
  const changedInD1 = [];
  const changedInNotion = [];
  const missingNotionIdentity = [];
  const stateCounts = { STAGED: 0, VERIFIED: 0, SQL_ONLY: 0 };
  const seen = new Set();

  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id))
      throw new Error("DIRECTORY_STEP3_DUPLICATE_PROFILE");
    seen.add(id);
    const receipt = receiptById.get(id);
    if (!receipt) {
      if (row.status === "archived" || Number(row.tombstone) > 0)
        protectedUnstaged.push(id);
      else missingActive.push(id);
      continue;
    }
    if (!Object.hasOwn(stateCounts, receipt.state))
      throw new Error("DIRECTORY_STEP3_INVALID_STATE");
    stateCounts[receipt.state]++;
    if (receipt.source_revision !== row.updated_at) changedInD1.push(id);
    if (receipt.notion_revision) {
      const page = pageById.get(id);
      if (!page || norm(page.id) !== norm(row.notion_page_id))
        missingNotionIdentity.push(id);
      else if (receipt.notion_revision !== page.last_edited_time)
        changedInNotion.push(id);
    }
  }
  if (receipts.length !== stateCounts.STAGED + stateCounts.VERIFIED + stateCounts.SQL_ONLY ||
      receiptById.size > seen.size ||
      [...receiptById.keys()].some(id => !seen.has(id)))
    throw new Error("DIRECTORY_STEP3_ORPHAN_RECEIPT");

  return {
    profiles: rows.length,
    receipts: receipts.length,
    states: stateCounts,
    missingActive: missingActive.length,
    protectedUnstaged: protectedUnstaged.length,
    changedInD1: changedInD1.length,
    changedInNotion: changedInNotion.length,
    missingNotionIdentity: missingNotionIdentity.length,
    samples: {
      missingActive: sample(missingActive),
      protectedUnstaged: sample(protectedUnstaged),
      changedInD1: sample(changedInD1),
      changedInNotion: sample(changedInNotion),
      missingNotionIdentity: sample(missingNotionIdentity),
    },
    // A receipt is not a field-by-field, runtime, partner, or Notion parity proof.
    safeToSwitchRuntime: false,
    reason: "PARITY_AND_RUNTIME_WRITERS_NOT_VERIFIED",
  };
}
