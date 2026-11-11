/**
 * Work-copy editorial delta: interpret the 90-field Notion breed database using
 * the EXISTING Psipedia per-field conflict-resolution engine.
 *
 * This function is read-only. It does NOT persist to D1, write to Notion, touch
 * public pages, publish profiles, or change active breed_notion_sync mapping.
 * A caller must prove old sync is disabled before applying any future plan.
 */
import { materializeBreedWorkCopyForRead } from "@/lib/notion-breed-workcopy-compatible-page.mjs";
import { BREED_NOTION_SCHEMA } from "@/lib/notion-breed-property-registry";
import { notionPageToManagedBreedInput } from "@/lib/notion-breed-sync";
import { breedNotionPresentFieldIds } from "@/lib/notion-breed-presence";
import {
  breedFieldSnapshot,
  planBreedNotionFieldDelta,
  type BreedFieldSnapshot,
} from "@/lib/notion-breed-field-delta";
import type { ManagedBreed } from "@/lib/breed-store";
import type { NotionPage } from "@/lib/notion-sync-shared";
import type { NotionFieldMode } from "@/lib/notion-field-authority";

const FULL_FCI_AND_EDITORIAL = new Set([
  "fciStandard", "editorial",
  "relatedBreedIds", "relatedArticleIds", "directoryProfileIds",
]);

export function planBreedWorkCopyEditorialDelta(input: {
  page: NotionPage;
  canonical: ManagedBreed;
  previousNotion: BreedFieldSnapshot;
  previousAdmin: BreedFieldSnapshot;
  authority?: Readonly<Record<string, NotionFieldMode>>;
  eventFieldIds?: readonly string[];
}) {
  if (!input.page?.id || !input.canonical?.id || !input.previousNotion || !input.previousAdmin)
    throw Error("BREED_WORKCOPY_DELTA_MISSING_BASELINE");

  const projection = materializeBreedWorkCopyForRead(input.page, {
    id: input.canonical.id,
    slug: input.canonical.slug,
    fciNumber: input.canonical.fciNumber,
  });
  if (!projection.valid || !projection.page)
    return {
      ready: false as const,
      conflicts: projection.errors,
      accepted: [] as string[],
      skipped: [] as string[],
      changed: [] as string[],
      patch: {},
    };
  // Ignore only malformed SOURCE segments, not every sibling field.
  // A missing merged target invalidates that physical field's logical parts.
  const invalidSources = new Set<string>();
  const invalidTargets = new Set<string>();
  for (const error of projection.errors) {
    if (error.source) invalidSources.add(error.source);
    else if (error.target) invalidTargets.add(error.target);
  }
  const invalidFieldIds = new Set(BREED_NOTION_SCHEMA
    .filter(spec => spec.mode === "content" && (
      invalidSources.has(spec.notion) ||
      invalidTargets.has(spec.notion)))
    .map(spec => spec.id));
  const managed = notionPageToManagedBreedInput(projection.page);
  const present = breedNotionPresentFieldIds(projection.page);
  const actual = breedFieldSnapshot(managed);
  // The explicitly edited Notion cell wins against its current Admin value.
  // Old receipts never become content-level locks on a newer signed edit.
  // Untouched fields are still excluded by the event + present-field filter.
  const current = breedFieldSnapshot(input.canonical);
  const plan = planBreedNotionFieldDelta(
    input.canonical,
    managed,
    current,
    current,
    {},
    present,
  );
  const restricted = [...new Set([
    ...plan.accepted,
    ...plan.changed,
  ])].filter(field => FULL_FCI_AND_EDITORIAL.has(field));
  // Isolate special media/relations: never let one unsupported field block
  // independently valid ordinary text and FCI edits. Those fields remain
  // pending in their prior receipt until their dedicated adapter is ready.
  // The existing per-field engine decides Notion/Admin priority. We do not
  // synthesize missing SEO/OG values or absent technical fields.
  return {
    ready: true as const,
    conflicts: plan.conflicts.map(field => ({
      code: "BREED_WORKCOPY_FIELD_CONFLICT", field,
    })),
    accepted: plan.accepted.filter(field =>
      !restricted.includes(field) && !invalidFieldIds.has(field)),
    skipped: [...new Set([...restricted, ...invalidFieldIds])],
    changed: plan.changed,
    patch: plan.patch,
    sourceSnapshot: actual,
    adminSnapshot: breedFieldSnapshot(input.canonical),
    presentFields: [...present],
  };
}
