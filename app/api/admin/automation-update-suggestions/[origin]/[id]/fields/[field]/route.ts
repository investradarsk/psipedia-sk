import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  AutomationUpdateReviewConflictError,
  AutomationUpdateReviewNotFoundError,
  AutomationUpdateReviewUnsupportedError,
  AutomationUpdateReviewValidationError,
  reviewAutomationUpdateField,
  type AutomationUpdateOrigin,
} from "@/lib/data-automation-update-review";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ origin: string; id: string; field: string }> };

function sameOriginJson(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const origin = request.headers.get("origin");
  return contentType.startsWith("application/json") && (!origin || origin === new URL(request.url).origin);
}

export async function POST(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (!sameOriginJson(request)) {
    return Response.json({ error: "Neplatný pôvod alebo formát požiadavky." }, { status: 403 });
  }

  const { origin, id, field } = await params;
  if (origin !== "DIRECT_ENTITY" && origin !== "FEED_SOURCE") {
    return Response.json({ error: "Neplatný pôvod návrhu." }, { status: 400 });
  }
  const suggestionId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(suggestionId) || suggestionId < 1 || !field || field.length > 120) {
    return Response.json({ error: "Neplatný návrh alebo pole." }, { status: 400 });
  }

  let body: { action?: unknown; expectedProposedValueHash?: unknown; expectedUpdatedAt?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 });
  }
  if (body.action !== "accept" && body.action !== "reject") {
    return Response.json({ error: "Neplatná review akcia." }, { status: 400 });
  }
  if (typeof body.expectedProposedValueHash !== "string" || !/^[a-f0-9]{64}$/i.test(body.expectedProposedValueHash)) {
    return Response.json({ error: "Chýba verzia navrhovanej hodnoty." }, { status: 400 });
  }
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== null && typeof body.expectedUpdatedAt !== "string") {
    return Response.json({ error: "Neplatná verzia canonical záznamu." }, { status: 400 });
  }

  try {
    const result = await reviewAutomationUpdateField({
      origin: origin as AutomationUpdateOrigin,
      suggestionId,
      field,
      action: body.action,
      expectedProposedValueHash: body.expectedProposedValueHash,
      expectedUpdatedAt: typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null,
      actor: user.email,
    });
    return Response.json({ result });
  } catch (error) {
    if (error instanceof AutomationUpdateReviewNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof AutomationUpdateReviewConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof AutomationUpdateReviewUnsupportedError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AutomationUpdateReviewValidationError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    console.error("Automation update field review failed", error);
    return Response.json({ error: "Návrh zmeny sa nepodarilo spracovať." }, { status: 500 });
  }
}
