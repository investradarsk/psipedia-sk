/**
 * Bootstrap a NEW, independent field-event baseline from the CURRENT work
 * Notion page and canonical D1 breed. No writes, no forced reconciliation.
 * A baseline records independent values on both sides; different editorial
 * values stay intact until an explicit future property edit.
 */
import type { ManagedBreed } from "@/lib/breed-store";
import type { NotionPage } from "@/lib/notion-sync-shared";
import { materializeBreedWorkCopyForRead } from "@/lib/notion-breed-workcopy-compatible-page.mjs";
import { notionPageToManagedBreedInput } from "@/lib/notion-breed-sync";
import { breedFieldSnapshot } from "@/lib/notion-breed-field-delta";
import { isCompatibleBreedWorkcopyReceipt } from "@/lib/notion-breed-workcopy-receipt";
import { encodeIndependentBreedWorkCopyReceipt } from "@/lib/notion-breed-workcopy-baseline-receipt.mjs";

export function buildBreedWorkCopyBaseline(page: NotionPage, breed: ManagedBreed) {
  const projection = materializeBreedWorkCopyForRead(page, {
    id: breed.id, slug: breed.slug, fciNumber: breed.fciNumber,
  });
  if (!projection.valid || !projection.page)
    throw Error("BREED_WORKCOPY_BASELINE_UNREADABLE_PAGE");
  const notion = breedFieldSnapshot(notionPageToManagedBreedInput(projection.page));
  const admin = breedFieldSnapshot(breed);
  const value = encodeIndependentBreedWorkCopyReceipt(notion, admin);
  if (!isCompatibleBreedWorkcopyReceipt(value))
    throw Error("BREED_WORKCOPY_BASELINE_INVALID");
  const differenceCount = Object.keys(notion).filter(key =>
    JSON.stringify(notion[key as keyof typeof notion]) !==
    JSON.stringify(admin[key as keyof typeof admin])).length;
  return { value, differenceCount };
}
