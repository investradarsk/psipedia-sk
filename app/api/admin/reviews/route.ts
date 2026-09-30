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
    const review = await setAdminEntityReviewed(body.entityType, entityId, body.reviewed, user.email);
    return Response.json({ review });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stav kontroly sa nepodarilo uložiť.";
    return Response.json({ error: message }, { status: /nenašiel/.test(message) ? 404 : 500 });
  }
}
