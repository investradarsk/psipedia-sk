import { env } from "cloudflare:workers";
import { syncSavedNotionRecord, type TargetedNotionSaveBindings } from "@/lib/notion-targeted-admin-save";
import { unauthorizedAdminResponse, requireAdminMutation } from "@/lib/admin-auth";
import { isAdoptionAdminConflict, updateAdoptionFromAdmin } from "@/lib/adoption-admin-write";
import type { ManagedAdoptionInput } from "@/lib/adoption";
import { updateAdoptionInlineName } from "@/lib/adoption-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type Body = { payload?: ManagedAdoptionInput; expectedUpdatedAt?: string };
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
async function numericId(params: Props["params"]) { const value = Number.parseInt((await params).id, 10); return Number.isSafeInteger(value) && value > 0 ? value : null; }
function errorResponse(error: unknown) {
  const conflict = isAdoptionAdminConflict(error);
  const message = error instanceof Error ? error.message : "Adopčný profil sa nepodarilo uložiť.";
  return Response.json({ error: message }, { status: conflict ? 409 : 400 });
}

/** Quick in-row name update: strictly one field and optimistic version. */
export async function PATCH(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID adopcie." }, { status: 400 });
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Neplatný pôvod požiadavky." }, { status: 403 });
  }
  let body: { action?: unknown; name?: unknown; expectedUpdatedAt?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 }); }
  if (!isRecord(body) || Object.keys(body).length !== 3 ||
      body.action !== "set-inline-name" || typeof body.name !== "string" ||
      typeof body.expectedUpdatedAt !== "string" || !body.expectedUpdatedAt.trim()) {
    return Response.json({ error: "Rýchla úprava umožňuje iba meno psa a vyžaduje verziu záznamu." }, { status: 400 });
  }
  if (!body.name.trim() || body.name.trim().length > 180) {
    return Response.json({ error: "Meno psa musí mať 1–180 znakov." }, { status: 400 });
  }
  try {
    const updatedId = await updateAdoptionInlineName(id, body.name, body.expectedUpdatedAt, auth.user.email);
    if (!updatedId) return Response.json({ error: "Adopčný profil neexistuje." }, { status: 404 });
    const notionFieldSync = await syncSavedNotionRecord({
      bindings: env as unknown as TargetedNotionSaveBindings,
      agenda: "adoptions", entityId: id,
    });
    return Response.json({ id: updatedId, notionFieldSync }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Adopciu sa nepodarilo upraviť.";
    return Response.json({ error: message }, { status: 409, headers: { "cache-control": "no-store" } });
  }
}

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID adopčného profilu." }, { status: 400 });
  try {
    const body = await request.json() as Body;
    if (!isRecord(body) || !isRecord(body.payload) || typeof body.expectedUpdatedAt !== "string") {
      return Response.json({ error: "Neplatný payload adopčného profilu alebo chýbajúca verzia záznamu." }, { status: 400 });
    }
    const item = await updateAdoptionFromAdmin(id, body.payload as ManagedAdoptionInput, user.email, body.expectedUpdatedAt);
    if (!item) return Response.json({ error: "Adopčný profil sa nenašiel." }, { status: 404 });
    const notionFieldSync = await syncSavedNotionRecord({ bindings: env as unknown as TargetedNotionSaveBindings, agenda: "adoptions", entityId: id });
    return Response.json({ item, notionFieldSync });
  } catch (error) {
    return errorResponse(error);
  }
}
