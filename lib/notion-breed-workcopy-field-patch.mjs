/**
 * Pure, single-logical-field editor for the 60-field Notion breed work copy.
 * It never sends an API request. Consumers must re-fetch the page and verify
 * their baseline before submitting its one-cell PATCH.
 */
import { BREED_COMPACT_MERGE, BREED_COMPACT_HEADINGS } from "./breed-notion-compact-consolidation.mjs";
import { splitBreedWorkCopyField } from "./notion-breed-workcopy-adapter.mjs";

const mergedTargets = new Set(Object.values(BREED_COMPACT_MERGE));
const normalize = str => String(str ?? "")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    (full, label, href) => label === href ? href : full);

function markerPositions(target, text) {
  const positions = [];
  for (const [source, destination] of Object.entries(BREED_COMPACT_MERGE)) {
    if (destination !== target) continue;
    const label = BREED_COMPACT_HEADINGS[source] + ": ";
    let start = text.indexOf(" — " + label);
    let length = (" — " + label).length;
    if (start < 0 && text.startsWith(label)) {
      start = 0; length = label.length;
    }
    if (start >= 0) positions.push({ source, start, length });
  }
  positions.sort((a, b) => a.start - b.start);
  return positions;
}

function validateSourceFormat(field, value) {
  if (field === "Platnosť FCI štandardu" && value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value + "T00:00:00Z"))) {
      throw Error("BREED_WORKCOPY_DATE_INVALID");
    }
  }
  if (field === "FCI nomenklatúra URL" && value) {
    try {
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol)) throw Error();
    } catch {
      throw Error("BREED_WORKCOPY_FCI_URL_INVALID");
    }
  }
}

function toRichText(value) {
  const chars = Array.from(value);
  if (chars.length > 180_000) throw Error("BREED_WORKCOPY_RICH_TEXT_LIMIT");
  const parts = [];
  for (let i = 0; i < chars.length; i += 1800) {
    parts.push({ type: "text", text: { content: chars.slice(i, i + 1800).join("") } });
  }
  return { rich_text: parts };
}

/**
 * Updating one FCI/editorial source changes only its labeled segment.
 * Replacing the target's base text preserves every suffix.
 *
 * expectedText MUST be the version previously inspected by the editor.
 * Notion itself does not support a field-level compare-and-swap PATCH;
 * the caller must check the page's revision again just before writing.
 */
export function planBreedWorkCopyMergedFieldPatch({
  target, field, currentText, expectedText, newValue,
}) {
  if (!mergedTargets.has(target) ||
    !(field === target || BREED_COMPACT_MERGE[field] === target)) {
    throw Error("BREED_WORKCOPY_FIELD_NOT_MAPPED");
  }
  if (typeof currentText !== "string" ||
    typeof expectedText !== "string" || typeof newValue !== "string") {
    throw Error("BREED_WORKCOPY_FIELD_TEXT_REQUIRED");
  }
  if (normalize(currentText) !== normalize(expectedText)) {
    throw Error("BREED_WORKCOPY_CELL_CHANGED");
  }
  const before = splitBreedWorkCopyField(target, currentText);
  if (before.issues.length) throw Error("BREED_WORKCOPY_MERGED_FIELD_INVALID");
  const positions = markerPositions(target, currentText);
  const value = newValue.trim();
  validateSourceFormat(field, value);

  let replacement;
  if (field === target) {
    const first = positions[0]?.start ?? currentText.length;
    const suffix = currentText.slice(first);
    replacement = value + (suffix
      ? (value ? suffix.startsWith(" — ") ? suffix : " — " + suffix : suffix.replace(/^ — /, ""))
      : "");
  } else {
    const index = positions.findIndex(pos => pos.source === field);
    if (index === -1) {
      replacement = value
        ? currentText + (currentText ? " — " : "") + BREED_COMPACT_HEADINGS[field] + ": " + value
        : currentText;
    } else {
      const current = positions[index];
      const end = positions[index + 1]?.start ?? currentText.length;
      if (value) {
        replacement = currentText.slice(0, current.start + current.length) +
          value + currentText.slice(end);
      } else {
        replacement = currentText.slice(0, current.start) + currentText.slice(end);
        replacement = replacement.replace(/^ — /, "").trimEnd();
      }
    }
  }
  const after = splitBreedWorkCopyField(target, replacement);
  if (after.issues.length) throw Error("BREED_WORKCOPY_PATCH_INVALID_RESULT");
  if (field === target) {
    for (const [name, content] of Object.entries(before.sources)) {
      if (normalize(after.sources[name]) !== normalize(content))
        throw Error("BREED_WORKCOPY_UNRELATED_SECTION_CHANGED");
    }
  } else {
    if (normalize(before.base) !== normalize(after.base))
      throw Error("BREED_WORKCOPY_BASE_CHANGED");
    for (const [name, content] of Object.entries(before.sources)) {
      if (name !== field && normalize(after.sources[name]) !== normalize(content))
        throw Error("BREED_WORKCOPY_UNRELATED_SECTION_CHANGED");
    }
  }
  return {
    target,
    field,
    changed: replacement !== currentText,
    nextText: replacement,
    // Only one Notion cell. Never include ID, title, publication or siblings.
    properties: replacement === currentText ? {} : { [target]: toRichText(replacement) },
  };
}
