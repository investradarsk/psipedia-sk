/**
 * Mirror ONLY the Admin-owned Odkontrolované flag to an already mapped
 * Notion Events/Help page. Editorial fields, sync hashes and publication
 * state are never touched. Notion cannot unlock an Admin-owned review.
 *
 * The mirror is intentionally optional: older targets without the checkbox
 * remain protected in D1 and can have the column added safely later.
 */
import { isAdminNotionSyncLocked, type LockableAgenda } from "./admin-notion-review-lock";
import { notionPageBelongsToDataSource, type NotionOwnedPage } from "./notion-sync-page-ownership";
import {
  notionPropertyRecord, notionRequest, notionRichTextProperty, type NotionSyncBindings,
} from "./notion-sync-shared";

export const ADMIN_REVIEW_NOTION_PROPERTY = "Odkontrolované";
type ReviewPage = NotionOwnedPage & {
  archived?: boolean; in_trash?: boolean; properties?: Record<string, unknown>;
};

function pageReview(page: ReviewPage): boolean | null {
  const flag = notionPropertyRecord(page, ADMIN_REVIEW_NOTION_PROPERTY)?.checkbox;
  return typeof flag === "boolean" ? flag : null;
}

function assertMappedIdentity(page: ReviewPage, input: {
  entityId: number; pageId: string; dataSourceId: string;
}) {
  if(page.id!==input.pageId || page.archived || page.in_trash ||
     !notionPageBelongsToDataSource(page,input.dataSourceId) ||
     notionRichTextProperty(page,"Psipedia ID")!==String(input.entityId))
    throw Error("ADMIN_REVIEW_NOTION_IDENTITY_MISMATCH");
}

/** Does not pull a Notion checkbox into D1. The Admin owns the review decision. */
export async function mirrorAdminReviewFlagToNotion(input:{
  database:D1Database;bindings:NotionSyncBindings;
  agenda:LockableAgenda;entityId:number;
  dataSourceId:string;page:ReviewPage;
}):Promise<"missing-property"|"unchanged"|"pushed">{
  if(!Number.isSafeInteger(input.entityId)||input.entityId<1)
    throw Error("ADMIN_REVIEW_NOTION_INVALID_ID");
  const pageId=input.page.id;
  assertMappedIdentity(input.page,{
    entityId:input.entityId,pageId,dataSourceId:input.dataSourceId,
  });
  const current=pageReview(input.page);
  if(current===null)return "missing-property";
  const desired=await isAdminNotionSyncLocked(input.database,input.agenda,input.entityId);
  if(current===desired)return "unchanged";

  // Never PATCH from an old batch snapshot. Refresh the exact mapped page.
  const latest=await notionRequest<ReviewPage>(input.bindings,"/pages/"+encodeURIComponent(pageId));
  assertMappedIdentity(latest,{
    entityId:input.entityId,pageId,dataSourceId:input.dataSourceId,
  });
  if(pageReview(latest)!==current)throw Error("ADMIN_REVIEW_NOTION_CONCURRENT_CHANGE");
  // Read D1 again: a Partner may have been approved since the first check.
  const stillDesired=await isAdminNotionSyncLocked(input.database,input.agenda,input.entityId);
  if(stillDesired!==desired)throw Error("ADMIN_REVIEW_CONCURRENT_CHANGE");
  const echoed=await notionRequest<ReviewPage>(
    input.bindings,"/pages/"+encodeURIComponent(pageId),{
      method:"PATCH",
      body:JSON.stringify({properties:{[ADMIN_REVIEW_NOTION_PROPERTY]:{checkbox:desired}}}),
    },
  );
  assertMappedIdentity(echoed,{
    entityId:input.entityId,pageId,dataSourceId:input.dataSourceId,
  });
  if(pageReview(echoed)!==desired)throw Error("ADMIN_REVIEW_NOTION_ECHO_MISMATCH");
  return "pushed";
}
