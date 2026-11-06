/**
 * Work-copy editorial delta: interpret the 60 + 2 Notion breed database using
 * the EXISTING Psipedia per-field conflict-resolution engine.
 *
 * This function is read-only. It does NOT persist to D1, write to Notion, touch
 * public pages, publish profiles, or change active breed_notion_sync mapping.
 * A caller must prove old sync is disabled before applying any future plan.
 */
import { materializeBreedWorkCopyForRead } from "@/lib/notion-breed-workcopy-compatible-page.mjs";
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
  "fciStandard", "editorial", "image", "gallery",
  "relatedBreedIds", "relatedArticleIds", "directoryProfileIds",
]);

export function planBreedWorkCopyEditorialDelta(input: {
  page: NotionPage;
  canonical: ManagedBreed;
  previousNotion: BreedFieldSnapshot;
  previousAdmin: BreedFieldSnapshot;
  authority?: Readonly<Record<string, NotionFieldMode>>;
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
  const managed = notionPageToManagedBreedInput(projection.page);
  const present = breedNotionPresentFieldIds(projection.page);
  const actual = breedFieldSnapshot(managed);
  const plan = planBreedNotionFieldDelta(
    input.canonical,
    managed,
    input.previousNotion,
    input.previousAdmin,
    input.authority ?? {},
    present,
  );
  const restricted = [...new Set([
    ...plan.accepted,
    ...plan.changed,
  ])].filter(field => FULL_FCI_AND_EDITORIAL.has(field));
  if (restricted.length) {
    // Aggregates, images and relations need special adapters and must not
    // be treated as ordinary text even if the old receipt contained them.
    return {
      ready: false as const,
      conflicts: restricted.map(field => ({
        code: "BREED_WORKCOPY_COMPLEX_FIELD_REQUIRES_ADAPTER", field,
      })),
      accepted: plan.accepted.filter(field => !restricted.includes(field)),
      skipped: restricted,
      changed: plan.changed,
      patch: plan.patch,
    };
  }
  // The existing per-field engine decides Notion/Admin priority. We do not
  // synthesize missing SEO/OG values or absent technical fields.
  return {
    ready: true as const,
    conflicts: plan.conflicts.map(field => ({
      code: "BREED_WORKCOPY_FIELD_CONFLICT", field,
    })),
    accepted: plan.accepted,
    skipped: [] as string[],
    changed: plan.changed,
    patch: plan.patch,
    sourceSnapshot: actual,
    adminSnapshot: breedFieldSnapshot(input.canonical),
    presentFields: [...present],
  };
}
