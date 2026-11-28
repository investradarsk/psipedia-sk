import { unlockReviewedBreed, type BreedWorkCopyBindings } from "@/lib/notion-breed-workcopy-sync";
import { unlockReviewedEshop, type NotionEshopSyncBindings } from "@/lib/notion-eshop-sync";
import { env } from "cloudflare:workers";
import { unlockReviewedEventsHelpProfile, type NotionEventsHelpSyncBindings } from "@/lib/notion-events-help-sync";
import { getAdminEntityReview } from "@/lib/admin-entity-review-store";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  isAdminReviewEntityType,
  setAdminEntityReviewed,
} from "@/lib/admin-entity-review-store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  if (request.headers.get("origin") !== new URL(request.url).origin
    || !request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Neplatný pôvod požiadavky." }, { status: 403 });
  }

  const body = await request.json() as {
    entityType?: unknown;
    entityId?: unknown;
    reviewed?: unknown;
  };

  if (!isAdminReviewEntityType(body.entityType)) {
    return Response.json({ error: "Nepodporovaný typ záznamu." }, { status: 400 });
  }
  const entityId = Number(body.entityId);
  if (!Number.isSafeInteger(entityId) || entityId <= 0 || typeof body.reviewed !== "boolean") {
    return Response.json({ error: "Neplatný stav kontroly." }, { status: 400 });
  }

  try {
    const bindings=env as unknown as NotionEventsHelpSyncBindings & BreedWorkCopyBindings & NotionEshopSyncBindings & {DB?:D1Database};
    if((body.entityType==="BREED"||body.entityType==="ESHOP")&&bindings.NOTION_PROFILE_AUTHORITY_MODE!=="validated-text")return Response.json({error:"Nový režim kontroly ešte nie je aktivovaný."},{status:409});
    if(body.reviewed===false&&bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"){
      if(!bindings.DB)throw Error("Databáza administrácie nie je pripojená.");
      const current=await getAdminEntityReview(body.entityType,entityId,bindings.DB);
      if(current.reviewed){
        if(body.entityType==="BREED"){
          await unlockReviewedBreed({database:bindings.DB,bindings,entityId});
          return Response.json({review:await getAdminEntityReview("BREED",entityId,bindings.DB)});
        }
        if(body.entityType==="ESHOP"){
          await unlockReviewedEshop({database:bindings.DB,bindings,entityId});
          return Response.json({review:await getAdminEntityReview("ESHOP",entityId,bindings.DB)});
        }
        const agendas={EVENT:"events",ORGANIZATION:"organizations",ADOPTION:"adoptions",LOST_FOUND:"lost-found",HELP_CASE:"help-cases"} as const;
        await unlockReviewedEventsHelpProfile({database:bindings.DB,bindings,
          agenda:agendas[body.entityType],entityId});
        return Response.json({review:await getAdminEntityReview(body.entityType,entityId,bindings.DB)});
      }
    }
    if((body.entityType==="BREED"||body.entityType==="ESHOP")&&body.reviewed===false)
      return Response.json({review:await getAdminEntityReview(body.entityType,entityId,bindings.DB)});
    const review = await setAdminEntityReviewed(body.entityType, entityId, body.reviewed, user.email);
    return Response.json({ review });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stav kontroly sa nepodarilo uložiť.";
    return Response.json({ error: message }, {
      status: /nenašiel/.test(message) ? 404
        : /spravuje partner|partner.*uzamknut/i.test(message) ? 409 : 500,
      headers: { "cache-control": "no-store" },
    });
  }
}
