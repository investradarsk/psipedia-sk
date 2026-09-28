import { requireAdminMutation } from "@/lib/admin-auth";
import {
  applyAutomationLifecycleSuggestion,
  AutomationLifecycleConflictError,
  AutomationLifecycleUnsupportedError,
} from "@/lib/data-automation-lifecycle-apply";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const auth = await requireAdminMutation(request);
  if (auth.response || !auth.user) return auth.response;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Očakáva sa JSON požiadavka." }, { status: 415 });
  }

  const numericId = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) {
    return Response.json({ error: "Neplatné ID návrhu zmeny stavu." }, { status: 400 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;
    const expectedFingerprint = typeof body.expectedFingerprint === "string"
      ? body.expectedFingerprint.trim()
      : "";
    if (action !== "accept" && action !== "reject") {
      return Response.json({ error: "Neplatná lifecycle akcia." }, { status: 400 });
    }
    if (!/^(?:lifecycle:)?[a-f0-9]{64}$/i.test(expectedFingerprint)) {
      return Response.json({ error: "Návrh zmeny stavu nemá platnú verziu." }, { status: 400 });
    }

    const result = await applyAutomationLifecycleSuggestion({
      id: numericId,
      action,
      expectedFingerprint,
      reviewerEmail: auth.user.email,
    });
    if (!result) return Response.json({ error: "Návrh zmeny stavu neexistuje." }, { status: 404 });
    return Response.json({ ok: true, result });
  } catch (error) {
    if (error instanceof AutomationLifecycleConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof AutomationLifecycleUnsupportedError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    const message = error instanceof Error ? error.message : "Zmenu stavu sa nepodarilo spracovať.";
    if (message === "automation_lifecycle_fingerprint_mismatch" || message === "automation_lifecycle_already_decided") {
      return Response.json({ error: "Návrh sa medzičasom zmenil. Obnov stránku a skontroluj aktuálny stav." }, { status: 409 });
    }
    return Response.json({ error: message }, { status: 400 });
  }
}
