import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  ContentHistoryError, parseHistoryTarget, previewContentHistory, restoreContentRevision,
} from "@/lib/admin-content-history";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const params = new URL(request.url).searchParams;
    const { entityType, key } = parseHistoryTarget(params.get("entityType"), params.get("key"));
    return noStoreJson(await previewContentHistory(entityType, key));
  } catch (error) {
    if (error instanceof ContentHistoryError) return noStoreJson({ error: error.message }, error.status);
    console.error("Admin content history read failed", error);
    return noStoreJson({ error: "História nie je dostupná. Skontroluj migráciu 0151." }, 503);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response) return auth.response;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return noStoreJson({ error: "Očakáva sa JSON požiadavka." }, 415);
  }
  try {
    const input = await request.json() as { entityType?: unknown; key?: unknown; revisionId?: unknown; intent?: unknown };
    if (input.intent !== "restore-last") return noStoreJson({ error: "Zmenu je nutné explicitne potvrdiť." }, 400);
    const { entityType, key } = parseHistoryTarget(input.entityType, input.key);
    const result = await restoreContentRevision(entityType, key, input.revisionId as number, auth.user!.email);
    return noStoreJson(result);
  } catch (error) {
    if (error instanceof ContentHistoryError) return noStoreJson({ error: error.message }, error.status);
    console.error("Admin content restore failed", error);
    return noStoreJson({ error: "Obnova zlyhala. Údaje neobnovuj naslepo – skontroluj históriu." }, 503);
  }
}
